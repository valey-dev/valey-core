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
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// ----------------------------------------------------------------- the standup
const at = (list) => list.findIndex((b) => b.has('focus'));

state.agents = twoTeams(3, 2);
roster = makeRoster([3, 2]);
UI.renderRoster();
check('планёрка: фокус встаёт на первую карточку', at(roster.cards) === 0, at(roster.cards));
check('стрелка вниз обработана', UI.rosterKey('ArrowDown') === true, 'не обработана');
check('и идёт по своей команде, а не по всем подряд', at(roster.cards) === 1, at(roster.cards));
check('стрелка вправо уносит в соседнюю команду', UI.rosterKey('ArrowRight') === true && at(roster.cards) === 4,
  at(roster.cards));
check('и держит место в колонке, а не падает на первую строку',
  roster.cols[1].cards.indexOf(roster.cards[4]) === 1, at(roster.cards));
// The short column is shorter: coming back sideways there is no third row to
// stand on, and the focus stops at the last card rather than falling out.
UI.rosterKey('ArrowDown');
check('в конце короткой колонки закольцовано внутри неё', at(roster.cards) === 3, at(roster.cards));

UI.rosterKey('ArrowLeft');
check('влево возвращает в первую команду', at(roster.cards) === 0, at(roster.cards));
UI.rosterKey('ArrowUp');
check('вверх закольцовано по своей колонке', at(roster.cards) === 2, at(roster.cards));

UI.rosterKey('Enter');
check('ENTER открывает ту карточку, на которой стоишь',
  roster.cards[2].clicked === 1, roster.cards.map((b) => b.clicked).join(','));

// G is the standup's only key of its own, and it is caught by the physical code:
// under "ЙЦУКЕН" that key types «п», and the office must not care.
led = null;
check('G обработана', UI.rosterKey({ key: 'п', code: 'KeyG' }) === true, 'не обработана');
check('и ведёт к тому, на ком стоял фокус', led === 't0-2', led);
check('панель при этом закрылась', UI.rosterOpen() === false, 'осталась открыта');

roster.hidden = false;
UI.renderRoster();
// a closed panel must not take the arrows — otherwise after the very first
// standup the player stops walking around the office
roster.hidden = true;
check('закрытая планёрка стрелки не ест', UI.rosterKey('ArrowDown') === false, 'съел');
check('и G не ест', UI.rosterKey({ key: 'g', code: 'KeyG' }) === false, 'съел');

// an empty standup: nobody is in the office, there is nothing to press
state.agents = [];
roster = makeRoster([]);
UI.renderRoster();
check('пустая планёрка стрелки не ест', UI.rosterKey('ArrowDown') === false, 'съел');
check('и Enter не ест', UI.rosterKey('Enter') === false, 'съел');

// ----------------------------------------------------------------- the notes
notes = makeNotes(2);            // two notes: each has "open" and ✕
UI.renderNotes();
const nb = notes.btns;
check('заметки: фокус встаёт на первую кнопку', at(nb) === 0, at(nb));
check('стрелка вниз идёт на ✕ той же строки', UI.notesKey('ArrowDown') === true && at(nb) === 1, at(nb));
UI.notesKey('ArrowDown');
check('и дальше — на следующую заметку', at(nb) === 2 && nb[2].has('ngo'), at(nb));
UI.notesKey('Enter');
check('Enter нажимает выбранную кнопку', nb[2].clicked === 1, nb.map((b) => b.clicked).join(','));
check('и только её', nb.filter((b) => b.clicked).length === 1, nb.filter((b) => b.clicked).length);

UI.notesKey('ArrowUp'); UI.notesKey('ArrowUp'); UI.notesKey('ArrowUp');
check('кольцо замкнуто', at(nb) === 3, at(nb));

// a closed panel does not take the keys
UI.closeNotes();
check('закрытые заметки стрелки не едят', UI.notesKey('ArrowDown') === false, 'съели');

// an empty panel: there is nothing to press, the arrows have to go to the office
notes = makeNotes(0);
UI.renderNotes();
check('пустые заметки стрелки не едят', UI.notesKey('ArrowDown') === false, 'съели');

