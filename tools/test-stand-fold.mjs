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
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
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
ok('sign built', !!s && s.text === 'что проверяем', s && s.text);
ok('and hung on the page along with a label', document.body.children.length === 2,
  document.body.children.map((c) => c.id));
const tab = document.body.children[1];
ok('label - a button labeled “STAND”', tab.id === 'standtab' && tab.textContent === 'STAND', tab.textContent);
ok('the sign itself tells you how to roll it',
  (document.body.children[0].children[0] || {}).textContent === 'TEST STAND · ~ COLLAPSE',
  (document.body.children[0].children[0] || {}).textContent);
ok('developed from the very beginning', !classes.has('stand-folded'), [...classes]);

// ------------------------------------------------------------------- the key
const key = listeners.find((l) => l.type === 'keydown');
ok('the key listener is hung exactly one', listeners.length === 1 && !!key, listeners.length);

let prevented = 0;
const press = (code, extra = {}) => key.fn({ code, preventDefault: () => { prevented += 1; }, ...extra });

press('Backquote');
ok('"~" collapses', classes.has('stand-folded'), [...classes]);
ok('and the key doesn\'t go any further', prevented === 1, prevented);
press('Backquote');
ok('second press expands', !classes.has('stand-folded'), [...classes]);

press('KeyS');
ok('someone else\'s key does not touch the sign', !classes.has('stand-folded'), [...classes]);
ok('and is not intercepted', prevented === 2, prevented);

press('Backquote', { metaKey: true });
ok('Cmd+“ remains to the browser', !classes.has('stand-folded'), [...classes]);
press('Backquote', { ctrlKey: true });
press('Backquote', { altKey: true });
ok('Ctrl and Alt too', !classes.has('stand-folded') && prevented === 2, [[...classes], prevented]);

press('Backquote', { target: { tagName: 'INPUT' } });
ok('in the input field "~" is printed rather than collapsed', !classes.has('stand-folded'), [...classes]);
press('Backquote', { target: { tagName: 'TEXTAREA' } });
ok('and in a multiline field too', !classes.has('stand-folded'), [...classes]);

// ------------------------------------------------------------- between reloads
press('Backquote');
ok('the collapsed state is written', store.get('valey-stand-folded') === '1', store.get('valey-stand-folded'));
classes.clear();
document.body.children.length = 0;
listeners.length = 0;
await initStand();
ok('after the reboot the sign remained collapsed', classes.has('stand-folded'), [...classes]);
const tab2 = document.body.children[1];
tab2.onclick();
ok('Click on the shortcut to expand', !classes.has('stand-folded'), [...classes]);
ok('and it\'s remembered', !store.get('valey-stand-folded'), store.get('valey-stand-folded'));

// -------------------------------------------------------------- no stand at all
classes.clear();
document.body.children.length = 0;
listeners.length = 0;
answer = { text: null };
const none = await initStand();
ok('without VALEY_STAND nothing is built', none === null, none);
ok('and the key is not occupied', listeners.length === 0, listeners.length);

console.log(bad ? `\nfailed: ${bad}` : '\nall intact');
process.exit(bad ? 1 : 0);
