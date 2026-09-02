// Дерево гита комнаты: история проекта, диф одного коммита и отметка «этого
// ещё нет на origin». Читается тем же способом, что и стек в stack.js —
// execFile по каталогу сессии, — поэтому зависимостей у офиса по-прежнему ноль.
//
// Наружу отсюда не уходит ничего: каталог выбирает не запрос, а index.js по
// ключу комнаты. Принимать путь параметром нельзя — это чтение любого каталога
// машины чужими руками, тот же довод уже записан у /api/file.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const LOG_TTL = 30_000;      // историю открывают часто, а меняется она реже
const SHOW_TTL = 5 * 60_000; // диф коммита не меняется вообще: коммит неизменен
const LOG_LIMIT = 200;
const MAX_DIFF = 400 * 1024; // больше в панель всё равно не влезет

const logCache = new Map();   // dir -> { at, board }
const showCache = new Map();  // dir + '\0' + hash -> { at, data }

const SEP = '\x1f';
const REC = '\x1e';

// Отказ словами и кодом возврата: 128 — «каталог больше не репозиторий»,
// 127 или ENOENT — «git не установлен», и чинятся они разным. Одна пустая
// панель на оба случая не различает их вовсе.
function fail(err) {
  const code = err && (err.code === 'ENOENT' ? 127 : err.code);
  const said = String((err && err.stderr) || (err && err.message) || '').split('\n')[0].trim();
  return {
    ok: false,
    code: typeof code === 'number' ? code : null,
    message: said || 'git не ответил',
  };
}

const git = (dir, args, opts = {}) => run('git', args, {
  cwd: dir,
  timeout: opts.timeout || 5000,
  maxBuffer: opts.maxBuffer || 8 * 1024 * 1024,
});

// Есть ли тут репозиторий вообще. Отдельным вопросом, потому что от ответа
// зависит не только панель, но и то, вырастет ли в комнате дерево.
export async function hasRepo(dir) {
  if (!dir) return false;
  try {
    await git(dir, ['rev-parse', '--git-dir'], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// Коммиты, которых ещё нет ни на одном remote. Считается через --not --remotes,
// а не через @{upstream}: у ветки, заведённой локально, upstream не настроен, и
// вопрос «отправлено ли это наружу» остался бы без ответа именно там, где он
// важнее всего. Если удалённых нет вовсе — не отмечается ничего: в репозитории
// без remote «не отправлено» верно про каждый коммит и не значит ничего.
async function unpushed(dir) {
  try {
    const { stdout: remotes } = await git(dir, ['remote'], { timeout: 2000 });
    if (!remotes.trim()) return { marks: new Set(), remotes: false };
    // HEAD здесь обязателен. `git log --not --remotes` без положительной ссылки
    // не подставляет HEAD сам — любой аргумент-ревизия отменяет умолчание, — и
    // отвечает пустотой: 31 августа 2026 отметка «не на origin» так и не
    // появилась ни разу, а выглядело это как «всё отправлено».
    const { stdout } = await git(dir, ['log', 'HEAD', '--pretty=%H', '--not', '--remotes', '-n', String(LOG_LIMIT)]);
    return { marks: new Set(stdout.split('\n').filter(Boolean)), remotes: true };
  } catch {
    // Ветка без коммитов, оборванный remote — это не повод хоронить всю панель:
    // история читается и без отметок.
    return { marks: new Set(), remotes: true };
  }
}

const FORMAT = ['%H', '%h', '%P', '%an', '%aI', '%D', '%s', '%b'].join(SEP) + REC;

function parseLog(stdout) {
  return stdout.split(REC)
    .map((rec) => rec.replace(/^\n/, ''))
    .filter((rec) => rec.trim())
    .map((rec) => {
      const [hash, short, parents, author, iso, refs, subject, body] = rec.split(SEP);
      return {
        hash,
        short,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        author,
        ts: Date.parse(iso) || 0,
        refs: refs ? refs.split(', ').filter(Boolean) : [],
        subject: subject || '',
        body: (body || '').trim(),
      };
    });
}

export async function gitLog(dir, { force = false } = {}) {
  if (!dir) return { ok: false, code: null, message: 'комната без каталога' };
  const hit = logCache.get(dir);
  if (hit && !force && Date.now() - hit.at < LOG_TTL) return hit.board;

  let board;
  try {
    const [{ stdout: raw }, head, count, dirty, ahead] = await Promise.all([
      git(dir, ['log', '-n', String(LOG_LIMIT), '--pretty=format:' + FORMAT]),
      git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).then((r) => r.stdout.trim()).catch(() => ''),
      git(dir, ['rev-list', '--count', 'HEAD']).then((r) => Number(r.stdout.trim()) || 0).catch(() => 0),
      git(dir, ['status', '--porcelain']).then((r) => r.stdout.split('\n').filter(Boolean).length).catch(() => 0),
      unpushed(dir),
    ]);
    const commits = parseLog(raw).map((c) => ({ ...c, unpushed: ahead.marks.has(c.hash) }));
    board = {
      ok: true,
      branch: head === 'HEAD' ? '' : head,   // отсоединённая голова имени не имеет
      total: count,
      dirty,
      remotes: ahead.remotes,
      unpushed: commits.filter((c) => c.unpushed).length,
      commits,
    };
  } catch (err) {
    // Свежий `git init` отвечает 128 на `git log` — коммитов нет. Это не отказ:
    // дерево в комнате выросло правильно, репозиторий есть, истории пока нет.
    const said = String((err && err.stderr) || '');
    if (/does not have any commits yet|unknown revision/i.test(said)) {
      board = { ok: true, branch: '', total: 0, dirty: 0, remotes: false, unpushed: 0, commits: [] };
    } else {
      board = fail(err);
    }
  }
  logCache.set(dir, { at: Date.now(), board });
  return board;
}

// ------------------------------------------------------------------ один диф

// Разбор unified diff в строки с двумя номерами. Префикс отрезается здесь, а не
// на странице: подсветке достаётся чистый код, и второй разборщик — тот, что
// понимал бы «+» как часть строки, — не заводится.
export function parseDiff(text) {
  const files = [];
  let file = null, oldNo = 0, newNo = 0;
  for (const line of String(text).split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/ b\/(.+)$/);
      file = { path: m ? m[1] : line.slice(11), add: 0, del: 0, lines: [], binary: false };
      files.push(file);
      continue;
    }
    if (!file) continue;
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) { file.binary = true; continue; }
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')
      || line.startsWith('new file') || line.startsWith('deleted file')
      || line.startsWith('similarity index') || line.startsWith('rename ')
      || line.startsWith('old mode') || line.startsWith('new mode')) continue;
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
      if (m) { oldNo = Number(m[1]); newNo = Number(m[2]); }
      file.lines.push({ kind: 'hunk', text: line });
      continue;
    }
    const c = line[0];
    if (c === '+') { file.lines.push({ kind: 'add', new: newNo++, text: line.slice(1) }); file.add++; }
    else if (c === '-') { file.lines.push({ kind: 'del', old: oldNo++, text: line.slice(1) }); file.del++; }
    else if (c === ' ' || c === '') { file.lines.push({ kind: 'ctx', old: oldNo++, new: newNo++, text: line.slice(1) }); }
    // «\ No newline at end of file» — не строка файла, в панели ей делать нечего
  }
  return files;
}

