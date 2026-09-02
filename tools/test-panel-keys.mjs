// node tools/test-panel-keys.mjs — клавиши в панелях офиса.
//
// Радио уехало отсюда в modules/radio/test-keys.mjs вместе с самим радио.
// DOM подставной, как и в остальных клавиатурных стендах: проверяется не
// вёрстка, а состояние фокуса — куда он встаёт, как ходит и что нажимает.

function node(cls = '', props = {}) {
  const classes = new Set(cls.split(' ').filter(Boolean));
  return {
    disabled: false, textContent: '', innerHTML: '', scrollTop: 0,
    clicked: 0, focused: 0, dataset: {}, tagName: 'BUTTON', title: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))),
    },
    has: (c) => classes.has(c),
    click() { this.clicked += 1; },
    focus() { this.focused += 1; },
    scrollIntoView() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => fakeCtx,
    style: {},
    ...props,
  };
}

const stub = node();
let roster = null;
let notes = null;
let bag = null;
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

// Порядок такой же, как в разметке панели: ручки, волны, громкость, своя волна.

// портрет в «переодеться» рисуется на канвасе — стенду хватит заглушки
const fakeCtx = {
  imageSmoothingEnabled: false, fillStyle: '',
  fillRect() {}, save() {}, restore() {}, scale() {}, translate() {},
  beginPath() {}, ellipse() {}, fill() {}, fillText() {},
};

// Слот одежды — строка с ◀ и ▶ внутри, а не кнопка. Стрелки в стороны должны
// жать эти кнопки, а не перескакивать на соседний слот.
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

// Вкладка «вещи» — сетка: ряд на слот, в ряду клетки. Стрелки тут значат не то
// же самое, что на «на себе», поэтому у неё свой стенд.
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

// Вкладка «офис» — просто ряд кнопок, кольцо фокуса как у окна в мир.
function makeBagOffice(n) {
  const btns = Array.from({ length: n }, () => node('obtn'));
  return {
    hidden: false, innerHTML: '', btns,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.obtn' ? btns : []),
  };
}

// Плоское кольцо: окно в мир и цвет офиса устроены одинаково.
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

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// Адрес страницы нужен подсказке про Redirect URI в радио — второй кусок,
// который отложенный ответ probeDrm достаёт из панели уже после её отрисовки.
globalThis.location = { origin: 'http://localhost:5177', hash: '', search: '' };
const withStyle = (n) => Object.assign(n, { style: { setProperty: () => {}, removeProperty: () => {} } });
// initUI запоминает узлы один раз, поэтому за ним стоит постоянная обёртка, а
// свежий подставной DOM подсовывается уже за ней
const notesProxy = {
  get hidden() { return notes.hidden; },
  set hidden(v) { notes.hidden = v; },
  set innerHTML(v) { notes.innerHTML = v; },
  get innerHTML() { return notes.innerHTML; },
  querySelector: (s2) => notes.querySelector(s2),
  querySelectorAll: (s2) => notes.querySelectorAll(s2),
};

const proxy = (get) => ({
  get hidden() { return get().hidden; },
  set hidden(v) { get().hidden = v; },
  set innerHTML(v) { get().innerHTML = v; },
  get innerHTML() { return get().innerHTML; },
  querySelector: (s2) => get().querySelector(s2),
  querySelectorAll: (s2) => get().querySelectorAll(s2),
});
const bagProxy = proxy(() => bag);
let viewer = null;
const skyProxy = proxy(() => sky);
const skinProxy = proxy(() => skin);

const rosterProxy = {
  get hidden() { return roster.hidden; },
  set hidden(v) { roster.hidden = v; },
  set innerHTML(v) { roster.innerHTML = v; },
  get innerHTML() { return roster.innerHTML; },
  querySelector: (s2) => roster.querySelector(s2),
  querySelectorAll: (s2) => roster.querySelectorAll(s2),
};

const viewerProxy = proxy(() => viewer);