// --------------------------------------------------------------- the bag
// The "worn" tab is the former panel C, word for word: up and down the slots,
// sideways turns the value of the one you are standing on.
bag = makeBagSelf(3);            // the name row plus three slots
const rows = bag.rows;
const focusRow = () => rows.findIndex((r) => r.has('focus'));
UI.bagKey('ArrowDown');
check('на себе: фокус пошёл со строки имени на первый слот', focusRow() === 1, focusRow());
check('и подсвечена ровно одна строка', rows.filter((r) => r.has('focus')).length === 1, rows.filter((r) => r.has('focus')).length);
UI.bagKey('ArrowRight');
check('вправо жмёт ▶ этого слота, а не уводит', rows[1].next.clicked === 1 && rows[1].has('focus'), `${rows[1].next.clicked}`);
UI.bagKey('ArrowLeft');
check('влево жмёт ◀ того же слота', rows[1].prev.clicked === 1, rows[1].prev.clicked);
check('соседний слот не тронут', rows[2].next.clicked === 0 && rows[2].prev.clicked === 0, 'тронут');
UI.bagKey('Enter');
check('Enter на слоте делает то же, что ▶', rows[1].next.clicked === 2, rows[1].next.clicked);

// the name is an input: Enter has to give it the focus, or it cannot be typed from the keyboard
UI.bagKey('ArrowUp');
UI.bagKey('Enter');
check('Enter на имени отдаёт полю фокус', rows[0].input.focused === 1, rows[0].input.focused);

// The tabs: a digit switches, and the arrows mean something else afterwards.
bag = makeBagThings([3, 2]);
check('цифра 2 обработана панелью', UI.bagKey('2') === true, 'не обработана');
const cells = bag.cells;
const focusCell = () => {
  for (let r = 0; r < cells.length; r++) {
    const i = cells[r].findIndex((c) => c.has('focus'));
    if (i >= 0) return `${r}:${i}`;
  }
  return 'нигде';
};
check('вещи: фокус встал на первую клетку', focusCell() === '0:0', focusCell());
UI.bagKey('ArrowRight'); UI.bagKey('ArrowRight');
check('вправо ходит по клеткам ряда', focusCell() === '0:2', focusCell());
UI.bagKey('ArrowDown');
check('вниз меняет ряд и поджимает клетку под его длину', focusCell() === '1:1', focusCell());
UI.bagKey('Enter');
check('Enter надевает выбранное', cells[1][1].clicked === 1, cells[1][1].clicked);
check('подсвечена ровно одна клетка', cells.flat().filter((c) => c.has('focus')).length === 1,
  cells.flat().filter((c) => c.has('focus')).length);
check('вправо по кругу возвращает в начало ряда', (UI.bagKey('ArrowRight'), focusCell()) === '1:0', focusCell());

// back to "worn": the focus starts over there rather than remembering a cell of the grid
bag = makeBagSelf(3);
UI.bagKey('1');
check('цифра 1 вернула на «на себе»', focusRow() === 0, focusRow());
check('несуществующая вкладка не ловится', UI.bagKey('9') === false, 'поймана');
check('шестой вкладки нет', UI.bagKey('6') === false, 'поймана');

// The "keys" tab: a shelf of two floors. Left and right walk the cards, down
// steps into the open card, and up out of its first row comes back to the shelf.
// The office is walked with the keyboard: a card whose buttons need a mouse is
// a card nobody sets up.
bag = makeBagKeys(3);
check('ключи: цифра 5 открыла вкладку', UI.bagKey('5') === true, 'не обработана');
check('стрелка по полке обработана', UI.bagKey('ArrowRight') === true, 'не обработана');
check('вверх с полки никуда не уводит', UI.bagKey('ArrowUp') === true, 'не обработана');
UI.bagKey('ArrowDown');
check('вниз завела внутрь карточки', bag.btn.classList.contains('focus'), 'фокус не встал');
UI.bagKey('Enter');
check('Enter внутри карточки жмёт кнопку', bag.btn.clicked === 1, `${bag.btn.clicked}`);
UI.bagKey('ArrowDown');
check('вниз перешло во вторую строку', bag.btn2.classList.contains('focus'), 'фокус не переехал');
UI.bagKey('ArrowUp');
check('вверх вернулось в первую', bag.btn.classList.contains('focus'), 'фокус не вернулся');
UI.bagKey('ArrowUp');
check('вверх из первой строки вышло на полку', !bag.btn.classList.contains('focus'), 'застряло в карточке');
check('и полка снова слушает стрелки вбок', UI.bagKey('ArrowRight') === true, 'не обработана');
check('чужая клавиша с полки уходит в офис', UI.bagKey('q') === false, 'съедена');
// A guest reads the cards and presses nothing: the class is what hides the
// controls, and it also drops the fields out of the tab order.
state.owner = false;
UI.renderBag('keys');
check('гость: карточка помечена как гостевая', /class="keydetail guest"/.test(bag.innerHTML), bag.innerHTML.slice(0, 60));
check('и ему сказано, кто заводит ключи', /keys are set up|заводит хозяин/i.test(bag.innerHTML), 'молчит');
state.owner = true;
UI.renderBag('keys');
check('хозяину гостевого класса нет', !/keydetail guest/.test(bag.innerHTML), 'есть');

