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
  else { failed++; console.log('FAIL  |', name, '→', got); }
};

// ------------------------------------------------------------------ the shape
const ids = new Set(LIBRARY.map((n) => n.id));
check('ids are not repeated', ids.size === LIBRARY.length, LIBRARY.length - ids.size);
for (const n of LIBRARY) {
  check(`${n.id}: tier known`, TIERS.includes(n.tier) || n.tier === 'more', n.tier);
  check(`${n.id}: bilingual name`, n.name && n.name.ru && n.name.en, n.name);
  check(`${n.id}: “what gives” in two languages`, n.gives && n.gives.ru && n.gives.en, n.gives);
  if (n.parent) {
    const p = byId(n.parent);
    check(`${n.id}: parent ${n.parent} exists`, !!p, 'нет');
    if (p) check(`${n.id}: grows from the previous column`, colOf(p) < colOf(n), `${colOf(p)} → ${colOf(n)}`);
  }
  if (n.tier !== 'room' && n.tier !== 'more') check(`${n.id}: paid thread grows from something`, !!n.parent, 'корень');
}
for (const c of [0, 1, 2]) {
  const rows = LIBRARY.filter((n) => colOf(n) === c).map((n) => n.row);
  check(`column ${c}: lines are not repeated`, new Set(rows).size === rows.length, rows.join(','));
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const n of LIBRARY.filter((x) => x.module)) {
  const mf = path.join(root, 'modules', n.module, 'module.json');
  // Paid folders are not in the core — they are absent and that is normal; a free one must be there.
  if (!fs.existsSync(mf)) { check(`${n.id}: module ${n.module} is not on disk - acceptable for paid`, n.tier !== 'room', 'бесплатный без папки'); continue; }
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  check(`${n.id}: manifest ${n.module} matches by id`, m.id === n.module, m.id);
  check(`${n.id}: manifest tier agreed (${m.tier})`, (m.tier === 'core') === (n.tier === 'room'), `${m.tier} vs ${n.tier}`);
}
check('“Office” has exactly five modules plus a node about the year', LIBRARY.filter((n) => n.tier === 'office').length === 5 && !!byId('more'), 'нет');

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

// The stand reads the office in Russian, and says so out loud: since 6 September
// 2026 the office comes up in the language of the device, and Node's is `en-US`.
// The checks below compare against Russian captions, and which language they get
// must not depend on the machine they run on.
(await import('../web/i18n.js')).setLang('ru');

const UI = await import('../web/ui.js');
const state = { agents: [], looks: new Map(), settings: {}, delivery: {}, visited: new Set(),
  me: { skin: '#e8ad7e', hair: '#3a2a20', shirt: '#c25a4b', pants: '#3f4a63', boots: '#2a2118',
        style: 0, tall: 0, face: 'none', head: 'none', glasses: false, hands: 'none', name: 'ТЫ' } };
UI.initUI(state, { guideTo: () => {}, saveMe: () => {} });

