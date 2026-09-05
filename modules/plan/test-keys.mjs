// node modules/plan/test-keys.mjs — the keys of the office plan.
//
// What is checked is not the layout but the focus: which room it lands on when the
// panel opens, where it walks with the arrows over the grid and whom Enter chooses.
// The plan is a real one, from buildLayout: walking the plan is walking its geometry,
// and a stand-in grid would check the stand rather than the module.
//
// The DOM is the shared one, from tools/lib/dom.mjs. There was a machine of its own
// here, and it lived exactly until the first merge with main: six copies had already
// been brought together into one there, and a seventh arriving from a branch would
// bring back the same trouble — stands diverge not by the signature of a node but by
// what they hold to be true. What is left local here is only what the shared shim does
// not know and must not: the canvas of the plan and the sheet it lays the room buttons on.
import { node, installDom } from '../../tools/lib/dom.mjs';

// The sheet of the map. The room buttons live over the canvas, and the module rebuilds
// them on every change of the plan — so appendChild really has to add and remove really
// has to take away what was added. The shared node cannot do that and does not have to:
// this is the only place in the office where the list of children matters.
function makeMap() {
  const cells = [];
  return node('planmap', {
    id: 'planmap',
    appendChild(b) {
      b.remove = () => { const i = cells.indexOf(b); if (i >= 0) cells.splice(i, 1); };
      cells.push(b);
      return b;
    },
    querySelectorAll: (sel) => (sel === '.plancell' ? cells.slice() : []),
    cells,
  });
}

const map = makeMap();
const canvas = node('', { id: 'plancanvas', tagName: 'CANVAS' });
const detail = node('plandetail', { id: 'plandetail' });
const count = node('', { id: 'plancount', tagName: 'I' });
// The core toasts: toast() counts children, so the list has to exist.
const toasts = node('', { id: 'toasts', children: [], appendChild() {} });

installDom({
  byId: {
    planmap: map, plancanvas: canvas, plandetail: detail, plancount: count,
    planx: node('', { id: 'planx' }), plango: node('plango', { id: 'plango' }),
    toasts,
  },
});

const { buildLayout } = await import('../../web/layout.js');
const { addDict } = await import('../../web/i18n.js');
const { define: defineKeys, reset: resetKeys, actionOf, hints } = await import('../../web/keymap.js');
const CORE = await import('../../web/ui.js');
const P = await import('./client.js');

const hooks = {};
// The stand-in api mirrors the real loader: the `keys` seam declares the module's
// keys in the shared registry, putting its id in front.
resetKeys();
P.register({
  id: 'plan',
  on: (n, f) => (hooks[n] = f),
  i18n: (d) => addDict(d),
  keys: (list) => defineKeys([].concat(list).map((a) => ({ ...a, id: `plan.${a.id}` }))),
});

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// Six projects — two rows of three; in the first there are two agents, one of them waiting.
const agents = [
  { id: 'a0', project: 'p0', name: 'Броня', status: 'working', seat: 0 },
  { id: 'a1', project: 'p0', name: 'Тимур', status: 'awaiting', seat: 1 },
  ...[1, 2, 3, 4, 5].map((i) => ({ id: 'b' + i, project: 'p' + i, name: 'b' + i, status: 'idle', seat: 0 })),
];
const L = buildLayout(agents);
const actors = new Map();
for (const a of agents) {
  const spot = L.byAgent.get(a.id);
  actors.set(a.id, { id: a.id, x: spot.desk.x, y: spot.desk.y, room: spot.room, state: 'sit' });
}
const r0 = L.projectRooms[0];
const state = {
  agents, layout: L, actors, people: new Map(), sig: 'one', t: 0,
  player: { x: r0.doorPoint.x, y: r0.doorPoint.y - 30 },   // in the corridor by the door of the first room
  cat: { x: 0, y: 0 }, lift: { floor: 2 }, currentRoom: null, waypoint: null,
};
CORE.initUI(state, { guideTo: () => {} });
hooks.tick(state, 16);

