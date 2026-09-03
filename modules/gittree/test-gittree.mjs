// node tools/test-gitgraph.mjs — раскладка полос и разбор дифа без браузера.
//
// Две чистые половины дерева гита: layoutGraph решает, на какой полосе стоит
// коммит и куда уходят линии, parseDiff режет unified diff на строки с двумя
// номерами. Обе ломаются тихо — граф просто нарисуется неправильно, — поэтому
// проверяются здесь, а не глазами.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutGraph, railBits, laneColor, RAIL } from './gitgraph.js';
import { parseDiff, gitLog } from './server.js';

let failed = 0;
const ok = (cond, name, said = '') => {
  if (cond) console.log(`ok    | ${name}`);
  else { failed++; console.log(`ПЛОХО | ${name}${said ? ' — ' + said : ''}`); }
};

// список коммитов записывается как «хеш: родители», сверху вниз
const chain = (spec) => spec.map((s) => {
  const [hash, parents] = s.split(':');
  return { hash: hash.trim(), parents: (parents || '').trim().split(/\s+/).filter(Boolean) };
});

// ------------------------------------------------------------- прямая линия
{
  const { rows, width } = layoutGraph(chain(['a: b', 'b: c', 'c: d', 'd:']));
  ok(rows.every((r) => r.lane === 0), 'прямая история идёт одной полосой');
  ok(width === 1, 'прямой истории хватает одной полосы', `ширина ${width}`);
  ok(rows[3].bottom.length === 0, 'последний коммит без родителя закрывает полосу');
}

// ------------------------------------------------ ветвление и слияние обратно
{
  //  m — слияние a и b, обе линии сходятся в общем предке r
  const { rows, width } = layoutGraph(chain(['m: a b', 'a: r', 'b: r', 'r:']));
  ok(width === 2, 'ветвление занимает вторую полосу', `ширина ${width}`);
  ok(rows[0].merge && rows[0].steps.length === 1 && rows[0].steps[0].to === 1,
    'слияние открывает вторую полосу лесенкой');
  ok(rows[1].lane === 0 && rows[2].lane === 1, 'родители садятся каждый на свою полосу');
  ok(rows[3].lane === 0 && rows[3].joins.includes(1),
    'общий предок садится в левую полосу, правая закрывается в него');
  ok(rows[3].bottom.length === 0, 'после схождения не остаётся висящих полос');
}

// ------------------------------------------------- второй родитель ниже по списку
{
  // ccc сливает 363 и 0a9 — ровно случай из истории самого офиса: вторая
  // полоса живёт пять строк и закрывается внизу
  const { rows } = layoutGraph(chain(['ccc: 363 0a9', '363: x', 'x: 0a9', '0a9:']));
  ok(rows[0].steps[0].to === 1, 'дальний второй родитель уводит линию вправо');
  ok(rows[1].top.includes(1) && rows[2].top.includes(1),
    'полоса второго родителя идёт через промежуточные строки');
  ok(rows[3].lane === 0 && rows[3].joins.includes(1), 'внизу линия возвращается');
}

// ------------------------------------------------------- восемь линий разом
{
  const spec = ['m: p0 p1 p2 p3 p4 p5 p6 p7'];
  for (let i = 0; i < 8; i++) spec.push(`p${i}:`);
  const { rows, width } = layoutGraph(chain(spec));
  ok(width === 8, 'восемь родителей — восемь полос', `ширина ${width}`);
  ok(rows[0].steps.length === 7, 'у осьминога семь лесенок');
  ok(laneColor(6) === laneColor(0), 'цвета полос идут по кругу после шестой');
}

// ------------------------------------------ родитель за границей выборки
{
  // b ждут родителем, но самого b в выборке нет: полоса обязана уйти за нижний
  // край, а не исчезнуть — иначе история выглядит законченной, а она не всё
  const { rows } = layoutGraph(chain(['a: b']));
  ok(rows[0].bottom.includes(0), 'оборванная линия продолжается вниз');
  const { bits } = railBits(rows[0]);
  const down = bits.filter((b) => b.y >= RAIL.rowH / 2 && b.h > 0);
  ok(down.length > 0, 'у оборванной линии рисуется нижняя половина рельса');
}

