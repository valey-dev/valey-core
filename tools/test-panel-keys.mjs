// node tools/test-panel-keys.mjs — the keys in the office panels.
//
// The radio moved out of here into modules/radio/test-keys.mjs along with the
// radio itself. The DOM is a stand-in, as in the other keyboard stands: what is
// checked is not the layout but the focus state — where it lands, how it moves
// and what it presses.

import { node, proxy, installDom } from './lib/dom.mjs';

let roster = null;
let notes = null;
let bag = null;
let sky = null;
let skin = null;
let langPanel = null;

// The standup: columns of cards. The card is the focus target itself, and the
// column is what the up-down arrows must stay inside, so the stand-in has to
// know which cards belong to which column — that is the whole difference from a
// flat ring, and the only thing worth checking here.
function makeRoster(cols) {
  const cards = [];
  const columns = [].concat(cols).map((n, ci) => {
    const mine = Array.from({ length: n }, (_, i) => {
      const c = node('pcard');
      c.dataset.id = `t${ci}-${i}`;
      return c;
    });
    cards.push(...mine);
    const col = node('pcol');
    col.contains = (x) => mine.includes(x);
    col.cards = mine;
    return col;
  });
  return {
    hidden: false, innerHTML: '', cards, cols: columns,
    querySelector: (sel) => (sel === '.rbody' ? node('rbody')
      : sel === '.pcard.focus' ? (cards.find((c) => c.has('focus')) || null) : null),
    querySelectorAll: (sel) => (sel === '.pcard' ? cards : sel === '.pcol' ? columns : []),
  };
}

