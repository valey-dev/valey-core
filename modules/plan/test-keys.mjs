// node modules/plan/test-keys.mjs — клавиши плана офиса.
//
// Проверяется не вёрстка, а фокус: на какой комнате он встаёт при открытии,
// куда ходит стрелками по сетке и кого выбирает Enter. Планировка настоящая,
// из buildLayout: ходьба по плану — это ходьба по её геометрии, и подставная
// сетка проверяла бы стенд, а не модуль.
//
// DOM общий, из tools/lib/dom.mjs. Своя машинка здесь была, и прожила ровно до
// первого слияния с main: там шесть копий уже свели в одну, и седьмая, приехав
// из ветки, вернула бы ту же беду — стенды расходятся не подписью узла, а тем,
// что считают правдой. Местного тут осталось только то, чего общий шим не
// знает и знать не должен: холст плана и полотно, на которое он кладёт кнопки
// комнат.
import { node, installDom } from '../../tools/lib/dom.mjs';

// Полотно карты. Кнопки комнат живут поверх холста, и модуль их пересобирает
// на каждую смену планировки — значит appendChild должен правда складывать, а
// remove у сложенного правда убирать. Общий узел этого не умеет и не обязан:
// это единственное место в офисе, где список детей имеет значение.
function makeMap() {
  const cells = [];
  return node('planmap', {
    id: 'planmap',
    appendChild(b) {
      b.remove = () => { const i = cells.indexOf(b); if (i >= 0) cells.splice(i, 1); };
      cells.push(b);
      return b;
    },
    querySelectorAll: (sel) => (sel === '.plancell' ? cells.slice() : []),
    cells,
  });
}

const map = makeMap();
const canvas = node('', { id: 'plancanvas', tagName: 'CANVAS' });
const detail = node('plandetail', { id: 'plandetail' });
const count = node('', { id: 'plancount', tagName: 'I' });
// Тосты ядра: toast() считает детей, поэтому список должен существовать.
const toasts = node('', { id: 'toasts', children: [], appendChild() {} });

installDom({
  byId: {
    planmap: map, plancanvas: canvas, plandetail: detail, plancount: count,
    planx: node('', { id: 'planx' }), plango: node('plango', { id: 'plango' }),
    toasts,
  },
});

const { buildLayout } = await import('../../web/layout.js');
const { addDict } = await import('../../web/i18n.js');
const { define: defineKeys, reset: resetKeys, actionOf } = await import('../../web/keymap.js');
const CORE = await import('../../web/ui.js');
const P = await import('./client.js');

const hooks = {};
// Подставной api повторяет настоящий загрузчик: точка `keys` объявляет клавиши
// модуля в общем реестре, приписывая его id спереди.
resetKeys();
P.register({
  id: 'plan',
  on: (n, f) => (hooks[n] = f),
  i18n: (d) => addDict(d),
  keys: (list) => defineKeys([].concat(list).map((a) => ({ ...a, id: `plan.${a.id}` }))),
});

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
// Клавиша объявлена в реестре, а не зашита в обработчике: буквы модуль больше
// не сравнивает, и русская «Л» — это та же физическая KeyK, что проверено в
// tools/test-keymap.mjs.
check('модуль объявил свою клавишу в реестре', actionOf({ code: 'KeyK' }) === 'plan.toggle', actionOf({ code: 'KeyK' }));
check('закрытый план стрелки не ест', P.planKey('ArrowDown') === false, 'съел');
check('чужое действие модуль не берёт', hooks.action('radio.toggle') === false, 'взял');
check('действие открывает план', hooks.action('plan.toggle') === true && P.planOpen(), P.planOpen());
check('и он держит экран', hooks.busy() === true, hooks.busy());
check('фокус встаёт на ближайшую дверь — первую комнату', P.planFocus() === r0.key, P.planFocus());
check('на каждую комнату положена своя кнопка', map.cells.length === L.rooms.length, `${map.cells.length} на ${L.rooms.length}`);

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
hooks.action('plan.toggle');
check('и оно же открывает снова', P.planOpen(), P.planOpen());
check('и фокус снова у своей двери', P.planFocus() === r0.key, P.planFocus());
P.planKey('Enter');
check('Enter ведёт к тому, кто ждёт, а не к первому за столом', state.waypoint === 'a1', state.waypoint);
check('и закрывает план', !P.planOpen(), P.planOpen());

// Комната без людей: стрелке не к кому вести, план остаётся открытым.
state.waypoint = null;
hooks.action('plan.toggle');
P.planKey('ArrowDown'); P.planKey('ArrowDown');
const empty = P.planFocus();
P.planKey('Enter');
check('в пустую комнату не ведёт', state.waypoint === null && P.planOpen(), [empty, state.waypoint]);
hooks.esc();

// Экран входа: под ним плана нет, там ещё нечему быть «здесь».
document.body.classList.add('titling');
check('на экране входа план не открывается', hooks.action('plan.toggle') === false && !P.planOpen(), P.planOpen());
document.body.classList.remove('titling');

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
