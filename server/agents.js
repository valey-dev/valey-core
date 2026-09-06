// Discovers live Claude Code sessions and turns each one into an "office worker":
// who they are, what they're doing right now, what they last produced.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { getSettings, patchSettings } from './settings.js';
import { projectInfo, repoRoot, repoRootCached } from './stack.js';

// Where the office reads sessions from. The variable is for the stands: until
// 4 September 2026 the directory was pinned to the home one, and transcript
// parsing could only be checked against this machine's live sessions. A stand
// that needs a real agent is a stand that fails on a clean machine and in CI.
const CLAUDE_DIR = process.env.VALEY_CLAUDE_DIR || path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const FIRST_READ_BYTES = 1024 * 1024;

// ---------------------------------------------------------------- discovery

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// The sessions directory is keyed by pid rather than by sessionId, so one
// session sometimes sits in two files: the old one outlives its process exactly
// until somebody else takes the freed pid — and then alive() honestly says
// "alive" about both. On 30 August 2026 Olya and Grisha doubled this way: one
// name, one desk in the registry, but two bodies in different parts of the
// office.
//
// We take the newest by start time. What matters is not which record is "more
// correct" — it is that the choice does not change from tick to tick, or a
// person would jump between two desks. So an equal startedAt is settled by pid,
// not by the order the directory was read in.
export function dedupeSessions(list) {
  const best = new Map();
  for (const s of list) {
    const cur = best.get(s.sessionId);
    const newer = !cur
      || (s.startedAt || 0) > (cur.startedAt || 0)
      || ((s.startedAt || 0) === (cur.startedAt || 0) && (s.pid || 0) > (cur.pid || 0));
    if (newer) best.set(s.sessionId, s);
  }
  return [...best.values()];
}

export async function liveSessions() {
  let files = [];
  try { files = await fsp.readdir(SESSIONS_DIR); } catch { return []; }
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fsp.readFile(path.join(SESSIONS_DIR, f), 'utf8');
      const s = JSON.parse(raw);
      if (!s.sessionId || !alive(s.pid)) continue;
      out.push(s);
    } catch { /* session file rotated mid-read */ }
  }
  return dedupeSessions(out);
}

const projectDirOf = (cwd) => (cwd || '').replace(/[^a-zA-Z0-9]/g, '-');

// picks the transcript that belongs to this session's own working directory
async function transcriptFor(sessionId, cwd) {
  const paths = transcriptIndex.get(sessionId) || [];
  if (paths.length < 2) return paths[0] || null;
  const want = projectDirOf(cwd).toLowerCase();
  const exact = paths.find((p) => path.basename(path.dirname(p)).toLowerCase() === want);
  if (exact) return exact;
  const stats = await Promise.all(paths.map(async (p) => {
    try { return { p, m: (await fsp.stat(p)).mtimeMs }; } catch { return { p, m: 0 }; }
  }));
  console.warn(`[transcript] ${sessionId.slice(0, 8)}: ${paths.length} копий, беру свежую`);
  return stats.sort((a, b) => b.m - a.m)[0].p;
}

// sessionId -> transcript paths, rebuilt lazily
let transcriptIndex = new Map();
let transcriptIndexedAt = 0;

async function indexTranscripts() {
  if (Date.now() - transcriptIndexedAt < 10_000) return transcriptIndex;
  const map = new Map();
  let dirs = [];
  try { dirs = await fsp.readdir(PROJECTS_DIR); } catch { return map; }
  for (const d of dirs) {
    let entries = [];
    try { entries = await fsp.readdir(path.join(PROJECTS_DIR, d)); } catch { continue; }
    for (const e of entries) {
      if (!e.endsWith('.jsonl')) continue;
      const id = e.slice(0, -6);
      // the same conversation can end up under two project folders (resuming it
      // from another directory does that) — keep every copy, pick later by cwd
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(path.join(PROJECTS_DIR, d, e));
    }
  }
  transcriptIndex = map;
  transcriptIndexedAt = Date.now();
  return map;
}

// Incremental tail: each session is read once deep, then only the new bytes.
const cache = new Map(); // sessionId -> { file, offset, pending, st }

// Grades are counted over the whole transcript, not over the tail follow reads.
// Measured on this machine's ~/.claude on 5 September 2026: a 63 MB file holds
// 1096 tool calls and its last megabyte holds 13. A grade built on the tail
// would show a percentage of the work — and not a fixed one, since what fits
// depends on how long the closing replies are rather than on what was done.
// The honest pass costs 350 ms on the largest file here, once per session.
//
// It does not block the tick: the snapshot goes out at once and the grades
// arrive a second later. Otherwise the first look into the office would wait
// for every session to be re-read.
//
// The shift — replies, characters and the gaps between them — is counted in the
// same pass, for the same reason: on the tail it would be a percentage of a
// day. The filter widens from a tool call to any assistant line, which is what
// a reply is; measured at the same 350 ms on the largest file here.
async function deepSkills(st, file, until) {
  if (until <= 0) return;
  const own = { last: 0 };
  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8', start: 0, end: until - 1 }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    // JSON.parse only where the agent speaks: on 63 MB that is the difference
    // between 350 ms and parsing the whole file for nothing.
    if (line.length < 40 || !line.includes('"assistant"')) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.type !== 'assistant' || !r.message) continue;
    // The head keeps its own clock. It runs after the tail has been applied and
    // its stamps are all older, so sharing one would produce negative gaps; the
    // single gap across the boundary is lost, and that is one per session.
    gap(st.shift, Date.parse(r.timestamp || '') || 0, own);
    for (const b of Array.isArray(r.message.content) ? r.message.content : []) {
      if (b?.type === 'text' && b.text) { st.shift.turns++; st.shift.chars += b.text.length; }
      if (b?.type !== 'tool_use') continue;
      const d = describeTool(b.name, b.input);
      const mood = (IMAGE_RE.test(b.input?.file_path || '') && /Write|Edit/.test(b.name)) ? 'design' : d.mood;
      if (SKILL_OF[mood]) st.skills[SKILL_OF[mood]]++;
    }
  }
}

