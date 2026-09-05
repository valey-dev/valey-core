// node tools/test-plaque.mjs — табличка над дверью и три щели, открытые наружу.
//
// Табличку рисуют двое: экран входа вешает её на стену, генератор обложки
// печатает картинкой. Пока модуль был один на двоих только на словах, вторая
// копия молча разошлась по цвету и порядку строк — сравнивать было не с чем.
// Здесь есть с чем: обе стороны зовут drawPlaque, и стенд смотрит, что именно
// она кладёт на холст.
//
// Второе — параметры drawTitle. Ими живёт заглушка valey.dev в отдельном
// репозитории: своя строка на табличке, свой вид за стеклом и отключённые
// органы управления. Пока сцена рисовалась одна на всех, менять её приходилось
// бы копией, а копия экрана входа — это ровно тот второй движок, который уже
// сносили с лендинга.
const fakeNode = (extra = {}) => ({
  dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  querySelectorAll: () => [], querySelector: () => null, ...extra,
});
const overlay = { hidden: true, innerHTML: '', style: {}, querySelectorAll: () => [], querySelector: () => null };
globalThis.document = {
  querySelector: (s) => (s === '#title' ? overlay : null),
  getElementById: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 675 }) }),
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.addEventListener = () => {};

// Холст-регистратор: он не рисует, он записывает. Сравнивать пиксели незачем —
// ломается здесь не цвет, а то, что вызов вообще не случился.
function recorder() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1, fillStyle: '', font: '', textAlign: 'left',
    fillRect(...a) { calls.push({ kind: 'rect', color: this.fillStyle, box: a.map(Math.round) }); },
    fillText(s, x, y) { calls.push({ kind: 'text', color: this.fillStyle, text: s, x: Math.round(x), y: Math.round(y) }); },
    measureText: (s) => ({ width: s.length * 4 }),
    beginPath() {}, ellipse() {}, fill() {}, save() {}, restore() {}, translate() {}, scale() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
}

const { PLAQUE, NAIL_RISE, drawPlaque } = await import('../web/plaque.js');
const { initTitle, drawTitle } = await import('../web/title.js');
const { lookOf } = await import('../web/sprites.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// ------------------------------------------------------- сама табличка
{
  const ctx = recorder();
  drawPlaque(ctx, PLAQUE, 'OPENING SOON', null);
  const boxes = ctx.calls.filter((c) => c.kind === 'rect');
  const board = boxes.find((c) => c.box[2] === PLAQUE.w && c.box[3] === PLAQUE.h);
  ok('доска на месте и своего размера', !!board && board.box[0] === PLAQUE.x && board.box[1] === PLAQUE.y, board);
  ok('рамка тёплого дерева, а не поля', board && board.color === '#8a5f3a', board && board.color);
  // Гвозди торчат выше рамки, и это часть картинки: обложка формы считает свою
  // безопасную зону от них. Уехали внутрь — обложку обрежет по живому.
  const nails = boxes.filter((c) => c.box[1] === PLAQUE.y - NAIL_RISE && c.box[2] === 3);
  ok('два гвоздя, и оба выше доски', nails.length === 2, nails);
  // Буквы набраны пикселями: прямоугольниками, а не fillText. Пятый кегль на
  // холсте 400×225 рисуется полутонами, а офис раздувает каждый полутон в
  // квадрат — на настоящем кадре подпись не читалась ни одной буквой.
  ok('строки набраны пикселями, а не шрифтом', !ctx.calls.some((c) => c.kind === 'text'), ctx.calls.filter((c) => c.kind === 'text'));
  ok('нарисовано много мелких пятен — это и есть буквы', boxes.length > 60, boxes.length);
}

// Строка, которой нет ни в одном лице, уходит в fallback: мыльная подпись
// лучше пропавшей. Иероглифов в пиксельном шрифте нет и не будет.
{
  const ctx = recorder();
  let asked = null;
  drawPlaque(ctx, PLAQUE, '事務所', (c, s, x, y) => { asked = { s, x, y }; });
  ok('чего не берёт шрифт — отдаётся запасному рисовальщику', asked && asked.s === '事務所', asked);
}
{
  const ctx = recorder();
  ok('и без запасного не падает', (() => { try { drawPlaque(ctx, PLAQUE, '事務所', null); return true; } catch { return false; } })());
}

// ------------------------------------------------------- щели наружу
const scene = (opts) => {
  initTitle({ agents: [{ id: 'a' }, { id: 'b' }], me: lookOf('valey-test') }, {});
  const ctx = recorder();
  drawTitle(ctx, 400, 225, 1000, opts);
  return ctx;
};

{
  const plain = scene(undefined);
  const quiet = scene({ controls: false });
  // Переключатель языка — единственная вещь на экране входа, которую можно
  // нажать. На странице, по которой не ходят, он обещает то, чего там нет.
  ok('без controls сцена беднее', quiet.calls.length < plain.calls.length, [plain.calls.length, quiet.calls.length]);
  ok('и подсказок в ней нет', !quiet.calls.some((c) => c.kind === 'text' && /ПРОБЕЛ|SPACE/.test(c.text || '')),
    quiet.calls.filter((c) => c.kind === 'text').map((c) => c.text));
}

{
  const own = scene({ sub: 'OPENING SOON' });
  const dflt = scene({});
  // Разница должна быть только в нижней строке таблички: имя над ней остаётся
  // именем офиса на двери, а не превращается во второй логотип страницы.
  const nameRows = (ctx) => ctx.calls.filter((c) => c.kind === 'rect' && c.box[1] >= PLAQUE.y + 3 && c.box[1] < PLAQUE.y + 13).length;
  ok('имя на табличке не трогается', nameRows(own) === nameRows(dflt), [nameRows(own), nameRows(dflt)]);
  const subRows = (ctx) => ctx.calls.filter((c) => c.kind === 'rect' && c.box[1] >= PLAQUE.y + 15 && c.box[1] < PLAQUE.y + 22).length;
  ok('а нижняя строка меняется', subRows(own) !== subRows(dflt), [subRows(own), subRows(dflt)]);
}

{
  let got = null;
  const s = scene({ window: (ctx, WIN) => { got = { ...WIN }; ctx.fillStyle = '#123456'; ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h); } });
  ok('за стекло пускают чужого рисовальщика', !!got && got.w === 64 && got.h === 36, got);
  ok('и он рисует именно там, где окно', s.calls.some((c) => c.color === '#123456'), null);
  // Рама и переплёт остаются общими: окно — часть этой стены, а не картинка,
  // которую подменяют целиком.
  ok('рама и переплёт остаются наши',
    s.calls.some((c) => c.kind === 'rect' && c.box[2] === 2 && c.box[3] === 36 && c.color === '#8a6247'), null);
}

console.log(bad ? `\nПЛОХО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
