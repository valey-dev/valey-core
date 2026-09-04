// node tools/test-escape.mjs — чужой текст в панелях остаётся текстом.
//
// Имена файлов приходят из tool-call агента, названия проектов — из его cwd,
// ветка — из транскрипта, метки места — из геокодера, текст ошибки — с
// сервера. Ревью 3 сентября 2026 нашло с десяток мест, где всё это шло в
// innerHTML как есть или через esc, знавший только `<` и `&`. Стенд кормит
// панели одной и той же враждебной строкой и смотрит, не осталось ли в
// разметке ни тега, ни обработчика. DOM подставной, как в клавиатурных
// стендах: проверяется строка, которую панель положила бы в документ.
import { fileHeaders, fileType } from '../server/files.js';
import { esc } from '../web/esc.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', typeof got === 'string' ? got.slice(0, 200) : JSON.stringify(got)); }
};

// ------------------------------------------------------------- сама функция
ok('esc закрывает все пять символов', esc(`<>&"'`) === '&lt;&gt;&amp;&quot;&#39;', esc(`<>&"'`));
ok('esc переживает undefined и числа', esc(undefined) === '' && esc(0) === '0', [esc(undefined), esc(0)]);

// -------------------------------------------------------- заголовки файлов
ok('html из /api/file — вложение, не страница', fileHeaders('/x/a.html')['content-disposition'] === 'attachment', fileHeaders('/x/a.html'));
ok('svg — тоже: он исполняет скрипты', fileHeaders('/x/a.SVG')['content-disposition'] === 'attachment', fileHeaders('/x/a.SVG'));
ok('png — нет, картинку показывают как есть', !fileHeaders('/x/a.png')['content-disposition'], fileHeaders('/x/a.png'));
ok('nosniff на всём', ['/a.png', '/a.html', '/a.weird'].every((p) => fileHeaders(p)['x-content-type-options'] === 'nosniff'), null);
ok('неизвестное расширение — текст', fileType('/a.weird').startsWith('text/plain'), fileType('/a.weird'));

// --------------------------------------------------------------- панели
// Строка, которая закрывает атрибут в двойных кавычках, открывает тег и вешает
// обработчик — всё, что панель могла бы выполнить.
const EVIL = `"><img src=x onerror=alert(1)><script>alert(2)</script>'`;
// Смотрим на настоящие теги, а не на подстроки: экранированный текст всё ещё
// содержит буквы «onerror=», и первая версия этой проверки ловила саму себя.
// Тег — то, что начинается с неэкранированного «<»; в нём не должно быть ни
// script, ни обработчика on*=. Своя картинка на доске — тег законный.
// Значения атрибутов в кавычках вырезаются до проверки: экранированный текст
// внутри title="…" тоже содержит «onerror=», но закрыть кавычку он не может —
// в этом и смысл экранирования. Обработчик считается настоящим, только если
// стоит в теге вне кавычек.
const tags = (html) => html.match(/<[a-zA-Z][^>]*>/g) || [];
const bare = (t) => t.replace(/"[^"]*"|'[^']*'/g, '""');
const clean = (html) => !tags(html).some((t) => /^<script\b/i.test(t) || /\son\w+\s*=/i.test(bare(t)))
  && /&lt;script/.test(html);

function node(props = {}) {
  const classes = new Set();
  return {
    hidden: false, innerHTML: '', textContent: '', disabled: false, scrollTop: 0, dataset: {}, style: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: () => {} },
    click() {}, focus() {}, scrollIntoView() {},
    querySelector: () => null, querySelectorAll: () => [],
    getContext: () => fakeCtx,
    ...props,
  };
}
const fakeCtx = {
  imageSmoothingEnabled: false, fillStyle: '',
  fillRect() {}, save() {}, restore() {}, scale() {}, translate() {},
  beginPath() {}, ellipse() {}, fill() {}, fillText() {}, clearRect() {},
};
const panels = {};
for (const id of ['hud', 'dialog', 'viewer', 'roster', 'bag', 'toasts', 'sky', 'skin', 'lift', 'invite', 'notes']) panels[id] = node();
const stub = node();
const withStyle = (n) => Object.assign(n, { style: { setProperty: () => {}, removeProperty: () => {} } });
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.location = { origin: 'http://localhost:5177', hash: '', search: '' };
globalThis.document = {
  querySelector: (sel) => (sel.startsWith('#') && panels[sel.slice(1)]) || stub,
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

const look = { skin: '#e8ad7e', hair: '#3a2a20', shirt: '#c25a4b', pants: '#3f4a63', boots: '#2a2118',
  style: 0, tall: 0, face: 'none', head: 'none', glasses: false, hands: 'none', name: 'ТЫ' };
const agent = {
  id: 'a1', name: EVIL, project: EVIL, branch: EVIL, title: EVIL, roleKey: EVIL, status: 'awaiting',
  lastSaid: EVIL, idleFor: 60, saidLen: 4, activity: EVIL, act: { key: 'edit', arg: EVIL },
  files: [{ path: '/tmp/' + EVIL, name: EVIL, image: false }],
  outbox: [{ id: 1, agentId: 'a1', at: 0, state: 'failed', text: EVIL, error: EVIL, blocked: true, reply: EVIL }],
};
const S = {
  agents: [agent], looks: new Map([['a1', look]]), settings: { weather: { enabled: false, label: EVIL }, delivery: { mode: 'default' } },
  delivery: { available: false, hint: EVIL }, visited: new Set(), me: look,
  currentRoom: { title: EVIL }, weather: { kind: 'clear', label: EVIL, source: EVIL, temp: 20 },
  zoom: { dev: 1, auto: true }, soundOn: false, access: {}, owner: true,
  focus: agent, page: 'talk', notice: EVIL,
};
UI.initUI(S, { guideTo: () => {}, saveMe: () => {}, geocode: async () => ({ results: [] }), saveSettings: async () => ({}) });

UI.renderHud();
ok('HUD: комната и место — текст', clean(panels.hud.innerHTML), panels.hud.innerHTML);

UI.renderDialog();
ok('карточка, «поговорить»: имя, проект, ветка, роль — текст', clean(panels.dialog.innerHTML), panels.dialog.innerHTML);
S.page = 'work'; UI.renderDialog();
ok('карточка, «показать работу»: имя файла — текст', clean(panels.dialog.innerHTML), panels.dialog.innerHTML);
S.page = 'task'; UI.renderDialog();
ok('карточка, «дать задание»: записка, ответ, ошибка, подсказка — текст', clean(panels.dialog.innerHTML), panels.dialog.innerHTML);

UI.renderRoster();
ok('обход: комната и имя — текст', clean(panels.roster.innerHTML), panels.roster.innerHTML);

UI.renderSky([{ lat: 1, lon: 2, label: EVIL, detail: EVIL }]);
ok('окно в мир: место и результаты геокодера — текст', clean(panels.sky.innerHTML), panels.sky.innerHTML);

UI.openGallery([{ path: '/tmp/' + EVIL, name: EVIL, image: true, agent: { name: EVIL, project: EVIL } }], EVIL);
ok('доска: подписи — текст', clean(panels.viewer.innerHTML), panels.viewer.innerHTML);
ok('доска: у картинки нет встроенного onerror — обработчик вешается кодом',
  !tags(panels.viewer.innerHTML).some((t) => /onerror/i.test(bare(t))), panels.viewer.innerHTML);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