// Правая панель дерева гита: её листают PgUp/PgDn, поэтому у неё должна быть
// высота и прокрутка, а не общая заглушка с нулями.
const pane = () => node('', { clientHeight: 400, scrollHeight: 4000 });
const gcard = pane();
const gcode = pane();

globalThis.document = {
  querySelector: (sel) => (sel === '#roster' ? rosterProxy
    : sel === '#gcard' ? gcard
    : sel === '#gcode' ? gcode
    : sel === '#viewer' ? viewerProxy
    : sel === '#notes' ? notesProxy
    : sel === '#bag' ? bagProxy
    : sel === '#sky' ? skyProxy
    : sel === '#skin' ? skinProxy
    : stub),
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

const agents = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, name: 'Агент ' + i, project: 'AI valey', status: 'awaiting',
  title: 'задача', lastSaid: 'ждёт', idleFor: 60, roleKey: 'code',
}));
// me нужен: инвентарь рисует человечка и подписи слотов из него
const state = { agents: [], looks: new Map(), settings: {}, delivery: {}, visited: new Set(),
  me: { skin: '#e8ad7e', hair: '#3a2a20', shirt: '#c25a4b', pants: '#3f4a63', boots: '#2a2118',
        style: 0, tall: 0, face: 'none', head: 'none', glasses: false, hands: 'none', name: 'ТЫ' } };
roster = makeRoster(0);
notes = makeNotes(0);
bag = makeBagSelf(0);
sky = makeRing([]);
skin = makeRing([]);
UI.initUI(state, { guideTo: () => {}, saveMe: () => {} });

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// ------------------------------------------------------------------- обход
const at = (list) => list.findIndex((b) => b.has('focus'));

state.agents = agents(3);
roster = makeRoster(3);
UI.renderRoster();
check('обход: фокус встаёт на первую строку', at(roster.gos) === 0, at(roster.gos));
check('стрелка вниз обработана', UI.rosterKey('ArrowDown') === true, 'не обработана');
check('и переводит на вторую', at(roster.gos) === 1, at(roster.gos));
UI.rosterKey('Enter');
check('Enter ведёт к выбранному, а не к первому', roster.gos[1].clicked === 1, roster.gos.map((b) => b.clicked).join(','));

UI.rosterKey('ArrowUp'); UI.rosterKey('ArrowUp');
check('список закольцован', at(roster.gos) === 2, at(roster.gos));

// закрытая панель не должна забирать стрелки — иначе после первого же обхода
// по офису перестанет ходить игрок
roster.hidden = true;
check('закрытый обход стрелки не ест', UI.rosterKey('ArrowDown') === false, 'съел');

// пустой обход: ждущих нет, нажимать нечего
state.agents = [];
roster = makeRoster(0);
UI.renderRoster();
check('пустой обход стрелки не ест', UI.rosterKey('ArrowDown') === false, 'съел');
check('и Enter не ест', UI.rosterKey('Enter') === false, 'съел');

// ----------------------------------------------------------------- заметки
notes = makeNotes(2);            // две заметки: у каждой «открыть» и ✕
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

// закрытая панель клавиши не забирает
UI.closeNotes();
check('закрытые заметки стрелки не едят', UI.notesKey('ArrowDown') === false, 'съели');

// пустая панель: нажимать нечего, стрелки должны уйти в офис
notes = makeNotes(0);
UI.renderNotes();
check('пустые заметки стрелки не едят', UI.notesKey('ArrowDown') === false, 'съели');

// --------------------------------------------------------------- инвентарь
// Вкладка «на себе» — бывшая панель C, слово в слово: стрелки вверх-вниз по
// слотам, в стороны крутят значение того, на котором стоишь.
bag = makeBagSelf(3);            // строка имени плюс три слота
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

// имя — поле ввода: Enter должен отдать ему фокус, иначе с клавиатуры не набрать
UI.bagKey('ArrowUp');
UI.bagKey('Enter');
check('Enter на имени отдаёт полю фокус', rows[0].input.focused === 1, rows[0].input.focused);