// A clothing slot is a row with ◀ and ▶ inside, not a button. The sideways arrows
// have to press those buttons rather than jump to the neighbouring slot.
function makeBagSelf(slots) {
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

// The "things" tab is a grid: a row per slot, cells in the row. The arrows here
// do not mean the same as on "worn", so it has a stand of its own.
function makeBagThings(rows) {
  const cats = rows.map((n) => {
    const cells = Array.from({ length: n }, () => node('bcell'));
    const cat = node('bcat');
    cat.querySelectorAll = (sel) => (sel === '.bcell' ? cells : []);
    cat.cells = cells;
    return cat;
  });
  return {
    hidden: false, innerHTML: '', cats, cells: cats.map((c) => c.cells),
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.bcat' ? cats : []),
  };
}

// The "office" tab is just a row of buttons, a focus ring like the window on the world.
function makeBagOffice(n) {
  const btns = Array.from({ length: n }, () => node('obtn'));
  return {
    hidden: false, innerHTML: '', btns,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.obtn' ? btns : []),
  };
}

// The "keys" tab — a shelf of cards with the picked one opened underneath.
// Arrows walk the shelf, ⏎ hands focus inside: that is what is checked here,
// not the markup.
function makeBagKeys(n) {
  const cards = Array.from({ length: n }, () => node('keycard'));
  // Two rows inside the card, a control in each: that is the smallest card the
  // arrows can be wrong about. One row and «down» has nowhere to go; the CLI
  // card was exactly that, and it is why the shelf shipped without a way in.
  const one = node('obtn');
  const two = node('obtn');
  const rowA = node('keystep');
  const rowB = node('keyfoot');
  rowA.contains = (x) => x === one;
  rowB.contains = (x) => x === two;
  const detail = node('keydetail');
  const ctrls = [one, two];
  detail.querySelector = (sel) => (sel === '.keydetail input, .keydetail .obtn' ? one
    : sel === '.focus' ? ctrls.find((b) => b.classList.contains('focus')) || null : null);
  detail.querySelectorAll = (sel) => (sel === 'input, .obtn' ? ctrls
    : sel.includes('.keystep') ? [rowA, rowB] : []);
  // A real DOM answers a compound selector too — the panel asks with one for
  // the first thing it can hand focus to. The stand-in has to answer the same
  // way, or the stand is checking something the browser never does.
  return {
    hidden: false, innerHTML: '', cards, btn: one, btn2: two,
    querySelector: (sel) => (sel === '.keydetail' ? detail
      : sel === '.keydetail input, .keydetail .obtn' ? one : null),
    querySelectorAll: (sel) => (sel === '.keycard' ? cards
      : sel === '.keydetail input, .keydetail .obtn' ? ctrls
      : sel === '.keydetail .focus' ? ctrls.filter((b) => b.classList.contains('focus')) : []),
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

// The language and names panel. The rows here are not decoration: ↑↓ walk
// between them, ←→ inside one, and the stand-in rows have to be able to say
// whose button it is.
function makeLang() {
  const langBtns = [node('langbtn', { dataset: { lang: 'ru' } }), node('langbtn', { dataset: { lang: 'en' } })];
  const packBtns = ['auto', 'ru', 'en'].map((id) => node('packbtn', { dataset: { pack: id } }));
  const all = [...langBtns, ...packBtns];
  const rows = [
    { contains: (b) => langBtns.includes(b) },
    { contains: (b) => packBtns.includes(b) },
  ];
  const warn = node('langwarn');
  const status = node('langstatus');
  return {
    hidden: false, innerHTML: '', btns: all, langBtns, packBtns, warn, status,
    querySelector: (sel) => (sel === '.langwarn' ? warn : sel === '.langstatus' ? status : null),
    querySelectorAll: (sel) => (
      sel === '.langbtn, .packbtn' ? all
      : sel === '.langrow' ? rows
      : sel === '.langbtn' ? langBtns
      : sel === '.packbtn' ? packBtns
      : []),
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

const notesProxy = proxy(() => notes);
const bagProxy = proxy(() => bag);
let viewer = null;
const skyProxy = proxy(() => sky);
const skinProxy = proxy(() => skin);
const rosterProxy = proxy(() => roster);
const langProxy = proxy(() => langPanel);
const viewerProxy = proxy(() => viewer);

// The right panel of the git tree: it is paged with PgUp/PgDn, so it must have a
// height and a scroll rather than the shared stub full of zeros.
const pane = () => node('', { clientHeight: 400, scrollHeight: 4000 });
const gcard = pane();
const gcode = pane();

// The page address is needed by the hint about the Redirect URI in the radio —
// the second piece the deferred answer of probeDrm pulls out of the panel after
// it has been drawn.
const { stub } = installDom({
  byId: {
    roster: rosterProxy, gcard, gcode, viewer: viewerProxy, notes: notesProxy,
    bag: bagProxy, sky: skyProxy, skin: skinProxy, lang: langProxy,
  },
  location: {},
});

const UI = await import('../web/ui.js');

const agents = (n, project = 'AI valey') => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, name: 'Агент ' + i, project, status: 'awaiting', seat: i,
  title: 'задача', lastSaid: 'ждёт', idleFor: 60, roleKey: 'code',
}));
// Two teams: the standup lays them out in columns, and the arrows mean
// different things across a column and along one.
const twoTeams = (a, b) => [
  ...agents(a, 'team-a'),
  ...agents(b, 'team-b').map((x, i) => ({ ...x, id: 'b' + i })),
];
// me is needed: the bag draws the little person and the slot labels out of it
const state = { agents: [], looks: new Map(), settings: {}, delivery: {}, visited: new Set(),
  me: { skin: '#e8ad7e', hair: '#3a2a20', shirt: '#c25a4b', pants: '#3f4a63', boots: '#2a2118',
        style: 0, tall: 0, face: 'none', head: 'none', glasses: false, hands: 'none', name: 'ТЫ' } };
roster = makeRoster([]);
notes = makeNotes(0);
bag = makeBagSelf(0);
sky = makeRing([]);
skin = makeRing([]);
const PACKS = {
  choice: 'auto', pack: 'ru',
  packs: [
    { id: 'ru', size: 170, sample: ['Гоша', 'Марта'], names: { a0: 'Гоша', a1: 'Марта' } },
    { id: 'en', size: 170, sample: ['Pete', 'Sally'], names: { a0: 'Pete', a1: 'Sally' } },
  ],
};
let savedPatch = null;
let opened = null;
let led = null;
UI.initUI(state, {
  guideTo: (id) => { led = id; }, saveMe: () => {},
  openAgent: (id) => { opened = id; },
  names: async () => JSON.parse(JSON.stringify(PACKS)),
  saveSettings: async (patch) => { savedPatch = patch; return {}; },
  setLang: () => {},
});

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('FAIL  |', name, '→', got); }
};

// ----------------------------------------------------------------- the standup
const at = (list) => list.findIndex((b) => b.has('focus'));

