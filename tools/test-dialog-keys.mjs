// node tools/test-dialog-keys.mjs — стрелки в карточке агента, без браузера.
// DOM здесь подставной: проверяется не вёрстка, а состояние фокуса — куда
// уходит стрелка вверх, что нажимает Enter и когда фокус со ссылки слетает.

// --- минимальный DOM: ровно то, чего касается код карточки ---
function node(id = '', cls = '') {
  const classes = new Set(cls.split(' ').filter(Boolean));
  return {
    id,
    disabled: false,
    textContent: '',
    scrollTop: 0,
    clicked: 0,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (on ? classes.add(c) : classes.delete(c))),
    },
    has: (c) => classes.has(c),
    click() { this.clicked += 1; },
    scrollIntoView() {},
  };
}

// портрет в карточке рисуется на канвасе — для стенда хватит заглушки
const fakeCtx = {
  imageSmoothingEnabled: false, fillStyle: '',
  fillRect() {}, beginPath() {}, ellipse() {}, fill() {},
  save() {}, translate() {}, scale() {}, restore() {},
};

function makeDialog({ withLink = true, files = 0 } = {}) {
  const state = {
    body: node('', 'body'),
    link: withLink ? node('readAll', 'linky more') : null,
    files: Array.from({ length: files }, () => node('', 'file')),
  };
  state.buttons = ['talk', 'work', 'task', 'close'].map((p) => {
    const b = node('', 'btn-' + p);
    b.dataset = { p };
    return b;
  });
  const pf = Object.assign(node('pf'), { getContext: () => fakeCtx });
  state.dialog = {
    hidden: false,
    innerHTML: '',
    firstChild: {},
    querySelector: (sel) => (sel === '.body' ? state.body
      : sel === '#readAll' ? state.link
      : sel === '#pf' ? pf
      : null),
    // Тело карточки спрашивают одним объединённым селектором: файлы на
    // «Показать работу» и кнопки на записках в «Дать задание» — одно место.
    querySelectorAll: (sel) => (sel === '.acts button' ? state.buttons
      : sel.startsWith('.files li') ? state.files
      : []),
  };
  return state;
}

let current = makeDialog();
const stub = { querySelector: () => null, querySelectorAll: () => [] };