async function readRange(file, start, length) {
  if (length <= 0) return '';
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, start);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    await fh?.close();
  }
}

async function follow(sessionId, file, apply, fresh, deep) {
  let c = cache.get(sessionId);
  let size = 0;
  try { size = (await fsp.stat(file)).size; } catch { return c?.st; }

  if (!c || c.file !== file || size < c.offset) {
    const start = Math.max(0, size - FIRST_READ_BYTES);
    const text = await readRange(file, start, size - start);
    const lines = text.split('\n');
    if (start > 0) lines.shift();
    c = { file, offset: size, pending: lines.pop() ?? '', st: fresh() };
    for (const l of lines) apply(c.st, l);
    cache.set(sessionId, c);
    // The head of the file, for the grades only, once per session. The line
    // the boundary cuts is dropped by both passes — the tail throws away its
    // first, the deep pass its last — and that is one line per session.
    if (deep && start > 0 && !c.deep) {
      c.deep = true;
      deep(c.st, file, start).catch(() => { c.deep = false; });  // failed — try again on the next tick
    }
    return c.st;
  }

  if (size > c.offset) {
    const text = c.pending + await readRange(file, c.offset, size - c.offset);
    const lines = text.split('\n');
    c.pending = lines.pop() ?? '';
    c.offset = size;
    for (const l of lines) apply(c.st, l);
  }
  return c.st;
}

// ---------------------------------------------------------- interpretation

const base = (p) => (typeof p === 'string' ? p.split('/').pop() : '');

// What an agent is busy with now travels as a key rather than a finished
// phrase: the office speaks two languages, and there would be nothing to
// translate a string assembled on the server with. The server still builds the
// Russian text — it goes out in the activity field so an older client and the
// logs read as before.
function describeBash(cmd = '') {
  const c = cmd.toLowerCase();
  if (/\b(test|jest|vitest|pytest|spec)\b/.test(c)) return { key: 'test', mood: 'test' };
  if (/git\s+(commit|push)/.test(c)) return { key: 'ship', mood: 'ship' };
  if (/git\s+(status|diff|log)/.test(c)) return { key: 'gitread', mood: 'read' };
  if (/(build|compile|webpack|vite build|xcodebuild|gradle)/.test(c)) return { key: 'build', mood: 'build' };
  if (/(npm|yarn|pnpm|pub)\s+(i|install|get|add)/.test(c)) return { key: 'deps', mood: 'build' };
  if (/(analyze|lint|eslint|ruff|tsc)/.test(c)) return { key: 'lint', mood: 'test' };
  if (/(grep|rg|find|ls|cat|head|sed -n)/.test(c)) return { key: 'dig', mood: 'read' };
  return { key: 'shell', mood: 'code' };
}

function describeTool(name, input = {}) {
  const n = String(name || '');
  if (n === 'Bash') return describeBash(input.command);
  if (n === 'Edit' || n === 'Write' || n === 'NotebookEdit')
    return { key: 'edit', arg: base(input.file_path), mood: 'code' };
  if (n === 'Read') return { key: 'read', arg: base(input.file_path), mood: 'read' };
  if (n === 'Grep' || n === 'Glob') return { key: 'grep', mood: 'read' };
  if (n === 'WebSearch') return { key: 'search', arg: String(input.query || '').slice(0, 40), mood: 'research' };
  if (n === 'WebFetch') return { key: 'fetch', mood: 'research' };
  if (n === 'TodoWrite' || n === 'ExitPlanMode') return { key: 'plan', mood: 'plan' };
  if (n === 'Agent' || n === 'Task') return { key: 'subtasks', mood: 'plan' };
  if (n === 'Artifact') return { key: 'artifact', mood: 'design' };
  if (/figma/i.test(n)) return { key: 'figma', mood: 'design' };
  if (/jira/i.test(n)) return { key: 'jira', mood: 'plan' };
  if (/slack/i.test(n)) return { key: 'slack', mood: 'plan' };
  if (/gmail|message|mail/i.test(n)) return { key: 'mail', mood: 'plan' };
  if (n.startsWith('mcp__')) return { key: 'mcp', arg: n.split('__').pop(), mood: 'code' };
  return { key: 'work', mood: 'code' };
}

// The Russian phrase stays here so the activity field reads as it used to.
const ACT_RU = {
  test: 'гоняет тесты', ship: 'коммитит', gitread: 'смотрит в git', build: 'собирает билд',
  deps: 'ставит зависимости', lint: 'ловит линтер', dig: 'копается в файлах',
  shell: 'колдует в терминале', edit: 'правит {arg}', read: 'читает {arg}',
  grep: 'ищет по коду', search: 'гуглит: {arg}', fetch: 'читает статью',
  plan: 'раскладывает план', subtasks: 'раздаёт подзадачи', artifact: 'публикует артефакт',
  figma: 'рисует макет в Figma', jira: 'ковыряет Jira', slack: 'пишет в Slack',
  mail: 'разбирает почту', mcp: 'дёргает {arg}', work: 'работает', thinking: 'думает',
  awaiting: 'ждёт твоего слова', idle: 'залип в окно',
};
const ACT_FALLBACK_RU = { edit: 'код', read: 'файл' };
const actRu = (a) => (ACT_RU[a.key] || ACT_RU.work).replace('{arg}', a.arg || ACT_FALLBACK_RU[a.key] || '');