state.agents = twoTeams(3, 2);
roster = makeRoster([3, 2]);
UI.renderRoster();
check('planning meeting: focus is on the first card', at(roster.cards) === 0, at(roster.cards));
check('down arrow processed', UI.rosterKey('ArrowDown') === true, 'не обработана');
check('and follows his own command, and not everyone else', at(roster.cards) === 1, at(roster.cards));
check('the right arrow takes you to the neighboring team', UI.rosterKey('ArrowRight') === true && at(roster.cards) === 4,
  at(roster.cards));
check('and holds space in the column rather than falling to the first line',
  roster.cols[1].cards.indexOf(roster.cards[4]) === 1, at(roster.cards));
// Down at the bottom of a column stays there. It used to loop back to the top of
// the same column, and this stand pinned that; the owner asked for the opposite
// on 7 September 2026, because a long list is read to the end and the last press
// silently teleporting you to the top is indistinguishable from a redraw. Short
// panels — the lift, the language, the radio — keep their ring; only a panel
// that scrolls asks for noWrap.
UI.rosterKey('ArrowDown');
check('at the bottom of a column it stops instead of looping', at(roster.cards) === 4, at(roster.cards));
UI.rosterKey('ArrowDown');
check('and pressing again keeps it there', at(roster.cards) === 4, at(roster.cards));

UI.rosterKey('ArrowLeft');
check('left carries the place in the column across', at(roster.cards) === 1, at(roster.cards));
UI.rosterKey('ArrowUp');
check('up walks the column', at(roster.cards) === 0, at(roster.cards));
UI.rosterKey('ArrowUp');
check('and the top is a wall too, not a way round to the bottom', at(roster.cards) === 0, at(roster.cards));

UI.rosterKey('Enter');
check('ENTER opens the card you are on',
  roster.cards[0].clicked === 1, roster.cards.map((b) => b.clicked).join(','));

// G is the standup's only key of its own, and it is caught by the physical code:
// under "ЙЦУКЕН" that key types «п», and the office must not care.
led = null;
check('G processed', UI.rosterKey({ key: 'п', code: 'KeyG' }) === true, 'не обработана');
check('and leads to the one on whom the focus was', led === 't0-0', led);
check('the panel then closed', UI.rosterOpen() === false, 'осталась открыта');

roster.hidden = false;
UI.renderRoster();
// a closed panel must not take the arrows — otherwise after the very first
// standup the player stops walking around the office
roster.hidden = true;
check('closed planning meeting does not eat arrows', UI.rosterKey('ArrowDown') === false, 'съел');
check('and G doesn\'t eat', UI.rosterKey({ key: 'g', code: 'KeyG' }) === false, 'съел');

// an empty standup: nobody is in the office, there is nothing to press
state.agents = [];
roster = makeRoster([]);
UI.renderRoster();
check('empty planner doesn\'t eat arrows', UI.rosterKey('ArrowDown') === false, 'съел');
check('and Enter doesn\'t eat', UI.rosterKey('Enter') === false, 'съел');

// ----------------------------------------------------------------- the notes
notes = makeNotes(2);            // two notes: each has "open" and ✕
UI.renderNotes();
const nb = notes.btns;
check('notes: focus is on the first button', at(nb) === 0, at(nb));
check('the down arrow goes to the ✕ of the same line', UI.notesKey('ArrowDown') === true && at(nb) === 1, at(nb));
UI.notesKey('ArrowDown');
check('and further - to the next note', at(nb) === 2 && nb[2].has('ngo'), at(nb));
UI.notesKey('Enter');
check('Enter presses the selected button', nb[2].clicked === 1, nb.map((b) => b.clicked).join(','));
check('and only her', nb.filter((b) => b.clicked).length === 1, nb.filter((b) => b.clicked).length);

// The ring used to close here — a third press from the top landed on the last
// button. The notes scroll, so on 7 September 2026 they joined the standup and
// the shelf of things in stopping instead: two presses reach the top, the third
// changes nothing.
UI.notesKey('ArrowUp'); UI.notesKey('ArrowUp'); UI.notesKey('ArrowUp');
check('the top of the notes is a wall, not a way round to the last', at(nb) === 0, at(nb));

// a closed panel does not take the keys
UI.closeNotes();
check('closed notes arrows don\'t eat', UI.notesKey('ArrowDown') === false, 'съели');

// an empty panel: there is nothing to press, the arrows have to go to the office
notes = makeNotes(0);
UI.renderNotes();
check('empty notes arrows don\'t eat', UI.notesKey('ArrowDown') === false, 'съели');

