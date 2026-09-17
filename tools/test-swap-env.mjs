// node tools/test-swap-env.mjs — the handover's instructions stay with the worker.
//
// The supervisor tells the next worker where to listen and to wait for a
// handover, through the environment. Until v0.55.1 the worker kept them there,
// so everything the office started inherited them: on 13 September 2026 an
// agent resumed by an updated office ran the stands, and every office they
// raised went for port 5177 instead of its own. The stand gives an office, a
// supervisor and a bare import the same leaked environment, pointed at a port
// it holds itself, and expects each of them to ignore it.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, startOffice } from './lib/office.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

// The old office's port, held here, so that an office obeying the leak fails
// loudly instead of landing on 5177 beside the owner's.
const held = net.createServer();
await new Promise((r) => held.listen(0, '127.0.0.1', r));
const leak = {
  VALEY_WORKER: '1', VALEY_PORT_FIXED: String(held.address().port),
  VALEY_HOST_FIXED: '127.0.0.1', VALEY_HANDOFF_WAIT: '1',
};

// ----------------------------------------------------------- a bare import
// The names are the stand's own list, not swap.js's: a stand that reads what
// it checks from the code under test proves only that the code agrees with itself.
const probe = `
  const swap = await import(${JSON.stringify(path.join(ROOT, 'server/swap.js'))});
  console.log(JSON.stringify({
    left: ${JSON.stringify(Object.keys(leak))}.filter((k) => k in process.env),
    worker: swap.isWorker, fixed: swap.fixedAddress(),
  }));`;
const seen = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe],
  { env: { ...process.env, ...leak }, encoding: 'utf8' }).trim().split('\n').pop());
ok('loading the office takes the handover out of the environment its children get', seen.left.length === 0, seen.left);
ok('a process that is not a worker is not told it takes over', seen.worker === false && seen.fixed === null, seen);

// ------------------------------------------------------------ a plain office
// startOffice gives up after eight seconds; an office waiting for a handover
// would sit at its gate for thirty.
let office = null;
try { office = await startOffice({ env: leak }); } catch (e) { ok('an office raised in a leaked shell comes up on its own port', false, e.message); }
if (office) {
  ok('an office raised in a leaked shell comes up on its own port', true);
  const t = Date.now();
  const r = await fetch(office.base + '/api/state');
  ok('and answers without waiting for a handover', r.ok && Date.now() - t < 5000, { status: r.status, ms: Date.now() - t });
  await office.stop();
}

// ------------------------------------------------------------ the supervisor
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-swap-env-'));
const settingsFile = path.join(tmp, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify({ weather: { enabled: false }, delivery: { mode: 'default' } }));
const port = await freePort();
let out = '';
const sup = spawn(process.execPath, ['server/supervisor.js'], {
  cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...leak, PORT: String(port), HOST: '127.0.0.1', VALEY_SETTINGS: settingsFile, VALEY_STAND: '', VALEY_NUDGE: 'off' },
});
sup.stdout.on('data', (d) => { out += d; });
sup.stderr.on('data', (d) => { out += d; });
let up = false;
for (let i = 0; i < 80 && !up; i++) {
  try { up = (await fetch(`http://127.0.0.1:${port}/api/whoami`)).ok; } catch { await nap(100); }
}
ok('a supervisor started in a leaked shell brings its first office up on its own port', up, out.slice(-400));
try { process.kill(-sup.pid, 'SIGTERM'); } catch { /* gone */ }
await nap(300);
try { process.kill(-sup.pid, 'SIGKILL'); } catch { /* gone */ }
fs.rmSync(tmp, { recursive: true, force: true });
held.close();

process.exit(bad ? 1 : 0);
