// node tools/test-paused-sessions.mjs — a conversation the app put to sleep
// stays in the office.
//
// The desktop app shuts down the CLI of an idle session on its own — its log
// says «[CliGovernor] pressure evicting … (idle 747s)», fourteen times on
// 19 September 2026 — and keeps the chat, resumable, in its list. The office
// knew agents by their processes only, so the agent left the floor the same
// second and took the desk with it: there was nowhere to leave a note, while the
// app was still offering to write to that very chat.
//
// Archiving a chat in the app shuts its CLI down the same way and leaves the
// transcript as fresh, so an archived chat used to sit there asleep for the rest
// of the hour. The app's own record says which is which (isArchived).
//
// The sessions, the transcripts, the app's records and the settings are the
// stand's own: nothing of this machine's ~/.claude or the app's data is read.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 300) : JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-paused-'));
const claude = path.join(dir, 'claude');
const work = path.join(dir, 'work');
await fsp.mkdir(path.join(claude, 'sessions'), { recursive: true });
await fsp.mkdir(work, { recursive: true });
const projects = path.join(claude, 'projects', work.replace(/[^a-zA-Z0-9]/g, '-'));
await fsp.mkdir(projects, { recursive: true });

const ID = (n) => `0000000${n}-1111-2222-3333-44445555666${n}`;
const LIVE = ID(1), SLEPT = ID(2), OLD = ID(3), MIDTURN = ID(4), ASKED = ID(5), BOTH = ID(6), SHELVED = ID(7);

const said = (text, at = new Date()) => JSON.stringify({
  type: 'assistant', timestamp: at.toISOString(), cwd: work,
  message: { model: 'stand', content: [{ type: 'text', text }] },
});
// «Ждёт тебя» is not a question mark: the office reads it off the report tail —
// «Что нужно от меня» filled in, on a turn that ended (endOf in server/agents.js).
const asked = (at = new Date()) => JSON.stringify({
  type: 'assistant', timestamp: at.toISOString(), cwd: work,
  message: { model: 'stand', stop_reason: 'end_turn', content: [{ type: 'text', text:
    'Собрал.\n\n**Текущая фича/задача** — стенд спящих\n**Статус** — собрано\n**Что нужно от меня** — сказать, вливать ли' }] },
});
const tool = (at = new Date()) => JSON.stringify({
  type: 'assistant', timestamp: at.toISOString(), cwd: work,
  message: { model: 'stand', content: [{ type: 'tool_use', id: 'x1', name: 'Bash', input: { command: 'sleep 1' } }] },
});

const write = async (id, lines, mtime) => {
  const file = path.join(projects, `${id}.jsonl`);
  await fsp.writeFile(file, lines.join('\n') + '\n');
  if (mtime) await fsp.utimes(file, mtime / 1000, mtime / 1000);
  return file;
};

// The live one stands on this very process: alive() asks about its pid.
await fsp.writeFile(path.join(claude, 'sessions', `${process.pid}.json`),
  JSON.stringify({ sessionId: LIVE, pid: process.pid, cwd: work, startedAt: Date.now() }));
await write(LIVE, [said('я живой')]);
await write(SLEPT, [said('я ответил и уснул')]);
await write(OLD, [said('это было давно')], Date.now() - 3 * 60 * 60_000);
await write(MIDTURN, [said('начал'), tool()]);
await write(ASKED, [asked()]);
await write(BOTH, [said('у меня и процесс, и свежий транскрипт')]);
await fsp.writeFile(path.join(claude, 'sessions', '999999.json'),
  JSON.stringify({ sessionId: BOTH, pid: process.pid, cwd: work, startedAt: Date.now() }));

await write(SHELVED, [said('меня убрали в архив')]);

// The app's records, laid out as it lays them: <account>/<org>/local_<id>.json.
// The live one is marked archived too — a process still running wins over the
// mark, since an archived chat has none.
const desktop = path.join(dir, 'desktop');
const org = path.join(desktop, 'account', 'org');
await fsp.mkdir(org, { recursive: true });
const record = (n, cli, isArchived) => fsp.writeFile(path.join(org, `local_${n}.json`),
  JSON.stringify({ sessionId: `local_${n}`, cliSessionId: cli, isArchived, title: 'stand' }));