// --------------------------------------------------------------- the bag
// The "worn" tab is the former panel C, word for word: up and down the slots,
// sideways turns the value of the one you are standing on.
bag = makeBagSelf(3);            // the name row plus three slots
const rows = bag.rows;
const focusRow = () => rows.findIndex((r) => r.has('focus'));
UI.bagKey('ArrowDown');
check('on yourself: focus went from the name line to the first slot', focusRow() === 1, focusRow());
check('and exactly one line is highlighted', rows.filter((r) => r.has('focus')).length === 1, rows.filter((r) => r.has('focus')).length);
UI.bagKey('ArrowRight');
check('to the right presses ▶ of this slot, but does not move', rows[1].next.clicked === 1 && rows[1].has('focus'), `${rows[1].next.clicked}`);
UI.bagKey('ArrowLeft');
check('to the left presses ◀ of the same slot', rows[1].prev.clicked === 1, rows[1].prev.clicked);
check('the adjacent slot is not touched', rows[2].next.clicked === 0 && rows[2].prev.clicked === 0, 'тронут');
UI.bagKey('Enter');
check('Enter on a slot does the same as ▶', rows[1].next.clicked === 2, rows[1].next.clicked);

// The tab scrolls, so both ends are walls — the same rule as the standup, the
// shelf of things and the notes. Four rows here: the name and three slots.
UI.bagKey('ArrowDown'); UI.bagKey('ArrowDown'); UI.bagKey('ArrowDown');
check('the last slot does not wrap round to the name', focusRow() === 3, focusRow());
UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp');
check('and the name line is the other wall', focusRow() === 0, focusRow());
UI.bagKey('ArrowDown');

// the name is an input: Enter has to give it the focus, or it cannot be typed from the keyboard
UI.bagKey('ArrowUp');
UI.bagKey('Enter');
check('Enter on the name gives the field focus', rows[0].input.focused === 1, rows[0].input.focused);

// The tabs: a digit switches, and the arrows mean something else afterwards.
bag = makeBagThings([3, 2]);
check('number 2 processed by panel', UI.bagKey('2') === true, 'не обработана');
const cells = bag.cells;
const focusCell = () => {
  for (let r = 0; r < cells.length; r++) {
    const i = cells[r].findIndex((c) => c.has('focus'));
    if (i >= 0) return `${r}:${i}`;
  }
  return 'нигде';
};
check('things: focus is on the first cell', focusCell() === '0:0', focusCell());
UI.bagKey('ArrowRight'); UI.bagKey('ArrowRight');
check('walks to the right along the cells of the row', focusCell() === '0:2', focusCell());
UI.bagKey('ArrowDown');
check('down changes the row and presses the cell to its length', focusCell() === '1:1', focusCell());
UI.bagKey('Enter');
check('Enter puts on the selected one', cells[1][1].clicked === 1, cells[1][1].clicked);
check('exactly one cell is highlighted', cells.flat().filter((c) => c.has('focus')).length === 1,
  cells.flat().filter((c) => c.has('focus')).length);
check('to the right in a circle returns to the beginning of the row', (UI.bagKey('ArrowRight'), focusCell()) === '1:0', focusCell());
// Down the shelf scrolls, so the last row is a wall — asked for on 7 September
// 2026 together with the standup. Sideways stays a ring on purpose: a category
// is four to eight cells and they are all on screen at once, so nothing is lost
// by going round, which is why the check above still expects a wrap.
UI.bagKey('ArrowDown');
check('the last row of things does not wrap round to the first', focusCell() === '1:0', focusCell());
UI.bagKey('ArrowUp');
check('up walks the rows', focusCell() === '0:0', focusCell());
UI.bagKey('ArrowUp');
check('and the first row is a wall too', focusCell() === '0:0', focusCell());

// back to "worn": the focus starts over there rather than remembering a cell of the grid
bag = makeBagSelf(3);
UI.bagKey('1');
check('the number 1 returned to “on itself”', focusRow() === 0, focusRow());
check('non-existent tab is not caught', UI.bagKey('9') === false, 'поймана');
check('there is no sixth tab', UI.bagKey('6') === false, 'поймана');

