// node tools/test-lift-keys.mjs — клавиши в панели лифта и на стойке.
// DOM подставной, как и в остальных клавиатурных стендах: проверяется не
// вёрстка, а состояние фокуса — на каком этаже он стоит при открытии, куда
// ходит стрелками и что нажимает Enter.

function node(cls = '') {
  const classes = new Set(cls.split(' ').filter(Boolean));
  return {
    disabled: false, textContent: '', clicked: 0, dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))),
    },
    has: (c) => classes.has(c),
    click() { this.clicked += 1; },
    scrollIntoView() {},
  };
}

// В панели живут либо этажи, либо строки стойки — узел el.lift один и тот же.
function makeLift(kind = 'floors', n = 3) {
  const cls = kind === 'floors' ? 'liftbtn' : 'recgo';
  const btns = Array.from({ length: n }, (_, i) => {
    const b = node(cls);
    b.dataset.n = String(i + 1);      // этажи пронумерованы, и цифра ищет по номеру
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
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};
const focusAt = () => lift.btns.findIndex((b) => b.has('focus'));

// --- 1. фокус открывается на том этаже, где стоишь ---
const floors = { floors: [{ n: 1, rooms: [] }, { n: 2, rooms: [] }, { n: 3, rooms: [] }] };
lift = makeLift('floors', 3);
let picked = null;
UI.openLift(floors, 2, (n) => { picked = n; });
check('фокус на текущем этаже, а не на первом', focusAt() === 1, focusAt());

// --- 2. стрелки ходят по этажам ---
check('вверх обработана', UI.liftKey('ArrowUp') === true, 'не обработана');
check('и подняла на этаж выше по списку', focusAt() === 0, focusAt());
UI.liftKey('ArrowDown'); UI.liftKey('ArrowDown');
check('вниз опускает', focusAt() === 2, focusAt());

// --- 3. список закольцован: с края шаг переносит на другой ---
UI.liftKey('ArrowDown');
check('с последнего вниз — на первый', focusAt() === 0, focusAt());

// --- 4. Enter нажимает выбранный этаж ---
UI.liftKey('Enter');
check('Enter нажимает этаж под фокусом', lift.btns[0].clicked === 1, lift.btns[0].clicked);
check('и только его', lift.btns.filter((b) => b.clicked).length === 1, lift.btns.map((b) => b.clicked).join(','));

// --- 5. цифра — прямой выбор этажа: «3» это третий этаж, а не третий пункт ---
lift = makeLift('floors', 3);
check('цифра обработана панелью', UI.liftKey('2') === true, 'не обработана');
check('и нажала этаж с этим номером', lift.btns[1].clicked === 1, lift.btns[1].clicked);
check('соседние этажи не тронуты', lift.btns[0].clicked === 0 && lift.btns[2].clicked === 0, 'тронуты');
check('и фокус переехал туда же', lift.btns[1].has('focus'), 'не переехал');
UI.liftKey('7');
check('цифра мимо списка ничего не нажала', lift.btns.every((b) => b.clicked <= 1), 'нажала');
check('но в офис не уехала', UI.liftKey('7') === true, 'уехала');

// --- 6. закрытая панель клавиши не забирает ---
// иначе стрелки перестанут ходить по офису после первой же поездки
lift.hidden = true;
check('закрытая панель не ест стрелки', UI.liftKey('ArrowUp') === false, 'съела');
check('и не ест Enter', UI.liftKey('Enter') === false, 'съела');

// --- 6. стойка ресепшена: те же клавиши на том же узле ---
lift = makeLift('rec', 2);
UI.openReception({ n: 1, rooms: ['AI valey', 'figma'] }, () => {});
check('на стойке фокус встаёт на первую строку', focusAt() === 0, focusAt());
UI.liftKey('ArrowDown');
check('и ходит по строкам', focusAt() === 1, focusAt());
UI.liftKey(' ');
check('ПРОБЕЛ нажимает строку', lift.btns[1].clicked === 1, lift.btns[1].clicked);

// --- 7. этаж без строк: панель не должна залипать ---
// на пустом этаже стойка рисует приветствие и ни одной кнопки
lift = makeLift('rec', 0);
UI.openReception({ n: 9, rooms: [] }, () => {});
check('пустая стойка стрелки не забирает', UI.liftKey('ArrowDown') === false, 'забрала');
check('и Enter тоже', UI.liftKey('Enter') === false, 'забрала');

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
