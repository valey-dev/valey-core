// node modules/radio/test-keys.mjs — клавиши приёмника.
//
// Уехал сюда из tools/test-panel-keys.mjs вместе с радио: тест панели живёт
// рядом с панелью, иначе ядро продолжает знать про модуль хотя бы тестом.
// DOM подставной, как и в остальных клавиатурных стендах: проверяется не
// вёрстка, а состояние фокуса — куда он встаёт, как ходит и что нажимает.

import { node, proxy, installDom } from '../../tools/lib/dom.mjs';

let roster = null;
let radioBox = null;
let notes = null;
let dress = null;
let sky = null;
let skin = null;

function makeRoster(n) {
  const gos = Array.from({ length: n }, () => node('go'));
  return {
    hidden: false, innerHTML: '', gos,
    querySelector: (sel) => (sel === '.rbody' ? node('rbody') : null),
    querySelectorAll: (sel) => (sel === '.go' || sel === '[data-go]' ? gos : []),
  };
}

// Порядок такой же, как в разметке панели: ручки, волны, громкость, своя волна.
function makeRadio(waves = 2) {
  const ctl = [
    node('', { id: 'radioprev' }), node('big', { id: 'radiotoggle' }), node('', { id: 'radionext' }),
  ];
  for (let i = 0; i < waves; i++) { ctl.push(node('rst')); ctl.push(node('rdel')); }
  const stations = ctl.filter((c) => c.has('rst'));
  ctl.push(node('', { id: 'radiovol', tagName: 'INPUT', type: 'range', value: '50' }));
  ctl.push(node('', { id: 'radiouri', tagName: 'INPUT', type: 'text' }));
  const classes = new Set(['open']);
  // Стекло над пластинкой ищут по классу, и до дерева гита этот запрос никогда
  // не доходил: probeDrm отвечает через промис, а ждать его в стенде было
  // некому — падение ждало первого же await в файле.
  const glass = node('radioglass');
  return {
    ctl, glass, stations, innerHTML: '',
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    querySelector: (sel) => (sel === '.radioglass' ? glass : null),
    querySelectorAll: (sel) => (sel === '.rst' ? stations : ctl),
  };
}

// Слот одежды — строка с ◀ и ▶ внутри, а не кнопка. Стрелки в стороны должны
// жать эти кнопки, а не перескакивать на соседний слот.
function makeDress(slots) {
  const rows = [];
  const name = node('namerow');
  const input = node('', { tagName: 'INPUT' });
  name.querySelector = (sel) => (sel === 'input' ? input : null);
  name.input = input;
  rows.push(name);
  for (let i = 0; i < slots; i++) {
    const prev = node(), next = node();
    const row = node('drow');
    row.querySelector = (sel) => (sel === '[data-d="-1"]' ? prev : sel === '[data-d="1"]' ? next : null);
    row.prev = prev; row.next = next;
    rows.push(row);
  }
  return {
    hidden: false, innerHTML: '', rows,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.namerow, .drow' ? rows : []),
  };
}

// Плоское кольцо: окно в мир и цвет офиса устроены одинаково.
function makeRing(items) {
  const btns = items.map((it) => node('', it));
  return {
    hidden: false, innerHTML: '', btns,
    querySelector: () => null,
    querySelectorAll: () => btns,
  };
}

function makeNotes(n) {
  const btns = [];
  for (let i = 0; i < n; i++) { btns.push(node('ngo')); btns.push(node('ndel')); }
  return {
    hidden: false, innerHTML: '', btns,
    querySelector: () => null,
    querySelectorAll: (sel) => (
      sel === '.ngo, .ndel' ? btns
      : sel === '[data-go]' ? btns.filter((b) => b.has('ngo'))
      : sel === '[data-del]' ? btns.filter((b) => b.has('ndel'))
      : []),
  };
}

// initUI запоминает узлы один раз, поэтому за ним стоит постоянная обёртка, а
// свежий подставной DOM подсовывается уже за ней
const notesProxy = proxy(() => notes);
const dressProxy = proxy(() => dress);
const skyProxy = proxy(() => sky);
const skinProxy = proxy(() => skin);

const rosterProxy = proxy(() => roster);

const { stub } = installDom({
  byId: { roster: rosterProxy, notes: notesProxy, dress: dressProxy, sky: skyProxy, skin: skinProxy },
  location: {},
});

