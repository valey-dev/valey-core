// node modules/radio/test-keys.mjs — the keys of the receiver.
//
// It moved here out of tools/test-panel-keys.mjs together with the radio: the test of
// a panel lives next to the panel, or the core goes on knowing about the module at
// least through a test. The DOM is a stand-in, as in the other keyboard stands: what
// is checked is not the layout but the focus state — where it lands, how it moves and
// what it presses.

import { node, proxy, installDom } from '../../tools/lib/dom.mjs';

let roster = null;
let radioBox = null;
let notes = null;
let dress = null;
let sky = null;
let skin = null;

function makeRoster(n) {
  const gos = Array.from({ length: n }, () => node('go'));
  return {
    hidden: false, innerHTML: '', gos,
    querySelector: (sel) => (sel === '.rbody' ? node('rbody') : null),
    querySelectorAll: (sel) => (sel === '.go' || sel === '[data-go]' ? gos : []),
  };
}

// The order is the same as in the markup of the panel: the knobs, the waves, the volume, your own wave.
function makeRadio(waves = 2) {
  const ctl = [
    node('', { id: 'radioprev' }), node('big', { id: 'radiotoggle' }), node('', { id: 'radionext' }),
  ];
  for (let i = 0; i < waves; i++) { ctl.push(node('rst')); ctl.push(node('rdel')); }
  const stations = ctl.filter((c) => c.has('rst'));
  ctl.push(node('', { id: 'radiovol', tagName: 'INPUT', type: 'range', value: '50' }));
  ctl.push(node('', { id: 'radiouri', tagName: 'INPUT', type: 'text' }));
  const classes = new Set(['open']);
  // The glass over the record is looked up by class, and until the git tree this query
  // never got through: probeDrm answers through a promise, and there was nobody in the
  // stand to wait for it — the fall waited for the first await in the file.
  const glass = node('radioglass');
  return {
    ctl, glass, stations, innerHTML: '',
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    querySelector: (sel) => (sel === '.radioglass' ? glass : null),
    querySelectorAll: (sel) => (sel === '.rst' ? stations : ctl),
  };
}

// A clothing slot is a row with ◀ and ▶ inside, not a button. The sideways arrows have
// to press those buttons rather than jump to the neighbouring slot.
function makeDress(slots) {
  const rows = [];
  const name = node('namerow');
  const input = node('', { tagName: 'INPUT' });
  name.querySelector = (sel) => (sel === 'input' ? input : null);
  name.input = input;
  rows.push(name);
  for (let i = 0; i < slots; i++) {
    const prev = node(), next = node();
    const row = node('drow');
    row.querySelector = (sel) => (sel === '[data-d="-1"]' ? prev : sel === '[data-d="1"]' ? next : null);
    row.prev = prev; row.next = next;
    rows.push(row);
  }
  return {
    hidden: false, innerHTML: '', rows,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.namerow, .drow' ? rows : []),
  };
}

// A flat ring: the window on the world and the office colour are built the same way.
function makeRing(items) {
  const btns = items.map((it) => node('', it));
  return {
    hidden: false, innerHTML: '', btns,
    querySelector: () => null,
    querySelectorAll: () => btns,
  };
}

function makeNotes(n) {
  const btns = [];
  for (let i = 0; i < n; i++) { btns.push(node('ngo')); btns.push(node('ndel')); }
  return {
    hidden: false, innerHTML: '', btns,
    querySelector: () => null,
    querySelectorAll: (sel) => (
      sel === '.ngo, .ndel' ? btns
      : sel === '[data-go]' ? btns.filter((b) => b.has('ngo'))
      : sel === '[data-del]' ? btns.filter((b) => b.has('ndel'))
      : []),
  };
}

// initUI remembers its nodes once, so a permanent wrapper stands in front of it, and
// the fresh stand-in DOM is slipped in behind that
const notesProxy = proxy(() => notes);
const dressProxy = proxy(() => dress);
const skyProxy = proxy(() => sky);
const skinProxy = proxy(() => skin);

const rosterProxy = proxy(() => roster);

const { stub } = installDom({
  byId: { roster: rosterProxy, notes: notesProxy, dress: dressProxy, sky: skyProxy, skin: skinProxy },
  location: {},
});