// Вкладки: цифра переключает, и стрелки после этого значат другое.
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

// назад на «на себе»: фокус там начинается заново, а не помнит клетку сетки
bag = makeBagSelf(3);
UI.bagKey('1');
check('цифра 1 вернула на «на себе»', focusRow() === 0, focusRow());
check('несуществующая вкладка не ловится', UI.bagKey('9') === false, 'поймана');

// Вкладка «офис»: ряд кнопок, и стрелка вниз должна по ним ходить. До
// 31 августа 2026 она не делала ничего — обработчик знал только две вкладки из
// трёх, и клавиша уезжала в офис из-под открытой панели.
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

// ------------------------------------------- окно в мир и цвет офиса (кольцо)
sky = makeRing([{ id: 'skytoggle' }, { id: 'skyq', tagName: 'INPUT' }, { id: 'skygeo' }]);
check('окно в мир: стрелка обработана', UI.skyKey('ArrowDown') === true, 'нет');
UI.skyKey('Enter');
check('Enter на поле города отдаёт ему настоящий фокус', sky.btns[1].focused === 1, sky.btns[1].focused);
check('и не жмёт его как кнопку', sky.btns[1].clicked === 0, sky.btns[1].clicked);
UI.closeSky();
check('закрытое окно в мир стрелки не ест', UI.skyKey('ArrowDown') === false, 'съело');

// ползунок оттенка: стрелки в стороны крутят его, а не уводят фокус
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

// ------------------------------------------------------------- дерево гита
// Панель рисуется в общий оверлей, поэтому подставной DOM тут один узел, а
// проверяется по разметке: какая строка выбрана и какая ступень открыта.
viewer = {
  hidden: true, innerHTML: '',
  querySelector: () => null,
  querySelectorAll: () => [],
};
const commits = [
  { hash: 'a'.repeat(40), short: 'aaaaaaa', parents: ['b'.repeat(40)], author: 'xoyk', ts: Date.now(),
    refs: ['HEAD -> main'], subject: 'верхний коммит', body: '', unpushed: true },
  { hash: 'b'.repeat(40), short: 'bbbbbbb', parents: ['c'.repeat(40)], author: 'xoyk', ts: Date.now() - 6e5,
    refs: ['origin/main'], subject: 'средний коммит', body: '', unpushed: false },
  { hash: 'c'.repeat(40), short: 'ccccccc', parents: [], author: 'xoyk', ts: Date.now() - 12e5,
    refs: [], subject: 'нижний коммит', body: '', unpushed: false },
];
const board = { ok: true, branch: 'main', total: 3, dirty: 2, remotes: true, unpushed: 1, commits };
const diff = {
  ok: true, merge: false, truncated: false,
  commit: { ...commits[0], add: 1, del: 0 },
  files: [
    { path: 'web/main.js', add: 1, del: 0, binary: false, lines: [{ kind: 'add', new: 1, text: 'const a = 1;' }] },
    { path: 'web/ui.js', add: 0, del: 0, binary: false, lines: [] },
  ],
};
await UI.openGit('AI valey', async () => board, async () => diff);
const sel = () => {
  const m = viewer.innerHTML.match(/class="grow sel" data-i="(\d+)"/);
  return m ? Number(m[1]) : -1;
};
check('дерево: открылось на верхнем коммите', sel() === 0, sel());
check('высота панели закреплена, пока есть что прокручивать',
  viewer.innerHTML.includes('class="vwrap gitwrap tall"'), 'нет класса tall');
check('рабочее дерево стоит отдельной строкой', viewer.innerHTML.includes('grow dirty'), 'нет строки');
check('непушнутый коммит отмечен', viewer.innerHTML.includes('class="gup"'), 'нет отметки');
gcard.scrollTop = 0;
gcard.scrollTop = 0;
check('PgDn на истории листает сообщение, а не список',
  UI.gitKey('pagedown') === true && gcard.scrollTop > 0 && sel() === 0,
  `scrollTop ${gcard.scrollTop}, строка ${sel()}`);
