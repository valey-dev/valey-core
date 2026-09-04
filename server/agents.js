// Discovers live Claude Code sessions and turns each one into an "office worker":
// who they are, what they're doing right now, what they last produced.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getSettings, patchSettings } from './settings.js';
import { projectInfo, repoRoot, repoRootCached } from './stack.js';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const FIRST_READ_BYTES = 1024 * 1024;

// ---------------------------------------------------------------- discovery

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Каталог сессий ключуется по pid, а не по sessionId, поэтому одна сессия
// иногда лежит в двух файлах: старый переживает свой процесс ровно до тех пор,
// пока освободившийся pid не займёт кто-то другой, — и тогда alive() честно
// говорит «жив» про обоих. 30 августа 2026 так удвоились Оля и Гриша: одно имя,
// один стол по реестру, но два тела в разных местах офиса.
//
// Выбираем свежайшую по времени старта. Существенно не то, какая из записей
// «правильнее» — существенно, чтобы выбор не менялся от тика к тику: иначе
// человек прыгал бы между двумя столами. Поэтому при равном startedAt решает
// pid, а не порядок чтения каталога.
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

// Чем занят агент, теперь уезжает ключом, а не готовой фразой: офис говорит на
// двух языках, и переводить строку, собранную на сервере, было бы нечем.
// Русский текст сервер всё равно собирает — он уходит полем activity, чтобы
// старый клиент и логи читались как раньше.
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

// Русская фраза остаётся здесь, чтобы поле activity читалось как прежде.
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

// Кадр: Prod → «Роли · шесть чипов», node 285:9 — там цвета чипов и то, по
// какой работе включается каждая роль.
const ROLES = {
  design:   { role: 'Дизайнер',      short: 'design' },
  research: { role: 'Исследователь', short: 'research' },
  plan:     { role: 'Продакт',       short: 'plan' },
  code:     { role: 'Разработчик',   short: 'code' },
  qa:       { role: 'Тестировщик',   short: 'qa' },
  release:  { role: 'Релиз-инженер', short: 'release' },
  // роль тоже уезжает ключом (short) — офис переводит её у себя
};

// «You've hit your session limit · resets 12:10am (Asia/Yerevan)» и родня.
// Это говорит подписка, а не агент, и в офисе такое должно выглядеть как объявление
// на двери, а не как его реплика.
const LIMIT_RE = /(hit your (?:session|usage) limit|usage limit reached|out of (?:usage|credits)|лимит исчерпан)/i;

function limitNotice(text) {
  const line = (text || '').trim();
  if (!line || line.length > 200 || !LIMIT_RE.test(line)) return null;
  const at = line.match(/resets? ([^\n\u00b7]+)/i);
  return { text: line, resets: at ? at[1].trim() : null };
}

// Профессия — это то, чем агент занят сейчас, а не за всю сессию. Счётчик за
// всю историю давал всем «Разработчика»: любая работа рано или поздно доходит
// до правки файла, и накопленный code перевешивал полчаса дизайна.
// Поэтому считаем по скользящему окну последних действий.
const ROLE_WINDOW_MS = 12 * 60 * 1000;  // дольше — и снова получаем историю
const ROLE_STALE_MS = 60 * 60 * 1000;   // за этой чертой действие уже ни о чём не говорит
const ROLE_TAIL = 6;                    // сколько последних действий берём, когда окно пустое
const ROLE_SWITCH = 1.35;               // во сколько раз новый лидер должен обойти текущего

// Вклад одного действия в профессию. Чтение отдельной профессии не даёт и весит
// мало: читают все и всегда, и с полным весом оно снова делало бы всех кодерами.
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
  // Если в окне пусто — берём хвост последних действий, но только не протухших.
  // Добирать хвостом до фиксированной длины нельзя: именно так в счёт снова
  // попадает вся история, и час старого кода перебивает три свежих макета.
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
  // Гистерезис: без него агент мигает между профессиями на каждом тике, когда
  // счёт идёт ноздря в ноздрю, и карточка перестаёт читаться.
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

// Имена. Род хранится рядом с именем, а не угадывается по последней букве:
// на уменьшительных эта эвристика врёт чаще, чем работает — Гоша, Кузя, Савва,
// Никита и ещё десяток кончаются на а/я и все мужские. 30 августа 2026 офис на
// четырнадцати именах из пятидесяти писал «Гоша освободилась».
//
// Двуродные имена — Саша, Женя, Слава, Валя, Шура — закреплены за одним родом
// решением, а не истиной: пол сессии знать неоткуда, и монетка, брошенная один
// раз, лучше монетки, которую бросают в каждой фразе.
//
// Словарь с 4 сентября 2026 не один: паки выбираются в панели у человечка в
// коридоре. Пак — это пара списков с родом, и всё остальное — раздача имён,
// освобождение, номера на исчерпании — про пак не знает вовсе.
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

