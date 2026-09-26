// node tools/test-codex.mjs — Codex threads at the office's desks.
//
// Shapes read off this machine's ~/.codex on 13 September 2026: 88 rollout
// files from Codex Desktop and the VS Code extension, and the app-server
// holding the writer lock of the one thread it had open. The Codex directory
// here is the stand's own; the live lock is held open by this very process, so
// lsof finds a real holder, and the stale one is held by nobody.
//
// The last check guards the public pictures: a demo office points
// VALEY_CLAUDE_DIR at invented sessions, and it must not pick up the real
// Codex threads of the machine it runs on.
globalThis.document = { documentElement: {}, title: '' };
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-codex-'));
const codex = path.join(dir, 'codex');
const LIVE = '01a0aaaa-0000-7000-8000-000000000001';
const STALE = '01a0aaaa-0000-7000-8000-000000000002';
const HELPER = '01a0aaaa-0000-7000-8000-000000000003';
const work = '/Users/marina/Projects/tide-charts';
const day = path.join(codex, 'sessions', '2026', '09', '13');
await fsp.mkdir(day, { recursive: true });
await fsp.mkdir(path.join(codex, 'thread-writer-locks'), { recursive: true });

const at = (s) => new Date(Date.parse('2026-09-13T10:00:00Z') + s * 1000).toISOString();
const line = (s, type, payload) => JSON.stringify({ timestamp: at(s), type, payload });
const report = (need) => `Готово.\n\n**Текущая фича/задача** — часовой пояс на графике\n**Статус** — починено\n**Что нужно от меня** — ${need}\n`;
const meta = (id, source) => line(0, 'session_meta', {
  id, session_id: id, timestamp: at(0), cwd: work, originator: 'Codex Desktop', source,
  git: { branch: 'fix/timezone-drift', commit_hash: 'abc', repository_url: 'https://example.invalid/tide.git' },
});
const rollout = (id) => path.join(day, `rollout-2026-09-13T10-00-00-${id}.jsonl`);
const turn = [
  line(1, 'event_msg', { type: 'task_started', turn_id: 't1' }),
  line(2, 'turn_context', { turn_id: 't1', cwd: work, model: 'gpt-invented', approval_policy: 'on-request' }),
  // the injected context: the rulebook, not a prompt anybody typed
  line(3, 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions for /x' }] }),
  line(3, 'event_msg', { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'The chart is an hour off' }] } }),
  line(4, 'event_msg', { type: 'item_completed', item: { type: 'CommandExecution', cwd: 'file://' + work, command: ['/bin/zsh', '-lc', 'sed -n 1,40p src/chart.js'], parsed_cmd: [{ type: 'read', path: 'src/chart.js' }] } }),
  line(5, 'event_msg', { type: 'item_completed', item: { type: 'FileChange', changes: { [work + '/src/chart.js']: { type: 'update' } } } }),
  line(6, 'event_msg', { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text: report('Ничего') }] } }),
  line(7, 'event_msg', { type: 'task_complete', turn_id: 't1', last_agent_message: report('Ничего') }),
];
await fsp.writeFile(rollout(LIVE), [meta(LIVE, 'vscode'), ...turn].join('\n') + '\n');
await fsp.writeFile(rollout(STALE), meta(STALE, 'vscode') + '\n');
await fsp.writeFile(rollout(HELPER), meta(HELPER, { subagent: { other: 'guardian' } }) + '\n');
await fsp.writeFile(path.join(codex, 'session_index.jsonl'),
  JSON.stringify({ id: LIVE, thread_name: 'Old name' }) + '\n' + JSON.stringify({ id: LIVE, thread_name: 'Timezone on the chart' }) + '\n');
const lock = (id) => path.join(codex, 'thread-writer-locks', id + '.lock');
for (const id of [LIVE, STALE, HELPER]) await fsp.writeFile(lock(id), '');
const heldFds = [fs.openSync(lock(LIVE), 'r'), fs.openSync(lock(HELPER), 'r')];

await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ weather: { enabled: false } }));
process.env.VALEY_CODEX_DIR = codex;
process.env.VALEY_CLAUDE_DIR = path.join(dir, 'no-claude');
process.env.VALEY_SETTINGS = path.join(dir, 'settings.json');
process.env.VALEY_CONFIG_DIR = dir;
const { liveCodexSessions, applyCodexLine } = await import('../server/codex.js');
const { emptyState, statusOf, snapshot, conversation } = await import('../server/agents.js');

// --- which threads are at their desks -------------------------------------
const live = await liveCodexSessions();
ok('the open thread is found', live.length === 1 && live[0].sessionId === LIVE, live.map((s) => s.sessionId));
ok('a lock nobody holds is a closed thread', !live.some((s) => s.sessionId === STALE));
ok('a sub-agent is not an agent, even with its lock held', !live.some((s) => s.sessionId === HELPER));
ok('the thread carries its name as the app shows it, the latest one', live[0] && live[0].title === 'Timezone on the chart', live[0]);

