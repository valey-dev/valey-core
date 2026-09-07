// node tools/test-lift-keys.mjs — the keys in the lift panel and at the desk.
// The DOM is a stand-in, as in every keyboard stand: what is checked is not the
// layout but the state of the focus — which floor it starts on, where the arrows
// take it and what Enter presses.

import { node, proxy, installDom } from './lib/dom.mjs';

// The panel holds either floors or desk rows — el.lift is the same node.
function makeLift(kind = 'floors', n = 3) {
  const cls = kind === 'floors' ? 'liftbtn' : 'recgo';
  const btns = Array.from({ length: n }, (_, i) => {
    const b = node(cls);
    b.dataset.n = String(i + 1);      // the floors are numbered, and a digit looks up by number
    return b;
  });
  return {
    hidden: false,
    innerHTML: '',
    btns,
    querySelector: () => null,
    querySelectorAll: (sel) => (
      sel === '.liftbtn, .recgo' ? btns
      : sel === '.liftbtn' ? (kind === 'floors' ? btns : [])
      : sel === '[data-n]' && kind === 'floors' ? btns
      : sel === '[data-go]' && kind === 'rec' ? btns
      : []),
  };
}

let lift = makeLift();
const stub = { ...node(), querySelector: () => null, querySelectorAll: () => [], appendChild() {}, children: { length: 0 } };
const liftProxy = {
  get hidden() { return lift.hidden; },
  set hidden(v) { lift.hidden = v; },
  set innerHTML(v) { lift.innerHTML = v; },
  get innerHTML() { return lift.innerHTML; },
  querySelector: (s) => lift.querySelector(s),
  querySelectorAll: (s) => lift.querySelectorAll(s),
};

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const withStyle = (n) => Object.assign(n, { style: { setProperty: () => {}, removeProperty: () => {} } });
globalThis.document = {
  querySelector: (sel) => (sel === '#lift' ? liftProxy : stub),
  querySelectorAll: () => [],
  addEventListener: () => {},
  documentElement: withStyle(node()),
  body: withStyle(node()),
  createElement: () => withStyle(node()),
};
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
globalThis.addEventListener = () => {};

const UI = await import('../web/ui.js');
UI.initUI({ agents: [], looks: new Map(), settings: {}, delivery: {} }, {});

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('FAIL  |', name, '→', got); }
};
const focusAt = () => lift.btns.findIndex((b) => b.has('focus'));

// --- 1. the focus opens on the floor you are standing on ---
const floors = { floors: [{ n: 1, rooms: [] }, { n: 2, rooms: [] }, { n: 3, rooms: [] }] };
lift = makeLift('floors', 3);
let picked = null;
UI.openLift(floors, 2, (n) => { picked = n; });
check('focus on the current floor, not the first one', focusAt() === 1, focusAt());

// --- 2. the arrows walk the floors ---
check('up processed', UI.liftKey('ArrowUp') === true, 'не обработана');
check('and raised me to a floor higher on the list', focusAt() === 0, focusAt());
UI.liftKey('ArrowDown'); UI.liftKey('ArrowDown');
check('lowers down', focusAt() === 2, focusAt());

// --- 3. the list wraps: a step off the edge goes to the other end ---
UI.liftKey('ArrowDown');
check('from last down to first', focusAt() === 0, focusAt());

// --- 4. Enter presses the chosen floor ---
UI.liftKey('Enter');
check('Enter presses the floor under focus', lift.btns[0].clicked === 1, lift.btns[0].clicked);
check('and only him', lift.btns.filter((b) => b.clicked).length === 1, lift.btns.map((b) => b.clicked).join(','));

// --- 5. a digit picks a floor directly: "3" is floor three, not item three ---
lift = makeLift('floors', 3);
check('the figure is processed by the panel', UI.liftKey('2') === true, 'не обработана');
check('and pressed the floor with this number', lift.btns[1].clicked === 1, lift.btns[1].clicked);
check('the adjacent floors are not touched', lift.btns[0].clicked === 0 && lift.btns[2].clicked === 0, 'тронуты');
check('and the focus moved there', lift.btns[1].has('focus'), 'не переехал');
UI.liftKey('7');
check('the number past the list did not press anything', lift.btns.every((b) => b.clicked <= 1), 'нажала');
check('but didn\'t go to the office', UI.liftKey('7') === true, 'уехала');

// --- 6. a closed panel does not take the keys ---
// otherwise the arrows stop walking the office after the very first ride
lift.hidden = true;
check('closed panel does not accept arrows', UI.liftKey('ArrowUp') === false, 'съела');
check('and doesn\'t eat Enter', UI.liftKey('Enter') === false, 'съела');

// --- 6. the reception desk: the same keys on the same node ---
lift = makeLift('rec', 2);
UI.openReception({ n: 1, rooms: ['AI valey', 'figma'] }, () => {});
check('on the counter the focus is on the first line', focusAt() === 0, focusAt());
UI.liftKey('ArrowDown');
check('and walks along the lines', focusAt() === 1, focusAt());
UI.liftKey(' ');
check('SPACEBAR presses a line', lift.btns[1].clicked === 1, lift.btns[1].clicked);

// --- 7. a floor with no rows: the panel must not get stuck ---
// on an empty floor the desk draws a greeting and not a single button
lift = makeLift('rec', 0);
UI.openReception({ n: 9, rooms: [] }, () => {});
check('empty arrow stand does not pick up', UI.liftKey('ArrowDown') === false, 'забрала');
check('and Enter too', UI.liftKey('Enter') === false, 'забрала');

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
