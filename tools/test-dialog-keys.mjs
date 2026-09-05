// node tools/test-dialog-keys.mjs — the arrows in an agent's card, without a browser.
// The DOM here is a stand-in: what is checked is not the layout but the focus
// state — where the up arrow goes, what Enter presses and when the focus falls
// off the link.

// The DOM is a stand-in, shared with the other stands: tools/lib/dom.mjs.
import { node, proxy, installDom } from './lib/dom.mjs';

function makeDialog({ withLink = true, files = 0 } = {}) {
  const state = {
    say: node('say', { id: 'say' }),
    body: node('body'),
    link: withLink ? node('linky more', { id: 'readAll' }) : null,
    files: Array.from({ length: files }, () => node('file')),
  };
  state.buttons = ['talk', 'work', 'task', 'close'].map((p) => {
    const b = node('btn-' + p);
    b.dataset = { p };
    return b;
  });
  const pf = node('', { id: 'pf' });
  state.dialog = {
    hidden: false,
    innerHTML: '',
    firstChild: {},
    querySelector: (sel) => (sel === '.body' ? state.body
      : sel === '#say' ? state.say
      : sel === '#readAll' ? state.link
      : sel === '#pf' ? pf
      : null),
    // The body of the card is asked for with one combined selector: the files on
    // "show the work" and the buttons on the notes in "give a task" — one place.
    querySelectorAll: (sel) => (sel === '.acts button' ? state.buttons
      : sel.startsWith('.files li') ? state.files
      : []),
  };
  return state;
}

let current = makeDialog();

// initUI remembers the card's node once, so we slip it a permanent wrapper and
// put the fresh DOM behind it
const dialogProxy = Object.assign(proxy(() => current.dialog), { firstChild: {} });

// The card looks for its nodes through document as well ($('#pf'), $('#readAll')),
// so the lookup peeks into it first and only then hands out the stub.
installDom({
  byId: { dialog: dialogProxy },
  find: (sel) => (sel === '#dialog' ? dialogProxy : current.dialog.querySelector(sel)),
});

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

// --- 1. a fresh card with a reply still coming in: up leads to the link ---
current = makeDialog();
UI.closeDialog();
UI.dialogUp();
check('вверх на свежей карточке ставит фокус на ссылку', current.link.has('focus'), 'focus нет');
check('текст при этом не мотается', current.body.scrollTop === 0, current.body.scrollTop);
check('кнопки внизу фокус теряют', !current.buttons.some((b) => b.has('focus')), 'кнопка подсвечена');

// --- 2. Enter presses the link, not the button ---
UI.pressDialogFocus();
check('Enter нажимает ссылку', current.link.clicked === 1, current.link.clicked);
check('кнопки не нажаты', current.buttons.every((b) => b.clicked === 0), 'кнопка нажалась');

// --- 3. down returns to the text ---
UI.dialogDown();
check('вниз снимает фокус со ссылки', !current.link.has('focus'), 'focus остался');
check('и мотает текст вниз', current.body.scrollTop > 0, current.body.scrollTop);

// --- 4. the text is scrolled: up scrolls first, and only from the top leaves for the link ---
current = makeDialog();
UI.closeDialog();
current.body.scrollTop = 200;
UI.dialogUp();
check('промотанный текст: вверх мотает, а не прыгает', !current.link.has('focus') && current.body.scrollTop < 200, current.body.scrollTop);
current.body.scrollTop = 0;
UI.dialogUp();
check('домотал до верха — следующий вверх уводит на ссылку', current.link.has('focus'), 'focus нет');

// --- 5. a short reply: there is no link, up just scrolls ---
current = makeDialog({ withLink: false });
UI.closeDialog();
current.body.scrollTop = 200;
UI.dialogUp();
// There used to be scrollTop < 0 here. In a browser the scroll is pinned at
// zero, and the check passed only because the stand-in node allowed it: it was
// pinning a state that cannot occur. We scroll from a scrolled position.
check('без ссылки вверх просто мотает', current.body.scrollTop < 200, current.body.scrollTop);
UI.pressDialogFocus();
check('Enter без ссылки нажимает кнопку', current.buttons[0].clicked === 1, current.buttons.map((b) => b.clicked).join(','));