// --- what the lines say -----------------------------------------------------
const read = (lines) => { const st = emptyState(); for (const l of lines) applyCodexLine(st, l); return st; };
const now = Date.parse(at(8));
const st = read([meta(LIVE, 'vscode'), ...turn]);
ok('the branch comes from the session start', st.branch === 'fix/timezone-drift', st.branch);
ok('the model from the turn', st.model === 'gpt-invented', st.model);
ok('the prompt is what the person typed, not the injected rulebook', st.lastUserPrompt === 'The chart is an hour off', st.lastUserPrompt);
ok('the edited file is on the desk as made', st.files.get(work + '/src/chart.js')?.made === true, [...st.files.keys()]);
ok('the last act is the edit', st.lastTool === 'Edit', st.lastTool);
ok('the task comes from the report', st.task && st.task.what === 'часовой пояс на графике', st.task);
ok('a report that needs nothing is at rest', statusOf(st, now) === 'idle', statusOf(st, now));

const asked = read([meta(LIVE, 'vscode'), ...turn.slice(0, -1),
  line(7, 'event_msg', { type: 'task_complete', last_agent_message: report('посмотреть кадр') })]);
ok('a report that asks is awaiting', statusOf(asked, now) === 'awaiting', statusOf(asked, now));
const open = read([meta(LIVE, 'vscode'), ...turn, line(9, 'event_msg', { type: 'task_started', turn_id: 't2' })]);
ok('a new turn is working', statusOf(open, Date.parse(at(10))) === 'working', statusOf(open, Date.parse(at(10))));
const cut = read([meta(LIVE, 'vscode'), ...turn, line(9, 'event_msg', { type: 'task_started' }), line(10, 'event_msg', { type: 'turn_aborted' })]);
ok('an aborted turn is stopped', statusOf(cut, Date.parse(at(11))) === 'stopped', statusOf(cut, Date.parse(at(11))));

// --- in the snapshot ----------------------------------------------------------
const snap = await snapshot();
const a = snap.agents.find((x) => x.id === LIVE);
ok('the snapshot seats the Codex thread', !!a, snap.agents.map((x) => x.id));
ok('as provider codex, with no pid of its own', a && a.provider === 'codex' && a.pid === null, a && { provider: a.provider, pid: a.pid });
ok('with a name and a desk like anyone else', a && a.name && Number.isInteger(a.seat), a && { name: a.name, seat: a.seat });
ok('its title and branch', a && a.title === 'Timezone on the chart' && a.branch === 'fix/timezone-drift', a && { title: a.title, branch: a.branch });
ok('and its conversation opens', conversation(LIVE).some((m) => m.role === 'user' && m.text === 'The chart is an hour off'));

// --- a task into the thread ---------------------------------------------------
// Through `codex queue`; the CLI here is the stand's own and fails the way the
// real one does for a thread it cannot find (probed 13 September 2026).
const { queueToThread } = await import('../server/codex.js');
const failing = path.join(dir, 'codex-failing');
await fsp.writeFile(failing, `#!${process.execPath}\nprocess.stderr.write('Error: failed to queue session message: thread/queue/add failed: no rollout found for thread id x\\n'); process.exit(1);\n`, { mode: 0o755 });
process.env.CODEX_BIN = failing;
const refused = await queueToThread({ text: 'hi' }, { id: 'x', name: 'x' });
ok('a refused queue is a failed task, not a delivered one', refused.state === 'failed' && !refused.queued, refused);
ok('with Codex\'s own words, without its «Error:»', /^failed to queue session message/.test(refused.error || ''), refused.error);
delete process.env.CODEX_BIN;

// A task can be a dropped file with no words at all (#drop-files, 17 September
// 2026). `queue` is given one --message, so the paths have to ride inside it,
// or the thread is queued an empty line and the file is simply lost.
const recording = path.join(dir, 'codex-recording');
const argvOut = path.join(dir, 'argv.json');
// `require`, not `import`: a file with no extension is CommonJS to Node, and
// only Node 22 guesses otherwise. On 18 and 20 the import line is a syntax
// error, the recording is never written, and the case below died on a missing
// argv.json — on the CI runner's older legs only.
await fsp.writeFile(recording, `#!${process.execPath}\nconst fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(argvOut)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
process.env.CODEX_BIN = recording;
const shot = '/Users/kolya/.config/valey/inbox/2026-09-17/screen.png';
const withFile = await queueToThread({ text: '', files: [{ path: shot }] }, { id: 'live', name: 'x' });
const argv = JSON.parse(await fsp.readFile(argvOut, 'utf8'));
const msg = argv[argv.indexOf('--message') + 1];
ok('a file-only task is queued as the path, not as an empty message', withFile.state === 'delivered' && msg === `@${shot}`, { state: withFile.state, msg });
delete process.env.CODEX_BIN;

// --- the public pictures ------------------------------------------------------
// A separate process: the directory is decided when the module loads.
const probe = `import('${new URL('../server/codex.js', import.meta.url).href}').then(async (m) => console.log(JSON.stringify(await m.liveCodexSessions())))`;
const env = { ...process.env, VALEY_CLAUDE_DIR: path.join(dir, 'no-claude') };
delete env.VALEY_CODEX_DIR;
const seen = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe], { env, encoding: 'utf8' }).trim().split('\n').pop());
ok('a stand with invented Claude sessions reads no Codex at all', Array.isArray(seen) && seen.length === 0, seen);

for (const fd of heldFds) fs.closeSync(fd);
await fsp.rm(dir, { recursive: true, force: true });
if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');
