// node tools/test-draw.mjs — отрисовка этажа на подставном холсте.
//
// Зачем: 30 августа 2026 человек пропал с экрана, стоило подойти к курилке на
// сервисном ярусе. Причина — drawBoard звалась для каждой комнаты в кадре, а у
// сервисных доски нет: `r.board.x` у undefined роняло кадр, а падение рвало
// очередь draws, и всё, что стояло в ней ниже, — агенты, кот, сам игрок —
// переставало рисоваться. Ни один тест этого не видел, потому что все они
// считают числа и ни один не рисует.
//
// Холст подставной: проверяется не картинка, а то, что функции доживают до
// конца на всех комнатах этажа, включая те, у которых половины полей нет.
// Это стенд того же рода, что клавиатурные, — там подставной DOM, здесь ctx.

const noop = () => {};
const grad = { addColorStop: noop };
const ctx = new Proxy({}, {
  get(_, k) {
    if (k === 'measureText') return (s) => ({ width: String(s).length * 4 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (k === 'canvas') return { width: 400, height: 225 };
    return noop;
  },
  set() { return true; },
});
const canvas = { width: 400, height: 225, style: {}, getContext: () => ctx };
globalThis.document = {
  createElement: () => canvas,
  head: { appendChild: noop },
  body: { appendChild: noop, classList: { add: noop, remove: noop } },
  querySelector: () => null,
  getElementById: () => null,
  addEventListener: noop,
};
globalThis.window = globalThis;
globalThis.addEventListener = noop;
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };

const { buildLayout } = await import('../web/layout.js');
const office = await import('../web/office.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', String(got)); }
};
const survives = (name, fn) => {
  try { fn(); ok(name, true); } catch (e) { ok(name, false, e && e.message); }
};

const agents = Array.from({ length: 7 }, (_, i) => ({
  id: 'a' + i, project: 'p' + (i % 4), name: 'a' + i, status: 'idle',
}));
const L = buildLayout(agents);
const t = 1000;

// ------------------------------------------------------- контракт комнат
// Доска — примета проектной комнаты. Если появится комната без доски и без
// флага service, цикл отрисовки в main.js обойдёт её молча и неправильно.
const boardless = L.rooms.filter((r) => !r.board);
ok('комната без доски — только сервисная',
  boardless.every((r) => r.service), boardless.map((r) => r.title));
ok('и наоборот: у сервисных доски нет',
  L.rooms.filter((r) => r.service).every((r) => !r.board), null);
ok('у каждой комнаты есть desks, пусть и пустые',
  L.rooms.every((r) => Array.isArray(r.desks)), L.rooms.map((r) => typeof r.desks));
ok('и art, пусть и пустой',
  L.rooms.every((r) => Array.isArray(r.art)), L.rooms.map((r) => typeof r.art));
ok('у каждой есть дверь и точка у двери',
  L.rooms.every((r) => r.door && r.doorPoint), null);

// --------------------------------------------------------- сама отрисовка
survives('коридор рисуется', () => office.drawCorridor(ctx, L, t, 0.5, { kind: 'clear', intensity: 0.5, wind: 0 }));
survives('свет по всему этажу', () => office.drawLight(ctx, L, t, 0.5));
survives('лифт', () => office.drawLift(ctx, L, t, { floor: 1, open: 0, phase: 'idle' }));
survives('стойки секретаря', () => office.drawReception(ctx, L, t));

for (const r of L.rooms) {
  const who = r.title;
  if (r.draw === 'security') { survives(`пультовая: ${who}`, () => office.drawSecurity(ctx, r, t, {})); continue; }
  if (r.draw === 'meeting') { survives(`переговорка: ${who}`, () => office.drawMeeting(ctx, r, t)); continue; }
  if (r.draw === 'greenhouse') { survives(`оранжерея: ${who}`, () => office.drawGreenhouse(ctx, r, t, {})); continue; }
  survives(`комната: ${who}`, () => { office.drawRoom(ctx, r, t); office.drawRoomProps(ctx, r, t); });
  survives(`доска: ${who}`, () => office.drawBoard(ctx, r, [], t, false));
  for (const d of r.desks) survives(`стол ${who}#${d.i}`, () => office.drawDesk(ctx, d, null, t));
}

// Ловушка записана прямо здесь: drawBoard на сервисной комнате обязана падать,
// а не рисовать пустоту. Звать её без проверки нельзя — и это не вкусовщина,
// а то, из-за чего 30 августа 2026 с экрана пропал человек. Тест не может
// проверить сам main.js: тот привязан к браузеру и в node не поднимается.
{
  const svc = L.rooms.find((r) => r.service);
  let threw = false;
  try { office.drawBoard(ctx, svc, [], t, false); } catch { threw = true; }
  ok('drawBoard на сервисной комнате падает — значит её надо звать под проверкой',
    threw, 'не упала: молчаливая доска у комнаты, где её нет');
}

// --------------------------------------------------- чужая внешность
// Второй случай той же болезни: 30 августа 2026 человек, пришедший с чужой
// машины с половиной полей внешности, уронил drawPerson на shade(look.shirt) —
// и снова унёс с собой всю очередь отрисовки. Сервер теперь просеивает мусор,
// но недостающего не выдумывает: достраивать до полного обязан клиент.
{
  const sprites = await import('../web/sprites.js');
  // те же умолчания, что в main.js — там они живут рядом с state.me
  const DEFAULT_ME = {
    skin: '#ffdcb8', hair: '#3a2a20', shirt: '#4fa89a', pants: '#3f4a63', boots: '#2a2118',
    style: 0, head: 'none', glasses: false, face: 'none', tall: 1, hands: 'none',
  };
  const partial = sprites.normalizeLook({ boots: '#2a2118', head: 'cap' });
  let threw = false;
  try { sprites.drawPerson(ctx, 10, 10, partial, { pose: 'stand', frame: 0, dir: 1, bob: 0 }); } catch { threw = true; }
  ok('голая половинчатая внешность роняет drawPerson — её нельзя рисовать как есть',
    threw, 'не упала: значит ловушка ушла, и проверку ниже можно снимать');

  const whole = sprites.normalizeLook({ ...DEFAULT_ME, boots: '#2a2118', head: 'cap' });
  survives('достроенная до умолчаний — рисуется', () => sprites.drawPerson(ctx, 10, 10, whole, { pose: 'walk', frame: 1, dir: -1, bob: 0 }));
  survives('и пустая, достроенная до умолчаний, тоже', () => sprites.drawPerson(ctx, 10, 10, sprites.normalizeLook({ ...DEFAULT_ME }), { pose: 'stand', frame: 0, dir: 1, bob: 0 }));
}

// Тот же обход, каким его делает main.js: доску просит только у того, у кого
// она есть. Если guard там когда-нибудь снимут, упадёт вот это.
survives('обход всех комнат так, как ходит main.js', () => {
  for (const r of L.rooms) {
    if (r.board) office.drawBoard(ctx, r, [], t, false);
    for (const d of r.desks) office.drawDesk(ctx, d, null, t);
  }
});

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
