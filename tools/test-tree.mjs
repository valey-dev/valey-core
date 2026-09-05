// node tools/test-tree.mjs — the module tree in the inventory.
//
// Two halves. The first is the shape of the tree in web/library.js: every edge
// has both ends, a child stands in the next column, rows do not repeat within a
// column, every text has two languages, and a free module's id matches its
// folder on disk. The second is the keys: the DOM is a stand-in, as in every
// keyboard stand, and what is checked is not the layout but where the selected
// node moves to.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY, TIERS, byId, colOf } from '../web/library.js';

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// ------------------------------------------------------------------ the shape
const ids = new Set(LIBRARY.map((n) => n.id));
check('id не повторяются', ids.size === LIBRARY.length, LIBRARY.length - ids.size);
for (const n of LIBRARY) {
  check(`${n.id}: ярус известен`, TIERS.includes(n.tier) || n.tier === 'more', n.tier);
  check(`${n.id}: имя на двух языках`, n.name && n.name.ru && n.name.en, n.name);
  check(`${n.id}: «что даёт» на двух языках`, n.gives && n.gives.ru && n.gives.en, n.gives);
  if (n.parent) {
    const p = byId(n.parent);
    check(`${n.id}: родитель ${n.parent} существует`, !!p, 'нет');
    if (p) check(`${n.id}: растёт из предыдущей колонки`, colOf(p) < colOf(n), `${colOf(p)} → ${colOf(n)}`);
  }
  if (n.tier !== 'room' && n.tier !== 'more') check(`${n.id}: платная ветка растёт из чего-то`, !!n.parent, 'корень');
}
for (const c of [0, 1, 2]) {
  const rows = LIBRARY.filter((n) => colOf(n) === c).map((n) => n.row);
  check(`колонка ${c}: строки не повторяются`, new Set(rows).size === rows.length, rows.join(','));
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const n of LIBRARY.filter((x) => x.module)) {
  const mf = path.join(root, 'modules', n.module, 'module.json');
  // Paid folders are not in the core — they are absent and that is normal; a free one must be there.
  if (!fs.existsSync(mf)) { check(`${n.id}: модуль ${n.module} не на диске — допустимо для платного`, n.tier !== 'room', 'бесплатный без папки'); continue; }
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  check(`${n.id}: манифест ${n.module} совпадает по id`, m.id === n.module, m.id);
  check(`${n.id}: ярус манифеста согласован (${m.tier})`, (m.tier === 'core') === (n.tier === 'room'), `${m.tier} vs ${n.tier}`);
}
check('в «Офисе» ровно пять модулей плюс узел про год', LIBRARY.filter((n) => n.tier === 'office').length === 5 && !!byId('more'), 'нет');

