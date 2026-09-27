// node tools/test-transcript-cache.mjs — a session that left is forgotten.
//
// Until 13 September 2026 the transcript cache in server/agents.js kept every
// session that ever passed through a running server, each with its files and
// its conversation, and nothing ever took one out. A server that runs for weeks
// is the ordinary case here, not the unlucky one.
//
// The sessions and the settings are the stand's own: the office reads a
// directory of its making, and nothing of this machine's ~/.claude is touched.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 300) : JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-transcripts-'));
const claude = path.join(dir, 'claude');
const work = path.join(dir, 'work');
const ID = '0000aaaa-1111-2222-3333-444455556666';
const sessionFile = path.join(claude, 'sessions', `${process.pid}.json`);
await fsp.mkdir(path.join(claude, 'sessions'), { recursive: true });
await fsp.mkdir(work, { recursive: true });
const projects = path.join(claude, 'projects', work.replace(/[^a-zA-Z0-9]/g, '-'));
await fsp.mkdir(projects, { recursive: true });
// this very process stands in for the agent: alive() asks about its pid
await fsp.writeFile(sessionFile, JSON.stringify({ sessionId: ID, pid: process.pid, cwd: work, startedAt: Date.now() }));
const said = (text) => JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(),
  message: { model: 'stand', content: [{ type: 'text', text }] } });
await fsp.writeFile(path.join(projects, `${ID}.jsonl`), said('hello from the stand') + '\n');

await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ weather: { enabled: false } }));
// The variables come before the import: both are read on it.
process.env.VALEY_SETTINGS = path.join(dir, 'settings.json');
process.env.VALEY_CONFIG_DIR = dir;
process.env.VALEY_CLAUDE_DIR = claude;

const { snapshot, conversation, pruneTranscripts } = await import('../server/agents.js');

const first = await snapshot();
ok('the stand agent is in the office', first.agents.length === 1 && first.agents[0].id === ID, first.agents.map((a) => a.id));
ok('and its conversation is cached', conversation(ID).some((m) => m.text === 'hello from the stand'), conversation(ID));

// the session ends: its record leaves the sessions directory
await fsp.rm(sessionFile);
const gone = await snapshot();
ok('the agent leaves the office', gone.agents.length === 0, gone.agents.length);
ok('its transcript is kept for a while — a session can blink out for a tick', conversation(ID).length > 0);

const now = Date.now();
ok('nine minutes on it is still there', pruneTranscripts([], now + 9 * 60_000) === 0 && conversation(ID).length > 0);
ok('eleven minutes on it is dropped', pruneTranscripts([], now + 11 * 60_000) === 1 && conversation(ID).length === 0);

// a session that comes back is read again from its file, as on the first tick
await fsp.writeFile(sessionFile, JSON.stringify({ sessionId: ID, pid: process.pid, cwd: work, startedAt: Date.now() }));
await snapshot();
ok('a session that returns is read afresh', conversation(ID).some((m) => m.text === 'hello from the stand'), conversation(ID));
ok('and a live one is never dropped, however long the server runs', pruneTranscripts([ID], now + 24 * 3600_000) === 0
  && pruneTranscripts([ID], now + 48 * 3600_000) === 0 && conversation(ID).length > 0);

await fsp.rm(dir, { recursive: true, force: true });
if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');
