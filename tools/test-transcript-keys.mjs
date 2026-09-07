// node tools/test-transcript-keys.mjs — the keys in an open conversation, without
// a browser. The DOM is a stand-in: what is checked is not the layout but what a
// press does — where the scroll goes, and what R brings when there are new
// replies and when there are none.

import { node, installDom } from './lib/dom.mjs';

// The log has a height of its own and a lookup of its own: a new reply exists
// exactly when it has been drawn. The rest is the shared machine.
const withLog = (id) => node('', {
  id, scrollHeight: 2000, clientHeight: 300,
  querySelector(sel) {
    if (sel === '.msg.fresh' && this.innerHTML.includes('fresh')) return node('', { offsetTop: 1500 });
    return null;
  },
});

const viewer = node('', { id: 'viewer' });
const chatlog = withLog('chatlog');
const chatst = node('', { id: 'chatst' });
const vx = node('', { id: 'vx' });
const toasts = Object.assign(node('', { id: 'toasts' }), {
  children: [], appendChild(n) { this.children.push(n); }, get firstChild() { return this.children[0]; },
  removeChild(n) { this.children = this.children.filter((x) => x !== n); },
});
// while the conversation is "closed" there is no log in the document — as after closeViewer
let logPresent = true;

installDom({
  find: (sel) => ({
    '#toasts': toasts, '#viewer': viewer, '#chatlog': logPresent ? chatlog : null,
    '#chatst': logPresent ? chatst : null, '#vx': vx,
  }[sel] || null),
});
globalThis.setTimeout = setTimeout;

let served = { messages: [] };
let calls = 0;
globalThis.fetch = async (url) => {
  if (String(url).startsWith('/api/chat')) { calls += 1; return { json: async () => served }; }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};

const UI = await import('../web/ui.js');
UI.initUI({ agents: [], looks: new Map(), settings: {}, delivery: {}, me: {}, visited: new Set() }, {});

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('FAIL  |', name, '→', got); }
};

const agent = { id: 'a1', name: 'Савва', title: 'AI valey' };
const msg = (role, text) => ({ role, text, ts: Date.now() });

// --- 1. opening: the log is drawn and we stand at the bottom ---
served = { messages: [msg('user', 'привет'), msg('assistant', 'ответ')] };
await UI.openTranscript(agent);
check('log drawn', chatlog.innerHTML.includes('ответ'), chatlog.innerHTML.slice(0, 40));
check('opened on the last cue', chatlog.scrollTop === chatlog.scrollHeight, chatlog.scrollTop);

// --- 2. the arrows scroll, SHIFT scrolls further ---
chatlog.scrollTop = 1000;
UI.viewerKey('ArrowUp', false);
const smallStep = 1000 - chatlog.scrollTop;
check('the log is moving up', smallStep > 0, chatlog.scrollTop);
chatlog.scrollTop = 1000;
UI.viewerKey('ArrowUp', true);
check('with SHIFT the step is larger', 1000 - chatlog.scrollTop > smallStep, 1000 - chatlog.scrollTop);
chatlog.scrollTop = 1000;
UI.viewerKey('ArrowDown', false);
check('down swings in the other direction', chatlog.scrollTop > 1000, chatlog.scrollTop);
UI.viewerKey('Home', false);
check('Home takes you to the beginning', chatlog.scrollTop === 0, chatlog.scrollTop);
UI.viewerKey('End', false);
check('End - to the end', chatlog.scrollTop === chatlog.scrollHeight, chatlog.scrollTop);
check('the office doesn\'t see these shooters', UI.viewerKey('ArrowUp', false) === true, 'клавиша ушла мимо');

// --- 3. R brings a new reply ---
served = { messages: [...served.messages, msg('assistant', 'а вот и новое')] };
calls = 0;
chatlog.scrollTop = 0;
UI.viewerKey('r', false);
await new Promise((r) => setTimeout(r, 0));
check('R reread the conversation', calls === 1, calls);
check('new replica in the log', chatlog.innerHTML.includes('а вот и новое'), 'нет');
check('it\'s marked fresh', chatlog.innerHTML.includes('fresh'), 'метки нет');
check('and they approached her', chatlog.scrollTop > 1000, chatlog.scrollTop);
check('The title shows how much has arrived', chatst.textContent.includes('+1'), chatst.textContent);

// --- 4. R with no news redraws nothing ---
const before = chatlog.innerHTML;
UI.viewerKey('к', false);            // the Russian layout — the same key
await new Promise((r) => setTimeout(r, 0));
check('without new replicas the log does not change', chatlog.innerHTML === before, 'перерисовался');
check('and this is said', chatst.textContent.includes('новых реплик нет'), chatst.textContent);

// --- 5. an answer that grew is not a new reply, but it must still refresh ---
const grown = served.messages.slice();
grown[grown.length - 1] = msg('assistant', 'а вот и новое, и ещё продолжение');
served = { messages: grown };
UI.viewerKey('r', false);
await new Promise((r) => setTimeout(r, 0));
check('the finished tail was picked up', chatlog.innerHTML.includes('и ещё продолжение'), 'нет');
check('and called addition', chatst.textContent.includes('дописан'), chatst.textContent);

// --- 6. Esc closes, and after that the keys do not belong to the conversation ---
UI.viewerKey('Escape', false);
check('Esc closed the conversation', viewer.hidden === true, viewer.hidden);
logPresent = false;                  // the log is no longer in the document
check('on the closed screen the arrows return to the office', UI.viewerKey('ArrowUp', false) === false, 'перехвачены');
check('and R too', UI.viewerKey('r', false) === false, 'перехвачен');

