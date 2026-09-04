// Подставной DOM для стендов, которые проверяют панели без браузера.
//
// Копий этой машинки было шесть, и они разъехались: где-то у узла был `focus`,
// где-то нет, где-то `id`, где-то класс первым аргументом. Хуже другое — они
// разъехались по СМЫСЛУ. В карточке `scrollTop` не имел дна, и две проверки
// требовали от него отрицательного значения; в настоящем браузере он
// прижимается к нулю, то есть стенд закреплял состояние, которого не бывает.
// Одна машинка на всех потому и заведена: расхождение в ней — это расхождение
// в том, что стенды считают правдой.
//
// Здесь только то, чего касается код панелей. Это не jsdom и не должен им
// стать: панель, которой понадобится настоящая вёрстка, проверяется глазами и
// tools/shot.mjs, а не подставным деревом на две тысячи строк.

// Канвас: портрет в карточке и человечек в «переодеться» рисуются на нём, и
// стенду достаточно, чтобы вызовы не падали.
export const noopCtx = () => ({
  imageSmoothingEnabled: false, fillStyle: '', font: '', textAlign: '', globalAlpha: 1,
  fillRect() {}, clearRect() {}, strokeRect() {},
  save() {}, restore() {}, scale() {}, translate() {}, rotate() {},
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
  fill() {}, stroke() {}, fillText() {}, drawImage() {},
  measureText: () => ({ width: 0 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
});

const CTX = noopCtx();

/**
 * Узел. `cls` — классы через пробел, `props` — что дописать или переопределить.
 *
 * `scrollTop` с дном на нуле, как в браузере: прокрутка вверх из начала
 * никуда не уводит. `has(c)` — короткий способ спросить про класс в проверке.
 */
export function node(cls = '', props = {}) {
  // Второй аргумент — свойства, а не второй класс. У трёх прежних копий
  // подпись была своя, и перенос стенда на общую машинку падал бы глубоко
  // внутри, на `in`; лучше сказать сразу и по-русски.
  if (typeof props !== 'object' || props === null) {
    throw new TypeError(`node(cls, props): вторым аргументом объект свойств, пришло ${JSON.stringify(props)}`);
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
  // Дно у прокрутки — не придирка: до 4 сентября 2026 две проверки карточки
  // требовали scrollTop < 0, и проходили они только потому, что подставной
  // узел позволял то, чего браузер не позволяет.
  if (!('scrollTop' in props)) {
    Object.defineProperty(n, 'scrollTop', {
      get: () => scroll,
      set: (v) => { scroll = Math.max(0, Number(v) || 0); },
      enumerable: true, configurable: true,
    });
  }
  return n;
}

// Узлу, который красит :root, нужен свой style с методами.
export const withStyle = (n) => Object.assign(n, {
  style: { setProperty: () => {}, removeProperty: () => {}, getPropertyValue: () => '' },
});

/**
 * Обёртка над узлом, который стенд пересобирает между проверками. initUI
 * запоминает узлы один раз, поэтому за ним стоит постоянный объект, а свежий
 * подставной DOM подсовывается уже за ним.
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

// localStorage, который правда помнит: стендам про заметки и внешность нужно
// поведение, а не заглушка.
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
 * Ставит глобальные document, window, localStorage и прочее, чего код панелей
 * касается при импорте.
 *
 * `byId` — что отдавать на `#id`: объект вида { dialog: узелИлиОбёртка }.
 * `find` — свой поиск, если селекторы не сводятся к идентификаторам; вызывается
 * первым, и `null` от него означает «смотри дальше».
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
  if (location) globalThis.location = { origin: 'http://localhost:5177', hash: '', search: '', ...location };
  return { stub, lookup };
}
