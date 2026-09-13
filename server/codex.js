// Codex sessions as office workers, next to Claude's. Codex Desktop and the
// Codex CLI keep one file per thread under ~/.codex/sessions — rollout JSONL —
// and this module finds the live ones and reads them into the same state
// Claude transcripts are read into (server/agents.js), so the snapshot, the
// names, the desks and the card do not care where an agent came from.
//
// What was found on this machine on 13 September 2026, over 88 rollout files
// and the running Codex Desktop (ChatGPT.app, app-server 0.153):
//
//  - A thread is open while a Codex process holds its writer lock,
//    thread-writer-locks/<id>.lock. There is no file per process as there is
//    for Claude; the app-server keeps the lock and the rollout open for loaded
//    threads only and lets go when the thread is closed.
//  - Sub-agents ("guardian", spawned threads) have rollout files of their own,
//    with an object in session_meta.source. They are the agent's helpers, not
//    agents: seated, they would fill a room with people nobody started.
//  - What the person typed is in item_completed/UserMessage. The user message
//    in response_item carries the injected context — AGENTS.md, environment —
//    and read as a prompt it would put the rulebook in «asked».
//  - A turn is task_started … task_complete or turn_aborted, and
//    task_complete carries the last reply: the report's «Что нужно от меня»
//    decides awaiting or at rest the same way it does for Claude.
//  - The branch is in session_meta.git, written once at the start; nothing
//    later repeats it.
//  - Permission requests are not written to the rollout at all, so the office
//    cannot see a Codex agent waiting for one from the files alone. Codex has
//    hooks shaped like Claude's (PermissionRequest included); that is the way
//    in, and a separate step.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { useTool, remember, born, gap, reportTail, endOf } from './agents.js';

// A stand that points the office at invented Claude sessions must not get the
// real Codex ones from next door: a demo office photographs its floor for
// public release notes. So Codex is read only from where it is pointed, or
// from home when nothing is redirected at all.
const CODEX_DIR = process.env.VALEY_CODEX_DIR
  || (process.env.VALEY_CLAUDE_DIR ? null : path.join(os.homedir(), '.codex'));
const LOCKS_DIR = CODEX_DIR && path.join(CODEX_DIR, 'thread-writer-locks');
const SESSIONS_DIR = CODEX_DIR && path.join(CODEX_DIR, 'sessions');
const INDEX_FILE = CODEX_DIR && path.join(CODEX_DIR, 'session_index.jsonl');

const ROLLOUT_RE = /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;
const LOCK_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.lock$/;

// Which of these files a process holds open: path -> pid, one lsof for all of
// them (see isHeld for how often). Where it cannot answer — not installed,
// timed out — the answer is null and a lock file is trusted by existing: a
// stale one then seats a thread that has closed, which is the lesser evil
// than an office that never shows Codex at all.
function holders(files) {
  if (!files.length) return Promise.resolve(new Map());
  return new Promise((resolve) => {
    execFile('lsof', ['-F', 'pn', '--', ...files], { timeout: 3000 }, (err, stdout) => {
      // lsof exits 1 when some of the files are not open — that is an answer
      if (err && !stdout) return resolve(err.code === 1 ? new Map() : null);
      const out = new Map();
      let pid = null;
      for (const l of String(stdout).split('\n')) {
        if (l[0] === 'p') pid = Number(l.slice(1));
        else if (l[0] === 'n' && pid) out.set(l.slice(1), pid);
      }
      resolve(out);
    });
  });
}

// lsof walks every process on the machine: 290 ms here, measured, on each
// call. A closed thread deletes its lock file, so the file existing is most of
// the answer and lsof only guards against one left behind by a crash — asked
// every half minute, not every tick. A lock newer than the last ask is taken
// as held: a thread opened a second ago is not a crash leftover.
const HELD_TTL = 30_000;
let heldCache = { at: 0, map: null, asked: new Set() };
async function isHeld(files) {
  if (Date.now() - heldCache.at > HELD_TTL) {
    heldCache = { at: Date.now(), map: await holders(files), asked: new Set(files) };
  }
  const { map, asked } = heldCache;
  return (f) => !map || !asked.has(f) || map.has(f);
}

// id -> rollout path, rebuilt every ten seconds, or at once for an id it does
// not know yet: a thread opened a moment ago has a lock before the index has
// seen its file.
let rollouts = new Map();
let indexedAt = 0;
async function indexRollouts(force = false) {
  if (!force && Date.now() - indexedAt < 10_000) return rollouts;
  const map = new Map();
  async function walk(dir, depth) {
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && depth < 4) await walk(path.join(dir, e.name), depth + 1);
      const m = e.isFile() && e.name.match(ROLLOUT_RE);
      if (m) map.set(m[1], path.join(dir, e.name));
    }
  }
  await walk(SESSIONS_DIR, 0);
  rollouts = map;
  indexedAt = Date.now();
  return map;
}

