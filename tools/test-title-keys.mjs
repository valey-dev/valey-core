// node tools/test-title-keys.mjs — keys and walking on the entrance screen, without a browser.
// The DOM is a stand-in: what is checked is not the layout but the behaviour —
// where an arrow goes, what SPACE does at the door and at the switch, whether the
// menu takes the focus when you walk up to it, whether ESC brings you back out of
// the room list, and which room key travels into "enter here straight away".

// The nodes are made out of the markup renderTitle returned: querySelectorAll
// counts occurrences in innerHTML, and data-room is pulled out with a regexp. So
// the stand also checks that the markup contains the needed buttons and keys at all.
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

// The menu panel lives between repaints: it shows whether paintFocus hangs the
// away class at the moment the player has stepped aside — and not only at the
// next renderTitle. It is deliberately given no getBoundingClientRect: menuEdge()
// must be able to answer without a measurement too.
const menuNode = fakeNode();

const overlay = {
  hidden: true,
  innerHTML: '',
  style: {},
  // The overlay wears a class of its own now: layoutTitle marks it ready once
  // the canvas has a real box, and the fade lives on that class. Without a
  // classList here the stand died inside layoutTitle instead of checking keys.
  classList: (() => {
    const set = new Set();
    return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c),
      toggle: (c, on) => (on ? set.add(c) : set.delete(c)), has: (c) => set.has(c) };
  })(),
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
// The entrance prints the office address straight from the browser, so the fake
// page needs one. This stand builds its DOM by hand rather than through the
// shared shim, which means it installs location itself.
globalThis.location = { origin: 'http://localhost:5177', host: 'localhost:5177', hash: '', search: '' };
globalThis.document = {
  querySelector: (s) => (s === '#title' ? overlay : null),
  getElementById: (id) => (id === 'game' ? canvas : null),
  // The page carries its language and its tab title, and setLang writes both.
  // Until 6 September 2026 it wrote them only when the language changed, so a
  // stand already in Russian never reached this line and could do without the
  // two fields.
  documentElement: {}, title: '',
};

// The stand reads the office in Russian, and says so out loud: since 6 September
// 2026 the office comes up in the language of the device, and Node's is `en-US`.
// The checks below compare against Russian captions, and which language they get
// must not depend on the machine they run on.
(await import('../web/i18n.js')).setLang('ru');

const { initTitle, renderTitle, titleKey, titleOpen, closeTitle, tickTitle } = await import('../web/title.js');

// --- an office of four rooms, as it looks in a real snapshot ---
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
// The service rooms lie in layout.rooms together with the project ones, but the
// entrance screen lists only projectRooms: it is the card that lets you into the
// control room, not the menu. It is here precisely so that "three rooms" below
// means "SECURITY is not in the list" rather than "the fixture is short".
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

// The walking goes in the same steps as the live loop: dt there is capped at
// three. Deliberately more steps are taken than needed — running into the end of
// the corridor is itself the check that the player goes no further.
const held = new Set();
// The held set is keyed by physical codes, as in the office since 5 September
// 2026: a character is no longer put into it.
const walk = (code, steps) => {
  held.clear(); held.add(code);
  for (let i = 0; i < steps; i++) tickTitle(3, held);
  held.clear(); tickTitle(3, held);
};

// ------------------------------------------------------- arrived, standing at the door
renderTitle();
ok('экран открыт при старте', titleOpen(), titleOpen());
// The menu is shown only once it stands on the canvas: until 5 September 2026
// it flashed in the middle of the screen and jumped into the corner, because
// the first layout ran against a canvas nobody had measured yet. The stand-in
// canvas has a real box, so the ready class must be on by now.
ok('меню помечено готовым, когда холст измерен', overlay.classList.has('ready'), null);
ok('и раскладка встала по рамке холста', overlay.style.left === '40px' && overlay.style.width === '1200px',
  [overlay.style.left, overlay.style.width]);