// Английский пак. Регистр тот же, что у русского: не паспортные Robert и
// Elizabeth, а то, как зовут за столом, — Bob и Betty. Иначе офис на двух
// языках читается как два разных офиса.
//
// Двуродные — Sam, Alex, Charlie, Pat, Quinn — закреплены за мужским тем же
// решением и по той же причине, что Женя и Слава в русском.
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

// Перемешаны, а не склеены подряд: иначе первые полсотни агентов на пустой
// машине оказались бы сплошь мужчинами — имя выбирается от хеша, но соседи по
// списку разбираются подряд, когда хеш попал в занятый кусок.
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

// Словарь наружу — тесту, чтобы он проверял выданное, а не свою копию списка.
export const namePool = (id = 'ru') => packOf(id).pool.slice();
// Образец для панели берётся из раздаточного порядка, а не из пула: пул
// склеен мужскими и женскими подряд, и четыре первых имени в нём — четыре
// мужика, что про словарь врёт.
export const nameSample = (id = 'ru', n = 4) => packOf(id).names.slice(0, n);

// Какой пак работает на самом деле. «auto» — идти за языком офиса: свежий офис
// по-английски получает английские имена, и учить этому никого не надо.
export const effectivePack = ({ namePack = 'auto', lang = 'ru' } = {}) =>
  (PACKS[namePack] ? namePack : (PACKS[lang] ? lang : 'ru'));

// «Ося 51» — то же имя, что «Ося»: номер приписан на исчерпании пула. Имена из
// прежних версий словаря в карте не значатся, и для них остаётся старая догадка
// по последней букве — врать она будет ровно там же, где врала всегда.
//
// Пак спрашивается первым, но не последним: на диске лежат имена, выданные
// прежним паком, и «Пётр» обязан остаться мужчиной ровно до той секунды, пока
// снимок не переименует офис. Иначе между сменой пака и следующим снимком
// половина этажа меняет род.
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
// Чистая часть распределителя: `saved` — что лежит на диске, `order` — сессии,
// которым имя нужно, в порядке старта, `keep` — те, за кем имя остаётся. Всё
// остальное живёт в nameRegistry, чтобы это можно было прогнать тестом.
export function assignNames(saved, order, keep, packId = 'ru') {
  const NAMES = packOf(packId).names;
  const names = {};
  for (const [sid, n] of Object.entries(saved)) if (keep.has(sid)) names[sid] = n;
  const taken = new Set(Object.values(names));

  // «Клим 97» — не имя, а след исчерпанного пула: так звали всех, кто пришёл
  // после пятидесятого. Как только в пуле снова есть чистое имя, такой агент
  // получает его. Переименование посреди жизни здесь честнее молчания: номером
  // его назвали не по чьему-то выбору, а от нехватки, и заметки, где имя уже
  // записано, хранят свой снимок и не портятся.
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

// Порядок, в котором офис переименовывается целиком. Сначала все, у кого имя
// уже есть, по возрастанию id, потом безымянные живые — и только так, потому
// что этот же порядок берёт предпросмотр в панели. Разойдись они, и панель
// обещала бы «Пётр станет Gus», а стал бы Pete: соврала бы ровно та строка,
// ради которой её и показывают.
const renameOrder = (names, order, keep) => [
  ...Object.keys(names).filter((id) => keep.has(id)).sort(),
  ...order.filter((id) => !names[id]),
];

// Как офис будет называться на этом паке. Считается по тому, что лежит на
// диске, поэтому живые сессии без имени сюда не попадают — а спрашивают об
// этой строке ровно про тех, кто уже стоит на этаже.
export async function previewPack(packId) {
  const { names } = await getSettings();
  const keep = new Set(Object.keys(names));
  return assignNames({}, renameOrder(names, [], keep), keep, packId);
}

async function nameRegistry(sessions) {
  const settings = await getSettings();
  const { names } = settings;
  const packId = effectivePack(settings);

  // Имя держится за сессией, пока на диске жив её транскрипт: `claude --resume`
  // возвращает тот же sessionId, и агент обязан вернуться собой, а не новым
  // человеком. Когда транскрипта не стало — имя уходит обратно в пул.
  //
  // Раньше не уходило никогда, и пул расходовался по сессиям за всё время жизни
  // машины, а не по живым агентам: 30 августа 2026 в реестре было 152 записи и
  // 102 из них с номером — «Ося 51», «Гриша 150». Пятьдесят имён кончились на
  // пятьдесят первой сессии, две трети истории офиса агенты представлялись
  // порядковым номером. Словарь при этом больше вчетверо — но одна лишь замена
  // словаря просто отодвинула бы ту же стену.
  const keep = new Set(transcriptIndex.keys());
  for (const s of sessions) keep.add(s.sessionId);

  // Пустой индекс — это не «транскриптов не стало», это не прочитался каталог:
  // в такую минуту освобождение стёрло бы разом все имена в офисе. Тогда лучше
  // ничего не отпускать.
  if (!transcriptIndex.size) for (const id of Object.keys(names)) keep.add(id);

  const order = [...sessions]
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
    .map((s) => s.sessionId);

  // Пак сменили — офис переименовывается разом, с чистого листа: старые имена
  // не переносятся, иначе половина этажа осталась бы в прежнем словаре, а это
  // читается как поломка, а не как настройка. Обратно едет само — тот же
  // sessionId по тому же паку даёт то же имя.
  //
  // Отметка namesPack на диске отвечает на вопрос «каким паком выданы имена,
  // которые тут лежат». Без неё сервер не отличит «пак не трогали» от «пак
  // сменили, пока офис не работал».
  const renaming = settings.namesPack !== packId;
  const next = renaming
    ? assignNames({}, renameOrder(names, order, keep), keep, packId)
    : assignNames(names, order, keep, packId);

  if (renaming) await patchSettings({ names: next, namesPack: packId });
  else if (!sameNames(next, names)) await patchSettings({ names: next });
  return next;
}

// Стол закрепляется за сессией так же, как имя: пока агент жив, он сидит на
// том же месте. Раньше место выдавалось по позиции в списке, а список
// отсортирован по времени старта — новая сессия вставала в начало и сдвигала
// всю комнату на один стол, так что при каждом старте и завершении соседи
// вставали и шли пересаживаться.
// Комната — по репозиторию, а не по каталогу сессии: иначе каждое рабочее
// дерево одного проекта уезжает в собственную комнату на другом конце этажа.
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

  // Сначала все, у кого место уже записано, — иначе новичок займёт чужой стол
  // и хозяин уедет, ровно то, от чего уходим.
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

  // На диске остаются только живые: мёртвая сессия не вернётся, а её стол
  // должен достаться следующему новичку.
  if (!sameSeats(next, seats)) await patchSettings({ seats: next });
  return next;
}