await record(1, SHELVED, true);
await record(2, SLEPT, false);
await record(3, LIVE, true);
await fsp.writeFile(path.join(org, 'local_4.json'), '{ half-written');

await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ weather: { enabled: false } }));
// The variables come before the import: both are read on it.
process.env.VALEY_SETTINGS = path.join(dir, 'settings.json');
process.env.VALEY_CONFIG_DIR = dir;
process.env.VALEY_CLAUDE_DIR = claude;
process.env.VALEY_DESKTOP_DIR = desktop;

const { pausedSessions, liveSessions, snapshot } = await import('../server/agents.js');

// ------------------------------------------------------------------ the scan
const live = await liveSessions();
ok('the live sessions are the ones with a process', live.map((s) => s.sessionId).sort().join() === [LIVE, BOTH].sort().join(), live.map((s) => s.sessionId));

let now = Date.now();
const slept = await pausedSessions(live, now);
const ids = slept.map((s) => s.sessionId);
ok('a conversation touched within the hour is asleep, not gone', ids.includes(SLEPT), ids);
ok('one touched three hours ago is not', !ids.includes(OLD), ids);
ok('one that has a process is not listed twice', !ids.includes(LIVE) && !ids.includes(BOTH), ids);
ok('the sleeping one knows where it sat', (slept.find((s) => s.sessionId === SLEPT) || {}).cwd === work, slept[0]);
ok('and carries no pid, because there is no process', (slept.find((s) => s.sessionId === SLEPT) || {}).pid === 0, slept[0]);
ok('one the person archived in the app is gone, not asleep', !ids.includes(SHELVED), ids);
ok('one the app keeps unarchived stays asleep', ids.includes(SLEPT), ids);

// The scan is a stat per transcript and a tick is a second, so it is cached;
// a later clock goes past the cache rather than around it.
const again = await pausedSessions(live, now + 60_000);
ok('a second look sees the same sleepers', again.map((s) => s.sessionId).sort().join() === ids.sort().join(), again.map((s) => s.sessionId));

// ------------------------------------------------------------- on the floor
const snap = await snapshot();
const by = (id) => snap.agents.find((a) => a.id === id);
ok('the office seats the live and the sleeping alike', snap.agents.length === 5, snap.agents.map((a) => a.id.slice(0, 8) + ':' + a.status));
ok('the live one is not marked asleep', by(LIVE) && by(LIVE).paused === false, by(LIVE));
ok('the sleeping one is marked, and rests', by(SLEPT) && by(SLEPT).paused === true && by(SLEPT).status === 'idle', by(SLEPT));
ok('it keeps its room, so the desk stays where it was', by(SLEPT) && by(SLEPT).project === path.basename(work), by(SLEPT));
ok('and what it said is still readable — the note goes to a name, not to a pid', /уснул/.test((by(SLEPT) || {}).lastSaid || ''), (by(SLEPT) || {}).lastSaid);
// The app evicts an idle session, but a turn can be cut mid-step all the same:
// a tool call with nobody to finish it is not «working».
ok('one asleep mid-step is resting, not working', by(MIDTURN) && by(MIDTURN).status === 'idle', by(MIDTURN));
// The question it asked is still the person's to answer, so the plate stays up.
ok('one that asked still waits for you', by(ASKED) && by(ASKED).status === 'awaiting', by(ASKED));
ok('the one with a process and a fresh transcript is one person', snap.agents.filter((a) => a.id === BOTH).length === 1, snap.agents.map((a) => a.id));
ok('the archived one has no desk', !by(SHELVED), snap.agents.map((a) => a.id.slice(0, 8)));
ok('an archived mark does not evict a running process', by(LIVE) && by(LIVE).paused === false, by(LIVE));

// Taken out of the archive, the chat is back: the mark is read again when the
// app rewrites the record, and the cache is past its ten seconds.
await record(1, SHELVED, false);
await fsp.utimes(path.join(org, 'local_1.json'), (now + 5_000) / 1000, (now + 5_000) / 1000);
const back = await pausedSessions(live, now + 120_000);
ok('unarchived, it sits down again', back.some((s) => s.sessionId === SHELVED), back.map((s) => s.sessionId));

await fsp.rm(dir, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall green');
process.exit(bad ? 1 : 0);