// The "keys" tab: a shelf of two floors. Left and right walk the cards, down
// steps into the open card, and up out of its first row comes back to the shelf.
// The office is walked with the keyboard: a card whose buttons need a mouse is
// a card nobody sets up.
bag = makeBagKeys(3);
check('keys: number 5 opened a tab', UI.bagKey('5') === true, 'не обработана');
check('shelf arrow processed', UI.bagKey('ArrowRight') === true, 'не обработана');
check('doesn\'t lead anywhere up from the shelf', UI.bagKey('ArrowUp') === true, 'не обработана');
UI.bagKey('ArrowDown');
check('brought it down inside the card', bag.btn.classList.contains('focus'), 'фокус не встал');
UI.bagKey('Enter');
check('Enter presses the button inside the card', bag.btn.clicked === 1, `${bag.btn.clicked}`);
UI.bagKey('ArrowDown');
check('moved down to the second line', bag.btn2.classList.contains('focus'), 'фокус не переехал');
UI.bagKey('ArrowUp');
check('up returned to first', bag.btn.classList.contains('focus'), 'фокус не вернулся');
UI.bagKey('ArrowUp');
check('up from the first line went onto the shelf', !bag.btn.classList.contains('focus'), 'застряло в карточке');
check('and the shelf again listens to the arrows to the side', UI.bagKey('ArrowRight') === true, 'не обработана');
check('someone else\'s key goes off the shelf into the office', UI.bagKey('q') === false, 'съедена');
// A guest reads the cards and presses nothing: the class is what hides the
// controls, and it also drops the fields out of the tab order.
state.owner = false;
UI.renderBag('keys');
check('guest: the card is marked as guest', /class="keydetail guest"/.test(bag.innerHTML), bag.innerHTML.slice(0, 60));
check('and he is told who starts the keys', /keys are set up|заводит хозяин/i.test(bag.innerHTML), 'молчит');
state.owner = true;
UI.renderBag('keys');
check('the owner has no guest class', !/keydetail guest/.test(bag.innerHTML), 'есть');

// The "office" tab: a row of buttons, and the down arrow has to walk along them.
// Until 31 August 2026 it did nothing — the handler knew only two tabs out of
// three, and the key went off into the office from under an open panel. Keys
// took the last slot on 5 September 2026, so the office stayed on digit 3.
// Since 13 September 2026 the tab opens with nothing lit: its first button is
// «check for updates», a trip to git, and a stray Enter must not take it. The
// first ↓ lands on it — until then reaching it took a lap round the whole tab.
bag = makeBagOffice(5);
check('office: number 3 opened a tab', UI.bagKey('3') === true, 'not handled');
check('nothing is lit when the tab opens', bag.btns.every((b) => !b.has('focus')),
  bag.btns.map((b) => b.has('focus')));
UI.bagKey('Enter');
check('and Enter presses nothing before an arrow picked', bag.btns.every((b) => !b.clicked), bag.btns.map((b) => b.clicked));
check('down processed', UI.bagKey('ArrowDown') === true, 'not handled');
check('the first down lands on the first button', bag.btns[0].has('focus'), 'focus elsewhere');
check('exactly one is highlighted', bag.btns.filter((b) => b.has('focus')).length === 1,
  bag.btns.filter((b) => b.has('focus')).length);
UI.bagKey('ArrowDown');
check('and the next one moves to the second', bag.btns[1].has('focus'), 'focus elsewhere');
UI.bagKey('Enter');
check('Enter presses what you\'re standing on', bag.btns[1].clicked === 1, bag.btns[1].clicked);
UI.bagKey('ArrowUp');
check('up returns to first', bag.btns[0].has('focus'), 'did not return');

UI.closeBag();
check('closed inventory arrows do not eat', UI.bagKey('ArrowDown') === false, 'съело');

// ------------------------------------------- the window on the world and the office colour (the ring)
sky = makeRing([{ id: 'skytoggle' }, { id: 'skyq', tagName: 'INPUT' }, { id: 'skygeo' }]);
check('window to the world: arrow processed', UI.skyKey('ArrowDown') === true, 'нет');
UI.skyKey('Enter');
check('Entering the city field gives it real focus', sky.btns[1].focused === 1, sky.btns[1].focused);
check('and doesn’t press it like a button', sky.btns[1].clicked === 0, sky.btns[1].clicked);
UI.closeSky();
check('closed window to the world arrows do not eat', UI.skyKey('ArrowDown') === false, 'съело');

