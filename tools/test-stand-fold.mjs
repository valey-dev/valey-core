// node tools/test-stand-fold.mjs — «~» folds the stand plaque, without a browser.
//
// The plaque covers the top-left corner of the floor, and that corner is
// sometimes the thing being photographed. The key that pushes it aside is the
// kind of thing that breaks in silence: nothing on the screen says a listener
// stopped answering, and the plaque is only ever seen on stands — that is, by
// nobody who would report it.
//
// The DOM here is a stand-in. What is checked is behaviour: does the class on
// the body turn on and off, does the field keep its own «~», does a browser
// combination stay the browser's, and is the answer remembered between reloads —
// a module switched off on the plaque reloads the page by itself, and a plaque
// that unfolded every time would have to be folded after every switch.

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

const classes = new Set();
const node = () => ({
  id: '', type: '', className: '', textContent: '', title: '', innerHTML: '', dataset: {},
  disabled: false, onclick: null, children: [],
  appendChild(c) { this.children.push(c); return c; },
  append(...cs) { this.children.push(...cs); },
});

const listeners = [];
const store = new Map();

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  createElement: () => node(),
  body: {
    children: [],
    appendChild(c) { this.children.push(c); return c; },
    classList: {
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
  },
};
globalThis.window = { addEventListener: (type, fn) => listeners.push({ type, fn }) };

// The server's answer, as the plaque's own route gives it out.
const STAND = { text: 'что проверяем', branch: 'claude/тест', port: 5199, all: [{ id: 'radio' }, { id: 'plan', off: true }] };
let answer = STAND;
globalThis.fetch = async () => ({ json: async () => answer });

const { initStand } = await import('../web/stand.js');

// ------------------------------------------------------------------ the plaque
const s = await initStand();
ok('табличка построилась', !!s && s.text === 'что проверяем', s && s.text);
ok('и повешена на страницу вместе с ярлыком', document.body.children.length === 2,
  document.body.children.map((c) => c.id));
const tab = document.body.children[1];
ok('ярлык — кнопка с подписью «СТЕНД»', tab.id === 'standtab' && tab.textContent === 'СТЕНД', tab.textContent);
ok('сама табличка говорит, чем её свернуть',
  (document.body.children[0].children[0] || {}).textContent === 'ТЕСТОВЫЙ СТЕНД · ~ СВЕРНУТЬ',
  (document.body.children[0].children[0] || {}).textContent);
ok('развёрнута с самого начала', !classes.has('stand-folded'), [...classes]);

// ------------------------------------------------------------------- the key
const key = listeners.find((l) => l.type === 'keydown');
ok('слушатель клавиши повешен ровно один', listeners.length === 1 && !!key, listeners.length);

let prevented = 0;
const press = (code, extra = {}) => key.fn({ code, preventDefault: () => { prevented += 1; }, ...extra });

press('Backquote');
ok('«~» сворачивает', classes.has('stand-folded'), [...classes]);
ok('и клавиша не уходит дальше', prevented === 1, prevented);
press('Backquote');
ok('второе нажатие разворачивает', !classes.has('stand-folded'), [...classes]);

press('KeyS');
ok('чужая клавиша не трогает табличку', !classes.has('stand-folded'), [...classes]);
ok('и не перехватывается', prevented === 2, prevented);

press('Backquote', { metaKey: true });
ok('Cmd+« остаётся браузеру', !classes.has('stand-folded'), [...classes]);
press('Backquote', { ctrlKey: true });
press('Backquote', { altKey: true });
ok('Ctrl и Alt тоже', !classes.has('stand-folded') && prevented === 2, [[...classes], prevented]);

press('Backquote', { target: { tagName: 'INPUT' } });
ok('в поле ввода «~» печатается, а не сворачивает', !classes.has('stand-folded'), [...classes]);
press('Backquote', { target: { tagName: 'TEXTAREA' } });
ok('и в многострочном поле тоже', !classes.has('stand-folded'), [...classes]);

// ------------------------------------------------------------- between reloads
press('Backquote');
ok('свёрнутое состояние записано', store.get('valey-stand-folded') === '1', store.get('valey-stand-folded'));
classes.clear();
document.body.children.length = 0;
listeners.length = 0;
await initStand();
ok('после перезагрузки табличка осталась свёрнутой', classes.has('stand-folded'), [...classes]);
const tab2 = document.body.children[1];
tab2.onclick();
ok('клик по ярлыку разворачивает', !classes.has('stand-folded'), [...classes]);
ok('и это запомнено', !store.get('valey-stand-folded'), store.get('valey-stand-folded'));

// -------------------------------------------------------------- no stand at all
classes.clear();
document.body.children.length = 0;
listeners.length = 0;
answer = { text: null };
const none = await initStand();
ok('без VALEY_STAND ничего не строится', none === null, none);
ok('и клавиша не занята', listeners.length === 0, listeners.length);

console.log(bad ? `\n${bad} упало` : '\nвсё цело');
process.exit(bad ? 1 : 0);
