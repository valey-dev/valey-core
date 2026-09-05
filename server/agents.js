// Discovers live Claude Code sessions and turns each one into an "office worker":
// who they are, what they're doing right now, what they last produced.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
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

async function follow(sessionId, file, apply, fresh) {
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
    turns: 0, model: '', branch: '', slug: '', title: '', aiTitle: '',
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
    st.model = r.message.model || st.model;
    const content = r.message.content || [];
    const txt = textOf(content);
    if (txt) { st.lastAssistantText = txt; st.turns++; remember(st, 'assistant', txt, r.timestamp); }
    st.awaitingUser = r.message.stop_reason === 'end_turn';
    for (const b of Array.isArray(content) ? content : []) {
      if (b?.type !== 'tool_use') continue;
      const d = describeTool(b.name, b.input);
      const mood = (IMAGE_RE.test(b.input?.file_path || '') && /Write|Edit/.test(b.name)) ? 'design' : d.mood;
      st.acts.push({ mood, ts: st.lastTs || Date.now() });
      if (st.acts.length > 60) st.acts.splice(0, st.acts.length - 60);
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
// Гоша, Кузя, Савва, Никита and a dozen more end in а/я and are all male. On
// 30 August 2026 the office wrote "Гоша освободилась" for fourteen names out of
// fifty.
//
// Names that go either way — Саша, Женя, Слава, Валя, Шура — are pinned to one
// gender by decision, not by truth: there is nowhere to learn a session's
// gender from, and a coin flipped once is better than a coin flipped in every
// sentence.
const MALE = [
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
const FEMALE = [
  'Марта', 'Люся', 'Ася', 'Нина', 'Дуся', 'Вера', 'Тоня', 'Зоя', 'Майя', 'Софа',
  'Рита', 'Ева', 'Лиза', 'Поля', 'Дина', 'Оля', 'Настя', 'Галя', 'Валя', 'Катя',
  'Юля', 'Инна', 'Мила', 'Аля', 'Аня', 'Даша', 'Маша', 'Наташа', 'Света', 'Таня',
  'Лена', 'Ира', 'Оксана', 'Полина', 'Соня', 'Тася', 'Ульяна', 'Фрося', 'Шура', 'Эмма',
  'Яна', 'Агата', 'Варя', 'Глаша', 'Дуня', 'Жанна', 'Зина', 'Кира', 'Лада', 'Муза',
  'Ника', 'Рая', 'Стеша', 'Тома', 'Фаина', 'Эля', 'Юна', 'Ярина', 'Алина', 'Вика',
  'Гуля', 'Злата', 'Ксюша', 'Люба', 'Марина', 'Надя', 'Нюра', 'Рина', 'Сима', 'Устя',
  'Феня', 'Циля', 'Клава', 'Броня', 'Веста', 'Дося', 'Ляля', 'Нюся', 'Рэя', 'Тина',
];

// The pool is exported for the stand, so it checks what was handed out rather than its own copy of the list.
export const NAME_POOL = [...MALE, ...FEMALE];

const GENDER = new Map([...MALE.map((n) => [n, 'm']), ...FEMALE.map((n) => [n, 'f'])]);
// Interleaved rather than concatenated: otherwise the first fifty agents on a
// fresh machine would all be men — a name is picked from a hash, but neighbours
// in the list are taken in order once the hash lands in an occupied stretch.
const NAMES = MALE.flatMap((m, i) => (FEMALE[i] ? [m, FEMALE[i]] : [m]))
  .concat(FEMALE.slice(MALE.length));

// "Ося 51" is the same name as "Ося": the number was appended when the pool ran
// out. Names from earlier versions of the pool are not in the map, and for them
// the old guess by the last letter remains — it will be wrong in exactly the
// places it was always wrong.
export function genderOf(name = '') {
  const base = String(name).replace(/\s+\d+$/, '');
  return GENDER.get(base) || (/[ая]$/.test(base) ? 'f' : 'm');
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
export function assignNames(saved, order, keep) {
  const names = {};
  for (const [id, n] of Object.entries(saved)) if (keep.has(id)) names[id] = n;
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

async function nameRegistry(sessions) {
  const { names } = await getSettings();

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
  const next = assignNames(names, order, keep);

  if (!sameNames(next, names)) await patchSettings({ names: next });
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
  const seats = await seatRegistry(sessions);
  const agents = [];

  for (const s of sessions) {
    const file = await transcriptFor(s.sessionId, s.cwd);
    const t = (file ? await follow(s.sessionId, file, applyLine, emptyState) : null) || emptyState();
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
      gender: genderOf(names[s.sessionId] || ''),
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
      saidLen: t.lastAssistantText.length,
      lastAsked: t.lastUserPrompt,
      idleFor: Number.isFinite(idleFor) ? Math.round(idleFor / 1000) : null,
      startedAt: s.startedAt,
      turns: t.turns,
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

export { fs, inferRole, describeTool, ROLES, ROLE_WINDOW_MS, ROLE_STALE_MS };
