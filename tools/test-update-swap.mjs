// node tools/test-update-swap.mjs — an update replaces the office and breaks nothing.
//
// Decided 13 September 2026: an update is not a restart. A guest keeps what
// they were granted, a note stays on its desk, a question the office holds for
// an agent comes back held by the new office, every page hears «updated», and
// not one request is refused while the office changes under it. And a new
// office that fails to start must leave the running one serving.
//
// The stand runs the real supervisor on invented sessions and «updates» a git
// checkout of its own (VALEY_UPDATE_ROOT), not the branch it runs from.
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeClaudeDir, freePort } from './lib/office.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 10_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await nap(100); } return !!(await cond()); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-update-swap-'));
const procs = [];
const cleanup = () => {
  for (const p of procs) { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* gone */ } }
  fs.rmSync(tmp, { recursive: true, force: true });
};

// ---------------------------------------------------------- a checkout to update
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const pkg = (v) => JSON.stringify({ name: 'valey', version: v }) + '\n';
g(tmp, 'init', '-q', '--bare', '-b', 'main', 'core.git');
const author = path.join(tmp, 'author');
g(tmp, 'clone', '-q', path.join(tmp, 'core.git'), author);
fs.writeFileSync(path.join(author, 'package.json'), pkg('0.52.3'));
g(author, 'add', '-A'); g(author, 'commit', '-q', '-m', 'chore(release): v0.52.3'); g(author, 'push', '-q', 'origin', 'HEAD:main');
const checkout = path.join(tmp, 'checkout');
g(tmp, 'clone', '-q', path.join(tmp, 'core.git'), checkout);
fs.writeFileSync(path.join(author, 'package.json'), pkg('0.54.0'));
g(author, 'add', '-A'); g(author, 'commit', '-q', '-m', 'feat(office): something new'); g(author, 'push', '-q', 'origin', 'HEAD:main');

// ------------------------------------------------------------------ the office
const { dir: claudeDir, sessionId: agentId } = await fakeClaudeDir(tmp, { cwd: tmp });
const settingsFile = path.join(tmp, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify({
  weather: { enabled: false }, delivery: { mode: 'default' },
  access: { mode: 'private', token: 'owner-token', invites: [{ id: 'inv1', code: 'code1', name: 'Гость', from: 'стенд', at: Date.now(), usedAt: Date.now(), guest: 'guest-token' }] },
}));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env, PORT: String(port), VALEY_SETTINGS: settingsFile, VALEY_CLAUDE_DIR: claudeDir,
  VALEY_UPDATE_ROOT: checkout, VALEY_DELIVER_DIR: path.join(tmp, 'runs'), VALEY_STAND: '', VALEY_NUDGE: 'off',
};
let log = '';
const sup = spawn(process.execPath, [path.join(ROOT, 'server/supervisor.js')], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
procs.push(sup);
sup.stdout.on('data', (d) => { log += d; });
sup.stderr.on('data', (d) => { log += d; });

const get = async (p, headers = {}) => { const r = await fetch(base + p, { headers }); return r.json(); };
const post = async (p, body = {}, headers = {}) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return r.json();
};