// The first line of a rollout is session_meta. It carries the base
// instructions, tens of kilobytes, so the read is generous; it never changes,
// so it is read once per thread.
const metas = new Map();
async function metaOf(file) {
  if (metas.has(file)) return metas.get(file);
  let meta = null;
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const buf = Buffer.alloc(512 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const first = buf.toString('utf8', 0, bytesRead).split('\n')[0];
    const r = JSON.parse(first);
    if (r.type === 'session_meta') meta = r.payload;
  } catch { /* half-written, or not a rollout */ } finally { await fh?.close(); }
  if (meta) metas.set(file, meta);
  return meta;
}

// Thread names as the app shows them. The index is appended to, so the last
// line for an id is its current name.
async function threadNames() {
  const names = new Map();
  let text = '';
  try { text = await fsp.readFile(INDEX_FILE, 'utf8'); } catch { return names; }
  for (const l of text.split('\n')) {
    try { const r = JSON.parse(l); if (r.id && r.thread_name) names.set(r.id, r.thread_name); } catch { /* a torn line */ }
  }
  return names;
}

export async function liveCodexSessions() {
  if (!CODEX_DIR) return [];
  let locks = [];
  try { locks = await fsp.readdir(LOCKS_DIR); } catch { return []; }
  const ids = locks.map((f) => (f.match(LOCK_RE) || [])[1]).filter(Boolean);
  if (!ids.length) return [];
  // lsof names files by their real path; a directory reached through a
  // symlink (/var → /private/var on macOS) would never match without this
  let realLocks = LOCKS_DIR;
  try { realLocks = await fsp.realpath(LOCKS_DIR); } catch { /* read above, so it exists */ }
  const lockOf = (id) => path.join(realLocks, id + '.lock');
  const held = await isHeld(ids.map(lockOf));
  let index = await indexRollouts();
  if (ids.some((id) => !index.has(id))) index = await indexRollouts(true);
  const names = await threadNames();
  const out = [];
  for (const id of ids) {
    if (!held(lockOf(id))) continue;
    const file = index.get(id);
    if (!file) continue;
    const meta = await metaOf(file);
    // a sub-agent's source is an object; a thread a person opened is a string
    if (!meta || typeof meta.source !== 'string') continue;
    out.push({
      sessionId: id,
      provider: 'codex',
      file,
      cwd: meta.cwd || '',
      startedAt: Date.parse(meta.timestamp || '') || 0,
      title: names.get(id) || '',
      origin: meta.originator || '',
    });
  }
  return out;
}

// --------------------------------------------------------------- delivery
// A task goes into a Codex thread through `codex queue --thread <id>
// --message <text>`. It is not a second writer: the CLI starts a throwaway
// app-server that checks the thread exists and puts the message into Codex's
// shared queue (~/.codex/queue_1.sqlite, queued_items), and whoever holds the
// thread — the Desktop app here — takes it in when the turn in progress ends.
// So it returns at once, and the reply lands in the rollout like any other:
// the office sees it there, there is nothing to wait for on this side.
// Probed on 13 September 2026 with a thread that does not exist: 0.25 s, «no
// rollout found for thread id», no daemon left running. `codex exec resume`
// was not used: it would be a second process writing the thread the app
// holds.
const run = (file, args, opts) => new Promise((resolve) => {
  execFile(file, args, opts, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
});

let codexBin = { at: 0, path: null };
// Found once; a miss is asked again after a minute, as for claude.
export async function codexCli() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  if (codexBin.path || Date.now() - codexBin.at < 60_000) return codexBin.path;
  const { err, stdout } = await run('/bin/sh', ['-lc', 'command -v codex'], { timeout: 5000 });
  codexBin = { at: Date.now(), path: (!err && stdout.trim().split('\n')[0]) || null };
  return codexBin.path;
}

export async function codexDelivery() {
  const p = await codexCli();
  return { available: !!p, path: p };
}

