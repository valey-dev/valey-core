// node tools/test-title-keys.mjs — клавиши и ходьба на экране входа, без браузера.
// DOM подставной: проверяется не вёрстка, а поведение — куда уходит стрелка,
// что делает ПРОБЕЛ у двери и у переключателя, забирает ли меню фокус, когда к
// нему подойдёшь, возвращает ли ESC из списка комнат и какой ключ комнаты
// уезжает в «войти сразу сюда».

// Узлы делаются из разметки, которую вернул renderTitle: querySelectorAll
// считает вхождения в innerHTML, а data-room вынимается регуляркой. Так стенд
// заодно проверяет, что разметка вообще содержит нужные кнопки и ключи.
function fakeNode(extra = {}) {
  const classes = new Set();
  return {
    dataset: {},
    clicked: 0,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    has: (c) => classes.has(c),
    ...extra,
  };
}

// Панель меню живёт между перерисовками: по ней видно, вешает ли paintFocus
// класс away в тот момент, когда игрок отошёл, — а не только при следующем
// renderTitle. getBoundingClientRect ей намеренно не дан: menuEdge() должен
// уметь ответить и без замера.
const menuNode = fakeNode();

const overlay = {
  hidden: true,
  innerHTML: '',
  style: {},
  querySelectorAll(sel) {
    if (sel === '.tbtn') {
      return (this.innerHTML.match(/class="tbtn/g) || []).map(() => fakeNode());
    }
    if (sel === '.trow') {
      const rooms = [...this.innerHTML.matchAll(/data-room="([^"]*)"/g)].map((m) => m[1]);
      return rooms.map((room) => fakeNode({ dataset: { room } }));
    }
    return [];
  },
  querySelector(sel) {
    if (sel === '#tback') return fakeNode();
    if (sel === '.tmenu') return menuNode;
    return null;
  },
};

const canvas = { getBoundingClientRect: () => ({ left: 40, top: 30, width: 1200, height: 675 }) };
globalThis.document = {
  querySelector: (s) => (s === '#title' ? overlay : null),
  getElementById: (id) => (id === 'game' ? canvas : null),
};

const { initTitle, renderTitle, titleKey, titleOpen, closeTitle, tickTitle } = await import('../web/title.js');

// --- офис из четырёх комнат, как он выглядит в реальном снапшоте ---
const rooms = [
  { key: 'AI valey', title: 'AI valey', agents: ['a1', 'a2', 'a3'] },
  { key: 'budget-app', title: 'budget-app', agents: ['b1', 'b2'] },
  { key: 'shebis', title: 'shebis', agents: ['c1'] },
];
const agents = [
  { id: 'a1', status: 'awaiting' }, { id: 'a2', status: 'working' }, { id: 'a3', status: 'idle' },
  { id: 'b1', status: 'awaiting' }, { id: 'b2', status: 'awaiting' },
  { id: 'c1', status: 'idle' },
];
// Сервисные комнаты лежат в layout.rooms вместе с проектными, но экран входа
// перечисляет только projectRooms: в пультовую пускает карточка, а не меню.
// Она здесь именно затем, чтобы «три комнаты» ниже означало «SECURITY не в
// списке», а не «фикстура короткая».
const service = { key: '__security', title: 'SECURITY', service: true, agents: [] };
const floor = (rs) => ({ rooms: [...rs, service], projectRooms: rs });
const state = { agents, layout: floor(rooms), me: {} };

const calls = { enter: [], bag: 0, sky: 0, lang: 0 };
initTitle(state, {
  enter: (room) => calls.enter.push(room),
  bag: () => { calls.bag += 1; },
  sky: () => { calls.sky += 1; },
  lang: () => { calls.lang += 1; },
});

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};
const focused = (sel) => (sel === '.tbtn'
  ? (overlay.innerHTML.match(/class="tbtn[^"]*focus/g) || []).length
  : (overlay.innerHTML.match(/class="trow[^"]*focus/g) || []).length);

// Ходьба идёт теми же шагами, что и в живом цикле: dt там обрезан тройкой.
// Шагов берётся заведомо больше, чем нужно, — упор в край коридора и есть
// проверка, что дальше игрок не уходит.
const held = new Set();
// Множество зажатых ключуется физическими кодами, как в офисе с 5 сентября
// 2026: символ туда больше не кладут.
const walk = (code, steps) => {
  held.clear(); held.add(code);
  for (let i = 0; i < steps; i++) tickTitle(3, held);
  held.clear(); tickTitle(3, held);
};