const HASH = /^[0-9a-f]{4,40}$/i;

export async function gitCommit(dir, hash) {
  if (!dir) return { ok: false, code: null, message: 'комната без каталога' };
  if (!HASH.test(hash)) return { ok: false, code: null, message: 'это не хеш коммита' };
  const key = dir + '\0' + hash;
  const hit = showCache.get(key);
  if (hit && Date.now() - hit.at < SHOW_TTL) return hit.data;

  let data;
  try {
    const { stdout: meta } = await git(dir, ['show', '-s', '--pretty=format:' + FORMAT, hash]);
    const c = parseLog(meta)[0];
    if (!c) throw Object.assign(new Error('коммит не найден'), { code: 128 });
    // У слияния своего дифа нет: git show показывает пустоту, и панель на этом
    // месте врала бы «ничего не изменилось». Показываем разницу с первым
    // родителем и говорим об этом вслух — строкой в шапке.
    const merge = c.parents.length > 1;
    const args = merge
      ? ['diff', '--unified=3', c.parents[0], c.hash]
      : ['show', '--format=', '--unified=3', c.hash];
    const { stdout: raw } = await git(dir, args, { maxBuffer: MAX_DIFF * 4 });
    const truncated = raw.length > MAX_DIFF;
    const files = parseDiff(truncated ? raw.slice(0, MAX_DIFF) : raw);
    data = {
      ok: true,
      merge,
      truncated,
      commit: { ...c, add: files.reduce((n, f) => n + f.add, 0), del: files.reduce((n, f) => n + f.del, 0) },
      files,
    };
  } catch (err) {
    data = fail(err);
  }
  showCache.set(key, { at: Date.now(), data });
  return data;
}

export function forgetGit() { logCache.clear(); showCache.clear(); }