// task is mutated in place, like deliver() does for Claude
export async function queueToThread(task, agent) {
  const bin = await codexCli();
  if (!bin) {
    task.state = 'failed'; task.error = 'the codex CLI was not found in PATH'; task.errorKey = 'err.codexNoCli';
    return task;
  }
  task.state = 'sending';
  task.startedAt = Date.now();
  const { err, stderr, stdout } = await run(bin, ['queue', '--thread', agent.id, '--message', task.text], { timeout: 30_000 });
  task.finishedAt = Date.now();
  task.provider = 'codex';
  if (err) {
    task.state = 'failed';
    task.error = (stderr.trim() || stdout.trim() || err.message).replace(/^Error:\s*/, '').slice(0, 500);
  } else {
    // delivered into the thread's queue; the answer comes back through the rollout
    task.state = 'delivered';
    task.queued = true;
  }
  console.log(`[deliver] codex ${agent.name || agent.id}: ${task.state}`);
  return task;
}

// ----------------------------------------------------------------- the lines

const textOf = (content) => (Array.isArray(content) ? content : [])
  .map((b) => (b && typeof b.text === 'string' ? b.text : '')).filter(Boolean).join('\n').trim();
const localPath = (p) => {
  if (typeof p !== 'string' || !p) return '';
  try { return p.startsWith('file://') ? fileURLToPath(p) : p; } catch { return ''; }
};

// A completed item, translated into the tool names describeTool knows. A
// command Codex has parsed as a read or a search is one; anything else is the
// shell.
function item(st, it, ts) {
  const t = it.type;
  if (t === 'UserMessage') {
    const txt = textOf(it.content);
    if (txt) { st.lastUserPrompt = txt.slice(0, 400); remember(st, 'user', txt, ts); }
    st.ended = '';
  } else if (t === 'AgentMessage') {
    const txt = textOf(it.content);
    if (!txt) return;
    born(st, ts);
    gap(st.shift, Date.parse(ts || '') || 0, st.clock);
    st.lastAssistantText = txt; st.turns++; remember(st, 'assistant', txt, ts);
    st.shift.turns++; st.shift.chars += txt.length;
    const said = reportTail(txt);
    if (said) st.task = said;
  } else if (t === 'CommandExecution') {
    const pc = (it.parsed_cmd || [])[0] || {};
    const cwd = localPath(it.cwd);
    const abs = (p) => (p && cwd && !path.isAbsolute(p) ? path.join(cwd, p) : p || '');
    if (pc.type === 'read') useTool(st, 'Read', { file_path: abs(pc.path || pc.name) });
    else if (pc.type === 'search') useTool(st, 'Grep', {});
    else if (pc.type === 'list_files') useTool(st, 'Glob', {});
    else {
      const cmd = Array.isArray(it.command) ? it.command[it.command.length - 1] : String(it.command || '');
      useTool(st, 'Bash', { command: cmd });
    }
  } else if (t === 'FileChange') {
    for (const p of Object.keys(it.changes || {})) useTool(st, 'Edit', { file_path: p });
  } else if (t === 'McpToolCall') {
    useTool(st, `mcp__${it.server || 'codex'}__${it.tool || 'tool'}`, it.arguments || {});
  } else if (t === 'WebSearch') {
    useTool(st, 'WebSearch', { query: it.query || '' });
  } else if (t === 'ImageView') {
    useTool(st, 'Read', { file_path: localPath(it.path) });
  } else if (t === 'Extension') {
    if (it.kind === 'web.search') useTool(st, 'WebSearch', { query: it.query || '' });
    else if (/^image_gen/.test(it.kind || '')) useTool(st, 'Artifact', {});
  } else if (t === 'SubAgentActivity' && it.kind === 'started') {
    useTool(st, 'Task', {});
  } else if (t === 'Plan') {
    useTool(st, 'TodoWrite', {});
  }
}

export function applyCodexLine(st, line) {
  if (!line) return;
  let r;
  try { r = JSON.parse(line); } catch { return; }
  if (r.timestamp) st.lastTs = Math.max(st.lastTs, Date.parse(r.timestamp) || 0);
  const p = r.payload || {};
  if (r.type === 'session_meta') {
    if (p.git && p.git.branch) st.branch = p.git.branch;
    born(st, p.timestamp || r.timestamp);
  } else if (r.type === 'turn_context') {
    if (p.model) st.model = p.model;
  } else if (r.type === 'event_msg') {
    if (p.type === 'task_started') st.ended = '';
    else if (p.type === 'turn_aborted') st.ended = 'stopped';
    else if (p.type === 'task_complete') {
      const said = p.last_agent_message ? reportTail(p.last_agent_message) : null;
      if (said) st.task = said;
      st.ended = endOf(said);
    } else if (p.type === 'item_completed' && p.item) item(st, p.item, r.timestamp);
  }
}