// ------------------------------------------------------- пришёл, стоишь у двери
renderTitle();
ok('экран открыт при старте', titleOpen(), titleOpen());
ok('в меню четыре кнопки', overlay.querySelectorAll('.tbtn').length === 4, overlay.querySelectorAll('.tbtn').length);
ok('карточка показывает всех агентов', overlay.innerHTML.includes('6 агентов'), null);
ok('и сколько ждут ответа', overlay.innerHTML.includes('3 ждут ответа'), null);
ok('меню при старте погашено', /class="tmenu away"/.test(overlay.innerHTML), overlay.innerHTML.match(/class="tmenu[^"]*"/));
ok('и фокуса не держит', focused('.tbtn') === 0, overlay.innerHTML.match(/class="tbtn[^"]*"/g));
// Экран входа получает событие целиком, а не символ: с 5 сентября 2026 буквы
// разбирает реестр по физической клавише (web/keymap.js), и стенд обязан слать
// то же, что шлёт браузер. Русская «з» — это KeyP, и проверка ниже про это.
const ev = (key, code) => ({ key, code: code || null });
const NAMED = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', ' ': 'Space' };
const key = (raw, code) => titleKey(ev(raw, code || NAMED[raw] || null));

ok('стрелка вниз издалека проглатывается', key('ArrowDown') === true, null);
ok('но по меню не ходит', focused('.tbtn') === 0, null);

ok('ПРОБЕЛ у двери входит в офис', (key(' '), calls.enter.length === 1 && calls.enter[0] === null), calls.enter);
calls.enter.length = 0;

// ----------------------------------------------------- посреди коридора пусто
walk('ArrowRight', 8);   // ушёл от двери, но до переключателя не дошёл
renderTitle();
ok('в пустом месте коридора меню тоже погашено', /class="tmenu away"/.test(overlay.innerHTML), null);
key(' ');
ok('и ПРОБЕЛ там ничего не делает', calls.enter.length === 0 && calls.lang === 0, [calls.enter, calls.lang]);

// -------------------------------------------------------- подошёл к переключателю
walk('ArrowRight', 80);
key(' ');
ok('ПРОБЕЛ у переключателя меняет язык', calls.lang === 1, calls.lang);
ok('и в офис при этом не входит', calls.enter.length === 0, calls.enter);

// ---------------------------------------------------------------- подошёл к меню
walk('ArrowLeft', 120);
ok('меню зажглось, не дожидаясь перерисовки', !menuNode.has('away'), null);
renderTitle();
ok('и фокус появился на «Войти»', focused('.tbtn') === 1 && /class="tbtn main focus/.test(overlay.innerHTML), overlay.innerHTML.match(/class="tbtn[^"]*"/g));

ok('стрелки забираются экраном', key('ArrowDown') === true, null);
key('ArrowDown');   // idx = 2
key('ArrowUp');     // idx = 1
ok('Enter на «Кто внутри» открывает список', key('Enter') === true, null);
ok('в списке три комнаты', overlay.querySelectorAll('.trow').length === 3, overlay.querySelectorAll('.trow').length);

// ------------------------------------------------------------- комнаты
ok('стрелка вниз идёт по комнатам', key('ArrowDown') === true, null);
key('ArrowDown');   // roomIdx = 2, последняя
key('ArrowDown');   // упирается, а не заворачивается
key('Enter');
ok('Enter входит в выбранную комнату', calls.enter.at(-1) === 'shebis', calls.enter);

key('Escape');
renderTitle();
ok('ESC вернул в меню, а не закрыл экран', titleOpen() && overlay.querySelectorAll('.tbtn').length === 4, overlay.querySelectorAll('.tbtn').length);

// --------------------------------------------------------- прочие клавиши
calls.enter.length = 0;
key('c', 'KeyC');
ok('C зовёт инвентарь', calls.bag === 1, calls.bag);
key('з', 'KeyP');
ok('русская «з» — это P, окно в мир', calls.sky === 1, calls.sky);
key('p', 'KeyP');
ok('и латинская тоже', calls.sky === 2, calls.sky);
ok('влево-вправо забирает экран: это ходьба', key('ArrowLeft') === true, null);
ok('и русская «ф» тоже', key('ф', 'KeyA') === true, null);
ok('а W не занят: вверх-вниз в коридоре не ходят', key('w', 'KeyW') === false, key('w', 'KeyW'));

// ------------------------------------------------------------ пустой офис
state.agents = [];
state.layout = floor([]);
renderTitle();
ok('пустой офис объясняет себя', overlay.innerHTML.includes('пока никого'), null);
ok('и подсказывает, как позвать', overlay.innerHTML.includes('claude'), null);
ok('счётчиков-нулей нет', !overlay.innerHTML.includes('0 агентов'), null);

// ------------------------------------------------- гость по приглашению
// Гостя и отказ рисуют свои ветки menuHtml. 30 августа 2026 они приехали
// другой веткой и разошлись с хозяйской: несли прежнюю разметку «фокус сразу»
// и потеряли строку про стрелки — меню погашено, а чем его зажечь, гостю не
// написано нигде. Обе карточки собраны на общей разметке, стенд её и держит.
state.entry = { from: 'Сергей' };
walk('ArrowRight', 40);
renderTitle();
ok('у гостя меню тоже погашено', /class="tmenu away"/.test(overlay.innerHTML), overlay.innerHTML.match(/class="tmenu[^"]*"/));
ok('и гостю сказано, чем его зажечь', overlay.innerHTML.includes('tmeta center'), null);
state.entry = { refused: 'err.needCode' };
renderTitle();
ok('на отказном входе подсказка тоже есть', overlay.innerHTML.includes('tmeta center'), null);
state.entry = null;
walk('ArrowLeft', 120);

// ------------------------------------------------------------------ вход
state.agents = agents; state.layout = floor(rooms);
renderTitle();
// Выйдя из списка по ESC, фокус остаётся на «Кто внутри» — на том пункте,
// откуда ушёл. Поэтому Enter здесь снова откроет список, а не войдёт в офис.
key('Enter');
ok('после ESC фокус там же, откуда ушёл', overlay.querySelectorAll('.trow').length === 3, overlay.querySelectorAll('.trow').length);
key('Escape');
key('ArrowUp');     // «Кто внутри» → «Войти»
key('Enter');
ok('Enter на «Войти» зовёт вход без комнаты', calls.enter.length === 1 && calls.enter[0] === null, calls.enter);
closeTitle();
ok('после входа экран закрыт', !titleOpen(), titleOpen());
ok('и клавиши больше не забираются', key('ArrowDown') === false, null);
ok('ходьба тоже встала', (walk('ArrowLeft', 10), true), null);
ok('оверлей спрятан', overlay.hidden === true, overlay.hidden);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
