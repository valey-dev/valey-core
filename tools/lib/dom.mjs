import { setLang } from '../../web/i18n.js';

// A stand-in DOM for the stands that check panels without a browser.
//
// There were six copies of this little machine, and they had drifted: one node
// had `focus` and another did not, one took an `id` first and another a class.
// Worse, they had drifted in MEANING. In the card `scrollTop` had no floor, and
// two checks required a negative value from it; a real browser clamps it at
// zero, so the stand was pinning a state that cannot occur. One machine for all
// exists for exactly that reason: a difference in it is a difference in what
// the stands believe to be true.
//
// Only what the panel code touches is here. This is not jsdom and must not
// become it: a panel that needs real layout is judged by eye and by
// tools/shot.mjs, not by a stand-in tree two thousand lines long.

// The canvas: the portrait in the card and the little person in the wardrobe are
// drawn on it, and it is enough for a stand that the calls do not throw.
export const noopCtx = () => ({
  imageSmoothingEnabled: false, fillStyle: '', font: '', textAlign: '', globalAlpha: 1,
  fillRect() {}, clearRect() {}, strokeRect() {},
  save() {}, restore() {}, scale() {}, translate() {}, rotate() {}, setTransform() {},
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
  fill() {}, stroke() {}, fillText() {}, drawImage() {},
  measureText: () => ({ width: 0 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
});

const CTX = noopCtx();

/**
 * A node. `cls` is classes separated by spaces, `props` is what to add or
 * override.
 *
 * `scrollTop` has a floor at zero, as in a browser: scrolling up from the start
 * leads nowhere. `has(c)` is the short way to ask about a class in a check.
 */
export function node(cls = '', props = {}) {
  // The second argument is the properties, not a second class. Three of the old
  // copies had signatures of their own, and moving a stand onto the shared
  // machine would fail deep inside, on an `in`; better to say so at once and in
  // plain words.
  if (typeof props !== 'object' || props === null) {
    throw new TypeError(`node(cls, props): the second argument must be a props object; received ${JSON.stringify(props)}`);
  }
  const classes = new Set(String(cls).split(' ').filter(Boolean));
  let scroll = 0;
  const n = {
    id: '', tagName: 'BUTTON', title: '', value: '',
    disabled: false, hidden: false, textContent: '', innerHTML: '',
    clicked: 0, focused: 0, dataset: {}, style: {},
    scrollHeight: 0, clientHeight: 0, offsetTop: 0, offsetHeight: 0,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on === undefined
        ? (classes.has(c) ? classes.delete(c) : classes.add(c))
        : (on ? classes.add(c) : classes.delete(c))),
    },
    has: (c) => classes.has(c),
    click() { this.clicked += 1; },
    focus() { this.focused += 1; },
    blur() {},
    scrollIntoView() {},
    appendChild() {}, removeChild() {}, remove() {}, replaceWith() {},
    addEventListener() {}, removeEventListener() {},
    getContext: () => CTX,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    querySelector: () => null,
    querySelectorAll: () => [],
    ...props,
  };
  // The floor under the scroll is not pedantry: until 4 September 2026 two
  // checks of the card required scrollTop < 0, and they passed only because the
  // stand-in node allowed what a browser does not.
  if (!('scrollTop' in props)) {
    Object.defineProperty(n, 'scrollTop', {
      get: () => scroll,
      set: (v) => { scroll = Math.max(0, Number(v) || 0); },
      enumerable: true, configurable: true,
    });
  }
  return n;
}

// A node that paints :root needs a style of its own, with methods.
export const withStyle = (n) => Object.assign(n, {
  style: { setProperty: () => {}, removeProperty: () => {}, getPropertyValue: () => '' },
});

/**
 * A wrapper over a node the stand rebuilds between checks. initUI remembers its
 * nodes once, so a permanent object stands in front of it and the fresh stand-in
 * DOM is slipped in behind that.
 */
export const proxy = (get) => ({
  get hidden() { return get().hidden; },
  set hidden(v) { get().hidden = v; },
  get innerHTML() { return get().innerHTML; },
  set innerHTML(v) { get().innerHTML = v; },
  get scrollTop() { return get().scrollTop; },
  set scrollTop(v) { get().scrollTop = v; },
  querySelector: (s) => get().querySelector(s),
  querySelectorAll: (s) => get().querySelectorAll(s),
});

// A localStorage that really remembers: the stands for the notes and the look
// need behaviour rather than a stub.
export function memoryStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    store,
  };
}

/**
 * Installs the global document, window, localStorage and everything else the
 * panel code touches on import.
 *
 * `byId` is what to answer `#id` with: an object like { dialog: nodeOrWrapper }.
 * `find` is a lookup of your own, for selectors that do not reduce to ids; it is
 * called first, and a `null` from it means "keep looking".
 */
export function installDom({ byId = {}, find = null, storage = null, location = null } = {}) {
  const stub = node();
  const lookup = (sel) => {
    if (find) { const own = find(sel); if (own) return own; }
    if (typeof sel === 'string' && sel.startsWith('#')) {
      const hit = byId[sel.slice(1)];
      if (hit) return hit;
    }
    return null;
  };
  globalThis.document = {
    title: '',
    querySelector: (sel) => lookup(sel) || stub,
    querySelectorAll: () => [],
    getElementById: (id) => lookup('#' + id) || null,
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: withStyle(node()),
    body: withStyle(Object.assign(node(), { appendChild: () => {} })),
    head: Object.assign(node(), { appendChild: () => {} }),
    createElement: () => withStyle(node()),
  };
  globalThis.window = globalThis;
  globalThis.localStorage = storage || memoryStorage();
  globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  // Location is installed unconditionally, not on request: a page in a browser
  // always has one, and a stand that forgot to ask for it died on the first
  // read instead of checking the markup it came for. `host` is in the defaults
  // because the entrance prints the office address, and it must print the real
  // one.
  globalThis.location = { origin: 'http://localhost:5177', host: 'localhost:5177', hash: '', search: '', ...(location || {}) };
  standLang();
  return { stub, lookup };
}

// The stands read the office in Russian, and say so out loud.
//
// Since 6 September 2026 the office comes up in the language of the device, and
// a stand has one too: Node reports `en-US`, so four stands went red the moment
// the default changed — they compare against Russian captions, which is fair,
// because that is the office they were written against. What is not fair is
// letting the machine's locale decide: on a runner set to English the same
// stands would have gone red without a single line of the office changing.
//
// So it is pinned here rather than in each stand: the harness is what every
// keyboard stand already shares, and a stand that wants the other language calls
// setLang itself, after installDom.
//
// The call is synchronous, and it has to be: a dynamic import would settle a
// tick later, by which time the stand has already rendered its panel in whatever
// language the machine happened to have. Importing i18n.js at the top of this
// file is safe — it reads the device as it loads but writes nothing into
// `document` until setLang is called, which is here, after the document exists.
function standLang() {
  setLang('ru');
}
