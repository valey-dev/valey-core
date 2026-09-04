// node tools/test-transcript-keys.mjs — клавиши в открытом разговоре, без браузера.
// DOM подставной: проверяется не вёрстка, а что делает нажатие — куда уезжает
// прокрутка и что приносит R, когда реплик прибавилось и когда нет.

import { node, installDom } from './lib/dom.mjs';

// У лога своя высота и свой поиск: новая реплика есть ровно тогда, когда её
// нарисовали. Остальное — общая машинка.
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
// пока разговор «закрыт», лога в документе нет — как после closeViewer
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

// --- 1. открытие: лог нарисован, стоим внизу ---
served = { messages: [msg('user', 'привет'), msg('assistant', 'ответ')] };
await UI.openTranscript(agent);
check('лог нарисован', chatlog.innerHTML.includes('ответ'), chatlog.innerHTML.slice(0, 40));
check('открылись на последней реплике', chatlog.scrollTop === chatlog.scrollHeight, chatlog.scrollTop);

// --- 2. стрелки листают, SHIFT — крупнее ---
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

// --- 3. R приносит новую реплику ---
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

// --- 4. R без новостей ничего не перерисовывает ---
const before = chatlog.innerHTML;
UI.viewerKey('к', false);            // русская раскладка — та же клавиша
await new Promise((r) => setTimeout(r, 0));
check('без новых реплик лог не трогается', chatlog.innerHTML === before, 'перерисовался');
check('и об этом сказано', chatst.textContent.includes('новых реплик нет'), chatst.textContent);

// --- 5. дописанный ответ — это не новая реплика, но обновиться должен ---
const grown = served.messages.slice();
grown[grown.length - 1] = msg('assistant', 'а вот и новое, и ещё продолжение');
served = { messages: grown };
UI.viewerKey('r', false);
await new Promise((r) => setTimeout(r, 0));
check('дописанный хвост подхватился', chatlog.innerHTML.includes('и ещё продолжение'), 'нет');
check('и назван дописыванием', chatst.textContent.includes('дописан'), chatst.textContent);

// --- 6. Esc закрывает, и после этого клавиши разговору не принадлежат ---
UI.viewerKey('Escape', false);
check('Esc закрыл разговор', viewer.hidden === true, viewer.hidden);
logPresent = false;                  // лога в документе больше нет
check('на закрытом экране стрелки офису возвращаются', UI.viewerKey('ArrowUp', false) === false, 'перехвачены');
check('и R тоже', UI.viewerKey('r', false) === false, 'перехвачен');

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
