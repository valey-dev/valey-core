// node tools/test-desk.mjs — the notes on the desks outlive a restart.
//
// Until 13 September 2026 they lived only in the server's memory: an update
// handed them over, a restart swept every desk clean — including the notes
// nobody had read yet, which is what a note is for. Here a real office is
// started, given a note, stopped the way a terminal stops it, and started
// again on the same settings: the note must still be there, the next one must
// not reuse its number, and a note that was on its way into a chat must not
// come back as «sending» forever.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deskFile, keepable, loadDesk, deskWriter, PER_AGENT, MAX_AGE_MS, MAX_NOTES } from '../server/desk.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------- the file name
ok('the main office keeps desk.json beside settings.json',
  deskFile({ settingsFile: '/home/x/.config/valey/settings.json', port: 5177 }) === '/home/x/.config/valey/desk.json');
ok('a stand with its own settings keeps its own desk',
  deskFile({ settingsFile: '/tmp/valey-topic.json', port: 5177 }) === '/tmp/valey-topic.desk.json');
ok('an office on another port with shared settings keeps its own desk',
  deskFile({ settingsFile: '/home/x/.config/valey/settings.json', port: 5188 }) === '/home/x/.config/valey/desk-5188.json');

// ------------------------------------------------------------- what is kept
const now = Date.parse('2026-09-13T12:00:00Z');
const note = (id, agentId, at = now - 1000, state = 'note') => ({ id, agentId, text: `note ${id}`, at, state });
{
  const seven = Array.from({ length: 7 }, (_, i) => note(i + 1, 'a'));
  const kept = keepable([...seven, note(8, 'b')], now);
  ok(`an agent keeps its last ${PER_AGENT}, as many as the desk shows`,
    kept.filter((t) => t.agentId === 'a').map((t) => t.id).join() === '3,4,5,6,7', kept.map((t) => t.id));
  ok('another agent keeps its own', kept.some((t) => t.id === 8));
  ok('the order stays the outbox order', kept.map((t) => t.id).join() === '3,4,5,6,7,8', kept.map((t) => t.id));
  const old = keepable([note(1, 'a', now - MAX_AGE_MS - 1), note(2, 'a')], now);
  ok('a month-old note is dropped', old.map((t) => t.id).join() === '2', old);
  const flood = keepable(Array.from({ length: MAX_NOTES + 50 }, (_, i) => note(i + 1, `agent-${i}`)), now);
  ok(`a flood of notes for made-up agents stops at ${MAX_NOTES}, the newest`,
    flood.length === MAX_NOTES && flood[0].id === 51, { n: flood.length, first: flood[0]?.id });
  ok('something that is not a note is not kept', keepable([null, { agentId: 'a' }, { text: 'x' }, note(1, 'a')], now).length === 1);
}

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-desk-'));
try {
  ok('no file is an empty desk', (await loadDesk(path.join(dir, 'none.json'))).outbox.length === 0);
  fs.writeFileSync(path.join(dir, 'broken.json'), '{"outbox": [');
  const broken = await loadDesk(path.join(dir, 'broken.json'));
  ok('a broken file is an empty desk, not a failed start', broken.outbox.length === 0 && broken.taskSeq === 0, broken);

  const file = path.join(dir, 'w.json');
  const write = deskWriter(file);
  await write([note(3, 'a', Date.now())], 9);
  const back = await loadDesk(file);
  ok('what is written is read back', back.outbox.length === 1 && back.outbox[0].text === 'note 3', back);
  ok('the counter comes back too, so numbers are not reused', back.taskSeq === 9, back.taskSeq);
  ok('the file is the owner’s alone (0600)', (fs.statSync(file).mode & 0o777) === 0o600, (fs.statSync(file).mode & 0o777).toString(8));
  const before = fs.statSync(file).mtimeMs;
  await nap(20);
  await write([note(3, 'a', JSON.parse(fs.readFileSync(file, 'utf8')).outbox[0].at)], 9);
  ok('an unchanged desk is not written again', fs.statSync(file).mtimeMs === before);

  // ----------------------------------------------------------- a real office
  const settings = path.join(dir, 'office.json');
  fs.writeFileSync(settings, JSON.stringify({
    access: { mode: 'private', token: '', invites: [], devices: [] },
    weather: { enabled: false }, delivery: { mode: 'default' },
  }, null, 2));
  const port = await new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port), HOST: '127.0.0.1',
    VALEY_SETTINGS: settings, VALEY_CONFIG_DIR: path.join(dir, 'config'),
    VALEY_CLAUDE_DIR: path.join(dir, 'no-claude'), VALEY_DELIVER_DIR: path.join(dir, 'runs'),
    VALEY_JOURNAL: path.join(dir, 'journal.jsonl'),
  };
  delete env.VALEY_STAND;
  const server = fileURLToPath(new URL('../server/index.js', import.meta.url));
  const up = async () => {
    const child = spawn(process.execPath, [server], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    for (let i = 0; i < 100; i += 1) {
      try { if ((await fetch(base + '/api/whoami')).ok) return { child, log: () => log }; } catch { /* not yet */ }
      await nap(100);
    }
    throw new Error('the office did not come up:\n' + log);
  };
  const down = (office) => new Promise((resolve) => { office.child.once('exit', resolve); office.child.kill('SIGINT'); });
  const leave = (text) => fetch(base + '/api/task', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ agentId: 'agent-a', text }),
  }).then((r) => r.json());
  const onDisk = () => JSON.parse(fs.readFileSync(deskFile({ settingsFile: settings, port }), 'utf8'));

  let office = await up();
  try {
    const first = await leave('check the lamp in the lobby');
    ok('a note is left on the desk', first.ok && first.task?.state === 'note', first);
    ok('and is on disk at once, not a tick later', onDisk().outbox.some((t) => t.text === 'check the lamp in the lobby'), onDisk());
  } finally { await down(office); }

  // A note that was on its way into a chat when the office went down, with no
  // run left behind to read: the next office must say it failed.
  const d = onDisk();
  d.outbox.push({ id: d.taskSeq + 1, agentId: 'agent-b', text: 'in flight', at: Date.now(), state: 'sending', reply: null, error: null });
  d.taskSeq += 1;
  fs.writeFileSync(deskFile({ settingsFile: settings, port }), JSON.stringify(d));

  office = await up();
  try {
    ok('the office says how many notes it found', /notes on the desks: 2/.test(office.log()), office.log());
    const second = await leave('and the radio');
    ok('the next note takes the next number', second.task?.id === 3, second.task);
    const disk = onDisk();
    ok('the note from before the restart is still on the desk',
      disk.outbox.some((t) => t.id === 1 && t.text === 'check the lamp in the lobby' && t.state === 'note'), disk.outbox);
    let flight = null;
    for (let i = 0; i < 40 && !(flight && flight.state === 'failed'); i += 1) {
      await nap(100);
      flight = onDisk().outbox.find((t) => t.id === 2);
    }
    ok('a note left «sending» by a restart is settled, not stuck', flight?.state === 'failed', flight);
  } finally { await down(office); }
} finally {
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