UI.renderBag('self');
check('number 4 opens the “tree”', UI.bagKey('4') === true, 'не обработана');
check('tab is drawn', /class="tnode/.test(bag.innerHTML), bag.innerHTML.slice(0, 80));
check('By default, the first Office module is selected, which is not present', UI.treeSelected() === 'bible', UI.treeSelected());
check('in the free assembly, not a single “Office” node lights up', !/tnode own[^"]*" data-id="(bible|easel|gittree|feed|dossier)"/.test(bag.innerHTML), 'горит');
check('the whole root burns', (bag.innerHTML.match(/tnode own/g) || []).length === LIBRARY.filter((n) => n.tier === 'room' && !n.module).length, (bag.innerHTML.match(/tnode own/g) || []).length);
UI.bagKey('ArrowDown');
check('down - next in column', UI.treeSelected() === 'easel', UI.treeSelected());
UI.bagKey('ArrowLeft');
// The easel grew out of the board of works together with the git tree, so what
// stands to its left is the board rather than the paintings: one parent with two
// children, and that has to hold.
check('left - to the parent', UI.treeSelected() === 'board', UI.treeSelected());
UI.bagKey('ArrowRight');
check('to the right - to the first child of two', UI.treeSelected() === 'easel', UI.treeSelected());
UI.bagKey('ArrowDown');
check('down the column - second child of the same board', UI.treeSelected() === 'gittree', UI.treeSelected());
check('and on the left it has the same parent', (UI.bagKey('ArrowLeft'), UI.treeSelected()) === 'board', UI.treeSelected());
UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp');
check('up - previous in the column', UI.treeSelected() === 'floor1', UI.treeSelected());
UI.bagKey('ArrowUp');
check('up from the first - in a circle to the last', UI.treeSelected() === 'door', UI.treeSelected());
check('to the right from the entrance - through “Office” to “Floor”', (UI.bagKey('ArrowRight'), UI.treeSelected()) === 'guest', UI.treeSelected());
check('the edge of the tree does not give the shooter to the office', UI.bagKey('ArrowRight') === true && UI.treeSelected() === 'guest', UI.treeSelected());
UI.bagKey('ArrowLeft'); UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp'); UI.bagKey('ArrowUp');
check('went up to the radio', UI.treeSelected() === 'radio', UI.treeSelected());
check('to the right without a child - the closest one in the line (node about the year)', (UI.bagKey('ArrowRight'), UI.treeSelected()) === 'more', UI.treeSelected());
check('left without parent - closest in line (radio)', (UI.bagKey('ArrowLeft'), UI.treeSelected()) === 'radio', UI.treeSelected());
check('Enter is processed and does not break anything', UI.bagKey('Enter') === true && UI.treeSelected() === 'radio', UI.treeSelected());
check('card shows selected', /<b>Радио у входа<\/b>/.test(bag.innerHTML), 'нет');
// --- the detailed view: six directions, one branch at a time ---
// The flat columns stay the default; this one is entered on purpose with V, and
// while it is up the digits belong to it rather than to the inventory tabs.
UI.renderBag('tree');
check('default view is flat', /class="tcols"/.test(bag.innerHTML), 'не плоский');
check('V processed', UI.bagKey('v') === true, 'не обработана');
check('and opened a detailed view', /class="tdirs"/.test(bag.innerHTML) && /id="wtree"/.test(bag.innerHTML), 'не открыла');
// The wrapper carries three classes now — rwrap bagwrap steady wide — so the
// check asks for the one that matters instead of a pair in order.
check('the panel is wider at this time', /class="[^"]*\bwide\b/.test(bag.innerHTML), 'ширина прежняя');
check('and the height of the tree is fixed', /class="[^"]*\bsteady\b/.test(bag.innerHTML), 'не зафиксирована');
// `class="tdir` matches the container too, so the count goes by the attribute.
check('exactly six directions', (bag.innerHTML.match(/data-dir="/g) || []).length === 6,
  (bag.innerHTML.match(/data-dir="/g) || []).length);
check('the tree tab remains selected', /btab on" data-tab="tree"/.test(bag.innerHTML) || /data-tab="tree"/.test(bag.innerHTML), 'нет');

check('the number selects the direction, not the tab', UI.bagKey('5') === true, 'не обработана');
check('and this is DECOR', /tdir on free" data-dir="decor"/.test(bag.innerHTML), 'не он');
check('the tree remains on the screen', /id="wtree"/.test(bag.innerHTML), 'вкладка сменилась');
// A direction with nothing paid in it does not count — it says so in words:
// mood is not for sale.
check('DECOR does not have an account, it is “all yours”', /всё твоё/.test(bag.innerHTML) && /без тарифов/.test(bag.innerHTML), 'считает');
check('and the card moved to the same thread', ['art', 'radio'].includes(UI.treeSelected()), UI.treeSelected());

UI.bagKey('3');
check('third direction - work', /tdir on" data-dir="work"/.test(bag.innerHTML), 'не оно');
const wasWork = UI.treeSelected();
UI.bagKey('ArrowDown');
check('the arrow moves along the branch', UI.treeSelected() !== wasWork, 'стоит на месте');
check('and doesn\'t go out of direction', ['board', 'task', 'easel', 'gittree', 'feed'].includes(UI.treeSelected()), UI.treeSelected());

check('V returns flat view', (UI.bagKey('v'), /class="tcols"/.test(bag.innerHTML)), 'не вернула');
check('and the numbers are about tabs again', (UI.bagKey('2'), /class="bcat"/.test(bag.innerHTML) || !/class="tcols"/.test(bag.innerHTML)), 'вкладка не сменилась');

UI.renderBag('tree');
UI.bagKey('1');
check('the number takes you to another tab', !/class="tnode/.test(bag.innerHTML), 'дерево осталось');
UI.closeBag();
check('closed inventory arrows do not eat', UI.bagKey('ArrowDown') === false, 'съело');

// A guest does not see the tab and does not open it with a digit. Digits count
// the tabs a guest actually sees, so since keys took the last slot the fourth
// one is keys for him and the fifth is nobody's.
state.owner = false;
UI.renderBag('self');
check('guest: there is no “tree” tab', !/data-tab="tree"/.test(bag.innerHTML), 'есть');
check('guest: number 4 leads to the keys, not to the tree',
  UI.bagKey('4') === true && !/class="tnode/.test(bag.innerHTML), 'открылось дерево');
check('guest: there is no fifth tab', UI.bagKey('5') === false, 'открыла');
UI.closeBag();

console.log(failed ? `\nупало: ${failed}` : '\nall passed');
process.exit(failed ? 1 : 0);