ok('в меню четыре кнопки', overlay.querySelectorAll('.tbtn').length === 4, overlay.querySelectorAll('.tbtn').length);
ok('карточка показывает всех агентов', overlay.innerHTML.includes('6 агентов'), null);
ok('и сколько ждут ответа', overlay.innerHTML.includes('3 ждут ответа'), null);
ok('меню при старте погашено', /class="tmenu away"/.test(overlay.innerHTML), overlay.innerHTML.match(/class="tmenu[^"]*"/));
ok('и фокуса не держит', focused('.tbtn') === 0, overlay.innerHTML.match(/class="tbtn[^"]*"/g));
// The entrance screen gets the whole event rather than a character: since
// 5 September 2026 letters are parsed by the registry from the physical key
// (web/keymap.js), and the stand has to send what a browser sends. The Russian
// "з" is KeyP, and the check below is about exactly that.
const ev = (key, code) => ({ key, code: code || null });
const NAMED = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', ' ': 'Space' };
const key = (raw, code) => titleKey(ev(raw, code || NAMED[raw] || null));

ok('стрелка вниз издалека проглатывается', key('ArrowDown') === true, null);
ok('но по меню не ходит', focused('.tbtn') === 0, null);

ok('ПРОБЕЛ у двери входит в офис', (key(' '), calls.enter.length === 1 && calls.enter[0] === null), calls.enter);
calls.enter.length = 0;

// ----------------------------------------------------- the middle of the corridor is empty
walk('ArrowRight', 8);   // left the door, but has not reached the switch
renderTitle();
ok('в пустом месте коридора меню тоже погашено', /class="tmenu away"/.test(overlay.innerHTML), null);
key(' ');
ok('и ПРОБЕЛ там ничего не делает', calls.enter.length === 0 && calls.lang === 0, [calls.enter, calls.lang]);

// -------------------------------------------------------- walked up to the switch
walk('ArrowRight', 80);
key(' ');
ok('ПРОБЕЛ у переключателя меняет язык', calls.lang === 1, calls.lang);
ok('и в офис при этом не входит', calls.enter.length === 0, calls.enter);

// ---------------------------------------------------------------- walked up to the menu
walk('ArrowLeft', 120);
ok('меню зажглось, не дожидаясь перерисовки', !menuNode.has('away'), null);
renderTitle();
ok('и фокус появился на «Войти»', focused('.tbtn') === 1 && /class="tbtn main focus/.test(overlay.innerHTML), overlay.innerHTML.match(/class="tbtn[^"]*"/g));

ok('стрелки забираются экраном', key('ArrowDown') === true, null);
key('ArrowDown');   // idx = 2
key('ArrowUp');     // idx = 1
ok('Enter на «Кто внутри» открывает список', key('Enter') === true, null);
ok('в списке три комнаты', overlay.querySelectorAll('.trow').length === 3, overlay.querySelectorAll('.trow').length);

// ------------------------------------------------------------- the rooms
ok('стрелка вниз идёт по комнатам', key('ArrowDown') === true, null);
key('ArrowDown');   // roomIdx = 2, the last one
key('ArrowDown');   // it stops rather than wrapping around
key('Enter');
ok('Enter входит в выбранную комнату', calls.enter.at(-1) === 'shebis', calls.enter);

key('Escape');
renderTitle();
ok('ESC вернул в меню, а не закрыл экран', titleOpen() && overlay.querySelectorAll('.tbtn').length === 4, overlay.querySelectorAll('.tbtn').length);

// --------------------------------------------------------- the other keys
calls.enter.length = 0;
key('c', 'KeyC');
ok('C зовёт инвентарь', calls.bag === 1, calls.bag);
key('з', 'KeyP');
ok('русская «з» — это P, окно в мир', calls.sky === 1, calls.sky);
key('p', 'KeyP');
ok('и латинская тоже', calls.sky === 2, calls.sky);
ok('влево-вправо забирает экран: это ходьба', key('ArrowLeft') === true, null);
// A is no longer walking: WASD was removed on 5 September 2026, and the entrance
// screen does not take it.
ok('а буква A экраном больше не забирается', key('ф', 'KeyA') === false, key('ф', 'KeyA'));
ok('а W не занят: вверх-вниз в коридоре не ходят', key('w', 'KeyW') === false, key('w', 'KeyW'));

// ------------------------------------------------------------ an empty office
state.agents = [];
state.layout = floor([]);
renderTitle();
ok('пустой офис объясняет себя', overlay.innerHTML.includes('пока никого'), null);
ok('и подсказывает, как позвать', overlay.innerHTML.includes('claude'), null);
ok('счётчиков-нулей нет', !overlay.innerHTML.includes('0 агентов'), null);

// ------------------------------------------------- a guest with an invitation
// The guest and the refusal are drawn by their own branches of menuHtml. On 30
// August 2026 they arrived on another branch and diverged from the owner's: they
// carried the old "focus at once" markup and had lost the line about the arrows —
// the menu is dark, and nowhere does it say what lights it up for a guest. Both
// cards are built on shared markup, and the stand is what holds it there.
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

// ------------------------------------------------------------------ entering
state.agents = agents; state.layout = floor(rooms);
renderTitle();
// Having left the list by ESC, the focus stays on "Who is inside" — on the item
// it left from. So Enter here will open the list again rather than enter the office.
key('Enter');
ok('после ESC фокус там же, откуда ушёл', overlay.querySelectorAll('.trow').length === 3, overlay.querySelectorAll('.trow').length);
key('Escape');
key('ArrowUp');     // "Who is inside" → "Enter"
key('Enter');
ok('Enter на «Войти» зовёт вход без комнаты', calls.enter.length === 1 && calls.enter[0] === null, calls.enter);
closeTitle();
ok('после входа экран закрыт', !titleOpen(), titleOpen());
ok('и клавиши больше не забираются', key('ArrowDown') === false, null);
ok('ходьба тоже встала', (walk('ArrowLeft', 10), true), null);
ok('оверлей спрятан', overlay.hidden === true, overlay.hidden);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