check('PgUp крутит его обратно', UI.gitKey('pageup') === true && gcard.scrollTop === 0, gcard.scrollTop);
check('стрелка вниз обработана деревом', UI.gitKey('arrowdown') === true, 'не обработана');
check('и переводит на следующий коммит', sel() === 1, sel());
UI.gitKey('arrowup');
UI.gitKey('arrowup');
check('вверх на первом коммите не уезжает за край', sel() === 0, sel());
UI.gitKey('end');
check('End уводит к последнему', sel() === 2, sel());
UI.gitKey('home');
check('Home возвращает к первому', sel() === 0, sel());
await UI.gitKey('enter');
await new Promise((r) => setTimeout(r, 0));
check('Enter открывает диф', viewer.innerHTML.includes('class="gcode"'), 'дифа нет');
check('в дифе выбран первый файл', viewer.innerHTML.includes('class="gfile sel" data-f="0"'), 'нет выбора');
check('строка дифа пришла с подсветкой', viewer.innerHTML.includes('t-keyword'), 'без подсветки');
check('префикс отдельной колонкой, а не в коде', !viewer.innerHTML.includes('>+const'), 'префикс в коде');
UI.gitKey('arrowdown');
check('вниз ведёт к следующему файлу', viewer.innerHTML.includes('class="gfile sel" data-f="1"'), 'не ведёт');
UI.gitKey('arrowdown');
check('на последнем файле вниз не уходит по кругу', viewer.innerHTML.includes('class="gfile sel" data-f="1"'), 'ушло по кругу');
UI.gitKey('arrowup');
check('вверх возвращает к предыдущему файлу', viewer.innerHTML.includes('class="gfile sel" data-f="0"'), 'не вернуло');
UI.gitKey('arrowup');
check('на первом файле вверх стоит на месте', viewer.innerHTML.includes('class="gfile sel" data-f="0"'), 'уехало');
UI.gitKey('arrowright');
check('вправо делает то же, что вниз', viewer.innerHTML.includes('class="gfile sel" data-f="1"'), 'не листает');
gcode.scrollTop = 0;
check('PgDn в дифе листает диф, а не файлы', UI.gitKey('pagedown') === true
  && gcode.scrollTop > 0 && viewer.innerHTML.includes('class="gfile sel" data-f="1"'),
  `scrollTop ${gcode.scrollTop}`);
UI.gitKey('home');
check('Home уводит к первому файлу', viewer.innerHTML.includes('class="gfile sel" data-f="0"'), 'не увело');
UI.gitKey('end');
check('End — к последнему', viewer.innerHTML.includes('class="gfile sel" data-f="1"'), 'не увело');
UI.gitKey('escape');
check('Esc из дифа возвращает в историю, а не в офис', UI.gitPanelOpen() && sel() === 0, 'закрылось совсем');
UI.gitKey('escape');
check('второй Esc закрывает дерево', !UI.gitPanelOpen(), 'осталось открытым');
check('закрытое дерево клавиши не ест', UI.gitKey('arrowdown') === false, 'съело');

// Отказные экраны меряются по содержимому: окно в пол-экрана ради двух строк
// текста читается как поломка, а не как панель.
await UI.openGit('пусто', async () => ({ ok: true, branch: 'main', total: 0, dirty: 0, remotes: false, unpushed: 0, commits: [] }), async () => ({}));
check('«нет коммитов» не растягивается во весь экран',
  !viewer.innerHTML.includes('gitwrap tall'), 'растянулось');
await UI.openGit('отказ', async () => ({ ok: false, code: 128, message: 'not a git repository' }), async () => ({}));
check('отказ git тоже по содержимому', !viewer.innerHTML.includes('gitwrap tall'), 'растянулось');
check('и показывает код возврата', viewer.innerHTML.includes('128'), 'кода нет');
UI.gitKey('escape');

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