// ------------------------------------------------------------- геометрия
{
  const { rows } = layoutGraph(chain(['m: a b', 'a:', 'b:']));
  const one = railBits(rows[0]);
  ok(one.dot.merge && one.dot.size > RAIL.dot, 'слияние рисуется крупнее обычного коммита');
  ok(one.dot.x >= 0 && one.dot.y >= 0, 'точка не уезжает за левый край');
  const plain = railBits(rows[1]);
  ok(!plain.dot.merge && plain.dot.size === RAIL.dot, 'обычный коммит — квадрат в размер');
  ok(one.bits.every((b) => b.w > 0 && b.h > 0), 'рельсы не вырождаются в ноль');
}

// --------------------------------------------------------------- разбор дифа
{
  const src = [
    'diff --git a/web/main.js b/web/main.js',
    'index b67a5fd..bbba806 100644',
    '--- a/web/main.js',
    '+++ b/web/main.js',
    '@@ -42,6 +42,9 @@ const state = {',
    "   owner: true, accessMode: 'private',",
    '+  entry: null, needsCode: false,',
    '-const OWNER = (() => {',
    ' })();',
  ].join('\n');
  const [f] = parseDiff(src);
  ok(f.path === 'web/main.js', 'имя файла берётся из заголовка');
  ok(f.add === 1 && f.del === 1, 'прибыло и убыло считается', `+${f.add} −${f.del}`);
  const kinds = f.lines.map((l) => l.kind);
  ok(kinds[0] === 'hunk', 'заголовок куска сохраняется отдельной строкой');
  ok(!f.lines.some((l) => l.kind !== 'hunk' && /^[+-]/.test(l.text)),
    'префикс отрезан: подсветке достаётся чистый код');
  const add = f.lines.find((l) => l.kind === 'add');
  const ctx = f.lines.find((l) => l.kind === 'ctx');
  ok(add.new === 43 && add.old === undefined, 'прибывшая строка знает только новый номер');
  ok(ctx.old === 42 && ctx.new === 42, 'контекст нумеруется с обеих сторон');
  ok(!f.lines.some((l) => l.text && l.text.startsWith('index ')),
    'служебные строки заголовка в панель не попадают');
}

// строка кода, начинающаяся с минуса, не должна читаться как удаление
{
  const src = [
    'diff --git a/a.css b/a.css',
    '@@ -1,2 +1,2 @@',
    '+  margin: -4px;',
    '   width: 100%;',
  ].join('\n');
  const [f] = parseDiff(src);
  const add = f.lines.find((l) => l.kind === 'add');
  ok(add.text === '  margin: -4px;', 'минус внутри строки остаётся текстом', add.text);
}

// двоичный файл: строк нет, но файл в списке есть
{
  const src = [
    'diff --git a/web/favicon.png b/web/favicon.png',
    'index 1..2 100644',
    'Binary files a/web/favicon.png and b/web/favicon.png differ',
  ].join('\n');
  const [f] = parseDiff(src);
  ok(f.binary && f.lines.length === 0, 'двоичный файл виден в списке и без дифа');
}

