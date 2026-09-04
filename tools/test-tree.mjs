// node tools/test-tree.mjs — дерево модулей в инвентаре.
//
// Две половины. Первая — состав дерева в web/library.js: у каждого ребра есть
// оба конца, потомок стоит в следующей колонке, строки в колонке не
// повторяются, у всех текстов два языка, а id бесплатного модуля совпадает с
// папкой на диске. Вторая — клавиши: DOM подставной, как во всех клавиатурных
// стендах, проверяется не вёрстка, а куда переезжает выбранный узел.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY, TIERS, byId, colOf } from '../web/library.js';

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// ------------------------------------------------------------------ состав
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
  // Платные папки в ядре не лежат — их нет и это нормально; бесплатная обязана.
  if (!fs.existsSync(mf)) { check(`${n.id}: модуль ${n.module} не на диске — допустимо для платного`, n.tier !== 'room', 'бесплатный без папки'); continue; }
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  check(`${n.id}: манифест ${n.module} совпадает по id`, m.id === n.module, m.id);
  check(`${n.id}: ярус манифеста согласован (${m.tier})`, (m.tier === 'core') === (n.tier === 'room'), `${m.tier} vs ${n.tier}`);
}
check('в «Офисе» ровно пять модулей плюс узел про год', LIBRARY.filter((n) => n.tier === 'office').length === 5 && !!byId('more'), 'нет');

// ------------------------------------------------------------------ клавиши
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
check('влево — к родителю', UI.treeSelected() === 'art', UI.treeSelected());
UI.bagKey('ArrowRight');
check('вправо — к потомку', UI.treeSelected() === 'easel', UI.treeSelected());
UI.bagKey('ArrowLeft'); UI.bagKey('ArrowUp');
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
UI.bagKey('1');
check('цифра уводит на другую вкладку', !/class="tnode/.test(bag.innerHTML), 'дерево осталось');
UI.closeBag();
check('закрытый инвентарь стрелки не ест', UI.bagKey('ArrowDown') === false, 'съело');

// Гость вкладку не видит и цифрой её не открывает.
state.owner = false;
UI.renderBag('self');
check('гость: вкладки «дерево» нет', !/data-tab="tree"/.test(bag.innerHTML), 'есть');
check('гость: цифра 4 мимо', UI.bagKey('4') === false, 'открыла');
UI.closeBag();

console.log(failed ? `\nупало: ${failed}` : '\nвсё прошло');
process.exit(failed ? 1 : 0);
