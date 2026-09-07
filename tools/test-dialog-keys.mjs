// node tools/test-dialog-keys.mjs — the arrows in an agent's card, without a browser.
// The DOM here is a stand-in: what is checked is not the layout but the focus
// state — where the up arrow goes, what Enter presses and when the focus falls
// off the link.

// The DOM is a stand-in, shared with the other stands: tools/lib/dom.mjs.
import { node, proxy, installDom } from './lib/dom.mjs';

function makeDialog({ withLink = true, files = 0, ask = false, opts = 0 } = {}) {
  const state = {
    say: node('say', { id: 'say' }),
    body: node('body'),
    link: withLink ? node('linky more', { id: 'readAll' }) : null,
    files: Array.from({ length: files }, () => node('file')),
    // The guest's card has no files and no transcript link — the only thing in
    // its body is the button asking the owner for access.
    ask: ask ? node('askbtn', { id: 'askAccess' }) : null,
    // The options of a question: the answer itself, so the arrows have to reach
    // them the way they reach the files and the buttons on a note.
    opts: Array.from({ length: opts }, () => node('qopt')),
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
      // The selector is honoured, not merely recognised: the ask button comes
      // back only if the walk actually asks for it. A stand-in that hands it
      // over regardless would pass on the very code that forgot it.
      : sel.startsWith('.files li')
        ? state.files
          .concat(state.ask && sel.includes('#askAccess') ? [state.ask] : [])
          .concat(sel.includes('.qopt') ? state.opts : [])
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
  else { failed++; console.log('FAIL  |', name, '→', got); }
};

// --- 1. a fresh card with a reply still coming in: up leads to the link ---
current = makeDialog();
UI.closeDialog();
UI.dialogUp();
check('up on a fresh card puts focus on the link', current.link.has('focus'), 'focus нет');
check('the text doesn\'t move around', current.body.scrollTop === 0, current.body.scrollTop);
check('the buttons at the bottom lose focus', !current.buttons.some((b) => b.has('focus')), 'кнопка подсвечена');

// --- 2. Enter presses the link, not the button ---
UI.pressDialogFocus();
check('Enter clicks the link', current.link.clicked === 1, current.link.clicked);
check('no buttons pressed', current.buttons.every((b) => b.clicked === 0), 'кнопка нажалась');

// --- 3. down returns to the text ---
UI.dialogDown();
check('down removes focus from the link', !current.link.has('focus'), 'focus остался');
check('and scrolls the text down', current.body.scrollTop > 0, current.body.scrollTop);

// --- 4. the text is scrolled: up scrolls first, and only from the top leaves for the link ---
current = makeDialog();
UI.closeDialog();
current.body.scrollTop = 200;
UI.dialogUp();
check('scrolled text moves up before focus jumps to the link', !current.link.has('focus') && current.body.scrollTop < 200, current.body.scrollTop);
current.body.scrollTop = 0;
UI.dialogUp();
check('scrolled to the top - the next one up takes you to a link', current.link.has('focus'), 'focus нет');

// --- 5. a short reply: there is no link, up just scrolls ---
current = makeDialog({ withLink: false });
UI.closeDialog();
current.body.scrollTop = 200;
UI.dialogUp();
// There used to be scrollTop < 0 here. In a browser the scroll is pinned at
// zero, and the check passed only because the stand-in node allowed it: it was
// pinning a state that cannot occur. We scroll from a scrolled position.
check('without a link, Up only scrolls', current.body.scrollTop < 200, current.body.scrollTop);
UI.pressDialogFocus();
check('Enter without link clicks button', current.buttons[0].clicked === 1, current.buttons.map((b) => b.clicked).join(','));

// --- 6. left and right take the focus away from the link ---
current = makeDialog();
UI.closeDialog();
UI.dialogUp();
UI.moveDialogFocus(1);
check('right removes focus from the link', !current.link.has('focus'), 'focus остался');
check('and lights up the button', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');

// --- 7. closing the card resets the focus ---
UI.dialogUp();
UI.closeDialog();
current = makeDialog();
UI.pressDialogFocus();
check('after closing Enter does not click the link', current.link.clicked === 0, current.link.clicked);

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
check('the focus was on the link in the real card', current.link.has('focus'), 'focus нет');

current.link = node('linky more', { id: 'readAll' });   // the reply finished, the node rewritten
agent.lastSaid = 'начало ответа и продолжение';
UI.renderDialog();
check('after completing the answer, the backlight is in place', current.link.has('focus'), 'focus слетел');
check('and the text is not retyped', state.typed === state.sayText.length, `${state.typed} из ${state.sayText.length}`);

UI.pressDialogFocus();
check('Enter still clicks the link after the update', current.link.clicked === 1, current.link.clicked);

// --- 9. on a tab with no link the focus returns to the buttons ---
UI.dialogUp();
current.link = null;                     // "show the work" — there is no link on the tab
UI.renderDialog();
check('without a link, the backlight returns to the button', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');
current.buttons.forEach((b) => { b.clicked = 0; });
UI.pressDialogFocus();
check('and Enter presses the button, not the void', current.buttons.some((b) => b.clicked === 1), 'ничего не нажалось');

clearInterval(state.tw);


// --- 9. "show the work": up enters the list of files ---
// The list was clickable and only clickable: without a mouse an agent's work
// could not be opened at all, though every other move in the card is by keyboard.
current = makeDialog({ withLink: false, files: 3 });
UI.closeDialog();
UI.dialogUp();
check('goes up in the list from the last file', current.files[2].has('focus'), current.files.map((f) => f.has('focus')).join(','));
check('the buttons below give focus', !current.buttons.some((b) => b.has('focus')), 'кнопка подсвечена');
check('and the text doesn’t move around', current.body.scrollTop === 0, current.body.scrollTop);

// --- 10. further up — up the list ---
UI.dialogUp();
check('next up moves one line higher', current.files[1].has('focus'), 'не там');
check('and removes the backlight from the previous one', !current.files[2].has('focus'), 'подсвечены две');

// --- 11. Enter opens the file, not the button ---
UI.pressDialogFocus();
check('Enter presses file line', current.files[1].clicked === 1, current.files[1].clicked);
check('the buttons are not pressed', current.buttons.every((b) => b.clicked === 0), 'кнопка нажалась');

// --- 12. from the top row up scrolls rather than throwing you out of the list ---
UI.dialogUp();
check('from the first line the focus remains in the list', current.files[0].has('focus'), 'вылетел');
current.body.scrollTop = 200;
UI.dialogUp();
check('above the first line - we move the text, but the focus remains on the line',
  current.files[0].has('focus') && current.body.scrollTop < 200, current.body.scrollTop);

// --- 13. down from the last row returns to the buttons ---
current = makeDialog({ withLink: false, files: 2 });
UI.closeDialog();
UI.dialogUp();                       // on the last row
UI.dialogDown();                     // a dead end at the bottom of the list reads as "the keyboard is broken"
check('down from the last line returns to the buttons', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');
check('and no one is highlighted in the list', !current.files.some((f) => f.has('focus')), 'строка осталась подсвеченной');

// --- 14. left and right lead out of the list ---
current = makeDialog({ withLink: false, files: 2 });
UI.closeDialog();
UI.dialogUp();
UI.moveDialogFocus(1);
check('right removes from the list', !current.files.some((f) => f.has('focus')), 'строка подсвечена');
check('and lights up the button', current.buttons.some((b) => b.has('focus')), 'ни одна не подсвечена');

// --- 15. the focused file disappeared from the live stream ---
// files come from the snapshot and change on the fly; the row under the cursor
// can leave, and the focus then has to return to the buttons rather than hang
// over nothing
current = makeDialog({ withLink: false, files: 3 });
UI.closeDialog();
UI.dialogUp();                       // on the third row
current.files = current.files.slice(0, 1);
UI.pressDialogFocus();
check('the disappeared file does not press', current.files[0].clicked === 0, current.files[0].clicked);
check('and Enter goes to the button', current.buttons.some((b) => b.clicked === 1), current.buttons.map((b) => b.clicked).join(','));

// --- 16. a digit switches the tab of the card ---
// The same key as in the bag: 1 "doing now", 2 "show the work", 3 "give a task".
// "Close" gets no number — it has Esc.
current = makeDialog();
state.dialogOpen = true;
check('number 2 processed by card', UI.dialogNumber('2') === true, 'не обработана');
check('and clicked “show work”', current.buttons[1].clicked === 1, current.buttons[1].clicked);
check('adjacent tabs are not touched',
  current.buttons[0].clicked === 0 && current.buttons[2].clicked === 0, 'тронуты');
check('“close” number cannot be pressed', UI.dialogNumber('4') === false, 'нажимается');
check('and the close button is intact', current.buttons[3].clicked === 0, current.buttons[3].clicked);
state.dialogOpen = false;
check('when the card is closed, the number goes to the office', UI.dialogNumber('1') === false, 'осталась');

// --- 16. while a line is being typed out, Enter finishes it rather than pressing a button ---
// with a mouse this was a click on the text itself; there was no key, and the
// typewriter had to be waited out in silence
current = makeDialog({ withLink: false });
UI.closeDialog();
state.page = 'talk';
state.sayText = 'длинная реплика агента';
state.typed = 4;
UI.pressDialogFocus();
check('Enter on a printed replica appends it', state.typed === state.sayText.length, `${state.typed} из ${state.sayText.length}`);
check('and does not press the button under focus', current.buttons.every((b) => b.clicked === 0), current.buttons.map((b) => b.clicked).join(','));

// --- 17. a finished line no longer intercepts the key ---
UI.pressDialogFocus();
check('the next Enter is already pressing the button', current.buttons.some((b) => b.clicked === 1), current.buttons.map((b) => b.clicked).join(','));

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
check('up to the transcript block adds the replica at once',
  state.typed === state.sayText.length, `${state.typed} из ${state.sayText.length}`);
check('and the focus remains on the block, and does not go back to the buttons',
  current.link.has('focus') && current.buttons.every((b) => !b.has('focus')),
  `ссылка: ${current.link.has('focus')}`);
UI.pressDialogFocus();
check('Enter on the transcript link opens it the first time',
  current.link.clicked === 1, `нажатий: ${current.link.clicked}`);

// --- the guest's card: the arrows have to reach «попросить доступ» ---
// Until 5 September 2026 they could not: the walk knew the bottom row and the
// file list, and this button was in neither. A guest could press it with a
// mouse and by no other means, in an office where everything else answers keys.
current = makeDialog({ withLink: false, files: 0, ask: true });
UI.closeDialog();
UI.dialogUp();
check('up goes to “request access”', current.ask.has('focus'), 'focus нет');
check('and the bottom row gave focus', !current.buttons.some((b) => b.has('focus')), 'кнопка подсвечена');
UI.pressDialogFocus();
check('Enter presses it', current.ask.clicked === 1, current.ask.clicked);
check('no tabs pressed', current.buttons.every((b) => b.clicked === 0), 'вкладка нажалась');
UI.dialogDown();
check('down returns focus to tabs',
  !current.ask.has('focus') && current.buttons.some((b) => b.has('focus')), 'фокус потерялся');

// --- the options of a question are reached by the arrows and pressed by Enter ---
// The office answers a question by pressing one of them, so «choose with the
// keyboard» is the whole feature and not a convenience: without it the answer is
// mouse-only, in an office where everything else answers keys.
current = makeDialog({ withLink: false, files: 0, opts: 3 });
UI.closeDialog();
UI.dialogUp();
check('up goes to the last option', current.opts[2].has('focus'), 'focus нет');
UI.dialogUp();
check('and the next one goes up in the list of options', current.opts[1].has('focus'), 'focus не сдвинулся');
UI.pressDialogFocus();
check('Enter presses option under focus', current.opts[1].clicked === 1, current.opts[1].clicked);
check('no tabs pressed', current.buttons.every((b) => b.clicked === 0), 'вкладка нажалась');

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