// --- 6. left and right take the focus away from the link ---
current = makeDialog();
UI.closeDialog();
UI.dialogUp();
UI.moveDialogFocus(1);
check('вправо снимает фокус со ссылки', !current.link.has('focus'), 'focus остался');
check('и подсвечивает кнопку', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');

// --- 7. closing the card resets the focus ---
UI.dialogUp();
UI.closeDialog();
current = makeDialog();
UI.pressDialogFocus();
check('после закрытия Enter не жмёт ссылку', current.link.clicked === 0, current.link.clicked);

// --- 8. an update to the card does not knock the highlight off the link ---
// this is exactly what used to break: the reply grows, the node is rewritten, the
// class goes — and after that the focus cannot be brought back, because in memory
// it is still "on the link"
const agent = {
  id: 'a1', name: 'Савва', role: 'Разработчик', roleKey: 'code', project: 'AI valey',
  status: 'awaiting', activity: 'ждёт', lastSaid: 'начало ответа', saidLen: 4000,
  files: [], outbox: [],
};
current = makeDialog();
UI.closeDialog();
state.focus = agent;
state.page = 'talk';
UI.renderDialog();                       // the first paint of the card
UI.dialogUp();
check('фокус встал на ссылку в настоящей карточке', current.link.has('focus'), 'focus нет');

current.link = node('linky more', { id: 'readAll' });   // the reply finished, the node rewritten
agent.lastSaid = 'начало ответа и продолжение';
UI.renderDialog();
check('после дописывания ответа подсветка на месте', current.link.has('focus'), 'focus слетел');
check('и текст не перенабирается заново', state.typed === state.sayText.length, `${state.typed} из ${state.sayText.length}`);

UI.pressDialogFocus();
check('Enter после обновления всё ещё жмёт ссылку', current.link.clicked === 1, current.link.clicked);

// --- 9. on a tab with no link the focus returns to the buttons ---
UI.dialogUp();
current.link = null;                     // "show the work" — there is no link on the tab
UI.renderDialog();
check('без ссылки подсветка возвращается на кнопку', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');
current.buttons.forEach((b) => { b.clicked = 0; });
UI.pressDialogFocus();
check('и Enter нажимает кнопку, а не пустоту', current.buttons.some((b) => b.clicked === 1), 'ничего не нажалось');

clearInterval(state.tw);


// --- 9. "show the work": up enters the list of files ---
// The list was clickable and only clickable: without a mouse an agent's work
// could not be opened at all, though every other move in the card is by keyboard.
current = makeDialog({ withLink: false, files: 3 });
UI.closeDialog();
UI.dialogUp();
check('вверх заходит в список с последнего файла', current.files[2].has('focus'), current.files.map((f) => f.has('focus')).join(','));
check('кнопки внизу фокус отдают', !current.buttons.some((b) => b.has('focus')), 'кнопка подсвечена');
check('и текст при этом не мотается', current.body.scrollTop === 0, current.body.scrollTop);

// --- 10. further up — up the list ---
UI.dialogUp();
check('следующий вверх поднимает на строку выше', current.files[1].has('focus'), 'не там');
check('и снимает подсветку с прежней', !current.files[2].has('focus'), 'подсвечены две');

// --- 11. Enter opens the file, not the button ---
UI.pressDialogFocus();
check('Enter нажимает строку файла', current.files[1].clicked === 1, current.files[1].clicked);
check('кнопки при этом не нажаты', current.buttons.every((b) => b.clicked === 0), 'кнопка нажалась');

// --- 12. from the top row up scrolls rather than throwing you out of the list ---
UI.dialogUp();
check('с первой строки фокус остаётся в списке', current.files[0].has('focus'), 'вылетел');
current.body.scrollTop = 200;
UI.dialogUp();
check('выше первой строки — мотаем текст, а фокус остаётся на строке',
  current.files[0].has('focus') && current.body.scrollTop < 200, current.body.scrollTop);

// --- 13. down from the last row returns to the buttons ---
current = makeDialog({ withLink: false, files: 2 });
UI.closeDialog();
UI.dialogUp();                       // on the last row
UI.dialogDown();                     // a dead end at the bottom of the list reads as "the keyboard is broken"
check('вниз с последней строки возвращает на кнопки', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');
check('и в списке никто не подсвечен', !current.files.some((f) => f.has('focus')), 'строка осталась подсвеченной');

// --- 14. left and right lead out of the list ---
current = makeDialog({ withLink: false, files: 2 });
UI.closeDialog();
UI.dialogUp();
UI.moveDialogFocus(1);
check('вправо выводит из списка', !current.files.some((f) => f.has('focus')), 'строка подсвечена');
check('и подсвечивает кнопку', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');

// --- 15. the focused file disappeared from the live stream ---
// files come from the snapshot and change on the fly; the row under the cursor
// can leave, and the focus then has to return to the buttons rather than hang
// over nothing
current = makeDialog({ withLink: false, files: 3 });
UI.closeDialog();
UI.dialogUp();                       // on the third row
current.files = current.files.slice(0, 1);
UI.pressDialogFocus();
check('исчезнувший файл не жмётся', current.files[0].clicked === 0, current.files[0].clicked);
check('и Enter уходит на кнопку', current.buttons.some((b) => b.clicked === 1), current.buttons.map((b) => b.clicked).join(','));

// --- 16. a digit switches the tab of the card ---
// The same key as in the bag: 1 "doing now", 2 "show the work", 3 "give a task".
// "Close" gets no number — it has Esc.
current = makeDialog();
state.dialogOpen = true;
check('цифра 2 обработана карточкой', UI.dialogNumber('2') === true, 'не обработана');
check('и нажала «показать работу»', current.buttons[1].clicked === 1, current.buttons[1].clicked);
check('соседние вкладки не тронуты',
  current.buttons[0].clicked === 0 && current.buttons[2].clicked === 0, 'тронуты');
check('«закрыть» цифрой не нажимается', UI.dialogNumber('4') === false, 'нажимается');
check('и кнопка закрытия цела', current.buttons[3].clicked === 0, current.buttons[3].clicked);
state.dialogOpen = false;
check('при закрытой карточке цифра уходит в офис', UI.dialogNumber('1') === false, 'осталась');

// --- 16. while a line is being typed out, Enter finishes it rather than pressing a button ---
// with a mouse this was a click on the text itself; there was no key, and the
// typewriter had to be waited out in silence
current = makeDialog({ withLink: false });
UI.closeDialog();
state.page = 'talk';
state.sayText = 'длинная реплика агента';
state.typed = 4;
UI.pressDialogFocus();
check('Enter на печатающейся реплике дописывает её', state.typed === state.sayText.length, `${state.typed} из ${state.sayText.length}`);
check('и не нажимает кнопку под фокусом', current.buttons.every((b) => b.clicked === 0), current.buttons.map((b) => b.clicked).join(','));

// --- 17. a finished line no longer intercepts the key ---
UI.pressDialogFocus();
check('следующий Enter уже нажимает кнопку', current.buttons.some((b) => b.clicked === 1), current.buttons.map((b) => b.clicked).join(','));

// --- 18. the typewriter does not take Enter from someone who has gone up ---
// The path that broke on 3 September 2026: open the dialog, move up onto the
// transcript link with the arrow, press Enter — and instead of the transcript the
// line finished typing. Reading agents in the full-screen transcript cost two
// presses, the first of which looked like "it did nothing".
current = makeDialog({ withLink: true });
UI.closeDialog();
state.page = 'talk';
state.sayText = 'длинная реплика агента';
state.typed = 4;
UI.dialogUp();
check('вверх на блок транскрипта дописывает реплику разом',
  state.typed === state.sayText.length, `${state.typed} из ${state.sayText.length}`);
check('и фокус остаётся на блоке, а не уходит обратно к кнопкам',
  current.link.has('focus') && current.buttons.every((b) => !b.has('focus')),
  `ссылка: ${current.link.has('focus')}`);
UI.pressDialogFocus();
check('Enter на ссылке транскрипта открывает её с первого раза',
  current.link.clicked === 1, `нажатий: ${current.link.clicked}`);

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