// ------------------------------------------------------------ opening and closing
// The module no longer writes the caption on its own cap: it declared the key, and the
// caption appeared. It has no help line at all, and that is checked by the entry for it
// being in the registry of hints.
const mine = hints().find((h) => h.hint === 'plan.hint');
check('клавиша попала в подсказку', !!mine && mine.caps.includes('K'), mine);
check('и своей строки помощи модуль не держит', !hooks.help, 'держит');
// The key is declared in the registry rather than wired into the handler: the module
// compares no letters, and the Russian «Л» is the same physical KeyK, which is checked
// in tools/test-keymap.mjs.
check('модуль объявил свою клавишу в реестре', actionOf({ code: 'KeyK' }) === 'plan.toggle', actionOf({ code: 'KeyK' }));
check('закрытый план стрелки не ест', P.planKey('ArrowDown') === false, 'съел');
check('чужое действие модуль не берёт', hooks.action('radio.toggle') === false, 'взял');
check('действие открывает план', hooks.action('plan.toggle') === true && P.planOpen(), P.planOpen());
check('и он держит экран', hooks.busy() === true, hooks.busy());
check('фокус встаёт на ближайшую дверь — первую комнату', P.planFocus() === r0.key, P.planFocus());
check('на каждую комнату положена своя кнопка', map.cells.length === L.rooms.length, `${map.cells.length} на ${L.rooms.length}`);

// ------------------------------------------------------------------ the grid
const row0 = L.projectRooms.filter((r) => r.y === r0.y).sort((a, b) => a.x - b.x);
const row1 = L.projectRooms.filter((r) => r.y !== r0.y).sort((a, b) => a.x - b.x);
check('в планировке два ряда по три', row0.length === 3 && row1.length === 3, [row0.length, row1.length]);
P.planKey('ArrowRight');
check('вправо — соседняя комната того же ряда', P.planFocus() === row0[1].key, P.planFocus());
P.planKey('ArrowUp');
check('вверх — комната над ней, а не первая в списке', P.planFocus() === row1[1].key, P.planFocus());
P.planKey('ArrowLeft');
check('влево — сосед слева', P.planFocus() === row1[0].key, P.planFocus());
P.planKey('ArrowLeft');
check('с края ряда — на другой его конец', P.planFocus() === row1[2].key, P.planFocus());
P.planKey('ArrowUp');
check('с верхнего ряда вверх — оранжерея на крыше', P.planFocus() === '__greenhouse', P.planFocus());
P.planKey('ArrowDown');
check('с крыши вниз — обратно в верхний ряд', row1.some((r) => r.key === P.planFocus()), P.planFocus());
P.planKey('ArrowDown'); P.planKey('ArrowDown');
check('под нижним рядом — сервисный ярус', ['__security', '__meeting'].includes(P.planFocus()), P.planFocus());

// ----------------------------------------------------------- lead me there
hooks.esc();
check('ESC закрывает план', !P.planOpen(), P.planOpen());
hooks.action('plan.toggle');
check('и оно же открывает снова', P.planOpen(), P.planOpen());
check('и фокус снова у своей двери', P.planFocus() === r0.key, P.planFocus());
P.planKey('Enter');
check('Enter ведёт к тому, кто ждёт, а не к первому за столом', state.waypoint === 'a1', state.waypoint);
check('и закрывает план', !P.planOpen(), P.planOpen());

// A room with no people: the arrow has nobody to lead to, the plan stays open.
state.waypoint = null;
hooks.action('plan.toggle');
P.planKey('ArrowDown'); P.planKey('ArrowDown');
const empty = P.planFocus();
P.planKey('Enter');
check('в пустую комнату не ведёт', state.waypoint === null && P.planOpen(), [empty, state.waypoint]);
hooks.esc();

// The entrance screen: there is no plan under it, there is nothing to be "here" yet.
document.body.classList.add('titling');
check('на экране входа план не открывается', hooks.action('plan.toggle') === false && !P.planOpen(), P.planOpen());
document.body.classList.remove('titling');

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