// Frame: Prod → "Roles · six chips", node 285:9 — it holds the chip colours and
// which work switches each role on.
const ROLES = {
  design:   { role: 'Дизайнер',      short: 'design' },
  research: { role: 'Исследователь', short: 'research' },
  plan:     { role: 'Продакт',       short: 'plan' },
  code:     { role: 'Разработчик',   short: 'code' },
  qa:       { role: 'Тестировщик',   short: 'qa' },
  release:  { role: 'Релиз-инженер', short: 'release' },
  // the role travels as a key (short) too — the office translates it at its end
};

// "You've hit your session limit · resets 12:10am (Asia/Yerevan)" and its kin.
// That is the subscription talking, not the agent, and in the office it has to
// look like a notice on the door rather than something he said.
const LIMIT_RE = /(hit your (?:session|usage) limit|usage limit reached|out of (?:usage|credits)|лимит исчерпан)/i;

function limitNotice(text) {
  const line = (text || '').trim();
  if (!line || line.length > 200 || !LIMIT_RE.test(line)) return null;
  const at = line.match(/resets? ([^\n\u00b7]+)/i);
  return { text: line, resets: at ? at[1].trim() : null };
}

// The report tail: the three lines AGENTS.md requires at the end of every
// answer. The session name in the head names a branch of conversation, not the
// work — it is given once and lives a week, while the task changes with every
// answer and is the question the card gets opened for. This needs no new data
// path: the last answer already sits right here, for "what did he say".
const TAIL_MAX = 1600;           // the tail is at the end — we do not dig deeper
const TAIL_VALUE = 300;          // clipping happens in the head; this is only a ceiling
const NOTHING = /^(ничего|нет|nothing|none|—|-)[.!]?$/i;