// ------------------------------------- на настоящей истории этого репозитория
{
  // fileURLToPath, а не url.pathname: в пути главного чекаута есть пробел («AI
  // valey»), и pathname оставляет его как %20 — git запускается в каталоге,
  // которого нет, и падает с ENOENT. В воркtree без пробела это не всплывало
  // ни разу, поэтому нашлось только при вливании 2 сентября 2026.
  const raw = execFileSync('git', ['log', '-n', '60', '--pretty=format:%H %P'], {
    cwd: dirname(dirname(fileURLToPath(import.meta.url))), encoding: 'utf8',
  });
  const commits = raw.split('\n').filter(Boolean).map((l) => {
    const [hash, ...parents] = l.trim().split(' ');
    return { hash, parents };
  });
  const { rows, width } = layoutGraph(commits);
  ok(rows.length === commits.length, 'ни один коммит не потерялся');
  // Две полосы даёт только история со слияниями. В свежем клоне — и в
  // публичном репозитории, начатом с одного коммита, — история линейна, и
  // требовать от неё ветвления значит требовать чужого прошлого. Найдено 2
  // сентября 2026: набор для публикации падал на этой строке при том, что
  // раскладка работала.
  const branched = commits.some((c) => c.parents.length > 1);
  if (branched) ok(width >= 2, 'в настоящей истории офиса больше одной линии', `ширина ${width}`);
  else console.log('  —    история линейна, полосы проверять не на чем');
  ok(rows.every((r) => r.lane >= 0 && r.lane < width), 'каждый коммит стоит внутри своей ширины');
  const seen = new Set();
  let twice = 0;
  for (const r of rows) { if (seen.has(r.hash)) twice++; seen.add(r.hash); }
  ok(twice === 0, 'коммит не встаёт на две полосы разом');
  console.log(`      | ${rows.length} коммитов, ${width} полос — настоящая история`);
}

// ------------------------------------------- «не на origin» на живом репозитории
// Отметка считается запросом к git, и ошибиться в нём можно молча: пустой
// ответ читается как «всё отправлено». 31 августа 2026 так и было — в запросе
// не хватало HEAD, и ↑ не появлялась вообще ни у кого.
{
  const root = mkdtempSync(join(tmpdir(), 'valey-git-'));
  const work = join(root, 'work'), bare = join(root, 'bare');
  const run = (dir, ...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  try {
    execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'pipe' });
    execFileSync('git', ['init', '-q', '-b', 'main', work], { stdio: 'pipe' });
    run(work, 'config', 'user.email', 'office@valey');
    run(work, 'config', 'user.name', 'office');
    writeFileSync(join(work, 'a.txt'), 'a\n');
    run(work, 'add', '-A'); run(work, 'commit', '-qm', 'первый');

    const alone = await gitLog(work, { force: true });
    ok(alone.ok && alone.unpushed === 0 && alone.remotes === false,
      'без remote отметок нет вовсе', `${alone.unpushed} отметок`);

    run(work, 'remote', 'add', 'origin', bare);
    run(work, 'push', '-q', 'origin', 'main');
    writeFileSync(join(work, 'b.txt'), 'b\n');
    run(work, 'add', '-A'); run(work, 'commit', '-qm', 'второй, ещё не отправлен');

    const after = await gitLog(work, { force: true });
    ok(after.unpushed === 1, 'неотправленный коммит отмечен ровно один', `${after.unpushed}`);
    ok(after.commits[0].unpushed && !after.commits[1].unpushed,
      'отмечен именно верхний, а отправленный — нет');

    writeFileSync(join(work, 'c.txt'), 'c\n');
    const dirty = await gitLog(work, { force: true });
    ok(dirty.dirty === 1, 'рабочее дерево считает несохранённые файлы', `${dirty.dirty}`);

    // пустой репозиторий: коммитов нет, но это не отказ
    const fresh = join(root, 'fresh');
    execFileSync('git', ['init', '-q', '-b', 'main', fresh], { stdio: 'pipe' });
    const empty = await gitLog(fresh, { force: true });
    ok(empty.ok && empty.commits.length === 0, 'свежий git init — пусто, а не отказ',
      empty.ok ? 'ok' : empty.code + ' ' + empty.message);

    const nowhere = await gitLog(join(root, 'нет-такого'), { force: true });
    ok(!nowhere.ok && nowhere.code != null, 'не репозиторий — отказ с кодом',
      `${nowhere.code} ${nowhere.message}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё хорошо');
process.exit(failed ? 1 : 0);