const CORE = await import('../../web/ui.js');
const UI = await import('./client.js');
const { addDict } = await import('../../web/i18n.js');
const hooks = {};
const { define: defineKeys, reset: resetKeys } = await import('../../web/keymap.js');
resetKeys();
UI.register({
  id: 'radio',
  on: (n, f) => (hooks[n] = f),
  i18n: (d) => addDict(d),
  keys: (list) => defineKeys([].concat(list).map((a) => ({ ...a, id: `radio.${a.id}` }))),
});

const agents = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, name: 'Агент ' + i, project: 'AI valey', status: 'awaiting',
  title: 'задача', lastSaid: 'ждёт', idleFor: 60, roleKey: 'code',
}));
const state = { agents: [], looks: new Map(), settings: {}, delivery: {}, visited: new Set() };
roster = makeRoster(0);
notes = makeNotes(0);
dress = makeDress(0);
sky = makeRing([]);
skin = makeRing([]);
CORE.initUI(state, { guideTo: () => {} });

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// Which of the buttons holds the focus — the same helper as in the core panels test.
const at = (list) => list.findIndex((b) => b.has('focus'));

// ------------------------------------------------------------------- the radio
// el.radio is set inside buildRadio, so we slip it in by the same path the panel code
// takes it out by.
//
// We add to the map rather than overwrite it. The overwriting variant arrived here
// together with the move of the test and had already cost half an hour in the core:
// everything below got the shared stub instead of its own nodes, and "PgUp/PgDn do not
// scroll the panel" meant that the panel turned out to be a stub of zero height. Fixed
// in main on 2 September 2026, moved here after it.
const baseQuery = document.querySelector;
document.querySelector = (sel) => (sel === '#radio' ? radioBox : baseQuery(sel));
radioBox = makeRadio(2);
// openRadio touches the live player and the browser's DRM on the way — on bare node
// that falls over. But el.radio and the open class are set at the very beginning, before
// this place, so by the moment of the fall the key handling already works. We catch it
// and go on: what is being checked is the keys, not the assembly of the markup.
try { UI.openRadio(); } catch { /* there is no player here and there must not be */ }
// The fall happens before the end of openRadio, so we lay the highlight down with the
// same call the live panel lays it with on every repaint.
UI.repaintRadioFocus();

const ctl = radioBox.ctl;
check('радио: фокус встаёт на первую ручку', at(ctl) === 0, at(ctl));
check('стрелка вправо обработана', UI.radioKey('ArrowRight') === true, 'не обработана');
check('и переводит на «включить»', ctl[1].id === 'radiotoggle' && at(ctl) === 1, at(ctl));
UI.radioKey('Enter');
check('Enter нажимает «включить»', ctl[1].clicked === 1, ctl[1].clicked);

// the waves and their crosses stand in the same ring: deleting a wave without a mouse has to work too
UI.radioKey('ArrowRight'); UI.radioKey('ArrowRight');
check('фокус доходит до списка волн', ctl[at(ctl)].has('rst'), at(ctl));

// the volume: sideways it turns itself, up and down lead away from it
const vol = ctl.find((b) => b.id === 'radiovol');
let volSet = 0;
vol.oninput = () => { volSet += 1; };
while (ctl[at(ctl)] !== vol) UI.radioKey('ArrowDown');
UI.radioKey('ArrowRight');
check('на громкости вправо крутит её, а не уводит', ctl[at(ctl)] === vol && Number(vol.value) === 55, `${vol.value}, фокус ${at(ctl)}`);
check('и дёргает обработчик ползунка', volSet === 1, volSet);
UI.radioKey('ArrowLeft'); UI.radioKey('ArrowLeft');
check('влево крутит обратно и не уходит ниже нуля не сразу', Number(vol.value) === 45, vol.value);
UI.radioKey('ArrowDown');
check('вниз с громкости всё-таки уводит', ctl[at(ctl)] !== vol, 'застряли');

// your own wave is an input field: Enter has to give it real focus rather than "press"
// it, or typing into it from the keyboard is still impossible
const uri = ctl.find((b) => b.id === 'radiouri');
while (ctl[at(ctl)] !== uri) UI.radioKey('ArrowDown');
UI.radioKey('Enter');
check('Enter на своей волне отдаёт полю фокус', uri.focused === 1, uri.focused);
check('и не жмёт его как кнопку', uri.clicked === 0, uri.clicked);

// a closed panel does not take the keys
UI.closeRadio();
check('закрытое радио стрелки не ест', UI.radioKey('ArrowDown') === false, 'съело');



console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