try {
  ok('the supervisor brings the office up', await until(async () => {
    try { return ((await get('/api/state')).agents || []).some((a) => a.id === agentId); } catch { return false; }
  }, 20_000), log.slice(-600));

  // what lives in memory and must come across
  await post('/api/task', { agentId, text: 'записка до обновления' });
  const onDesk = async () => (((await get('/api/state')).agents || []).find((a) => a.id === agentId)?.outbox || []).some((t) => t.text === 'записка до обновления');
  ok('the note is on the desk before the update', await until(onDesk), null);
  await post('/api/access', { agentId }, { 'x-valey-guest': 'guest-token' });
  const reqId = ((await get('/api/state')).access.requests || [])[0]?.id;
  await post('/api/access/answer', { id: reqId, yes: true });

  // an owner's page on the stream: the audience a held question needs, and the ear for «updated»
  let events = '';
  const stream = http.get(`${base}/api/stream`, (res) => { res.setEncoding('utf8'); res.on('data', (d) => { events += d; }); });
  stream.on('error', () => {});
  await nap(500);

  // a question the office holds
  const hook = spawn(process.execPath, [path.join(ROOT, 'tools/permit.mjs')], { env: { ...process.env, VALEY_URL: base, VALEY_SETTINGS: settingsFile }, stdio: ['pipe', 'pipe', 'pipe'] });
  let hookOut = '';
  hook.stdout.on('data', (d) => { hookOut += d; });
  hook.stdin.end(JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: agentId, tool_name: 'Bash', tool_input: { command: 'echo held' } }));
  ok('the office holds the question', await until(async () => ((await get('/api/state')).permits || []).length === 1), null);

  // everything that knocks during the update must get in
  let probes = 0, refused = 0, probing = true;
  (async () => {
    while (probing) {
      try { const r = await fetch(base + '/api/version'); probes += 1; if (!r.ok) refused += 1; } catch { probes += 1; refused += 1; }
      await nap(25);
    }
  })();

  const started = await post('/api/update/run');
  ok('the update starts', started.state === 'updating', started);
  ok('every page hears «updated», with both versions', await until(() => /event: update\ndata: \{"from":"[\d.]+","to":"0\.54\.0"\}/.test(events)), events.slice(-300));
  ok('the new office takes over', await until(async () => { try { return (await get('/api/update')).state === 'idle'; } catch { return false; } }), log.slice(-400));
  await nap(800);
  probing = false;
  await nap(100);
  ok('not one request was refused while the office changed', refused === 0 && probes > 20, { probes, refused });

  const st = await get('/api/state');
  const me = (st.agents || []).find((a) => a.id === agentId) || {};
  // at once, not on the next tick: a page reloading onto the new office must
  // not find the desks bare for the 2.5 s until the snapshot is rebuilt
  ok('the note is still on the desk, in the very first snapshot', (me.outbox || []).some((t) => t.text === 'записка до обновления'), me.outbox);
  ok('the guest keeps what they were granted', (st.access.open || []).some((o) => o.guestId === 'guest-token' && o.agentId === agentId), st.access);
  ok('the checkout was pulled forward', JSON.parse(fs.readFileSync(path.join(checkout, 'package.json'), 'utf8')).version === '0.54.0');

  ok('the held question comes back, held by the new office', await until(async () => ((await get('/api/state')).permits || []).some((p) => /echo held/.test(p.command))), null);
  const permit = ((await get('/api/state')).permits || [])[0];
  await post('/api/permit/answer', { id: permit.id, decision: 'allow' });
  ok('and the answer reaches the hook', await until(() => /"behavior":"allow"/.test(hookOut)), hookOut);
  stream.destroy();
} catch (e) {
  ok('the stand ran to the end', false, e.message + ' · ' + log.slice(-400));
}
try { process.kill(-sup.pid, 'SIGTERM'); } catch { /* gone */ }

// ------------------------------------------- a new office that fails to start
const fakeWorker = path.join(tmp, 'worker.mjs');
fs.writeFileSync(fakeWorker, `
import http from 'node:http';
if (process.env.VALEY_HANDOFF_WAIT === '1') { console.error('SyntaxError: the new code is broken'); process.exit(3); }
let failed = null;
const server = http.createServer((req, res) => {
  if (req.url === '/swap') { process.send({ valey: 'swap' }); res.end('{}'); return; }
  res.end(JSON.stringify({ pid: process.pid, failed }));
});
process.on('message', (m) => { if (m && m.valey === 'swap-failed') failed = m.detail; });
server.listen(Number(process.env.PORT), '127.0.0.1', () => process.send({ valey: 'bound', port: Number(process.env.PORT), host: '127.0.0.1' }));`);
const port2 = await freePort();
const sup2 = spawn(process.execPath, [path.join(ROOT, 'server/supervisor.js')], {
  cwd: ROOT, env: { ...process.env, PORT: String(port2), VALEY_WORKER_EXEC: fakeWorker }, detached: true, stdio: 'ignore',
});
procs.push(sup2);
const b2 = `http://127.0.0.1:${port2}`;
let first = null;
await until(async () => { try { first = await (await fetch(b2 + '/')).json(); return true; } catch { return false; } });
await fetch(b2 + '/swap');
let after = null;
await until(async () => { try { after = await (await fetch(b2 + '/')).json(); return !!after.failed; } catch { return false; } });
ok('a new office that fails to start leaves the old one serving', first && after && after.pid === first.pid, { first, after });
ok('and the old one is told why, in the new one’s own last words', after && /exited with code 3/.test(after.failed || '') && /the new code is broken/.test(after.failed || ''), after);

cleanup();
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