// ------------------------------------------------------------------- the keys
function node(cls = '', props = {}) {
  const classes = new Set(cls.split(' ').filter(Boolean));
  return {
    disabled: false, textContent: '', innerHTML: '', dataset: {}, tagName: 'BUTTON', style: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))) },
    click() {}, focus() {}, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [],
    getContext: () => ({ imageSmoothingEnabled: false, fillStyle: '', fillRect() {}, save() {}, restore() {}, scale() {}, translate() {},
      beginPath() {}, ellipse() {}, fill() {}, fillText() {}, clearRect() {} }),
    ...props,
  };
}
const withStyle = (n) => Object.assign(n, { style: { setProperty: () => {}, removeProperty: () => {} } });
const bag = { hidden: true, innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
const stub = node();
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.location = { origin: 'http://localhost:5177', hash: '', search: '' };
globalThis.document = {
  querySelector: (sel) => (sel === '#bag' ? bag : stub),
  querySelectorAll: () => [], addEventListener: () => {},
  documentElement: withStyle(node()), body: withStyle(node()), createElement: () => withStyle(node()),
};
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
globalThis.addEventListener = () => {};

const UI = await import('../web/ui.js');
const state = { agents: [], looks: new Map(), settings: {}, delivery: {}, visited: new Set(),
  me: { skin: '#e8ad7e', hair: '#3a2a20', shirt: '#c25a4b', pants: '#3f4a63', boots: '#2a2118',
        style: 0, tall: 0, face: 'none', head: 'none', glasses: false, hands: 'none', name: 'ТЫ' } };
UI.initUI(state, { guideTo: () => {}, saveMe: () => {} });

UI.renderBag('self');
check('цифра 4 открывает «дерево»', UI.bagKey('4') === true, 'не обработана');
check('вкладка нарисована', /class="tnode/.test(bag.innerHTML), bag.innerHTML.slice(0, 80));
check('по умолчанию выбран первый модуль «Офиса», которого нет', UI.treeSelected() === 'bible', UI.treeSelected());
check('в бесплатной сборке ни один узел «Офиса» не горит', !/tnode own[^"]*" data-id="(bible|easel|gittree|feed|dossier)"/.test(bag.innerHTML), 'горит');
check('корень горит целиком', (bag.innerHTML.match(/tnode own/g) || []).length === LIBRARY.filter((n) => n.tier === 'room' && !n.module).length, (bag.innerHTML.match(/tnode own/g) || []).length);
UI.bagKey('ArrowDown');
check('вниз — следующий в колонке', UI.treeSelected() === 'easel', UI.treeSelected());
UI.bagKey('ArrowLeft');
// The easel grew out of the board of works together with the git tree, so what
// stands to its left is the board rather than the paintings: one parent with two
// children, and that has to hold.
check('влево — к родителю', UI.treeSelected() === 'board', UI.treeSelected());
UI.bagKey('ArrowRight');
check('вправо — к первому потомку из двух', UI.treeSelected() === 'easel', UI.treeSelected());
UI.bagKey('ArrowDown');
check('вниз по колонке — второй потомок той же доски', UI.treeSelected() === 'gittree', UI.treeSelected());
check('и слева у него тот же родитель', (UI.bagKey('ArrowLeft'), UI.treeSelected()) === 'board', UI.treeSelected());
UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp');
check('вверх — предыдущий в колонке', UI.treeSelected() === 'floor1', UI.treeSelected());
UI.bagKey('ArrowUp');
check('вверх с первого — по кругу на последний', UI.treeSelected() === 'door', UI.treeSelected());
check('вправо со входа — через «Офис» в «Этаж»', (UI.bagKey('ArrowRight'), UI.treeSelected()) === 'guest', UI.treeSelected());
check('край дерева не отдаёт стрелку офису', UI.bagKey('ArrowRight') === true && UI.treeSelected() === 'guest', UI.treeSelected());
UI.bagKey('ArrowLeft'); UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp');
check('поднялись к радио', UI.treeSelected() === 'radio', UI.treeSelected());
check('вправо без потомка — ближайший по строке (узел про год)', (UI.bagKey('ArrowRight'), UI.treeSelected()) === 'more', UI.treeSelected());
check('влево без родителя — ближайший по строке (радио)', (UI.bagKey('ArrowLeft'), UI.treeSelected()) === 'radio', UI.treeSelected());
check('Enter обработан и ничего не ломает', UI.bagKey('Enter') === true && UI.treeSelected() === 'radio', UI.treeSelected());
check('карточка показывает выбранное', /<b>Радио у входа<\/b>/.test(bag.innerHTML), 'нет');
// --- the detailed view: six directions, one branch at a time ---
// The flat columns stay the default; this one is entered on purpose with V, and
// while it is up the digits belong to it rather than to the inventory tabs.
UI.renderBag('tree');
check('по умолчанию вид плоский', /class="tcols"/.test(bag.innerHTML), 'не плоский');
check('V обработана', UI.bagKey('v') === true, 'не обработана');
check('и открыла подробный вид', /class="tdirs"/.test(bag.innerHTML) && /id="wtree"/.test(bag.innerHTML), 'не открыла');
// The wrapper carries three classes now — rwrap bagwrap steady wide — so the
// check asks for the one that matters instead of a pair in order.
check('панель на это время шире', /class="[^"]*\bwide\b/.test(bag.innerHTML), 'ширина прежняя');
check('и высота у дерева зафиксирована', /class="[^"]*\bsteady\b/.test(bag.innerHTML), 'не зафиксирована');
// `class="tdir` matches the container too, so the count goes by the attribute.
check('направлений ровно шесть', (bag.innerHTML.match(/data-dir="/g) || []).length === 6,
  (bag.innerHTML.match(/data-dir="/g) || []).length);
check('вкладка «дерево» осталась выбранной', /btab on" data-tab="tree"/.test(bag.innerHTML) || /data-tab="tree"/.test(bag.innerHTML), 'нет');

check('цифра выбирает направление, а не вкладку', UI.bagKey('5') === true, 'не обработана');
check('и это ДЕКОР', /tdir on free" data-dir="decor"/.test(bag.innerHTML), 'не он');
check('дерево осталось на экране', /id="wtree"/.test(bag.innerHTML), 'вкладка сменилась');
// A direction with nothing paid in it does not count — it says so in words:
// mood is not for sale.
check('у ДЕКОРА нет счёта, есть «всё твоё»', /всё твоё/.test(bag.innerHTML) && /без тарифов/.test(bag.innerHTML), 'считает');
check('и карточка переехала в эту же ветку', ['art', 'radio'].includes(UI.treeSelected()), UI.treeSelected());

UI.bagKey('3');
check('третье направление — работа', /tdir on" data-dir="work"/.test(bag.innerHTML), 'не оно');
const wasWork = UI.treeSelected();
UI.bagKey('ArrowDown');
check('стрелка ходит по ветке', UI.treeSelected() !== wasWork, 'стоит на месте');
check('и не уходит из направления', ['board', 'task', 'easel', 'gittree', 'feed'].includes(UI.treeSelected()), UI.treeSelected());

check('V возвращает плоский вид', (UI.bagKey('v'), /class="tcols"/.test(bag.innerHTML)), 'не вернула');
check('и цифры снова про вкладки', (UI.bagKey('2'), /class="bcat"/.test(bag.innerHTML) || !/class="tcols"/.test(bag.innerHTML)), 'вкладка не сменилась');

UI.renderBag('tree');
UI.bagKey('1');
check('цифра уводит на другую вкладку', !/class="tnode/.test(bag.innerHTML), 'дерево осталось');
UI.closeBag();
check('закрытый инвентарь стрелки не ест', UI.bagKey('ArrowDown') === false, 'съело');

// A guest does not see the tab and does not open it with a digit. Digits count
// the tabs a guest actually sees, so since keys took the last slot the fourth
// one is keys for him and the fifth is nobody's.
state.owner = false;
UI.renderBag('self');
check('гость: вкладки «дерево» нет', !/data-tab="tree"/.test(bag.innerHTML), 'есть');
check('гость: цифра 4 ведёт на ключи, а не на дерево',
  UI.bagKey('4') === true && !/class="tnode/.test(bag.innerHTML), 'открылось дерево');
check('гость: пятой вкладки нет', UI.bagKey('5') === false, 'открыла');
UI.closeBag();

console.log(failed ? `\nупало: ${failed}` : '\nвсё прошло');
process.exit(failed ? 1 : 0);
