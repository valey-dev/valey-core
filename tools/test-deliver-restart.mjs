// node tools/test-deliver-restart.mjs — a run survives the office that sent it.
//
// On 13 September 2026 every turn sent through the office died on the Ctrl-C
// that stops `npm start`: the runs sat in the office's process group, on its
// terminal, and got the same SIGINT — four to six sessions interrupted in one
// second at every restart. Here an office of the stand's own starts a run and
// its whole group gets SIGINT, as a terminal sends it. The run must finish, and
// the next office must neither start a second turn on top of it nor wait
// forever on one that hung.
//
// DELIVER_PATH points the office at another copy of deliver.js; that is how the
// stand was run against the unfixed one to see it fail.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (cond, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await nap(50); } return cond(); };

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-deliver-restart-'));
process.env.VALEY_DELIVER_DIR = path.join(dir, 'runs');
const DELIVER = process.env.DELIVER_PATH || fileURLToPath(new URL('../server/deliver.js', import.meta.url));
const { deliver, forgetCli } = await import(DELIVER);

const script = (name, body) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  return p;
};
// A turn that takes a few seconds and talks while it works, as claude does:
// stderr is written every 100 ms, so a pipe to a dead office would fail it.
const LONG = script('long', `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(path.join(dir, 'cli.pid'))}, String(process.pid));
const tick = setInterval(() => process.stderr.write('working\\n'), 100);
setTimeout(() => { clearInterval(tick); fs.writeFileSync(${JSON.stringify(path.join(dir, 'finished'))}, 'yes'); console.log('done'); }, 2500);`);
const QUICK = script('quick', "console.log('done: ' + process.argv.slice(2).join(' '));");
const STUBBORN = script('stubborn', "process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000);");

// The office: its own process group, so the stand can signal it the way a
// terminal does without signalling itself.
const officeJs = path.join(dir, 'office.mjs');
fs.writeFileSync(officeJs, `
const { deliver } = await import(${JSON.stringify(DELIVER)});
process.env.CLAUDE_BIN = ${JSON.stringify(LONG)};
await deliver({ text: 'hello' }, { id: 'agent-a', name: 'a', cwd: ${JSON.stringify(dir)} });`);
const office = spawn(process.execPath, [officeJs], { detached: true, stdio: 'ignore', env: { ...process.env } });

const started = await until(() => fs.existsSync(path.join(dir, 'cli.pid')));
ok('the office starts a run', started);
const cliPid = started ? Number(fs.readFileSync(path.join(dir, 'cli.pid'), 'utf8')) : 0;
// The office leads its own group (detached), so its pgid is its pid; the run
// must lead another one, or the terminal's signal reaches it too.
const pgidOf = (pid) => { try { return Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim()); } catch { return 0; } };
ok('the run is in a process group of its own, not the office’s', cliPid && pgidOf(cliPid) !== office.pid, { cli: pgidOf(cliPid), office: office.pid });
await nap(300);
try { process.kill(-office.pid, 'SIGINT'); } catch { /* already gone */ }
ok('Ctrl-C stops the office', await until(() => !alive(office.pid), 3000), office.pid);

// --- a second message while the orphan still answers ------------------------
forgetCli();
process.env.CLAUDE_BIN = QUICK;
const second = { text: 'again' };
await deliver(second, { id: 'agent-a', name: 'a', cwd: dir });
ok('a second message to that agent waits instead of starting a second turn', second.state === 'failed' && second.errorKey === 'err.busy', second);

ok('the run outlives the office and finishes its turn', await until(() => fs.existsSync(path.join(dir, 'finished')), 5000), { cliAlive: alive(cliPid) });

const third = { text: 'after' };
await deliver(third, { id: 'agent-a', name: 'a', cwd: dir });
ok('once it has finished, the agent takes messages again', third.state === 'delivered' && /--resume agent-a -p after/.test(third.reply), third);

// --- an orphan that hung ------------------------------------------------------
const hung = spawn(STUBBORN, ['--resume', 'agent-h', '-p', 'x'], { detached: true, stdio: 'ignore' });
await nap(400);
fs.mkdirSync(process.env.VALEY_DELIVER_DIR, { recursive: true });
fs.writeFileSync(path.join(process.env.VALEY_DELIVER_DIR, 'agent-h.json'), JSON.stringify({ pid: hung.pid, startedAt: Date.now() - 5000 }));
const h = { text: 'unstick' };
await deliver(h, { id: 'agent-h', name: 'h', cwd: dir }, 'default', { timeout: 1500, grace: 200 });
ok('a run older than the timeout is stopped and the message goes through', h.state === 'delivered' && !alive(hung.pid), { state: h.state, hungAlive: alive(hung.pid) });

// --- a pid that is no longer ours --------------------------------------------
const stranger = spawn('sleep', ['5'], { detached: true, stdio: 'ignore' });
fs.writeFileSync(path.join(process.env.VALEY_DELIVER_DIR, 'agent-s.json'), JSON.stringify({ pid: stranger.pid, startedAt: Date.now() - 5000 }));
const s = { text: 'hi' };
await deliver(s, { id: 'agent-s', name: 's', cwd: dir }, 'default', { timeout: 1500, grace: 200 });
ok('a recorded pid that now runs something else is neither waited for nor killed', s.state === 'delivered' && alive(stranger.pid), { state: s.state, strangerAlive: alive(stranger.pid) });
try { process.kill(stranger.pid, 'SIGKILL'); } catch { /* gone */ }

ok('a finished run leaves nothing behind', fs.readdirSync(process.env.VALEY_DELIVER_DIR).length === 0, fs.readdirSync(process.env.VALEY_DELIVER_DIR));

delete process.env.CLAUDE_BIN;
forgetCli();
await fsp.rm(dir, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
