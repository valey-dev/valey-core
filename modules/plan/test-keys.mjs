// node modules/plan/test-keys.mjs — клавиши плана офиса.
//
// DOM подставной, как и в остальных клавиатурных стендах: проверяется не
// вёрстка, а фокус — на какой комнате он встаёт при открытии, куда ходит
// стрелками по сетке и кого подсвечивает Enter. Планировка настоящая, из
// buildLayout: ходьба по плану — это ходьба по её геометрии, и подставная
// сетка проверяла бы стенд, а не модуль.

function node(tag = 'DIV') {
  const classes = new Set();
  const kids = [];
  const n = {
    tagName: tag, hidden: false, textContent: '', title: '', width: 0, height: 0,
    dataset: {}, style: {}, clicked: 0, children: kids,
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))),
    },
    has: (c) => classes.has(c),
    appendChild(k) { kids.push(k); k.parent = n; return k; },
    remove() { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); },
    click() { n.clicked += 1; if (n.onclick) n.onclick(); },
    scrollIntoView() {},
    getContext: () => ctx,
    querySelector: (sel) => n.querySelectorAll(sel)[0] || null,
    querySelectorAll: (sel) => {
      const cls = sel.startsWith('.') ? sel.slice(1) : null;
      const id = sel.startsWith('#') ? sel.slice(1) : null;
      const out = [];
      for (const k of kids) {
        if ((cls && k.has(cls)) || (id && k.id === id)) out.push(k);
        out.push(...k.querySelectorAll(sel));
      }
      return out;
    },
    set className(v) { classes.clear(); v.split(' ').filter(Boolean).forEach((c) => classes.add(c)); },
    // Разметка панели приходит строкой; узлы с id и классом из неё заводятся
    // плоским списком — модуль ищет их по id, а вложенность ему не важна.
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = v; kids.length = 0;
      for (const m of v.matchAll(/<(\w+)([^>]*)>/g)) {
        const id = (m[2].match(/\sid="([^"]+)"/) || [])[1];
        const cls = (m[2].match(/\sclass="([^"]+)"/) || [])[1];
        if (!id && !cls) continue;
        const k = node(m[1].toUpperCase());
        if (id) k.id = id;
        if (cls) k.className = cls;
        n.appendChild(k);
      }
    },
  };
  let html = '';
  return n;
}

// Холст рисуется по-настоящему, но смотреть на него здесь некому: контекст
// принимает любой вызов и любое свойство.
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true) });

const body = node('BODY');
// Модуль ищет свои узлы через document.querySelector по id: панель висит на
// body, значит искать надо по всему дереву от него.
globalThis.document = {
  body,
  documentElement: node('HTML'),
  createElement: (tag) => node(tag.toUpperCase()),
  querySelector: (sel) => body.querySelector(sel),
  querySelectorAll: (sel) => body.querySelectorAll(sel),
  addEventListener: () => {},
  getElementById: (id) => body.querySelector('#' + id),
};
Object.assign(document.documentElement, { style: { setProperty() {}, removeProperty() {} } });
Object.assign(body, { style: { setProperty() {}, removeProperty() {} } });
// тосты ядра живут в #toasts: «провожу» из плана падает без него
body.appendChild(Object.assign(node('DIV'), { id: 'toasts' }));
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;

const { buildLayout } = await import('../../web/layout.js');
const { addDict } = await import('../../web/i18n.js');
const CORE = await import('../../web/ui.js');
const P = await import('./client.js');

const hooks = {};
P.register({ id: 'plan', on: (n, f) => (hooks[n] = f), i18n: (d) => addDict(d) });

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// Шесть проектов — два ряда по три; в первом два агента, один из них ждёт.
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
  player: { x: r0.doorPoint.x, y: r0.doorPoint.y - 30 },   // в коридоре у двери первой комнаты
  cat: { x: 0, y: 0 }, lift: { floor: 2 }, currentRoom: null, waypoint: null,
};
CORE.initUI(state, { guideTo: () => {} });
hooks.tick(state, 16);

// ------------------------------------------------------------ вход и выход
check('строка подсказки называет клавишу', /K/.test(hooks.help()), hooks.help());
check('закрытый план стрелки не ест', P.planKey('ArrowDown') === false, 'съел');
check('K открывает план', hooks.key('k') === true && P.planOpen(), P.planOpen());
check('и он держит экран', hooks.busy() === true, hooks.busy());
check('фокус встаёт на ближайшую дверь — первую комнату', P.planFocus() === r0.key, P.planFocus());

// ------------------------------------------------------------------ сетка
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

// ----------------------------------------------------------- вести туда
hooks.esc();
check('ESC закрывает план', !P.planOpen(), P.planOpen());
hooks.key('л');
check('русская Л открывает так же', P.planOpen(), P.planOpen());
check('и фокус снова у своей двери', P.planFocus() === r0.key, P.planFocus());
P.planKey('Enter');
check('Enter ведёт к тому, кто ждёт, а не к первому за столом', state.waypoint === 'a1', state.waypoint);
check('и закрывает план', !P.planOpen(), P.planOpen());

// Комната без людей: стрелке не к кому вести, план остаётся открытым.
state.waypoint = null;
hooks.key('k');
P.planKey('ArrowDown'); P.planKey('ArrowDown');
const empty = P.planFocus();
P.planKey('Enter');
check('в пустую комнату не ведёт', state.waypoint === null && P.planOpen(), [empty, state.waypoint]);
hooks.esc();

// Экран входа: под ним плана нет, там ещё нечему быть «здесь».
body.classList.add('titling');
check('на экране входа K не открывает план', hooks.key('k') === false && !P.planOpen(), P.planOpen());
body.classList.remove('titling');

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