const IDLE_MS = 90_000;

export async function snapshot() {
  const sessions = await liveSessions();
  // Греем кэш корней до того, как считаются места: projectOf синхронная, а git
  // асинхронный, и без прогрева первый снимок рассадил бы всех по каталогам.
  await Promise.all(sessions.map((s) => repoRoot(s.cwd)));
  await indexTranscripts();
  const names = await nameRegistry(sessions);
  const namesPack = effectivePack(await getSettings());
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
    // Версия и стек — свойство репозитория, а не сессии: у всех агентов одного
    // проекта они одни и те же, и projectInfo держит результат в кэше, чтобы
    // манифест не перечитывался на каждый тик каждым агентом.
    const repo = await projectInfo(s.cwd);

    agents.push({
      id: s.sessionId,
      pid: s.pid,
      handle: s.name || s.sessionId.slice(0, 8),
      name: names[s.sessionId] || s.sessionId.slice(0, 6),
      // род едет со снимком: на странице от имени остаётся одна строка, а
      // «освободилась» и «повесила» ей нужны в двух местах
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
      // Служебное сообщение про лимит — не реплика агента: пришло от подписки,
      // а не от него, и показывать его как «что он сказал» сбивает с толку
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

// Чьи это файлы: id агентов, в чьём транскрипте путь появился. Файл принадлежит
// разговору, и открывать его гостю можно ровно тогда, когда открыт разговор.
export function fileOwners(p, snap) {
  return (snap.agents || [])
    .filter((a) => a.files.some((f) => f.path === p) || a.artifacts.some((f) => f.path === p))
    .map((a) => a.id);
}

export function fileAllowed(p, snap) {
  return fileOwners(p, snap).length > 0;
}

export { fs, inferRole, describeTool, ROLES, ROLE_WINDOW_MS, ROLE_STALE_MS };
