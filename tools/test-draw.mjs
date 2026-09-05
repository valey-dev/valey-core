// node tools/test-draw.mjs — drawing the floor on a stand-in canvas.
//
// Why: on 30 August 2026 the person vanished from the screen the moment you
// walked up to the smoking spot on the service tier. The cause: drawBoard was
// called for every room in the frame, and the service ones have no board —
// `r.board.x` on undefined brought the frame down, and the crash tore the draws
// queue apart, so everything below it — the agents, the cat, the player himself —
// stopped being drawn. Not one test saw this, because they all count numbers and
// none of them draws.
//
// The canvas is a stand-in: what is checked is not the picture but that the
// functions survive to the end on every room of the floor, including those
// missing half their fields. This is a stand of the same kind as the keyboard
// ones — there the DOM is a stand-in, here the ctx is.

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

// ------------------------------------------------------- the rooms' contract
// A board is the mark of a project room. Should a room appear with no board and
// no service flag, the drawing loop in main.js would pass it by silently and
// wrongly.
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

// --------------------------------------------------------- the drawing itself
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

// The trap is written down right here: drawBoard on a service room must throw
// rather than draw emptiness. Calling it without a check is not on — and that is
// not taste but the reason a person vanished from the screen on 30 August 2026.
// The test cannot check main.js itself: that one is tied to a browser and does
// not come up in node.
{
  const svc = L.rooms.find((r) => r.service);
  let threw = false;
  try { office.drawBoard(ctx, svc, [], t, false); } catch { threw = true; }
  ok('drawBoard на сервисной комнате падает — значит её надо звать под проверкой',
    threw, 'не упала: молчаливая доска у комнаты, где её нет');
}

// --------------------------------------------------- a foreign look
// The second case of the same illness: on 30 August 2026 a person who arrived
// from another machine with half their look fields brought drawPerson down on
// shade(look.shirt) — and again took the whole drawing queue with them. The
// server now sieves the rubbish, but does not invent what is missing: filling it
// out is the client's job.
{
  const sprites = await import('../web/sprites.js');
  // the same defaults as in main.js — there they live next to state.me
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

// The same walk main.js makes: the board is asked for only from those that have
// one. If the guard there is ever removed, this is what falls over.
survives('обход всех комнат так, как ходит main.js', () => {
  for (const r of L.rooms) {
    if (r.board) office.drawBoard(ctx, r, [], t, false);
    for (const d of r.desks) office.drawDesk(ctx, d, null, t);
  }
});

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