// The label of a line may arrive bold, italic or bare, and the separator is a
// dash of any kind or a colon. Anything else counts as not a report.
function tailField(tail, label) {
  const re = new RegExp('(?:^|\\n)[ \\t>*_]*(?:' + label + ')[ \\t*_]*[—–:-]+[ \\t]*(.+)', 'gi');
  let m, last = null;
  while ((m = re.exec(tail))) last = m;
  if (!last) return '';
  return last[1].replace(/[*_`]/g, '').trim().slice(0, TAIL_VALUE);
}

export function reportTail(text) {
  const tail = String(text || '').slice(-TAIL_MAX);
  const what = tailField(tail, 'Текущая (?:фича\\/задача|задача|фича)');
  if (!what) return null;
  const need = tailField(tail, 'Что нужно от меня');
  return {
    what,
    status: tailField(tail, 'Статус'),
    // "Ничего" is a full answer, and it has no business in the head: the ⚑ plate
    // must mean "you are needed", not "the line was filled in".
    need: NOTHING.test(need) ? '' : need,
  };
}

// A trade is what an agent is doing now, not over the whole session. Counting
// the whole history gave everyone "Developer": any work reaches a file edit
// sooner or later, and the accumulated code outweighed half an hour of design.
// So we count over a sliding window of the latest actions.
const ROLE_WINDOW_MS = 12 * 60 * 1000;  // any longer and we are back to the whole history
const ROLE_STALE_MS = 60 * 60 * 1000;   // past this line an action says nothing any more
const ROLE_TAIL = 6;                    // how many latest actions to take when the window is empty
const ROLE_SWITCH = 1.35;               // how far a new leader must beat the current one

// One action's contribution to the trade. Reading gives no trade of its own and
// weighs little: everyone reads all the time, and at full weight it would make
// everyone a coder again.
const ROLE_WEIGHTS = {
  design:   { design: 1 },
  research: { research: 1 },
  plan:     { plan: 1 },
  code:     { code: 1 },
  test:     { qa: 1 },
  build:    { release: 1 },
  ship:     { release: 1 },
  read:     { code: 0.3, research: 0.15 },
};

// Grades: the same table as the profession weights, read the other way. The
// profession is a 12-minute window — what he is doing now; the grade is the
// whole shift — what he can do at all. Hence a counter of its own: st.acts is
// trimmed at sixty actions and no sum can be taken from it.
//
// Seven branches against six professions. The seventh is reading: in the
// profession it deliberately weighs 0.3, or everyone who opens a file becomes
// a developer. Over a whole shift that trick is not needed and does harm —
// reading happens three times as often as editing — so reading gets a branch
// instead of a quiet addition to code.
const SKILL_OF = {
  design: 'design', research: 'research', plan: 'plan', code: 'code',
  test: 'qa', build: 'release', ship: 'release', read: 'archive',
};
const SKILL_BRANCHES = ['design', 'research', 'plan', 'code', 'qa', 'release', 'archive'];

// The shift: how much was done in this reporting period, next to what the
// grades say he can do. Three numbers and no more, because only three survived
// the measuring on 6 September 2026 — replies, characters said, and the gaps
// between them. Files read did not: half the reads go through the terminal
// without a path in the call, and the count would be quietly low. The walks to
// the coffee machine and the cooler did not either: the office draws those
// itself, so counting them measures our own screensaver.
//
// A gap is what it is and is named so in the office: a pause between two
// replies is the conversation waiting for a human, not an agent daydreaming.
const IDLE_GAP = 10 * 60 * 1000;
const newShift = () => ({ turns: 0, chars: 0, idleN: 0, idleMs: 0 });

// `clock` is passed in rather than kept on the shift: the tail and the head are
// two passes over one file, and they must not share one last-seen stamp.
function gap(shift, ts, clock) {
  if (!ts) return;
  if (clock.last && ts > clock.last) {
    const d = ts - clock.last;
    if (d > IDLE_GAP) { shift.idleN++; shift.idleMs += d; }
  }
  clock.last = Math.max(clock.last, ts);
}
const newSkills = () => Object.fromEntries(SKILL_BRANCHES.map((b) => [b, 0]));

function roleScores(acts, now) {
  const cut = now - ROLE_WINDOW_MS;
  const win = acts.filter((a) => a.ts >= cut);
  // If the window is empty, take the tail of the latest actions — but only the
  // ones that have not gone stale. Padding the tail to a fixed length is not on:
  // that is exactly how the whole history gets back into the count, and an hour
  // of old code beats three fresh mock-ups.
  const use = win.length ? win : acts.filter((a) => a.ts >= now - ROLE_STALE_MS).slice(-ROLE_TAIL);
  const sc = { design: 0, research: 0, plan: 0, code: 0, qa: 0, release: 0 };
  for (const a of use) {
    const w = ROLE_WEIGHTS[a.mood];
    if (!w) continue;
    for (const [k, v] of Object.entries(w)) sc[k] += v;
  }
  return sc;
}

function inferRole(st) {
  const sc = roleScores(st.acts || [], Date.now());
  const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] <= 0) return ROLES[st.role] || ROLES.code;
  // Hysteresis: without it an agent flickers between trades on every tick when
  // the count is neck and neck, and the card stops being readable.
  const cur = st.role;
  if (cur && cur !== top[0] && sc[cur] > 0 && top[1] < sc[cur] * ROLE_SWITCH) return ROLES[cur];
  st.role = top[0];
  return ROLES[top[0]];
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n').trim();
}

const IMAGE_RE = /\.(png|jpe?g|gif|svg|webp)$/i;

const RECENT_MAX = 16;
const MSG_MAX = 12000;

function remember(st, role, text, ts) {
  st.recent.push({ role, text: text.slice(0, MSG_MAX), ts: ts ? Date.parse(ts) : Date.now() });
  if (st.recent.length > RECENT_MAX) st.recent.splice(0, st.recent.length - RECENT_MAX);
}

function emptyState() {
  return {
    lastTs: 0, lastTool: null, lastToolInput: null, lastAssistantText: '',
    lastUserPrompt: '', awaitingUser: false, acts: [], role: '', files: new Map(),
    turns: 0, model: '', branch: '', slug: '', title: '', aiTitle: '', task: null,
    skills: newSkills(),   // the grade counter: it grows and is never trimmed
    shift: newShift(),     // replies, characters and idle gaps, over the whole file
    clock: { last: 0 },    // the tail's own last-seen stamp, see gap()
    recent: [],   // rolling window of the actual conversation, read on demand
  };
}

function applyLine(st, line) {
  if (!line) return;
  let r;
  try { r = JSON.parse(line); } catch { return; }
  if (r.timestamp) st.lastTs = Math.max(st.lastTs, Date.parse(r.timestamp) || 0);
  if (r.gitBranch) st.branch = r.gitBranch;
  if (r.slug) st.slug = r.slug;
  // what the chat is called in the app — two sessions can share a name, so it is
  // shown next to the project rather than instead of it
  if (r.type === 'custom-title' && r.customTitle) st.title = r.customTitle;
  if (r.type === 'ai-title' && r.aiTitle) st.aiTitle = r.aiTitle;
  if (r.type === 'last-prompt' && r.lastPrompt) st.lastUserPrompt = String(r.lastPrompt).slice(0, 400);

  if (r.type === 'assistant' && r.message) {
    gap(st.shift, Date.parse(r.timestamp || '') || 0, st.clock);
    st.model = r.message.model || st.model;
    const content = r.message.content || [];
    const txt = textOf(content);
    if (txt) {
      st.lastAssistantText = txt; st.turns++; remember(st, 'assistant', txt, r.timestamp);
      // The same three numbers the deep pass keeps for the head of the file.
      st.shift.turns++; st.shift.chars += txt.length;
      // The task is held until the next one is named, rather than taken from
      // the last message. While an agent answers it says a dozen replies with no
      // tail — going by the last one, the line went out exactly during the
      // minutes the work is happening, which is when it is wanted. Found on a
      // live stand on 5 September 2026.
      const said = reportTail(txt);
      if (said) st.task = said;
    }
    st.awaitingUser = r.message.stop_reason === 'end_turn';
    for (const b of Array.isArray(content) ? content : []) {
      if (b?.type !== 'tool_use') continue;
      const d = describeTool(b.name, b.input);
      const mood = (IMAGE_RE.test(b.input?.file_path || '') && /Write|Edit/.test(b.name)) ? 'design' : d.mood;
      st.acts.push({ mood, ts: st.lastTs || Date.now() });
      if (st.acts.length > 60) st.acts.splice(0, st.acts.length - 60);
      // The grade counts the same mood — but before the trim and with no window.
      if (SKILL_OF[mood]) st.skills[SKILL_OF[mood]]++;
      st.lastTool = b.name;
      st.lastToolInput = b.input;
      const fp = b.input?.file_path;
      if (fp) {
        st.files.set(fp, {
          path: fp, name: base(fp), image: IMAGE_RE.test(fp), ts: st.lastTs,
          made: /Write|Edit|Artifact/.test(b.name),
        });
        if (st.files.size > 60) st.files.delete(st.files.keys().next().value);
      }
    }
  } else if (r.type === 'user' && r.message && !r.isSidechain) {
    const content = r.message.content;
    const isToolResult = Array.isArray(content) && content.some((b) => b?.type === 'tool_result');
    if (!isToolResult) {
      const txt = textOf(content);
      if (txt && !txt.startsWith('<')) {
        st.lastUserPrompt = txt.slice(0, 400);
        st.awaitingUser = false;
        remember(st, 'user', txt, r.timestamp);
      }
    } else {
      st.awaitingUser = false;
    }
  }
}

// ------------------------------------------------------------ presentation

// The names. Gender is stored next to the name rather than guessed from the
// last letter: on diminutives that heuristic is wrong more often than right —
// «Гоша, Кузя, Савва, Никита» and a dozen more end in «а/я» and are all male. On
// 30 August 2026 the office wrote "Гоша освободилась" for fourteen names out of
// fifty.
//
// Names that go either way — «Саша, Женя, Слава, Валя, Шура» — are pinned to one
// gender by decision, not by truth: there is nowhere to learn a session's
// gender from, and a coin flipped once is better than a coin flipped in every
// sentence.
//
// Since 4 September 2026 there is more than one dictionary: packs are chosen in
// the panel at the switcher in the corridor. A pack is a pair of lists with
// gender, and everything else — handing names out, freeing them, the numbers
// when the pool runs dry — never learns which pack it is on.
const RU_MALE = [
  'Гоша', 'Тимка', 'Борис', 'Федя', 'Рома', 'Клим', 'Сеня', 'Гриша', 'Лёва', 'Пётр',
  'Юра', 'Стёпа', 'Кузя', 'Матвей', 'Игнат', 'Савва', 'Захар', 'Митя', 'Прохор', 'Ося',
  'Никита', 'Артём', 'Слава', 'Тихон', 'Costa', 'Ваня', 'Вова', 'Дима', 'Коля', 'Миша',
  'Паша', 'Саша', 'Серёжа', 'Толя', 'Костя', 'Лёша', 'Витя', 'Гена', 'Игорь', 'Олег',
  'Глеб', 'Марк', 'Тимур', 'Руслан', 'Данила', 'Егор', 'Илья', 'Кирилл', 'Максим', 'Антон',
  'Денис', 'Андрей', 'Сева', 'Стас', 'Влад', 'Гера', 'Ефим', 'Лука', 'Макар', 'Мирон',
  'Назар', 'Платон', 'Родион', 'Семён', 'Тарас', 'Устин', 'Фома', 'Яша', 'Аркаша', 'Боря',
  'Валера', 'Демид', 'Ерёма', 'Жора', 'Кеша', 'Лёня', 'Наум', 'Осип', 'Радик', 'Тёма',
  'Филя', 'Шурик', 'Ярик', 'Афоня', 'Ефрем', 'Трофим', 'Женя', 'Гаврик', 'Луша', 'Юзик',
];
const RU_FEMALE = [
  'Марта', 'Люся', 'Ася', 'Нина', 'Дуся', 'Вера', 'Тоня', 'Зоя', 'Майя', 'Софа',
  'Рита', 'Ева', 'Лиза', 'Поля', 'Дина', 'Оля', 'Настя', 'Галя', 'Валя', 'Катя',
  'Юля', 'Инна', 'Мила', 'Аля', 'Аня', 'Даша', 'Маша', 'Наташа', 'Света', 'Таня',
  'Лена', 'Ира', 'Оксана', 'Полина', 'Соня', 'Тася', 'Ульяна', 'Фрося', 'Шура', 'Эмма',
  'Яна', 'Агата', 'Варя', 'Глаша', 'Дуня', 'Жанна', 'Зина', 'Кира', 'Лада', 'Муза',
  'Ника', 'Рая', 'Стеша', 'Тома', 'Фаина', 'Эля', 'Юна', 'Ярина', 'Алина', 'Вика',
  'Гуля', 'Злата', 'Ксюша', 'Люба', 'Марина', 'Надя', 'Нюра', 'Рина', 'Сима', 'Устя',
  'Феня', 'Циля', 'Клава', 'Броня', 'Веста', 'Дося', 'Ляля', 'Нюся', 'Рэя', 'Тина',
];

// The English pack. The same register as the Russian one: not passport Robert
// and Elizabeth but what people are called at the desk — Bob and Betty. An
// office that reads as two different offices in two languages is the thing this
// was meant to avoid.
//
// The either-way ones — Sam, Alex, Charlie, Pat, Quinn — are pinned to male by
// the same decision and for the same reason as «Женя» and «Слава» in Russian.
const EN_MALE = [
  'Pete', 'Gus', 'Sam', 'Max', 'Ed', 'Joe', 'Nick', 'Tom', 'Bill', 'Dave',
  'Frank', 'Charlie', 'Andy', 'Bob', 'Mike', 'Steve', 'Jack', 'Harry', 'Alfie', 'Ollie',
  'Archie', 'Freddie', 'Georgie', 'Bertie', 'Monty', 'Reggie', 'Stan', 'Wally', 'Rex', 'Hank',
  'Chuck', 'Buddy', 'Duke', 'Earl', 'Jed', 'Cody', 'Wes', 'Chip', 'Skip', 'Buck',
  'Dean', 'Kirk', 'Lance', 'Marty', 'Neil', 'Otis', 'Percy', 'Quinn', 'Rudy', 'Silas',
  'Toby', 'Vince', 'Wade', 'Zeke', 'Abe', 'Barney', 'Cliff', 'Dexter', 'Elmer', 'Floyd',
  'Gil', 'Hugo', 'Ike', 'Jasper', 'Karl', 'Leo', 'Milo', 'Ned', 'Oscar', 'Pat',
  'Ralph', 'Roy', 'Seth', 'Theo', 'Vic', 'Walt', 'Ziggy', 'Angus', 'Boone', 'Caleb',
  'Dale', 'Emmett', 'Finn', 'Grady', 'Homer', 'Ivan', 'Jonah', 'Lyle', 'Moe', 'Rusty',
];
const EN_FEMALE = [
  'Sally', 'Ruby', 'Betty', 'Daisy', 'Ella', 'Flo', 'Gracie', 'Hattie', 'Ivy', 'June',
  'Kitty', 'Lucy', 'Maggie', 'Nell', 'Opal', 'Pearl', 'Queenie', 'Rosie', 'Sadie', 'Tess',
  'Una', 'Vera', 'Wanda', 'Winnie', 'Zelda', 'Abby', 'Bonnie', 'Cora', 'Dolly', 'Edie',
  'Fern', 'Gwen', 'Hazel', 'Iris', 'Josie', 'Katie', 'Lottie', 'Mabel', 'Nora', 'Olive',
  'Peggy', 'Polly', 'Rita', 'Susie', 'Trixie', 'Willa', 'Cleo', 'Dot', 'Elsie', 'Fay',
  'Ginny', 'Hetty', 'Jenny', 'Lena', 'Milly', 'Ada', 'Birdie', 'Cissy', 'Della', 'Effie',
  'Greta', 'Hilda', 'Isla', 'Janie', 'Lulu', 'Marge', 'Nan', 'Prue', 'Rhoda', 'Stella',
  'Tilly', 'Wilma', 'Bess', 'Clara', 'Dixie', 'Etta', 'Nina', 'Vi', 'Fanny', 'Minnie',
];

// Interleaved rather than concatenated: otherwise the first fifty agents on a
// fresh machine would all be men — a name is picked from a hash, but neighbours
// in the list are taken in order once the hash lands in an occupied stretch.
const weave = (male, female) => male
  .flatMap((m, i) => (female[i] ? [m, female[i]] : [m]))
  .concat(female.slice(male.length));

const pack = (male, female) => ({
  pool: [...male, ...female],
  names: weave(male, female),
  gender: new Map([...male.map((n) => [n, 'm']), ...female.map((n) => [n, 'f'])]),
});

export const PACKS = {
  ru: pack(RU_MALE, RU_FEMALE),
  en: pack(EN_MALE, EN_FEMALE),
};
export const PACK_IDS = Object.keys(PACKS);
const packOf = (id) => PACKS[id] || PACKS.ru;

// The pool is exported for the stand, so it checks what was handed out rather than its own copy of the list.
export const namePool = (id = 'ru') => packOf(id).pool.slice();
// The sample for the panel comes from the handing-out order, not from the pool:
// the pool is male and female concatenated, so its first four names are four
// men, which lies about the dictionary.
export const nameSample = (id = 'ru', n = 4) => packOf(id).names.slice(0, n);

// Which pack is actually in force. 'auto' follows the office language: a fresh
// office in English gets English names, and nobody has to be taught that.
//
// The office language can itself be 'auto' — a fresh install nobody has opened
// yet, since 6 September 2026 — and then neither lookup matches and the names
// come out Russian. That lasts until the first page load, which resolves the
// language from the device and writes it here; the pack changes with it and the
// office renames itself on the next tick. Nobody has learned those names in the
// meantime: an office with no visitor has no reader.
export const effectivePack = ({ namePack = 'auto', lang = 'ru' } = {}) =>
  (PACKS[namePack] ? namePack : (PACKS[lang] ? lang : 'ru'));

// "Ося 51" is the same name as "Ося": the number was appended when the pool ran
// out. Names from earlier versions of the pool are not in the map, and for them
// the old guess by the last letter remains — it will be wrong in exactly the
// places it was always wrong.
//
// The pack is asked first but not last: names issued by the previous pack sit
// on disk until the next snapshot, and «Пётр» has to stay a man for those
// seconds — otherwise half the floor changes gender between the keypress and
// the redraw.
export function genderOf(name = '', id = 'ru') {
  const base = String(name).replace(/\s+\d+$/, '');
  const here = packOf(id).gender.get(base);
  if (here) return here;
  for (const p of Object.values(PACKS)) {
    const g = p.gender.get(base);
    if (g) return g;
  }
  return /[ая]$/.test(base) ? 'f' : 'm';
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Names are handed out once and then remembered on disk: an agent you spoke to
// yesterday is the same person today, whoever else came and went in between.
//
// The pure part of the allocator: `saved` is what lies on disk, `order` is the
// sessions that need a name, in start order, and `keep` is those that keep
// theirs. Everything else lives in nameRegistry so this can be run by a stand.
export function assignNames(saved, order, keep, packId = 'ru') {
  const NAMES = packOf(packId).names;
  const names = {};
  for (const [sid, n] of Object.entries(saved)) if (keep.has(sid)) names[sid] = n;
  const taken = new Set(Object.values(names));

  // "Клим 97" is not a name but the mark of an exhausted pool: that is what
  // everyone after the fiftieth was called. As soon as the pool has a clean name
  // again, such an agent gets it. Renaming mid-life is more honest here than
  // silence: he was given a number by shortage rather than by anyone's choice,
  // and notes that already hold the name keep their own snapshot and do not
  // spoil.
  for (const id of Object.keys(names).filter((k) => /\s\d+$/.test(names[k])).sort()) {
    const h = hash(id);
    for (let i = 0; i < NAMES.length; i++) {
      const n = NAMES[(h + i) % NAMES.length];
      if (taken.has(n)) continue;
      taken.delete(names[id]);
      names[id] = n;
      taken.add(n);
      break;
    }
  }

  for (const id of order) {
    if (names[id]) continue;
    const h = hash(id);
    let picked = null;
    for (let i = 0; i < NAMES.length && !picked; i++) {
      const n = NAMES[(h + i) % NAMES.length];
      if (!taken.has(n)) picked = n;
    }
    picked = picked || `${NAMES[h % NAMES.length]} ${taken.size + 1}`;
    taken.add(picked);
    names[id] = picked;
  }
  return names;
}

const sameNames = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

// The order in which the office is renamed wholesale: first everyone who
// already has a name, by ascending id, then the live ones without one — and
// only that way, because the preview in the panel walks the same order. Let the
// two diverge and the panel promises «Пётр станет Gus» while Pete is what he
// becomes: the one line it is shown for would be the line that lies.
const renameOrder = (names, order, keep) => [
  ...Object.keys(names).filter((id) => keep.has(id)).sort(),
  ...order.filter((id) => !names[id]),
];

// What the office would be called on this pack. Computed from what lies on
// disk, so live sessions without a name yet do not appear — and this line is
// asked about exactly those who already stand on the floor.
export async function previewPack(packId) {
  const { names } = await getSettings();
  const keep = new Set(Object.keys(names));
  return assignNames({}, renameOrder(names, [], keep), keep, packId);
}

async function nameRegistry(sessions) {
  const settings = await getSettings();
  const { names } = settings;
  const packId = effectivePack(settings);

  // A name is held by a session for as long as its transcript lives on disk:
  // `claude --resume` returns the same sessionId, and the agent has to come back
  // as himself rather than as a new person. Once the transcript is gone, the
  // name goes back into the pool.
  //
  // It never went back before, and the pool was spent per session over the whole
  // life of the machine rather than per living agent: on 30 August 2026 the
  // registry held 152 entries and 102 of them carried a number — "Ося 51",
  // "Гриша 150". Fifty names ran out on the fifty-first session, and for two
  // thirds of the office's history agents introduced themselves by an ordinal.
  // The pool is four times larger now — but replacing the pool alone would only
  // have pushed the same wall further away.
  const keep = new Set(transcriptIndex.keys());
  for (const s of sessions) keep.add(s.sessionId);

  // An empty index is not "the transcripts are gone", it is "the directory did
  // not read": in such a minute the release would wipe every name in the office
  // at once. Better to release nothing then.
  if (!transcriptIndex.size) for (const id of Object.keys(names)) keep.add(id);

  const order = [...sessions]
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
    .map((s) => s.sessionId);

  // The pack changed — the office is renamed at once, from a clean slate: old
  // names are not carried over, or half the floor would stay in the previous
  // dictionary, and that reads as a bug rather than as a setting. Going back is
  // free: the same sessionId under the same pack yields the same name.
  //
  // The namesPack mark on disk answers "which pack were the names sitting here
  // issued with". Without it the server cannot tell "the pack was never
  // touched" from "the pack changed while the office was down".
  const renaming = settings.namesPack !== packId;
  const next = renaming
    ? assignNames({}, renameOrder(names, order, keep), keep, packId)
    : assignNames(names, order, keep, packId);

  if (renaming) await patchSettings({ names: next, namesPack: packId });
  else if (!sameNames(next, names)) await patchSettings({ names: next });
  return next;
}

// A desk is held by a session the same way a name is: while the agent lives, he
// sits in the same place. The seat used to be handed out by position in the
// list, and the list is sorted by start time — a new session went to the front
// and shifted the whole room by one desk, so on every start and every finish the
// neighbours got up and moved.
// The room comes from the repository, not from the session's directory:
// otherwise every working tree of one project moves into a room of its own at
// the other end of the floor.
const projectOf = (s) => path.basename(repoRootCached(s.cwd) || s.cwd || '') || 'nowhere';

function sameSeats(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => b[k] && b[k].i === a[k].i && b[k].project === a[k].project);
}

async function seatRegistry(sessions) {
  const { seats } = await getSettings();
  const next = {};
  const taken = new Map();
  const claim = (project, i) => {
    if (!taken.has(project)) taken.set(project, new Set());
    const set = taken.get(project);
    if (set.has(i)) return false;
    set.add(i);
    return true;
  };

  // Those with a recorded seat go first — otherwise a newcomer takes someone
  // else's desk and its owner moves, which is the very thing we are avoiding.
  const live = [...sessions].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  for (const s of live) {
    const kept = seats[s.sessionId];
    if (!kept || !Number.isInteger(kept.i) || kept.project !== projectOf(s)) continue;
    if (claim(kept.project, kept.i)) next[s.sessionId] = { project: kept.project, i: kept.i };
  }
  for (const s of live) {
    if (next[s.sessionId]) continue;
    const project = projectOf(s);
    let i = 0;
    while (!claim(project, i)) i++;
    next[s.sessionId] = { project, i };
  }

  // Only the living stay on disk: a dead session will not come back, and its
  // desk should go to the next newcomer.
  if (!sameSeats(next, seats)) await patchSettings({ seats: next });
  return next;
}

const IDLE_MS = 90_000;

export async function snapshot() {
  const sessions = await liveSessions();
  // Warm the roots cache before the seats are computed: projectOf is
  // synchronous while git is asynchronous, and without the warm-up the first
  // snapshot would seat everyone by directory.
  await Promise.all(sessions.map((s) => repoRoot(s.cwd)));
  await indexTranscripts();
  const names = await nameRegistry(sessions);
  const namesPack = effectivePack(await getSettings());
  const seats = await seatRegistry(sessions);
  const agents = [];

  for (const s of sessions) {
    const file = await transcriptFor(s.sessionId, s.cwd);
    const t = (file ? await follow(s.sessionId, file, applyLine, emptyState, deepSkills) : null) || emptyState();
    const files = [...t.files.values()].sort((a, b) => b.ts - a.ts).slice(0, 16);
    const artifacts = files.filter((f) => f.made || f.image);
    const idleFor = t.lastTs ? Date.now() - t.lastTs : Infinity;
    const busy = idleFor < IDLE_MS && !t.awaitingUser;
    const act = t.lastTool ? describeTool(t.lastTool, t.lastToolInput) : { key: 'thinking', mood: 'plan' };
    const roleInfo = inferRole(t);
    // The version and the stack belong to the repository, not to the session:
    // every agent of one project shares them, and projectInfo keeps the result
    // in a cache so the manifest is not re-read on every tick by every agent.
    const repo = await projectInfo(s.cwd);

    agents.push({
      id: s.sessionId,
      pid: s.pid,
      handle: s.name || s.sessionId.slice(0, 8),
      name: names[s.sessionId] || s.sessionId.slice(0, 6),
      // gender travels with the snapshot: on the page the name is one line,
      // while "освободилась" and "повесила" are needed in two places
      gender: genderOf(names[s.sessionId] || '', namesPack),
      project: projectOf(s),
      seat: seats[s.sessionId].i,
      cwd: s.cwd,
      version: repo.version || '',
      stack: repo.stack || '',
      repo: !!repo.git,
      branch: t.branch,
      model: t.model,
      title: t.title || t.aiTitle || '',
      role: roleInfo.role,
      roleKey: roleInfo.short,
      status: busy ? 'working' : (t.awaitingUser ? 'awaiting' : 'idle'),
      act: busy ? { key: act.key, arg: act.arg || '' } : { key: t.awaitingUser ? 'awaiting' : 'idle', arg: '' },
      activity: busy ? actRu(act) : (t.awaitingUser ? ACT_RU.awaiting : ACT_RU.idle),
      mood: act.mood,
      lastSaid: t.lastAssistantText.slice(0, 1500),
      // The limit notice is not something the agent said: it came from the
      // subscription rather than from him, and showing it as "what he said"
      // misleads
      limited: limitNotice(t.lastAssistantText),
      task: t.task,
      saidLen: t.lastAssistantText.length,
      lastAsked: t.lastUserPrompt,
      idleFor: Number.isFinite(idleFor) ? Math.round(idleFor / 1000) : null,
      startedAt: s.startedAt,
      turns: t.turns,
      // Raw per-branch counters. Whoever shows them turns them into grades:
      // the ladder belongs to the filing cabinet, not to the core.
      skills: { ...t.skills },
      // Minutes, not milliseconds: nobody reads an idle gap to the second, and
      // a rounded number cannot pretend to a precision it does not have.
      shift: { turns: t.shift.turns, chars: t.shift.chars, idleN: t.shift.idleN,
        idleMin: Math.round(t.shift.idleMs / 60000) },
      files,
      artifacts,
      hasNews: t.awaitingUser && artifacts.length > 0,
    });
  }

  agents.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return { now: Date.now(), agents };
}

// The office is the only place these replies can be read — the desktop app never
// shows what a headless run wrote — so the whole conversation stays available.
export function conversation(sessionId) {
  return cache.get(sessionId)?.st?.recent || [];
}

// Whose files these are: the ids of the agents in whose transcript the path
// appeared. A file belongs to a conversation, and it may be opened for a guest
// exactly when the conversation is.
export function fileOwners(p, snap) {
  return (snap.agents || [])
    .filter((a) => a.files.some((f) => f.path === p) || a.artifacts.some((f) => f.path === p))
    .map((a) => a.id);
}

export function fileAllowed(p, snap) {
  return fileOwners(p, snap).length > 0;
}

export {
  fs, inferRole, describeTool, ROLES, ROLE_WINDOW_MS, ROLE_STALE_MS,
  // exported for the stand alone: it runs the parser on real transcript lines
  applyLine, emptyState, SKILL_OF, SKILL_BRANCHES,
};