// --- copying a code block with C ---
// The boundary matters more here than the copying itself: while there is a code
// block in the viewer, C belongs to it.
// The screen is closed at this point by the previous check — we open it back, or
// viewerKey returns false simply because there is nothing to look at, and the
// check about the key turns into a check about nothing.
viewer.hidden = false;
logPresent = true;
// The rule changed on 5 September 2026: C always belongs to the viewer. It used
// to fall through into the office and open the inventory over the conversation
// when no code block was around; now an empty page answers in the header and a
// full one lights the numbers. A key that behaves differently depending on what
// the page happens to hold reads as broken.
check('without code blocks, C still belongs to the view', UI.viewerKey('c') === true, 'ушла в офис');
check('and the numbers didn’t light up because there was nothing to copy', UI.pickOn() === false, 'зажглись');

let copied = null;
// In node globalThis.navigator has only a getter, so we substitute it through
// defineProperty rather than by assignment.
const setClipboard = (writeText) => Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText } }, configurable: true, writable: true });
setClipboard(async (t) => { copied = t; });
const codeNode = Object.assign(node(), { textContent: 'git push origin main' });
const cbtn = Object.assign(node(), { textContent: 'копировать', scrollIntoView() {} });
const cblock = Object.assign(node(), {
  getBoundingClientRect: () => ({ top: 10, bottom: 60 }),
  querySelector: (sel) => (sel === 'pre.mdcode code' ? codeNode : sel === '.mdcopy' ? cbtn : null),
});
cbtn.closest = (sel) => (sel === '.mdblock' ? cblock : null);
viewer.querySelector = (sel) => (sel === '.mdblock' ? cblock : sel === '#chatlog' ? chatlog : null);
viewer.querySelectorAll = (sel) => (sel === '.mdblock' ? [cblock] : []);
chatlog.getBoundingClientRect = () => ({ top: 0, bottom: 400 });

check('with C code block picks up view', UI.viewerKey('c') === true, 'не забрала');
await new Promise((r) => setTimeout(r, 0));
check('The code text went into the buffer, not the highlighting', copied === 'git push origin main', copied);
check('the button said "copied"', cbtn.textContent === 'скопировано', cbtn.textContent);
check('and lit up', cbtn.classList.contains('done'), 'нет класса');

// A clipboard refusal is what anyone who opened the office through a tunnel will
// see. A second C in a row goes to the numbers, so this copies the way the first
// one did — after another key has cleared the memory of that press.
copied = null;
setClipboard(async () => { throw new Error('нет доступа'); });
globalThis.document.execCommand = () => false;
UI.viewerKey('ArrowDown');                // any other key clears «already copied»
UI.viewerKey('с');                        // and in Russian too
await new Promise((r) => setTimeout(r, 0));
check('the failure is visible on the button', cbtn.classList.contains('fail') && /не вышло/.test(cbtn.textContent), cbtn.textContent);

// --- numbers on everything copyable ---
// Fake DOM: one code block and two inline fragments, all «on screen».
const inlineBtn = (val) => Object.assign(node(), { dataset: val ? { copy: val } : {}, scrollIntoView() {} });
const wrap = (text, val) => {
  const btn = inlineBtn(val);
  const body = Object.assign(node(), { textContent: text });
  const w = Object.assign(node('mdcopyable'), {
    getBoundingClientRect: () => ({ top: 20, bottom: 40 }),
    querySelector: (sel) => (sel === '.mdcopy' ? null : sel === '.mdcopy-in' ? btn : sel === 'code, a' ? body : null),
    dataset: {},
  });
  btn.closest = (sel) => (sel === '.mdcopyable' ? w : null);
  return w;
};
const w1 = wrap('~/.claude/settings.json');
const w2 = wrap('текст ссылки', 'https://valey.dev');
const head = Object.assign(node('vhead'), { appendChild() {} });
cblock.classList.add('mdblock');
viewer.querySelectorAll = (sel) => (sel === '.mdblock, .mdcopyable' ? [cblock, w1, w2]
  : sel === '.mdblock' ? [cblock] : []);
viewer.querySelector = (sel) => (sel === '.mdblock' ? cblock : sel === '#chatlog' ? chatlog : sel === '.vhead' ? head : null);

setClipboard(async (t) => { copied = t; });
UI.viewerKey('ArrowDown');                // clear «already copied»
UI.viewerKey('c');                        // the first C takes the top block
check('the first C copies the block without lighting the numbers', UI.pickOn() === false, 'зажглись');
UI.viewerKey('c');                        // the second in a row lights the numbers
check('second C lights numbers', UI.pickOn() === true, 'не зажглись');
check('each piece got a number', [cblock, w1, w2].every((n, i) => n.dataset.pick === String(i + 1)),
  [cblock.dataset.pick, w1.dataset.pick, w2.dataset.pick].join(','));
copied = null;
UI.viewerKey('3');                        // the third is the link: its address is what lands in the clipboard
await new Promise((r) => setTimeout(r, 0));
check('the number copies the link address, not its text', copied === 'https://valey.dev', copied);
check('and the numbers go out after selection', UI.pickOn() === false, 'горят');
// After a digit pick the «already copied» memory is cleared, so the numbers are
// two presses away again: the first takes the block, the second lights them.
UI.viewerKey('c'); UI.viewerKey('c');
check('numbers lit up before ESC check', UI.pickOn() === true, 'не зажглись');
check('ESC extinguishes numbers', (UI.viewerKey('Escape'), UI.pickOn()) === false, 'горят');
check('and does not close the conversation', viewer.hidden === false, 'закрыл');

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