// initUI запоминает узел карточки один раз, поэтому подсовываем ему постоянную
// обёртку, а свежий DOM подставляем уже за ней
const dialogProxy = {
  hidden: false,
  firstChild: {},
  set innerHTML(v) { current.dialog.innerHTML = v; },
  get innerHTML() { return current.dialog.innerHTML; },
  querySelector: (sel) => current.dialog.querySelector(sel),
  querySelectorAll: (sel) => current.dialog.querySelectorAll(sel),
};

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// theme.js на импорте красит :root, поэтому у корня должен быть свой style
const withStyle = (n) => Object.assign(n, { style: { setProperty: () => {}, removeProperty: () => {} } });
globalThis.document = {
  // карточка ищет свои узлы и через document ($('#pf'), $('#readAll')), поэтому
  // сначала заглядываем в неё, а уже потом отдаём пустышку
  querySelector: (sel) => (sel === '#dialog' ? dialogProxy : (current.dialog.querySelector(sel) || stub)),
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

const look = { skin: '#f4c9a0', hair: '#3a2a20', shirt: '#4a7fa8', pants: '#3f4a63', style: 0, acc: 0, beard: false, tall: 0 };
const state = {
  agents: [], looks: new Map([['a1', look]]), page: 'talk', focus: null,
  settings: {}, delivery: {}, me: {}, visited: new Set(),
};
UI.initUI(state, {});

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

// --- 1. свежая карточка с оборванным ответом: вверх ведёт на ссылку ---
current = makeDialog();
UI.closeDialog();
UI.dialogUp();
check('вверх на свежей карточке ставит фокус на ссылку', current.link.has('focus'), 'focus нет');
check('текст при этом не мотается', current.body.scrollTop === 0, current.body.scrollTop);
check('кнопки внизу фокус теряют', !current.buttons.some((b) => b.has('focus')), 'кнопка подсвечена');

// --- 2. Enter нажимает ссылку, а не кнопку ---
UI.pressDialogFocus();
check('Enter нажимает ссылку', current.link.clicked === 1, current.link.clicked);
check('кнопки не нажаты', current.buttons.every((b) => b.clicked === 0), 'кнопка нажалась');

// --- 3. вниз возвращает к тексту ---
UI.dialogDown();
check('вниз снимает фокус со ссылки', !current.link.has('focus'), 'focus остался');
check('и мотает текст вниз', current.body.scrollTop > 0, current.body.scrollTop);

// --- 4. текст промотан: вверх сначала мотает, и только с верха уходит на ссылку ---
current = makeDialog();
UI.closeDialog();
current.body.scrollTop = 200;
UI.dialogUp();
check('промотанный текст: вверх мотает, а не прыгает', !current.link.has('focus') && current.body.scrollTop < 200, current.body.scrollTop);
current.body.scrollTop = 0;
UI.dialogUp();
check('домотал до верха — следующий вверх уводит на ссылку', current.link.has('focus'), 'focus нет');

// --- 5. короткий ответ: ссылки нет, вверх просто мотает ---
current = makeDialog({ withLink: false });
UI.closeDialog();
UI.dialogUp();
check('без ссылки вверх просто мотает', current.body.scrollTop < 0, current.body.scrollTop);
UI.pressDialogFocus();
check('Enter без ссылки нажимает кнопку', current.buttons[0].clicked === 1, current.buttons.map((b) => b.clicked).join(','));

// --- 6. влево-вправо забирают фокус у ссылки ---
current = makeDialog();
UI.closeDialog();
UI.dialogUp();
UI.moveDialogFocus(1);
check('вправо снимает фокус со ссылки', !current.link.has('focus'), 'focus остался');
check('и подсвечивает кнопку', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');

// --- 7. закрытие карточки сбрасывает фокус ---
UI.dialogUp();
UI.closeDialog();
current = makeDialog();
UI.pressDialogFocus();
check('после закрытия Enter не жмёт ссылку', current.link.clicked === 0, current.link.clicked);

// --- 8. обновление карточки не сбивает подсветку со ссылки ---
// именно этим ломалось: ответ дописывается, узел переписывается, класс уходит —
// и фокус после этого не вернуть, потому что в памяти он всё ещё «на ссылке»
const agent = {
  id: 'a1', name: 'Савва', role: 'Разработчик', roleKey: 'code', project: 'AI valey',
  status: 'awaiting', activity: 'ждёт', lastSaid: 'начало ответа', saidLen: 4000,
  files: [], outbox: [],
};
current = makeDialog();
UI.closeDialog();
state.focus = agent;
state.page = 'talk';
UI.renderDialog();                       // первая отрисовка карточки
UI.dialogUp();
check('фокус встал на ссылку в настоящей карточке', current.link.has('focus'), 'focus нет');

current.link = node('readAll', 'linky more');   // ответ дописали, узел переписан
agent.lastSaid = 'начало ответа и продолжение';
UI.renderDialog();
check('после дописывания ответа подсветка на месте', current.link.has('focus'), 'focus слетел');
check('и текст не перенабирается заново', state.typed === state.sayText.length, `${state.typed} из ${state.sayText.length}`);

UI.pressDialogFocus();
check('Enter после обновления всё ещё жмёт ссылку', current.link.clicked === 1, current.link.clicked);

// --- 9. на вкладке без ссылки фокус возвращается на кнопки ---
UI.dialogUp();
current.link = null;                     // «Показать работу» — ссылки на вкладке нет
UI.renderDialog();
check('без ссылки подсветка возвращается на кнопку', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');
current.buttons.forEach((b) => { b.clicked = 0; });
UI.pressDialogFocus();
check('и Enter нажимает кнопку, а не пустоту', current.buttons.some((b) => b.clicked === 1), 'ничего не нажалось');

clearInterval(state.tw);


// --- 9. «Показать работу»: вверх заходит в список файлов ---
// Список был кликабельным и только кликабельным: без мыши работу агента было
// не открыть вообще, хотя все остальные ходы в карточке клавиатурные.
current = makeDialog({ withLink: false, files: 3 });
UI.closeDialog();
UI.dialogUp();
check('вверх заходит в список с последнего файла', current.files[2].has('focus'), current.files.map((f) => f.has('focus')).join(','));
check('кнопки внизу фокус отдают', !current.buttons.some((b) => b.has('focus')), 'кнопка подсвечена');
check('и текст при этом не мотается', current.body.scrollTop === 0, current.body.scrollTop);

// --- 10. дальше вверх — по списку вверх ---
UI.dialogUp();
check('следующий вверх поднимает на строку выше', current.files[1].has('focus'), 'не там');
check('и снимает подсветку с прежней', !current.files[2].has('focus'), 'подсвечены две');

// --- 11. Enter открывает файл, а не кнопку ---
UI.pressDialogFocus();
check('Enter нажимает строку файла', current.files[1].clicked === 1, current.files[1].clicked);
check('кнопки при этом не нажаты', current.buttons.every((b) => b.clicked === 0), 'кнопка нажалась');

// --- 12. с верхней строки вверх мотает, а не выкидывает из списка ---
UI.dialogUp();
check('с первой строки фокус остаётся в списке', current.files[0].has('focus'), 'вылетел');
UI.dialogUp();
check('выше первой строки — мотаем текст', current.files[0].has('focus') && current.body.scrollTop < 0, current.body.scrollTop);

// --- 13. вниз с последней строки возвращает на кнопки ---
current = makeDialog({ withLink: false, files: 2 });
UI.closeDialog();
UI.dialogUp();                       // на последней строке
UI.dialogDown();                     // тупик внизу списка читается как «клавиатура сломалась»
check('вниз с последней строки возвращает на кнопки', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');
check('и в списке никто не подсвечен', !current.files.some((f) => f.has('focus')), 'строка осталась подсвеченной');

// --- 14. влево-вправо выводят из списка ---
current = makeDialog({ withLink: false, files: 2 });
UI.closeDialog();
UI.dialogUp();
UI.moveDialogFocus(1);
check('вправо выводит из списка', !current.files.some((f) => f.has('focus')), 'строка подсвечена');
check('и подсвечивает кнопку', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');

// --- 15. файл под фокусом исчез с живого потока ---
// files приходят из снимка и меняются на ходу; строка под курсором может уехать,
// и фокус тогда обязан вернуться на кнопки, а не висеть на пустоте
current = makeDialog({ withLink: false, files: 3 });
UI.closeDialog();
UI.dialogUp();                       // на третьей строке
current.files = current.files.slice(0, 1);
UI.pressDialogFocus();
check('исчезнувший файл не жмётся', current.files[0].clicked === 0, current.files[0].clicked);
check('и Enter уходит на кнопку', current.buttons.some((b) => b.clicked === 1), current.buttons.map((b) => b.clicked).join(','));


console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
