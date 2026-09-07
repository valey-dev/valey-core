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
const { define: definePlaces, reset: resetPlaces, get: placeOf, keyIn } = await import('../../web/places.js');
const CORE = await import('../../web/ui.js');
const P = await import('./client.js');

const hooks = {};
// The stand-in api mirrors the real loader: the `keys` seam declares the module's
// keys in the shared registry, putting its id in front.
resetKeys();
resetPlaces();
P.register({
  id: 'plan',
  on: (n, f) => (hooks[n] = f),
  i18n: (d) => addDict(d),
  keys: (list) => defineKeys([].concat(list).map((a) => ({ ...a, id: `plan.${a.id}` }))),
  places: (list) => {
    const own = [].concat(list).map((pl) => ({ ...pl, id: `plan.${pl.id}` }));
    definePlaces(own);
    return own.map((pl) => pl.id);
  },
});

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('FAIL  |', name, '→', got); }
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
check('the key is in the tooltip', !!mine && mine.caps.includes('K'), mine);
check('and the module does not keep its help line', !hooks.help, 'still present');
// The key is declared in the registry rather than wired into the handler: the module
// compares no letters, and the Russian «Л» is the same physical KeyK, which is checked
// in tools/test-keymap.mjs.
check('the module declared its key in the registry', actionOf({ code: 'KeyK' }) === 'plan.toggle', actionOf({ code: 'KeyK' }));
check('a closed plan does not consume arrow keys', P.planKey('ArrowDown') === false, 'consumed');
check('the module does not take someone else’s action', hooks.action('radio.toggle') === false, 'claimed');
check('action reveals a plan', hooks.action('plan.toggle') === true && P.planOpen(), P.planOpen());
check('and marks the screen as busy', hooks.busy() === true, hooks.busy());
// Its own place on the keys board. The module names it; the core asks rather than
// knowing, which is the whole point of the seam.
check('the module announced its place', !!placeOf('plan.map'), placeOf('plan.map'));
check('and while the plan is open, it answers', hooks.place() === 'plan.map', hooks.place());
check('the arrow at this point is the room, not the focus',
  keyIn('plan.map', 'ArrowLeft').caption === 'plan.place.room', keyIn('plan.map', 'ArrowLeft'));
check('K here closes, not opens',
  keyIn('plan.map', 'KeyK').caption === 'plan.place.close', keyIn('plan.map', 'KeyK'));
// The floor is still listening: planKey answers the arrows and returns false for
// letters, so C opens the wardrobe over the plan and the board must say so.
check('the floor letter on the plan is lit', keyIn('plan.map', 'KeyC').lit === true, keyIn('plan.map', 'KeyC'));
// Except the one that opens this board: it answers everywhere or it is useless.
check('and “/” is lit here too', keyIn('plan.map', 'Slash').lit === true, keyIn('plan.map', 'Slash'));
check('the focus is on the nearest door - the first room', P.planFocus() === r0.key, P.planFocus());
check('each room has its own button', map.cells.length === L.rooms.length, `${map.cells.length} of ${L.rooms.length}`);

// ------------------------------------------------------------------ the grid
const row0 = L.projectRooms.filter((r) => r.y === r0.y).sort((a, b) => a.x - b.x);
const row1 = L.projectRooms.filter((r) => r.y !== r0.y).sort((a, b) => a.x - b.x);
check('the layout has two rows of three', row0.length === 3 && row1.length === 3, [row0.length, row1.length]);
P.planKey('ArrowRight');
check('to the right - the next room of the same row', P.planFocus() === row0[1].key, P.planFocus());
P.planKey('ArrowUp');
check('up - the room above it, not the first one in the list', P.planFocus() === row1[1].key, P.planFocus());
P.planKey('ArrowLeft');
check('left - neighbor on the left', P.planFocus() === row1[0].key, P.planFocus());
P.planKey('ArrowLeft');
check('from the edge of the row - to its other end', P.planFocus() === row1[2].key, P.planFocus());
P.planKey('ArrowUp');
check('from the top row up - rooftop greenhouse', P.planFocus() === '__greenhouse', P.planFocus());
P.planKey('ArrowDown');
check('from the roof down - back to the top row', row1.some((r) => r.key === P.planFocus()), P.planFocus());
P.planKey('ArrowDown'); P.planKey('ArrowDown');
check('under the bottom row is the service tier', ['__security', '__meeting'].includes(P.planFocus()), P.planFocus());

// ----------------------------------------------------------- lead me there
hooks.esc();
check('ESC closes plan', !P.planOpen(), P.planOpen());
check('and the place is not ours again', hooks.place() === null, hooks.place());
hooks.action('plan.toggle');
check('and it opens again', P.planOpen(), P.planOpen());
check('and the focus is again at your door', P.planFocus() === r0.key, P.planFocus());
P.planKey('Enter');
check('Enter leads to the one who is waiting, not to the first one at the table', state.waypoint === 'a1', state.waypoint);
check('and closes the plan', !P.planOpen(), P.planOpen());

// A room with no people: the arrow has nobody to lead to, the plan stays open.
state.waypoint = null;
hooks.action('plan.toggle');
P.planKey('ArrowDown'); P.planKey('ArrowDown');
const empty = P.planFocus();
P.planKey('Enter');
check('doesn\'t lead to an empty room', state.waypoint === null && P.planOpen(), [empty, state.waypoint]);
hooks.esc();

// The entrance screen: there is no plan under it, there is nothing to be "here" yet.
document.body.classList.add('titling');
check('The plan does not open on the login screen', hooks.action('plan.toggle') === false && !P.planOpen(), P.planOpen());
document.body.classList.remove('titling');

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