// The "office" tab: a row of buttons, and the down arrow has to walk along them.
// Until 31 August 2026 it did nothing — the handler knew only two tabs out of
// three, and the key went off into the office from under an open panel. Keys
// took the last slot on 5 September 2026, so the office stayed on digit 3.
bag = makeBagOffice(5);
check('офис: цифра 3 открыла вкладку', UI.bagKey('3') === true, 'не обработана');
check('вниз обработана', UI.bagKey('ArrowDown') === true, 'не обработана');
check('и переводит на вторую кнопку', bag.btns[1].has('focus'), 'фокус не там');
check('подсвечена ровно одна', bag.btns.filter((b) => b.has('focus')).length === 1,
  bag.btns.filter((b) => b.has('focus')).length);
UI.bagKey('Enter');
check('Enter нажимает то, на чём стоишь', bag.btns[1].clicked === 1, bag.btns[1].clicked);
UI.bagKey('ArrowUp');
check('вверх возвращает на первую', bag.btns[0].has('focus'), 'не вернулась');

UI.closeBag();
check('закрытый инвентарь стрелки не ест', UI.bagKey('ArrowDown') === false, 'съело');

// ------------------------------------------- the window on the world and the office colour (the ring)
sky = makeRing([{ id: 'skytoggle' }, { id: 'skyq', tagName: 'INPUT' }, { id: 'skygeo' }]);
check('окно в мир: стрелка обработана', UI.skyKey('ArrowDown') === true, 'нет');
UI.skyKey('Enter');
check('Enter на поле города отдаёт ему настоящий фокус', sky.btns[1].focused === 1, sky.btns[1].focused);
check('и не жмёт его как кнопку', sky.btns[1].clicked === 0, sky.btns[1].clicked);
UI.closeSky();
check('закрытое окно в мир стрелки не ест', UI.skyKey('ArrowDown') === false, 'съело');

// the hue slider: the sideways arrows turn it rather than lead the focus away
skin = makeRing([
  { className: 'swatch' },
  { id: 'skinhue', tagName: 'INPUT', type: 'range', min: '0', max: '359', value: '100' },
  { id: 'skinreset' },
]);
let hueSet = 0;
skin.btns[1].oninput = () => { hueSet += 1; };
UI.skinKey('ArrowDown');
check('цвет офиса: дошли до ползунка', skin.btns[1].has('focus'), 'нет');
UI.skinKey('ArrowRight');
check('вправо крутит ползунок, а не уводит', skin.btns[1].has('focus') && Number(skin.btns[1].value) > 100, skin.btns[1].value);
check('и дёргает его обработчик', hueSet === 1, hueSet);
UI.skinKey('ArrowDown');
check('вниз с ползунка всё-таки уводит', !skin.btns[1].has('focus'), 'застряли');

// ------------------------------------------------- the language and the agents' names
// A panel of two rows: the interface and the names. A flat round would lie to
// the hand here — the down arrow has to lead into the second row rather than
// walk the first one to its end.
state.agents = [{ id: 'a0', name: 'Гоша' }, { id: 'a1', name: 'Марта' }];
langPanel = makeLang();
await UI.openLang();
const focused = () => langPanel.btns.findIndex((b) => b.has('focus'));
check('язык: фокус встаёт на первую кнопку', focused() === 0, focused());
check('стрелка вправо обработана', UI.langKey('ArrowRight') === true, 'нет');
check('и ходит внутри строки интерфейса', focused() === 1, focused());
UI.langKey('ArrowDown');
check('вниз уводит во вторую строку, столбец сохраняя', focused() === 3, focused());
check('и это «Русские», а не «как язык офиса»', langPanel.btns[3].dataset.pack === 'ru');

// The price row: it has to change along with the focus, not on a press.
check('на паке, который ничего не сменит, цены нет', langPanel.warn.hidden === true, langPanel.warn.textContent);
UI.langKey('ArrowRight');
check('дошли до English', langPanel.btns[4].dataset.pack === 'en' && focused() === 4, focused());
check('цена показана до нажатия', langPanel.warn.hidden === false, 'скрыта');
check('и называет число и пример', /2/.test(langPanel.warn.textContent) && /Pete/.test(langPanel.warn.textContent),
  langPanel.warn.textContent);
UI.langKey('ArrowLeft');
check('шаг назад цену убирает', langPanel.warn.hidden === true, langPanel.warn.textContent);

UI.langKey('ArrowRight');
UI.langKey('Enter');
check('Enter жмёт то, на чём фокус', langPanel.btns[4].clicked === 1, langPanel.btns[4].clicked);
UI.closeLang();
check('закрытая панель языка стрелки не ест', UI.langKey('ArrowDown') === false, 'съела');

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