const CORE = await import('../../web/ui.js');
const UI = await import('./client.js');
const { addDict } = await import('../../web/i18n.js');
const hooks = {};
UI.register({ id: 'radio', on: (n, f) => (hooks[n] = f), i18n: (d) => addDict(d) });

const agents = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, name: 'Агент ' + i, project: 'AI valey', status: 'awaiting',
  title: 'задача', lastSaid: 'ждёт', idleFor: 60, roleKey: 'code',
}));
const state = { agents: [], looks: new Map(), settings: {}, delivery: {}, visited: new Set() };
roster = makeRoster(0);
notes = makeNotes(0);
dress = makeDress(0);
sky = makeRing([]);
skin = makeRing([]);
CORE.initUI(state, { guideTo: () => {} });

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// Кто из кнопок держит фокус — тот же помощник, что и в тесте панелей ядра.
const at = (list) => list.findIndex((b) => b.has('focus'));

// ------------------------------------------------------------------- радио
// el.radio ставится внутри buildRadio, поэтому подсовываем его тем же путём,
// каким его достаёт код панели.
//
// Добавляем к карте, а не затираем её. Затирающий вариант приехал сюда вместе с
// переносом теста и в ядре успел стоить получаса: всё, что идёт ниже, получало
// общую заглушку вместо своих узлов, и «PgUp/PgDn не крутят панель» означало,
// что панелью оказалась заглушка нулевой высоты. Исправлено в main 2 сентября
// 2026, перенесено сюда следом.
const baseQuery = document.querySelector;
document.querySelector = (sel) => (sel === '#radio' ? radioBox : baseQuery(sel));
radioBox = makeRadio(2);
// openRadio по пути трогает живой плеер и DRM браузера — на голом node это
// падает. Но el.radio и класс open проставляются в самом начале, до этого
// места, поэтому разбор клавиш к моменту падения уже рабочий. Ловим и идём
// дальше: проверяем именно клавиши, а не сборку разметки.
try { UI.openRadio(); } catch { /* плеера здесь нет и не должно быть */ }
// Падение случается до конца openRadio, поэтому подсветку кладём тем же вызовом,
// каким её кладёт живая панель на каждую перерисовку.
UI.repaintRadioFocus();

const ctl = radioBox.ctl;
check('радио: фокус встаёт на первую ручку', at(ctl) === 0, at(ctl));
check('стрелка вправо обработана', UI.radioKey('ArrowRight') === true, 'не обработана');
check('и переводит на «включить»', ctl[1].id === 'radiotoggle' && at(ctl) === 1, at(ctl));
UI.radioKey('Enter');
check('Enter нажимает «включить»', ctl[1].clicked === 1, ctl[1].clicked);

// волны и их крестики стоят в том же кольце: удалить волну без мыши тоже надо
UI.radioKey('ArrowRight'); UI.radioKey('ArrowRight');
check('фокус доходит до списка волн', ctl[at(ctl)].has('rst'), at(ctl));

// громкость: в стороны крутится сама, вверх-вниз уводят с неё
const vol = ctl.find((b) => b.id === 'radiovol');
let volSet = 0;
vol.oninput = () => { volSet += 1; };
while (ctl[at(ctl)] !== vol) UI.radioKey('ArrowDown');
UI.radioKey('ArrowRight');
check('на громкости вправо крутит её, а не уводит', ctl[at(ctl)] === vol && Number(vol.value) === 55, `${vol.value}, фокус ${at(ctl)}`);
check('и дёргает обработчик ползунка', volSet === 1, volSet);
UI.radioKey('ArrowLeft'); UI.radioKey('ArrowLeft');
check('влево крутит обратно и не уходит ниже нуля не сразу', Number(vol.value) === 45, vol.value);
UI.radioKey('ArrowDown');
check('вниз с громкости всё-таки уводит', ctl[at(ctl)] !== vol, 'застряли');

// своя волна — поле ввода: Enter должен отдать ему настоящий фокус, а не
// «нажать» его, иначе печатать в него с клавиатуры по-прежнему нельзя
const uri = ctl.find((b) => b.id === 'radiouri');
while (ctl[at(ctl)] !== uri) UI.radioKey('ArrowDown');
UI.radioKey('Enter');
check('Enter на своей волне отдаёт полю фокус', uri.focused === 1, uri.focused);
check('и не жмёт его как кнопку', uri.clicked === 0, uri.clicked);

// закрытая панель клавиши не забирает
UI.closeRadio();
check('закрытое радио стрелки не ест', UI.radioKey('ArrowDown') === false, 'съело');



console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
