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
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

const agent = { id: 'a1', name: 'Савва', title: 'AI valey' };
const msg = (role, text) => ({ role, text, ts: Date.now() });

// --- 1. opening: the log is drawn and we stand at the bottom ---
served = { messages: [msg('user', 'привет'), msg('assistant', 'ответ')] };
await UI.openTranscript(agent);
check('лог нарисован', chatlog.innerHTML.includes('ответ'), chatlog.innerHTML.slice(0, 40));
check('открылись на последней реплике', chatlog.scrollTop === chatlog.scrollHeight, chatlog.scrollTop);

// --- 2. the arrows scroll, SHIFT scrolls further ---
chatlog.scrollTop = 1000;
UI.viewerKey('ArrowUp', false);
const smallStep = 1000 - chatlog.scrollTop;
check('вверх мотает лог', smallStep > 0, chatlog.scrollTop);
chatlog.scrollTop = 1000;
UI.viewerKey('ArrowUp', true);
check('с SHIFT шаг крупнее', 1000 - chatlog.scrollTop > smallStep, 1000 - chatlog.scrollTop);
chatlog.scrollTop = 1000;
UI.viewerKey('ArrowDown', false);
check('вниз мотает в другую сторону', chatlog.scrollTop > 1000, chatlog.scrollTop);
UI.viewerKey('Home', false);
check('Home уводит в начало', chatlog.scrollTop === 0, chatlog.scrollTop);
UI.viewerKey('End', false);
check('End — в конец', chatlog.scrollTop === chatlog.scrollHeight, chatlog.scrollTop);
check('офис этих стрелок не видит', UI.viewerKey('ArrowUp', false) === true, 'клавиша ушла мимо');

// --- 3. R brings a new reply ---
served = { messages: [...served.messages, msg('assistant', 'а вот и новое')] };
calls = 0;
chatlog.scrollTop = 0;
UI.viewerKey('r', false);
await new Promise((r) => setTimeout(r, 0));
check('R перечитал разговор', calls === 1, calls);
check('новая реплика в логе', chatlog.innerHTML.includes('а вот и новое'), 'нет');
check('она помечена свежей', chatlog.innerHTML.includes('fresh'), 'метки нет');
check('и к ней подмотали', chatlog.scrollTop > 1000, chatlog.scrollTop);
check('в заголовке видно, сколько пришло', chatst.textContent.includes('+1'), chatst.textContent);

// --- 4. R with no news redraws nothing ---
const before = chatlog.innerHTML;
UI.viewerKey('к', false);            // the Russian layout — the same key
await new Promise((r) => setTimeout(r, 0));
check('без новых реплик лог не трогается', chatlog.innerHTML === before, 'перерисовался');
check('и об этом сказано', chatst.textContent.includes('новых реплик нет'), chatst.textContent);

// --- 5. an answer that grew is not a new reply, but it must still refresh ---
const grown = served.messages.slice();
grown[grown.length - 1] = msg('assistant', 'а вот и новое, и ещё продолжение');
served = { messages: grown };
UI.viewerKey('r', false);
await new Promise((r) => setTimeout(r, 0));
check('дописанный хвост подхватился', chatlog.innerHTML.includes('и ещё продолжение'), 'нет');
check('и назван дописыванием', chatst.textContent.includes('дописан'), chatst.textContent);

// --- 6. Esc closes, and after that the keys do not belong to the conversation ---
UI.viewerKey('Escape', false);
check('Esc закрыл разговор', viewer.hidden === true, viewer.hidden);
logPresent = false;                  // the log is no longer in the document
check('на закрытом экране стрелки офису возвращаются', UI.viewerKey('ArrowUp', false) === false, 'перехвачены');
check('и R тоже', UI.viewerKey('r', false) === false, 'перехвачен');

// --- copying a code block with C ---
// The boundary matters more here than the copying itself: while there is a code
// block in the viewer, C belongs to it; when there are no blocks it falls through
// to the office and opens the inventory, as it always did.
// The screen is closed at this point by the previous check — we open it back, or
// viewerKey returns false simply because there is nothing to look at, and the
// check about the key turns into a check about nothing.
viewer.hidden = false;
logPresent = true;
check('без блоков кода C не забирается просмотром', UI.viewerKey('c') === false, 'забрала');

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

check('с блоком кода C забирает просмотр', UI.viewerKey('c') === true, 'не забрала');
await new Promise((r) => setTimeout(r, 0));
check('в буфер ушёл текст кода, а не подсветка', copied === 'git push origin main', copied);
check('кнопка сказала «скопировано»', cbtn.textContent === 'скопировано', cbtn.textContent);
check('и подсветилась', cbtn.classList.contains('done'), 'нет класса');

// A clipboard refusal is what anyone who opened the office through a tunnel will see.
copied = null;
setClipboard(async () => { throw new Error('нет доступа'); });
globalThis.document.execCommand = () => false;
UI.viewerKey('с');                        // and in Russian too
await new Promise((r) => setTimeout(r, 0));
check('отказ виден на кнопке', cbtn.classList.contains('fail') && /не вышло/.test(cbtn.textContent), cbtn.textContent);

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