// the hue slider: the sideways arrows turn it rather than lead the focus away
skin = makeRing([
  { className: 'swatch' },
  { id: 'skinhue', tagName: 'INPUT', type: 'range', min: '0', max: '359', value: '100' },
  { id: 'skinreset' },
]);
let hueSet = 0;
skin.btns[1].oninput = () => { hueSet += 1; };
UI.skinKey('ArrowDown');
check('office color: reached the slider', skin.btns[1].has('focus'), 'нет');
UI.skinKey('ArrowRight');
check('the slider rotates to the right, but does not move', skin.btns[1].has('focus') && Number(skin.btns[1].value) > 100, skin.btns[1].value);
check('and its handler pulls', hueSet === 1, hueSet);
UI.skinKey('ArrowDown');
check('still leads down from the slider', !skin.btns[1].has('focus'), 'застряли');

// A control without a box is not in the ring. The radio's volume sits under a
// hidden row until the full Spotify player connects, and one press of the down
// arrow used to go into it: no outline anywhere, a key that read as stuck.
const box = (shown) => ({ getClientRects: () => (shown ? [{}] : []) });
const three = () => [node('', box(true)), node('', box(false)), node('', box(true))];
const seen = three();
const seenRing = UI.focusRing(() => ({ ...box(true), querySelectorAll: () => seen }), '*');
seenRing.paint();
seenRing.key('ArrowDown', true);
check('a hidden control is stepped over', seen[2].has('focus') && !seen[1].has('focus'),
  seen.map((b) => b.has('focus')).join());
seenRing.on(seen[0]);
check('on() finds a control by itself, not by a count', seen[0].has('focus'), 'не нашла');
// A panel may paint its ring a moment before it opens; while it has no box of
// its own, nothing in it has one either, and the ring must not come up empty.
const shut = three();
UI.focusRing(() => ({ ...box(false), querySelectorAll: () => shut }), '*').paint();
check('a panel painted before it opens still shows a focus', shut[0].has('focus'), 'пусто');

// ------------------------------------------------- the language and the agents' names
// A panel of two rows: the interface and the names. A flat round would lie to
// the hand here — the down arrow has to lead into the second row rather than
// walk the first one to its end.
state.agents = [{ id: 'a0', name: 'Гоша' }, { id: 'a1', name: 'Марта' }];
langPanel = makeLang();
await UI.openLang();
const focused = () => langPanel.btns.findIndex((b) => b.has('focus'));
check('language: focus is on the first button', focused() === 0, focused());
check('right arrow processed', UI.langKey('ArrowRight') === true, 'нет');
check('and walks inside the interface line', focused() === 1, focused());
UI.langKey('ArrowDown');
check('takes you down to the second row, keeping the column', focused() === 3, focused());
check('and this is “Russian”, and not “like the language of the office”', langPanel.btns[3].dataset.pack === 'ru');

// The price row: it has to change along with the focus, not on a press.
check('there is no price for a package that will not replace anything', langPanel.warn.hidden === true, langPanel.warn.textContent);
UI.langKey('ArrowRight');
check('reached English', langPanel.btns[4].dataset.pack === 'en' && focused() === 4, focused());
check('price shown before clicking', langPanel.warn.hidden === false, 'скрыта');
check('and gives a number and an example', /2/.test(langPanel.warn.textContent) && /Pete/.test(langPanel.warn.textContent),
  langPanel.warn.textContent);
UI.langKey('ArrowLeft');
check('a step back removes the price', langPanel.warn.hidden === true, langPanel.warn.textContent);

UI.langKey('ArrowRight');
UI.langKey('Enter');
check('Enter presses what the focus is on', langPanel.btns[4].clicked === 1, langPanel.btns[4].clicked);
// The marks follow the language. Enter on «English» switched the office and,
// until 12 September 2026, left ● on «Русский» for as long as the panel stayed
// open: nothing redrew the panel on a language change.
{
  const { setLang, lang } = await import('../web/i18n.js');
  const was = lang();
  setLang('en');
  check('after a language change the mark moves to the new language',
    /class="langbtn on" data-lang="en"/.test(langPanel.innerHTML) && !/class="langbtn on" data-lang="ru"/.test(langPanel.innerHTML),
    langPanel.innerHTML.match(/class="langbtn[^>]*/g));
  setLang(was);
}
UI.closeLang();
check('closed arrow tongue panel does not eat', UI.langKey('ArrowDown') === false, 'съела');

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
