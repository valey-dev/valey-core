// Every panel that is HTML rather than pixels: dialog, board viewer,
// morning round, your own look, toasts.
import { drawPerson, drawItem, dressMe, cycle, hash, SKIN, HAIR, SHIRT, PANTS, BOOTS, HEADS, FACES, HANDS,
  SHIRT_WORK, BLOUSE, JACKET, TIE, CUTS, BOTTOMS } from './sprites.js';
import { renderMarkdown } from './markdown.js';
import { highlight, langOf } from './highlight.js';
import { collect, first, moduleIds } from './modules.js';
import { LIBRARY, TIERS, DIRS, SUBS, byId, children, colOf, inDir, dirTally } from './library.js';
import { theme, applyTheme, resetTheme, PRESETS, ui, UI_STEPS, applyUiScale } from './theme.js';
import { notesOf, noteCount, addNote, editNote, removeNote, splitNotes, allNotes } from './notes.js';
import { esc } from './esc.js';
import { owned } from './owned.js';

const $ = (s) => document.querySelector(s);
const el = { hud: null, dialog: null, viewer: null, roster: null, bag: null, toasts: null };
let S = null, api = null;

export function initUI(state, callbacks) {
  S = state; api = callbacks;
  el.hud = $('#hud'); el.dialog = $('#dialog'); el.viewer = $('#viewer');
  el.roster = $('#roster'); el.bag = $('#bag'); el.toasts = $('#toasts');
  el.sky = $('#sky');
  el.skin = $('#skin');
  el.lift = $('#lift');
  el.invite = $('#invite');
  el.notes = $('#notes');
  el.lang = $('#lang');
  // One handler for the whole viewer panel, set at the entrance: the markup
  // inside it is repainted constantly, and the handler outlives that.
  bindCopyButtons();
  // Panels with an input field close themselves. onKey in main.js returns on any
  // INPUT — that is how an unfinished task survives an accidental Escape — and the
  // press never reaches closeAll(): while the focus is in a field, the panel is
  // locked. The round and the lift have no fields, closeAll() is enough for them;
  // the agent's card is deliberately not in the list, the task field is there and
  // Escape is not its master.
  selfClosing(el.sky, closeSky);
  selfClosing(el.notes, closeNotes);
  selfClosing(el.invite, closeInvite);
  selfClosing(el.bag, closeBag);
  selfClosing(el.skin, closeSkin);
}

// The handler is hung on the panel itself rather than on the field: the innards
// of the panel are rewritten on every render, while the panel itself stays.
function selfClosing(box, close) {
  if (!box) return;
  box.onkeydown = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); close();
  };
}

export const clean = (s) => (s || '').replace(/```[\s\S]*?```/g, tr('clean.code')).replace(/[*#`]/g, '').replace(/\n{3,}/g, '\n\n').trim();

// ------------------------------------------------------------------- toasts
export function toast(text, kind = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + kind;
  d.textContent = text;
  el.toasts.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 600); }, 5200);
  while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
}

// ---------------------------------------------------------------------- hud
// tr, not t: in ui.js `t` is already taken by local variables in several
// functions, and the import there was silently shadowed
import { t as tr, lang } from './i18n.js';
import { cardClosed } from './pager.js';

const WEATHER_ICON = { clear: '☀', clouds: '☁', rain: '☂', storm: '⚡', snow: '❄', fog: '≋' };

// Our own player knows the track by name, the built-in one only the wave it is tuned to.

export function renderHud() {
  const waiting = S.agents.filter((a) => a.status === 'awaiting').length;
  const working = S.agents.filter((a) => a.status === 'working').length;
  const d = new Date();
  const room = S.currentRoom ? `<span class="chip room">▣ ${esc(S.currentRoom.title)}</span>` : `<span class="chip room">${tr('hud.corridor')}</span>`;
  const w = S.weather || { kind: 'clear' };
  const temp = w.temp != null ? ` ${Math.round(w.temp)}°` : '';
  const z = S.zoom || { dev: 1, auto: true, tight: false };
  const place = w.label ? ` · ${esc(w.label)}` : '';
  el.hud.innerHTML = `<b>VALEY</b> · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}
    <span class="chip sky" title="${tr('hud.skyTitle', { source: w.source === 'выдумана' ? tr('sky.made') : esc(w.source || '') })}">${WEATHER_ICON[w.kind] || '·'} ${tr('sky.' + w.kind)}${temp}${place}</span>
    ${room}<span class="chip work">⌨ ${working}</span><span class="chip wait">! ${waiting}</span>
    <span class="chip">👥 ${S.agents.length}</span>
    <span class="chip zoom${z.tight ? ' wait' : ''}" title="${tr('hud.zoomTitle')}${
      z.tight ? tr('hud.zoomTitleTight') : ''
    }">⛶ ×${z.dev}${z.auto ? tr('hud.zoomAuto') : ''}${z.tight ? tr('hud.zoomTight') : ''}</span>
    ${S.pagerWaiting ? `<button id="pagerChip" class="chip wait" title="${tr('hud.pagerTitle')}">📟 ${S.pagerWaiting}</button>` : ''}
    <span class="chip dim">${S.soundOn ? '🔊' : '🔇'} M</span>
    ${collect('hud', S).map((c) => `<span class="chip ${esc(c.kind || 'dim')}" title="${esc(c.title || '')}">${esc(c.text || '')}</span>`).join('')}
    <span class="chip dim">${tr('hud.round')}</span>`;
  // The badge is the only trace a deferred request leaves once its toast is gone,
  // and until 6 September 2026 it was a `span`: a person saw three requests in the
  // corner and had nowhere to press. H brings them back, but it is written in a
  // tooltip, and Esc — which is «back» everywhere else in the office — is what
  // defers them in the first place, so the pager is easy to put away by accident
  // and hard to find afterwards.
  const chip = $('#pagerChip');
  if (chip) chip.onclick = () => api.recallPager();
}

// ------------------------------------------------------------------- dialog
let dialogKey = '';
// A refusal in two steps: the button first, then the field for a note. It lives
// here rather than in the state of the office — this is not something that should
// outlive the closing of the card.
let denying = false;

// The server gives out both the Russian text of an error and a key, if the error
// is its own. Where we know the key we translate; where we do not, we show it as
// it is: what claude returned is not in the dictionary and cannot be.
const said = (o, field = 'error') => {
  if (!o) return '';
  const key = field === 'hint' ? o.hintKey : o.errorKey;
  return key ? tr(key) : (o[field] || '');
};

const statusWord = (a) => tr('status.' + (a.status === 'awaiting' ? 'awaiting' : a.status === 'idle' ? 'idle' : 'working'));
export const ago = (sec) => sec == null || !Number.isFinite(sec) ? ''
  : sec < 90 ? tr('ago.now')
  : sec < 5400 ? tr('ago.min', { n: Math.round(sec / 60) })
  : sec < 172800 ? tr('ago.hour', { n: Math.round(sec / 3600) })
  : tr('ago.day', { n: Math.round(sec / 86400) });
const metaLine = (a) => `${esc(a.project)}${a.branch ? ' · ' + esc(a.branch) : ''} · ${statusWord(a)}`
  + (a.status !== 'working' && a.idleFor > 300 ? tr('meta.spoke', { ago: ago(a.idleFor) }) : '');
const chatLine = (a) => (a.title ? `<span class="chatname">💬 ${esc(a.title)}</span>` : '');
// The report tail in the head. The task in the main colour, full width; the
// status dim under it, with the session name riding along at its end — telling
// two sessions of one project apart is all it was ever needed for. No tail and
// the head looks as it did, because the report ends answers by this repository's
// rule, not by Claude Code's.
const COLD_TASK = 3600;   // seconds of silence after which the task is no longer "now"
const taskRow = (a) => {
  const t = a.task;
  if (!t || !t.what) return chatLine(a);
  const cold = a.status !== 'working' && (a.idleFor || 0) > COLD_TASK;
  // The session name is not on its own blue line here, as it is without a task,
  // but at the end of the status: it stops being the first thing read, and does
  // not disappear. It sits in its own cell, because the status is clipped to fit
  // and the name is not clippable — it is short, and it is the thing that
  // identifies which of a project's two sessions this is.
  const stat = t.status ? `<span class="tval">${tr('task.status', { s: esc(t.status) })}</span>` : '';
  const sess = a.title ? `<span class="tsess">${stat ? '· ' : ''}💬 ${esc(a.title)}</span>` : '';
  return `<p class="task${cold ? ' cold' : ''}">${esc(t.what)}</p>`
    + (stat || sess ? `<p class="tstat">${stat}${sess}</p>` : '')
    + (t.need ? `<p class="need">⚑ ${tr('task.need', { s: esc(t.need) })}</p>` : '');
};

// The same task in the conversation header: it on the left, the status on the
// right. The session name is not repeated here — it is a row above, in its corner.
const chatTask = (a) => {
  const t = a && a.task;
  if (!t || !t.what) return '';
  return `<span class="task">${esc(t.what)}</span>`
    + (t.status ? `<span class="tstat">${tr('task.status', { s: esc(t.status) })}</span>` : '');
};
// The server sends the key of an activity and leaves the ready Russian phrase for
// compatibility: if there is no key, we show the phrase as it is.
const FALLBACK_ARG = { edit: 'act.someCode', read: 'act.someFile' };
export const actText = (a) => {
  if (!a || !a.act || !a.act.key) return (a && a.activity) || '';
  const arg = a.act.arg || (FALLBACK_ARG[a.act.key] ? tr(FALLBACK_ARG[a.act.key]) : '');
  return tr('act.' + a.act.key, { arg });
};
export const roleText = (a) => (a && a.roleKey ? tr('role.' + a.roleKey) : (a && a.role) || '');
// actText and roleText are text: they are also put into textContent. They enter
// the markup only through esc, because the arg of an activity is a file name or a
// command out of the transcript, and an unknown key is returned by tr as it is.
const actLine = (a) => `${esc(actText(a))}${(a.outbox || []).length ? ` · 📋 ${a.outbox.length}` : ''}`;
const readLabel = (a) => {
  const cut = (a.saidLen || 0) - (a.lastSaid || '').length;
  return cut > 0 ? tr('dlg.readOnArrow', { n: cut }) : tr('dlg.readAll');
};
const NOTE_ICON = { note: '📋', sending: '✈', delivered: '✅', failed: '⚠' };
// Which note is holding its breath before going into a real chat. Kept here rather
// than in the DOM, so the two-second repaint of the list does not disarm it.
let armedNote = 0;
const noteList = (a) => (a.outbox || []).map((t) => {
  const icon = t.blocked ? '🔒' : NOTE_ICON[t.state] || '📋';
  const tail = t.state === 'sending' ? `<span class="ntail">${tr('note.sending')}</span>`
    : t.state === 'delivered' ? `<span class="ntail ${t.blocked ? 'warn' : 'ok'}">${
        t.blocked ? tr('note.blocked') : tr('note.replied')}${esc(clean(t.reply || '').slice(0, 110))}</span>`
    : t.state === 'failed' ? `<span class="ntail bad">${esc(said(t) || tr('note.failed'))}</span>`
    : `<span class="ntail">${tr('note.onDesk')}</span>`;
  const retry = t.blocked
    ? `<button class="retry" data-retry="${esc(t.text)}">${tr('note.retry')}</button>`
    : '';
  const armed = armedNote === t.id;
  const toChat = t.state === 'note'
    ? `<button class="tochat${armed ? ' arm' : ''}" data-send="${t.id}">${armed ? tr('note.confirm') : tr('note.toChat')}</button>`
    : '';
  return `<li>${icon} ${esc(t.text.slice(0, 90))}${tail}${retry}${toChat}</li>`;
}).join('');
const fileList = (a) => (a.files || []).map((f) =>
  `<li data-path="${encodeURIComponent(f.path)}"><span class="ic">${f.image ? '▨' : '▤'}</span>${esc(f.name)}</li>`).join('');
const MODE_KEY = { default: 'default', acceptEdits: 'acceptEdits', bypassPermissions: 'bypass' };
const MODE_LABEL = () => ({
  default: tr('mode.default'), acceptEdits: tr('mode.acceptEdits'), bypassPermissions: tr('mode.bypass'),
});
const modeNote = (mode) => tr('modeNote.' + (MODE_KEY[mode] || 'acceptEdits'));
const hintText = () => {
  // Ответ сервера — и в notice, и в why — текст, который claude вернул или
  // с которым упал; в словаре его нет, значит и доверять ему как разметке нельзя.
  if (S.notice) return esc(S.notice);
  const d = S.delivery || {};
  if (!d.available) return tr('hint.noCli', { why: esc(said(d, 'hint') || said(d) || tr('hint.noCliDefault')) });
  const mode = (S.settings && S.settings.delivery && S.settings.delivery.mode) || 'acceptEdits';
  return tr('hint.deliver', { note: modeNote(mode) });
}

// Гостю записку оставить можно, отправить в чат — нет. Кнопки и выбора режима
// у него не появляется вовсе: неактивная кнопка обещает, что когда-нибудь
// нажмётся, а эта не нажмётся никогда.
//
// Подсказка выбирается здесь, а не по месту, потому что мест два: панель
// собирается целиком при открытии и подновляется частями на каждом такте.
// 30 августа 2026 гостевую строку переписывала обратно хозяйской именно
// вторая — кнопки уже не было, а текст обещал отправку.
const isGuest = () => S.owner === false;
const taskHint = () => (isGuest() ? tr('hint.guest') : hintText());

let btnIndex = 0;   // which of the bottom buttons the arrows are standing on

// Live data arrives every couple of seconds. Rebuilding the panel each time would
// yank the caret out of the task field, so a repeat render only patches the text.
export function renderDialog() {
  const a = S.focus;
  if (!a) return;
  el.dialog.hidden = false;
  // Состояние доступа входит в ключ: без него смена «закрыто → просим →
  // отказали» не пересобирает тело, и человек жмёт кнопку в пустоту.
  // Запрос входит в ключ: он уходит по ответу — своему или чужому, — и
  // карточка обязана пересобраться, а не остаться с кнопками в пустоту.
  const key = a.id + '|' + S.page + '|' + accessOf(a.id) + '|' + ((permitOf(a.id) || {}).id || '') + '|' + (denying ? 'deny' : '');
  if (key === dialogKey && el.dialog.firstChild) return patchDialog(a);
  dialogKey = key;
  buildDialog(a);
}

function patchDialog(a) {
  const set = (sel, html) => { const n = el.dialog.querySelector(sel); if (n && n.innerHTML !== html) n.innerHTML = html; };
  set('.meta', metaLine(a));
  set('.act', actLine(a));
  // The task is rewritten by every answer, so its row moves as a whole rather
  // than being patched piece by piece: between "you are needed" and its absence
  // what changes is the set of rows, not the text.
  set('.taskrow', taskRow(a));

  if (S.page === 'talk') {
    const said = clean(a.lastSaid) || tr('dlg.silent');
    // Пока ссылка выбрана, целишься в неё, а не читаешь: перенабор текста с нуля
    // в этот момент только дёргает карточку. Дописываем ответ молча.
    if (said !== S.sayText) {
      S.sayText = said;
      if (linkFocused) { S.typed = said.length; finishTypewriter(); }
      else { S.typed = 0; typewriter(); }
    }
    // ответ дорастает прямо в открытой карточке, и «ещё N символов» врёт, если
    // подпись не обновлять вместе с ним
    const link = readLink();
    if (link) {
      const label = readLabel(a);
      if (link.textContent !== label) link.textContent = label;
      link.classList.toggle('more', (a.saidLen || 0) > (a.lastSaid || '').length);
    }
  }
  if (S.page === 'work') {
    const list = el.dialog.querySelector('.files');
    const html = fileList(a);
    if (list && list.innerHTML !== html) { list.innerHTML = html; bindFiles(); }
    else if (!list && html) buildDialog(a);
  }
  if (S.page === 'task') {
    set('.hint', taskHint());
    const notes = el.dialog.querySelector('.notes');
    const html = noteList(a);
    // Rewriting the list drops the handlers with it, so bind them again right after.
    if (notes) { if (notes.innerHTML !== html) { notes.innerHTML = html; bindNotes(a); } }
    else if (html) {
      el.dialog.querySelector('.body').insertAdjacentHTML('beforeend', `<ul class="notes">${html}</ul>`);
      bindNotes(a);
    }
  }
  // подсветку кладём заново: обновление могло переписать узел вместе с классом
  paintDialogFocus();
}

// Запрос разрешения, которого ждёт этот агент. У гостя списка нет вовсе —
// сервер его не присылает, — поэтому проверять «хозяин ли» здесь не нужно.
const permitOf = (id) => (S.permits || []).find((p) => p.agentId === id) || null;

// Что гость знает про доступ к этому агенту. Три состояния и умолчание:
// закрыто, попросили, отказали. Отдельного «открыто» не нужно — там просто
// видно то же, что видит хозяин.
function accessOf(id) {
  const acc = S.access || {};
  if ((acc.granted || []).includes(id)) return 'open';
  if ((acc.pending || []).includes(id)) return 'pending';
  if ((acc.refused || []).includes(id)) return 'refused';
  return 'closed';
}

function buildDialog(a) {
  let body = '';
  if (S.page === 'talk') {
    // Гостю показывать нечего: реплики у него нет и не было — сервер её не
    // прислал. Вместо пустого места — что именно закрыто и что с этим делать.
    // Формулировка «не покидало машину» здесь была бы неправдой: в этом офисе
    // сессии свои, сервер их просто не отдаёт.
    const st = isGuest() ? accessOf(a.id) : 'open';
    if (st !== 'open') {
      const btn = st === 'pending' ? ''
        : `<button id="askAccess">${tr(st === 'refused' ? 'acc.askAgain' : 'acc.ask')}</button>`;
      body = `<p class="q">${tr('dlg.whatUp')}</p>
        <p class="say">${tr('acc.projectionOnly')}</p>
        <p class="hint block">${tr(st === 'refused' ? 'acc.refused' : st === 'pending' ? 'acc.waiting' : 'acc.closed')}</p>
        ${btn}
        <p class="hint dim">${tr('acc.note')}</p>`;
    }
    // Лимит подписки — объявление на двери, а не слова агента: он ничего не отвечал
    else if (a.limited) {
      body = `<p class="q">${tr('dlg.whatUp')}</p>
        <p class="say limitline">${tr('dlg.limited', {
          when: a.limited.resets ? tr('dlg.returns', { at: esc(a.limited.resets) }) : '' })}</p>
        <p class="hint">${tr('dlg.limitedWho', {
          by: S.delivery && S.delivery.account
            ? ' ' + tr('dlg.byAccount', { email: esc(S.delivery.account.email) })
            : ' ' + tr('dlg.byCli') })}</p>`;
    }
    else {
      const cut = (a.saidLen || 0) - (a.lastSaid || '').length;
      body = `<p class="q">${tr('dlg.whatUp')}</p><p class="say" id="say"></p>
        <button id="readAll" class="linky${cut > 0 ? ' more' : ''}">${esc(readLabel(a))}</button>`;
    }
  }
  else if (S.page === 'work') {
    body = (a.files || []).length
      ? `<p class="q">${tr('dlg.showWork')}</p><ul class="files">${fileList(a)}</ul>`
      : `<p class="say">${tr('dlg.noFiles')}</p>`;
  } else if (S.page === 'task') {
    const d = S.delivery || {};
    const mode = (S.settings && S.settings.delivery && S.settings.delivery.mode) || 'default';
    const guest = isGuest();
    body = `<p class="q">${tr('dlg.whatToDo')}</p>
      <textarea id="taskInput" rows="3" placeholder="${tr(guest ? 'dlg.enterHintGuest' : 'dlg.enterHint')}"></textarea>
      <div class="sendrow">
        <button id="asNote">${tr('dlg.onDesk')}</button>
        ${guest ? '' : `<button id="asSend" ${d.available ? '' : 'disabled'}>${tr('dlg.send')}</button>
        <label class="modepick">${tr('dlg.mode')}
          <select id="sendMode" ${d.available ? '' : 'disabled'}>
            ${Object.entries(MODE_LABEL()).map(([k, v]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </label>`}
      </div>
      <p class="hint">${taskHint()}</p>
      ${(a.outbox || []).length ? `<ul class="notes">${noteList(a)}</ul>` : ''}
      ${(a.outbox || []).some((t) => t.state === 'delivered')
        ? `<p class="hint dim">${tr('dlg.appendHint')}</p>`
        : ''}`;
  }

  // Макет: [Диалог · Разрешение · Bash](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=947-2)
  // Отказ с запиской: [Диалог · Разрешение · отказ](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=947-230)
  else if (S.page === 'permit') {
    const p = permitOf(a.id);
    // Запрос могли ответить с другой вкладки или он истёк, пока карточка была
    // открыта. Пустое место тут читалось бы как поломка.
    if (!p) body = `<p class="say">${tr('permit.gone')}</p>`;
    else if (denying) {
      body = `<p class="q">${tr('permit.denyQ')}</p>
        <p class="say">${esc(p.description || tr('permit.noDesc'))}</p>
        <pre class="cmd">${esc(p.command)}</pre>
        <textarea id="denyNote" rows="3" placeholder="${tr('permit.denyHint')}"></textarea>
        <div class="prow">
          <button data-a="deny" class="primary">${tr('permit.deny')} <kbd>⏎</kbd></button>
          <button data-a="back">${tr('permit.back')} <kbd>Esc</kbd></button>
        </div>
        <p class="hint">${tr('permit.denyNote')}</p>`;
    } else {
      body = `<p class="q">${tr('permit.q')}</p>
        <p class="say">${esc(p.description || tr('permit.noDesc'))}</p>
        <pre class="cmd">${esc(p.command)}</pre>
        ${p.rule ? `<p class="hint">${tr('permit.rule', { rule: esc(p.rule) })}</p>` : ''}
        <div class="prow">
          <button data-a="allow" class="primary">${tr('permit.allow')} <kbd>⏎</kbd></button>
          <button data-a="always" ${p.rule ? '' : 'disabled'}>${tr('permit.always')}</button>
          <button data-a="deny">${tr('permit.deny')}</button>
          <button data-a="terminal">${tr('permit.terminal')}</button>
        </div>
        <p class="hint">${tr('permit.note')}</p>`;
    }
  }

  el.dialog.innerHTML = `
    <div class="portrait"><canvas width="48" height="48" id="pf"></canvas></div>
    <div class="content">
      <div class="who"><b>${esc(a.name)}</b> <span class="role r-${esc(a.roleKey)}">${esc(roleText(a))}</span>
        <span class="meta">${metaLine(a)}</span><div class="taskrow">${taskRow(a)}</div></div>
      <div class="act">${actLine(a)}</div>
      <div class="body">${body}</div>
      <div class="acts">
        <button data-p="talk" class="${S.page === 'talk' ? 'on' : ''}">${tr('tab.talk')} <kbd>1</kbd></button>
        <button data-p="work" class="${S.page === 'work' ? 'on' : ''}">${tr('tab.work')} <kbd>2</kbd></button>
        <button data-p="task" class="${S.page === 'task' ? 'on' : ''}" ${permitOf(a.id) ? 'disabled' : ''}>${tr('tab.task')} <kbd>3</kbd></button>
        <button data-p="close">${tr('tab.close')} <kbd>Esc</kbd></button>
      </div>
    </div>`;

  const pf = $('#pf').getContext('2d');
  pf.imageSmoothingEnabled = false;
  pf.fillStyle = '#2a1f19'; pf.fillRect(0, 0, 48, 48);
  pf.save(); pf.translate(0, 6); pf.scale(1.7, 1.7);
  drawPerson(pf, 14, 24, S.looks.get(a.id), { pose: 'stand', frame: 0 });
  pf.restore();

  // the arrows start on the tab you are already reading
  btnIndex = Math.max(0, ['talk', 'work', 'task', 'close'].indexOf(S.page));
  fileIdx = -1;
  paintDialogFocus();

  el.dialog.querySelectorAll('.acts button').forEach((b) => b.onclick = () => {
    if (b.dataset.p === 'close') return api.close();
    S.page = b.dataset.p; S.notice = ''; S.typed = 0; armedNote = 0; renderDialog();
    if (S.page === 'task') setTimeout(() => $('#taskInput')?.focus(), 30);
  });
  bindFiles();
  bindPermit(a);

  const say = $('#say');
  if (say) say.onclick = () => finishTypewriter();
  const readAll = $('#readAll');
  if (readAll) readAll.onclick = () => openTranscript(a);

  // Просьба уходит один раз и заменяет прежнюю: повторная не ложится второй,
  // и хозяин не получает две одинаковые подряд.
  const askBtn = $('#askAccess');
  if (askBtn) {
    askBtn.onclick = async () => {
      askBtn.disabled = true;
      await api.askAccess(a.id);
      // Ставим «ждём» сами, не дожидаясь снимка: он приходит раз в 2.5 секунды,
      // и всё это время кнопка выглядела бы ненажатой.
      const acc = (S.access = S.access || {});
      acc.pending = [...new Set([...(acc.pending || []), a.id])];
      acc.refused = (acc.refused || []).filter((x) => x !== a.id);
      renderDialog();
    };
  }

  const ta = $('#taskInput');
  if (ta) {
    const submit = async (wanted) => {
      // Гость кладёт на стол в любом случае: сочетания клавиш живут дольше
      // кнопок, и Ctrl+Enter у него иначе уходил бы в сервер за отказом.
      const deliver = wanted && !isGuest();
      const text = ta.value.trim(); if (!text) return;
      if (deliver && armed !== 'yes') { armed = 'yes'; renderArm(); return; }
      armed = '';
      ta.disabled = true;
      const r = await api.sendTask(a.id, text, deliver);
      ta.disabled = false;
      if (!r.ok) S.notice = tr('task.failed', { err: said(r) || '?' });
      else if (!deliver) { S.notice = tr('task.onDeskToast'); toast(tr('task.onDeskTitle', { name: a.name })); }
      else if (r.task && r.task.state === 'failed') S.notice = tr('task.notSent', { err: said(r.task) || '?' });
      else { S.notice = tr('task.sentToast', { name: a.name }); toast(tr('task.sentTitle', { name: a.name })); }
      if (r.ok) ta.value = '';
      ta.focus();
      renderDialog();
    };

    let armed = '';
    const renderArm = () => {
      const b = $('#asSend');
      if (!b) return;
      b.textContent = armed === 'yes' ? tr('dlg.sendConfirm') : tr('dlg.send');
      b.classList.toggle('arm', armed === 'yes');
    };

    ta.onkeydown = (e) => {
      if (e.key === 'Escape') { S.page = 'talk'; renderDialog(); return; }
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      submit(e.ctrlKey || e.metaKey);
    };
    const note = $('#asNote'); if (note) note.onclick = () => submit(false);
    const snd = $('#asSend'); if (snd) snd.onclick = () => submit(true);
    bindNotes(a);
    const sel = $('#sendMode');
    if (sel) sel.onchange = () => api.saveSettings({ delivery: { mode: sel.value } });
  }

  if (S.page === 'talk') { S.sayText = clean(a.lastSaid) || tr('dlg.silent'); S.typed = 0; typewriter(); }
}

// Buttons that live on the notes themselves: send a lying one, or retry a blocked one.
// Ответ на запрос разрешения. Кнопки уходят сразу, не дожидаясь снимка:
// агент по ту сторону ждёт живьём, и «нажалось или нет» — не тот вопрос,
// который человек должен себе задавать.
function bindPermit(a) {
  const rows = [...el.dialog.querySelectorAll('.prow button')];
  if (!rows.length) return;
  const p = permitOf(a.id);
  // Фокус на первой кнопке: карточку открыли ответить, и Enter должен
  // отвечать, а не переключать вкладку под курсором.
  fileIdx = 0;
  paintDialogFocus();
  // Поле записки слушает те же клавиши, что поле задания: Enter отправляет,
  // Shift+Enter переносит строку, Esc возвращает к кнопкам. Другая раскладка в
  // соседнем поле той же карточки — это ошибка, которую делают руками.
  const note = $('#denyNote');
  if (note) note.onkeydown = (e) => {
    if (e.key === 'Escape') { denying = false; renderDialog(); return; }
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    el.dialog.querySelector('.prow [data-a="deny"]')?.click();
  };
  for (const b of rows) {
    b.onclick = async () => {
      const act = b.dataset.a;
      if (act === 'back') { denying = false; renderDialog(); return; }
      if (act === 'deny' && !denying) { denying = true; renderDialog(); setTimeout(() => $('#denyNote')?.focus(), 30); return; }
      if (!p) return;
      for (const x of rows) x.disabled = true;
      const message = act === 'deny' ? ($('#denyNote')?.value || '').trim() : '';
      const r = await api.answerPermit(p.id, act, message);
      denying = false;
      // Сервер мог не найти запрос: ответили с другой вкладки или он истёк.
      // Тогда карточка просто пересобирается и говорит об этом.
      if (r && r.error) UI_toastKey(r);
      else if (act === 'always' && p.rule) api.toast(tr('toast.permitAlways', { rule: p.rule }), 'news');
      else if (act === 'allow') api.toast(tr('toast.permitAllowed', { who: a.name }));
      else if (act === 'deny') api.toast(tr('toast.permitDenied', { who: a.name }), 'wait');
      else if (act === 'terminal') api.toast(tr('toast.permitTerminal', { who: a.name }), 'wait');
      api.forgetPermit(p.id);
      S.page = 'talk';
      renderDialog();
    };
  }
}

// Ошибка сервера — своим текстом, если ключ знаком, и чужим, если нет.
const UI_toastKey = (r) => toast(said(r), 'wait');

function bindNotes(a) {
  el.dialog.querySelectorAll('[data-retry]').forEach((b) => b.onclick = async () => {
    b.disabled = true; b.textContent = tr('note.sending');
    const r = await api.sendTask(a.id, b.dataset.retry, true, 'bypassPermissions');
    S.notice = r.ok && r.task && r.task.state !== 'failed'
      ? tr('task.resent')
      : tr('task.failed', { err: said(r.task) || said(r) || '?' });
    renderDialog();
  });
  el.dialog.querySelectorAll('[data-send]').forEach((b) => b.onclick = async () => {
    const id = Number(b.dataset.send);
    if (armedNote !== id) { armedNote = id; return renderDialog(); }   // asks twice, like the big button
    armedNote = 0;
    b.disabled = true; b.textContent = tr('note.sending');
    const sel = $('#sendMode');
    const r = await api.sendTask(a.id, null, true, sel ? sel.value : null, id);
    const ok = r.ok && r.task && r.task.state !== 'failed';
    S.notice = ok
      ? tr('task.noteSent', { name: a.name })
      : tr('task.failed', { err: said(r.task) || said(r) || '?' });
    if (ok) toast(tr('task.sentTitle', { name: a.name }));
    renderDialog();
  });
}

function bindFiles() {
  const files = (S.focus && S.focus.files) || [];
  el.dialog.querySelectorAll('.files li').forEach((li, i) => li.onclick = () => {
    openFile(decodeURIComponent(li.dataset.path), files.map((f) => ({ ...f, agent: S.focus })), i);
  });
}

export function finishTypewriter() {
  const node = $('#say');
  if (!node || !S.sayText) return;
  clearInterval(S.tw);
  S.typed = S.sayText.length;
  const cut = ((S.focus && S.focus.saidLen) || 0) > S.sayText.length;
  node.textContent = S.sayText + (cut ? ' […]' : ' ▼');
}

function typewriter() {
  const node = $('#say'); if (!node) return;
  clearInterval(S.tw);
  S.tw = setInterval(() => {
    S.typed = Math.min(S.sayText.length, S.typed + 3);
    const done = S.typed >= S.sayText.length;
    const cut = ((S.focus && S.focus.saidLen) || 0) > S.sayText.length;
    node.textContent = S.sayText.slice(0, S.typed) + (done ? (cut ? ' […]' : ' ▼') : '▌');
    if (S.typed >= S.sayText.length) clearInterval(S.tw);
  }, 16);
}

export function closeDialog() {
  el.dialog.hidden = true; dialogKey = ''; armedNote = 0; btnIndex = 0; linkFocused = false; fileIdx = -1;
  clearInterval(S.tw);   // машинка дописывала бы реплику в закрытую карточку
  denying = false;
  // Карточка закрылась — пейджер должен узнать: вопрос, отданный ей, иначе
  // пропадает с экрана совсем.
  cardClosed();
}

// Esc на шаге «отказать с запиской» — это «назад к кнопкам», а не «закрыть
// карточку»: человек только что нажал отказ и ещё ничего не отправил. Зовётся
// из main.js выше общего закрытия.
export function permitEscape() {
  if (!denying) return false;
  denying = false;
  renderDialog();
  return true;
}

// Карточку разрешения открывает пейджер: он знает, у какого агента спросили.
export function openPermit(agentId) {
  const a = (S.agents || []).find((x) => x.id === agentId);
  if (!a) return false;
  S.focus = a; S.dialogOpen = true; S.page = 'permit'; denying = false; S.notice = '';
  renderDialog();
  return true;
}

// ---- arrows walk along the bottom row, Enter presses ----
const actButtons = () => [...el.dialog.querySelectorAll('.acts button')];

// Цифра переключает вкладку карточки: 1 — чем занят, 2 — показать работу,
// 3 — дать задание. «Закрыть» номера не получает, у неё есть Esc. Пока
// печатаешь записку, сюда вообще не доходит: main.js отдаёт клавиши полю.
export function dialogNumber(raw) {
  if (!S || !S.dialogOpen) return false;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 3) return false;
  const b = actButtons()[n - 1];
  if (!b || b.disabled) return false;
  b.click();
  return true;
}
const readLink = () => el.dialog.querySelector('#readAll');
// Строки файлов на вкладке «Показать работу» и кнопки на записках во вкладке
// «Дать задание» — это одно и то же место в карточке: список под текстом, в
// который уводит стрелка вверх. Вкладки не открыты одновременно, поэтому
// достаточно объединить селекторы и не разводить их по страницам.
// «попросить доступ» belongs here too: until 5 September 2026 it was in no
// focus list at all, and a guest could press it with a mouse and by no other
// means — the one button in the office the keyboard could not reach. The tabs
// are never open at the same time, so the selectors can share one list.
const bodyRows = () => [...el.dialog.querySelectorAll(
  '.files li, .notes [data-retry], .notes [data-send], .notes [data-edit], .notes [data-del], .prow button, #askAccess')];

// Стрелка вверх на оборванном ответе уводит фокус на «дочитать»: длинную реплику
// всё равно читают целиком, и тянуться за ней мышью — лишний шаг.
let linkFocused = false;

// То же самое в теле карточки, только целей много. Список файлов и кнопки на
// записках были кликабельными и только кликабельными: ни открыть работу
// агента, ни переслать записку без мыши было нельзя.
let fileIdx = -1;

// Фокус живёт в переменной, а видно его по классу на узле — и перерисовка узел
// меняет. Поэтому красим заново после каждого обновления карточки, а если ссылки
// на новой вкладке нет, фокус возвращается на кнопки: иначе подсветки не видно
// нигде и нажимать нечего.
function paintDialogFocus() {
  if (linkFocused && !readLink()) linkFocused = false;
  const rows = bodyRows();
  // Файлы и записки приходят живым потоком, и строка под курсором может уехать.
  // Тогда фокус возвращается на кнопки, а не висит на пустоте.
  if (fileIdx >= rows.length) fileIdx = -1;
  const inBody = linkFocused || fileIdx >= 0;
  actButtons().forEach((b, i) => b.classList.toggle('focus', !inBody && i === btnIndex));
  const link = readLink();
  if (link) link.classList.toggle('focus', linkFocused);
  rows.forEach((li, i) => li.classList.toggle('focus', i === fileIdx));
}

export function moveDialogFocus(step) {
  const list = actButtons();
  if (!list.length) return;
  linkFocused = false;
  fileIdx = -1;
  btnIndex = (btnIndex + step + list.length) % list.length;
  paintDialogFocus();
}

// Пока реплика печатается, первый Enter или ПРОБЕЛ дописывает её целиком, а не
// нажимает то, на чём стоит фокус. Мышью это делалось кликом по самому тексту —
// клавиши не было вообще, и ждать машинку приходилось молча.
const stillTyping = () => S.page === 'talk' && !!$('#say') && !!S.sayText
  && S.typed < S.sayText.length;

export function pressDialogFocus() {
  // Дописывает машинку только тот Enter, который иначе нажал бы кнопку под
  // фокусом. Ушёл стрелкой вверх — на ссылку транскрипта или на файл — значит
  // уже выбрал, что делать, и перехватывать у него клавишу нельзя. 3 сентября
  // 2026 перехватывала: чтобы открыть транскрипт во весь экран, приходилось
  // жать Enter дважды, и первое нажатие выглядело как «не сработало».
  if (stillTyping() && !linkFocused && fileIdx < 0) { finishTypewriter(); return; }
  if (linkFocused) {
    const link = readLink();
    if (link) link.click();
    return;
  }
  if (fileIdx >= 0) {
    const row = bodyRows()[fileIdx];
    // Строка могла уехать с обновлением снимка между отрисовкой и нажатием.
    // Молча ничего не делать тут нельзя: это читается как «Enter не работает».
    if (row) { row.click(); return; }
    fileIdx = -1;
    paintDialogFocus();
  }
  const b = actButtons()[btnIndex];
  if (b && !b.disabled) b.click();
}

// Вверх: сначала домотать текст до верха, а с верхней строки — прыгнуть на ссылку.
// На только что открытой карточке верх и так виден, поэтому первый же нажим
// попадает на ссылку — ровно то, зачем это делалось.
export function dialogUp() {
  const body = el.dialog.querySelector('.body');
  const rows = bodyRows();
  if (rows.length) {
    // Заходим в список снизу, с последнего файла: кнопки стоят под ним, и вверх
    // — это шаг к ближайшей строке, а не прыжок через весь список.
    if (fileIdx < 0) fileIdx = rows.length - 1;
    else if (fileIdx > 0) fileIdx -= 1;
    else return scrollDialogBody(-1);   // выше первой строки листать, а не выходить
    paintDialogFocus();
    rows[fileIdx].scrollIntoView({ block: 'nearest' });
    return;
  }
  if (!linkFocused && readLink() && (!body || body.scrollTop <= 2)) {
    linkFocused = true;
    // Встал на блок транскрипта — значит читать будешь там, и машинка тут
    // больше не нужна: она дописывает текст сама и тянет внимание обратно.
    // То же правило ядро уже применяло к новой реплике, пришедшей при
    // выбранной ссылке, — здесь оно просто срабатывает и на само нажатие.
    finishTypewriter();
    paintDialogFocus();
    const link = readLink();
    if (link) link.scrollIntoView({ block: 'nearest' });
    return;
  }
  scrollDialogBody(-1);
}

export function dialogDown() {
  if (linkFocused) { linkFocused = false; paintDialogFocus(); }
  const rows = bodyRows();
  if (fileIdx >= 0) {
    // С последней строки вниз — обратно на кнопки: тупик внизу списка читается
    // как «клавиатура сломалась».
    fileIdx = fileIdx + 1 < rows.length ? fileIdx + 1 : -1;
    paintDialogFocus();
    if (fileIdx >= 0) rows[fileIdx].scrollIntoView({ block: 'nearest' });
    return;
  }
  scrollDialogBody(1);
}

export function scrollDialogBody(step) {
  const body = el.dialog.querySelector('.body');
  if (body) body.scrollTop += step * 42;
}

// ------------------------------------------------------------------ viewer
// The board and an agent's file list feed the same viewer, so arrows work in both:
// in the grid they move the pick, inside a file they leaf through the rest.
let gallery = { items: [], title: '', sel: 0, mode: 'grid' };

export function openGallery(items, title) {
  gallery = { items, title, sel: 0, mode: 'grid' };
  renderGallery();
}

function renderGallery() {
  const { items, title, sel } = gallery;
  gallery.mode = 'grid';
  mdSource = null;   // back to the grid: R has nothing to toggle
  el.viewer.hidden = false;
  el.viewer.innerHTML = `<div class="vwrap"><div class="vhead">${esc(title)} · ${items.length} работ
      ${items.length ? `<span class="zhint">${tr('gal.pick')}</span>` : ''}
      <button id="vx">✕</button></div>
    <div class="grid">${items.map((f, i) => `<figure data-i="${i}" class="${i === sel ? 'sel' : ''}">
      <div class="thumb">${f.image
        ? `<img src="/api/file?path=${encodeURIComponent(f.path)}" loading="lazy" class="thumbimg">`
        : '▤'}</div>
      <figcaption>${esc(f.name)}<span>${f.agent ? esc(f.agent.name + ' · ' + f.agent.project) : ''}</span></figcaption></figure>`).join('')
      || `<p class="empty">${tr('gal.empty')}</p>`}</div></div>`;
  $('#vx').onclick = closeViewer;
  // Обработчик вешается кодом, а не атрибутом onerror в разметке: строка в
  // атрибуте — это скрипт, собранный из текста, и однажды в него попала бы
  // кавычка из словаря. Заодно это то, что запретит CSP, когда он появится.
  el.viewer.querySelectorAll('img.thumbimg').forEach((im) => {
    im.onerror = () => im.replaceWith(Object.assign(document.createElement('span'), { textContent: '✕' }));
  });
  el.viewer.querySelectorAll('figure').forEach((f) => f.onclick = () => {
    gallery.sel = Number(f.dataset.i);
    openFile(gallery.items[gallery.sel].path, gallery.items, gallery.sel, gallery.title);
  });
  const picked = el.viewer.querySelector('figure.sel');
  if (picked) picked.scrollIntoView({ block: 'nearest' });
}

// ------------------------------------------------ копирование блоков кода
// Кнопку рисует markdown.js, нажатие ловится здесь и одной делегацией на
// панель: блоков в транскрипте бывают сотни, и вешать обработчик на каждый —
// это сотни обработчиков, переживающих перерисовку.
//
// Буфер обмена в браузере доступен только на localhost или по https. Офис
// открывают и по туннелю, и по адресу в сети — там `navigator.clipboard` либо
// отсутствует, либо отказывает, поэтому за ним стоит старый `execCommand`, а
// если и он не сработал, кнопка говорит «не вышло» вместо того, чтобы соврать
// зелёным.
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* туннель или http — падаем на запасной путь */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// Состояние живёт на самой кнопке полторы секунды и возвращается в покой.
// Отдельной строки статуса нет нарочно: кнопка и есть ответ.
async function copyBlock(btn) {
  const block = btn.closest('.mdblock');
  const code = block && block.querySelector('pre.mdcode code');
  if (!code) return false;
  const ok = await copyText(code.textContent);
  btn.classList.remove('done', 'fail');
  btn.classList.add(ok ? 'done' : 'fail');
  btn.textContent = tr(ok ? 'md.copied' : 'md.copyFail');
  clearTimeout(btn._back);
  btn._back = setTimeout(() => {
    btn.classList.remove('done', 'fail');
    btn.textContent = tr('md.copy');
  }, ok ? 1500 : 4000);
  return ok;
}

// Клавиша копирует верхний блок, попавший в экран, — тот, который читают.
// Ниже экрана блоки есть почти всегда, и копировать первый в документе значило
// бы копировать не то, что видно.
function copyTopBlock() {
  const box = el.viewer.querySelector('#chatlog') || el.viewer.querySelector('.vbody') || el.viewer;
  const top = box.getBoundingClientRect ? box.getBoundingClientRect().top : 0;
  const blocks = [...el.viewer.querySelectorAll('.mdblock')];
  if (!blocks.length) return false;
  const seen = blocks.find((b) => b.getBoundingClientRect().bottom > top + 4) || blocks[0];
  const btn = seen.querySelector('.mdcopy');
  if (!btn) return false;
  btn.scrollIntoView({ block: 'nearest' });
  copyBlock(btn);
  return true;
}

// A path or a link is copied by the fragment itself: the button beside it takes
// the click, the fragment answers with a flash. Its text is never swapped —
// «copied» is two characters longer than «copy» in Russian and would move the
// sentence it sits in.
async function copyInline(btn) {
  const wrap = btn.closest('.mdcopyable');
  if (!wrap) return false;
  const body = wrap.querySelector('code, a');
  const text = btn.dataset.copy || (body ? body.textContent : '');
  if (!text) return false;
  const ok = await copyText(text);
  wrap.classList.remove('done', 'fail');
  wrap.classList.add(ok ? 'done' : 'fail');
  clearTimeout(wrap._back);
  wrap._back = setTimeout(() => wrap.classList.remove('done', 'fail'), ok ? 1200 : 4000);
  return ok;
}

// ------------------------------------------------------------- digit picking
// The office is keyboard-first, and a button reachable only by mouse is a
// half-built one. C copies the block you are reading; pressed again — or where
// there is no block — it numbers everything copyable on screen, and a digit
// takes it. Digits already pick in this office: inventory tabs, lift floors,
// radio waves, so the gesture is not a new one.
let picked = [];
let copiedByC = false;

const pickBox = () => el.viewer.querySelector('#chatlog') || el.viewer.querySelector('.single') || el.viewer;

// Only what is on screen: nine badges are a promise about the visible page, not
// about a transcript of four hundred messages.
function pickTargets() {
  const box = pickBox();
  if (!box.getBoundingClientRect) return [];
  const r = box.getBoundingClientRect();
  return [...el.viewer.querySelectorAll('.mdblock, .mdcopyable')]
    .filter((n) => {
      const b = n.getBoundingClientRect();
      return b.bottom > r.top + 2 && b.top < r.bottom - 2;
    })
    .slice(0, 9);
}

// A key that answers with silence is the kind this project keeps paying for, so
// an empty page says so in the header instead of swallowing the press.
function pickNothing() {
  const head = el.viewer.querySelector('.vhead');
  if (!head || el.viewer.querySelector('.pickhint')) return;
  const hint = document.createElement('span');
  hint.className = 'pickhint';
  hint.textContent = tr('md.nothing');
  head.appendChild(hint);
  setTimeout(() => hint.remove(), 1500);
}

export function pickOpen() {
  pickClose();
  picked = pickTargets();
  if (!picked.length) { pickNothing(); return false; }
  picked.forEach((n, i) => { n.classList.add('picked'); n.dataset.pick = String(i + 1); });
  const head = el.viewer.querySelector('.vhead');
  if (head && !el.viewer.querySelector('.pickhint')) {
    const hint = document.createElement('span');
    hint.className = 'pickhint';
    hint.textContent = tr('md.pick');
    head.appendChild(hint);
  }
  return true;
}

export function pickClose() {
  if (!picked.length) return;
  for (const n of picked) { n.classList.remove('picked'); delete n.dataset.pick; }
  picked = [];
  const hint = el.viewer.querySelector('.pickhint');
  if (hint) hint.remove();
  // Whatever the server sent while the numbers were up has been waiting; put it
  // in now, the same way the note editor does when it closes.
  if (chatView && chatView.pending) {
    const waiting = chatView.pending;
    chatView.pending = null;
    paintChat(waiting.msgs, waiting.fresh, true);
  }
}

export const pickOn = () => picked.length > 0;

function pickTake(n) {
  const node = picked[n - 1];
  pickClose();
  if (!node) return true;
  const btn = node.querySelector('.mdcopy') || node.querySelector('.mdcopy-in');
  if (!btn) return true;
  if (node.classList.contains('mdblock')) copyBlock(btn); else copyInline(btn);
  return true;
}

// Строка клавиш внизу перечисляет то, что работает, — и обещание должно быть
// правдой: C копирует, только когда в панели есть блок кода, поэтому и в
// подсказке она появляется только тогда. Пустое обещание клавиши офис уже
// проходил на радио, когда «R — радио» стояло в строке бесплатной сборки.
export function paintCopyHint() {
  if (!el.viewer || el.viewer.hidden) return;
  const line = el.viewer.querySelector('.vpath');
  if (!line || line.dataset.copyHint) return;
  if (!el.viewer.querySelector('.mdblock')) return;
  line.dataset.copyHint = '1';
  const piece = document.createElement('span');
  piece.textContent = ` · C — ${tr('md.copy')}`;
  line.appendChild(piece);
}

// Делегация ставится один раз на панель просмотра: разметка внутри неё
// перерисовывается постоянно, а обработчик переживает это, потому что висит
// выше.
export function bindCopyButtons() {
  // Подставной DOM клавиатурных стендов слушателей не умеет, и это не повод
  // им падать: они проверяют состояние, а не подписку.
  if (!el.viewer || !el.viewer.addEventListener || el.viewer._copyBound) return;
  el.viewer._copyBound = true;
  el.viewer.addEventListener('click', (e) => {
    if (!e.target || !e.target.closest) return;
    const block = e.target.closest('.mdcopy');
    if (block) { e.preventDefault(); copyBlock(block); return; }
    // The inline button sits inside the link's wrapper, so the check has to run
    // before the browser follows the link — hence preventDefault here too.
    const inline = e.target.closest('.mdcopy-in');
    if (inline) { e.preventDefault(); e.stopPropagation(); copyInline(inline); }
  });
}

// `title` is what Esc goes back to: a board has one, an agent's file list does not
let viewToken = 0;

// .md and .html open rendered by default; each switch is remembered separately
const MD_RAW_KEY = 'valey-md-raw';
const HTML_RAW_KEY = 'valey-html-raw';
let mdRaw = localStorage.getItem(MD_RAW_KEY) === '1';
let htmlRaw = localStorage.getItem(HTML_RAW_KEY) === '1';
let mdSource = null;
let docKind = null;        // 'md' | 'html' — what the switch is switching
let htmlScripts = false;   // scripts stay off until you ask for them

const plainText = (t) => esc(t.slice(0, 20000));

// js/css/json get coloured; everything else stays plain text
const codeBody = (txt, lang) => (lang
  ? `<pre class="code lang-${lang}">${highlight(txt.slice(0, 60000), lang)}</pre>`
  : `<pre>${plainText(txt)}</pre>`);
const mdBody = (txt) => (mdRaw
  ? `<pre>${plainText(txt)}</pre>`
  : `<div class="md">${renderMarkdown(txt.slice(0, 120000))}</div>`);

// The page is rendered inside a sandboxed frame: its styles cannot leak into the
// office, and its scripts stay dead until you press the button.
const htmlBody = (txt) => (htmlRaw
  ? `<pre class="code lang-html">${highlight(txt.slice(0, 60000), 'html')}</pre>`
  : `<iframe class="htmlframe" sandbox="${htmlScripts ? 'allow-scripts' : ''}"
       srcdoc="${esc(txt.slice(0, 400000))}"></iframe>
     <div class="framebar">${tr('doc.sandbox', { state: htmlScripts ? tr('doc.scriptsOn') : tr('doc.scriptsOff') })}
       <button id="htmlscripts">${htmlScripts ? tr('doc.stopScripts') : tr('doc.runScripts')}</button></div>`);

const docBody = () => (docKind === 'md' ? mdBody(mdSource) : htmlBody(mdSource));
const toggleLabel = () => (docKind === 'md'
  ? (mdRaw ? tr('doc.markdown') : tr('doc.source'))
  : (htmlRaw ? tr('doc.page') : tr('doc.source')));

function bindDocControls() {
  const md = $('#mdtoggle');
  if (md) md.onclick = toggleMarkdownRaw;
  const sc = $('#htmlscripts');
  if (sc) sc.onclick = () => { htmlScripts = !htmlScripts; redrawDoc(); };
  paintHeadFocus();
}

function redrawDoc() {
  const box = el.viewer.querySelector('.single');
  const btn = $('#mdtoggle');
  if (box) { box.innerHTML = docBody(); box.scrollTop = 0; }
  if (btn) btn.textContent = toggleLabel();
  bindDocControls();
}

export function toggleMarkdownRaw() {
  if (mdSource === null || !docKind) return false;
  if (docKind === 'md') {
    mdRaw = !mdRaw;
    localStorage.setItem(MD_RAW_KEY, mdRaw ? '1' : '0');
  } else {
    htmlRaw = !htmlRaw;
    localStorage.setItem(HTML_RAW_KEY, htmlRaw ? '1' : '0');
  }
  redrawDoc();
  return true;
}

export async function openFile(p, items = null, index = -1, title = '') {
  gallery = items
    ? { items, title, sel: index, mode: 'single' }
    : { items: [], title: '', sel: 0, mode: 'single' };

  const mine = ++viewToken;   // holding an arrow down must not race text loads
  el.viewer.hidden = false;
  const url = '/api/file?path=' + encodeURIComponent(p);
  const isImg = /\.(png|jpe?g|gif|svg|webp)$/i.test(p);
  const isMd = /\.(md|markdown|mdx)$/i.test(p);
  const isHtml = /\.html?$/i.test(p);
  let inner;
  if (isImg) {
    inner = `<div class="zoomwrap"><img class="full" id="zimg" src="${url}"></div>`;
  } else {
    const txt = await fetch(url, { headers: owned() }).then((r) => r.ok ? r.text() : tr('gal.notServed') + r.status).catch((e) => e.message);
    if (mine !== viewToken) return;   // arrows moved on while this one was loading
    docKind = isMd ? 'md' : isHtml ? 'html' : null;
    mdSource = docKind ? txt : null;
    inner = docKind ? docBody() : codeBody(txt, langOf(p));
  }
  const many = gallery.items.length > 1;
  const back = gallery.title ? tr('gal.toGrid') : tr('gal.back');
  el.viewer.innerHTML = `<div class="vwrap"><div class="vhead">${esc(p.split('/').pop())}
      <span class="zhint">${many ? tr('gal.of', { i: gallery.sel + 1, n: gallery.items.length }) : ''}${isImg ? tr('gal.loupe') : ''}${docKind ? `R — ${toggleLabel()} · ` : ''}${!isImg && !docKind && langOf(p) ? `${langOf(p)} · ` : ''}Esc — ${back}</span>
      ${docKind ? `<button id="mdtoggle">${toggleLabel()}</button>` : ''}
      <button id="vx">✕</button></div>
    <div class="single">${inner}</div><div class="vpath">${esc(p)}</div></div>`;
  $('#vx').onclick = closeViewer;
  bindDocControls();
  paintCopyHint();
  const img = $('#zimg');
  if (img) {
    img.onclick = () => { img.classList.toggle('pixel'); };
    img.onerror = () => img.replaceWith(Object.assign(document.createElement('p'), { className: 'empty', textContent: tr('gal.gone') }));
  }
}

function leaf(step) {
  const n = gallery.items.length;
  if (n < 2) return;
  const next = (gallery.sel + step + n) % n;
  openFile(gallery.items[next].path, gallery.items, next, gallery.title);
}

function columns() {
  const figs = [...el.viewer.querySelectorAll('figure')];
  if (!figs.length) return 1;
  const top = figs[0].offsetTop;
  return Math.max(1, figs.filter((f) => f.offsetTop === top).length);
}

export function closeViewer() {
  el.viewer.hidden = true;
  chatView = null;
  mdSource = null;
  docKind = null;
  htmlScripts = false;
  gallery = { items: [], title: '', sel: 0, mode: 'grid' };
}

const VIEWER_KEYS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'pageup', 'pagedown', 'home', 'end', 'enter', ' ', 'escape', 'r', 'к', 'z', 'я'];

// Кнопки в шапке открытого файла: переключить исходник и разрешить скрипты в
// песочнице. Отдельной буквы у скриптов нарочно нет — случайно нажатая клавиша
// не должна запускать чужой код, поэтому до неё надо дойти стрелками и нажать.
let headIdx = 0;
const headBtns = () => [...el.viewer.querySelectorAll('#mdtoggle, #htmlscripts')];

function paintHeadFocus() {
  const list = headBtns();
  if (!list.length) return;
  headIdx = Math.max(0, Math.min(list.length - 1, headIdx));
  list.forEach((b, i) => b.classList.toggle('focus', i === headIdx));
}

// true means the key belonged to the viewer and the office should ignore it
// Which screen is up, for the keys panel. It asks rather than guesses: only this
// file knows that the viewer has two states — a wall of thumbnails and one open
// file — and they are not the same place. ESC leaves the file for the gallery and
// the gallery for the room, so one caption cannot serve both.
export function viewerOpen() {
  if (!el.viewer || el.viewer.hidden) return null;
  return gallery.mode === 'single' ? 'single' : 'gallery';
}
export function rosterOpen() { return !!(el.roster && !el.roster.hidden); }
export function liftOpen() { return !!(el.lift && !el.lift.hidden); }
// The tab the card is reading. In «поговорить» the cursor sits in the field, and
// that is a different place from the card itself: there the letters type.
export function cardPage() { return S.page; }

export function viewerKey(raw, big = false) {
  if (el.viewer.hidden) return false;
  const key = raw.toLowerCase();
  // While the numbers are up they own the digits, ESC and C; anything else
  // takes them down and goes on to do its usual job, so scrolling away from
  // what you numbered cannot leave stale badges behind.
  if (pickOn()) {
    if (/^[1-9]$/.test(key)) return pickTake(Number(key));
    if (key === 'escape' || key === 'c' || key === 'с') { pickClose(); return true; }
    pickClose();
  }

  // C copies the block you are reading — in the transcript and in a file alike.
  // Outside the viewer this letter opens the inventory on «on you», and until
  // 4 September 2026 it did that on top of an open viewer: letters fell through
  // the panel into the office. Inside the viewer there is nothing to change
  // into and plenty to copy; the inventory stays one press away on I.
  //
  // Pressed a second time — or where the screen holds no code block — it hands
  // the page to the digits instead.
  if (key === 'c' || key === 'с') {
    if (!copiedByC && el.viewer.querySelector('.mdblock') && copyTopBlock()) {
      copiedByC = true;
      return true;
    }
    copiedByC = false;
    return pickOpen() || true;
  }
  copiedByC = false;
  if (transcriptKey(key, big)) return true;
  const n = gallery.items.length;

  if (gallery.mode === 'single') {
    if (key === 'r' || key === 'к') return toggleMarkdownRaw();
    // Лупа по пикселям — действие над самой картинкой, кнопки у неё нет, и
    // мышью это был единственный способ разглядеть пиксель.
    if (key === 'z' || key === 'я') {
      const img = $('#zimg');
      if (img) { img.classList.toggle('pixel'); return true; }
      return true;
    }
    if (key === 'arrowleft') { leaf(-1); return true; }
    if (key === 'arrowright') { leaf(1); return true; }
    if (key === 'arrowup' || key === 'arrowdown') {
      const list = headBtns();
      if (!list.length) return true;
      headIdx = (headIdx + (key === 'arrowup' ? -1 : 1) + list.length) % list.length;
      paintHeadFocus();
      return true;
    }
    if (key === 'enter' || key === ' ') {
      const b = headBtns()[headIdx];
      if (b) { b.click(); return true; }
      return VIEWER_KEYS.includes(key);
    }
    if (key === 'escape') {
      if (gallery.title) renderGallery(); else closeViewer();
      return true;
    }
    return VIEWER_KEYS.includes(key);
  }

  if (key === 'escape') { closeViewer(); return true; }
  if (!n) return VIEWER_KEYS.includes(key);

  const cols = columns();
  const step = { arrowleft: -1, arrowright: 1, arrowup: -cols, arrowdown: cols }[key];
  if (step !== undefined) {
    gallery.sel = Math.max(0, Math.min(n - 1, gallery.sel + step));
    renderGallery();
    return true;
  }
  if (key === 'enter' || key === ' ') {
    openFile(gallery.items[gallery.sel].path, gallery.items, gallery.sel, gallery.title);
    return true;
  }
  return false;
}

// ------------------------------------------------------- morning round (Tab)
// Rebuilt only when the list itself changes; otherwise the rows are patched in
// place, so the scroll position survives the two-second refresh.
let rosterSig = '';

export function renderRoster() {
  const waiting = S.agents.filter((a) => a.status === 'awaiting');
  const byRoom = new Map();
  for (const a of waiting) {
    if (!byRoom.has(a.project)) byRoom.set(a.project, []);
    byRoom.get(a.project).push(a);
  }
  const done = waiting.filter((a) => S.visited.has(a.id)).length;
  el.roster.hidden = false;

  const key = [...byRoom.entries()].map(([room, list]) =>
    room + ':' + list.map((a) => a.id + (S.visited.has(a.id) ? '✓' : '')).join(',')).join('|');

  if (key === rosterSig && el.roster.querySelector('.rbody')) {
    patchRoster(waiting, done);
    return;
  }
  rosterSig = key;

  const body = el.roster.querySelector('.rbody');
  const scroll = body ? body.scrollTop : 0;

  el.roster.innerHTML = `<div class="rwrap">
    <div class="vhead"><span id="rcount">${tr('round.title', { done, n: waiting.length })}</span><button id="rx">✕</button></div>
    <div class="rbody">${[...byRoom.entries()].map(([room, list]) => `
      <div class="rgroup"><h4>▣ ${esc(room)}</h4>${list.map((a) => `
        <div class="rrow ${S.visited.has(a.id) ? 'done' : ''}" data-id="${esc(a.id)}">
          <span class="rname">${S.visited.has(a.id) ? '✓' : '·'} ${esc(a.name)}</span>
          <span class="rwhat"><b>${esc(a.title || tr('round.untitled'))}</b>
            <i>${esc(clean(a.lastSaid).slice(0, 60) || actText(a))} · ${ago(a.idleFor)}</i></span>
          <button class="go" data-go="${esc(a.id)}">${tr('round.lead')}</button>
        </div>`).join('')}</div>`).join('') || `<p class="empty">${tr('round.nobody')}</p>`}
    </div></div>`;

  const fresh = el.roster.querySelector('.rbody');
  if (fresh) fresh.scrollTop = scroll;

  $('#rx').onclick = closeRoster;
  el.roster.querySelectorAll('[data-go]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    api.guideTo(b.dataset.go);
    closeRoster();
  });
  rosterRing.paint();
}

function patchRoster(waiting, done) {
  const count = $('#rcount');
  const label = tr('round.title', { done, n: waiting.length });
  if (count && count.textContent !== label) count.textContent = label;
  for (const a of waiting) {
    const row = el.roster.querySelector(`.rrow[data-id="${a.id}"]`);
    if (!row) continue;
    const title = row.querySelector('b');
    const line = row.querySelector('i');
    const t = a.title || tr('round.untitled');
    const l = `${clean(a.lastSaid).slice(0, 60) || actText(a)} · ${ago(a.idleFor)}`;
    if (title && title.textContent !== t) title.textContent = t;
    if (line && line.textContent !== l) line.textContent = l;
  }
}

// Обход открывается клавишей TAB и до сих пор требовал мыши, чтобы хоть что-то
// в нём нажать. Действие у панели ровно одно — «вести», — поэтому фокус ходит
// по этим кнопкам и ни по чему больше.
const rosterRing = focusRing(() => el.roster, '.go');
export function closeRoster() { el.roster.hidden = true; rosterSig = ''; rosterRing.reset(); }
export function rosterKey(raw) { return rosterRing.key(raw, el.roster && !el.roster.hidden); }

// -------------------------------------------------------------------- инвентарь
// Панель «Как ты выглядишь» переехала сюда целиком и стала вкладкой «на себе»:
// слева цвета, справа тело. Съёмное ушло на «вещи» и показывается сеткой, а не
// строками с ◀▶ — галстуков в дресс-коде будет восемнадцать, и перебирать их
// стрелкой это не выбор, а перелистывание.
//
// Вкладки лежат списком, а не тремя ветками if: «ключи» и «офис» из того же
// макета приезжают следующими коммитами и добавляются сюда одной строкой.
// Макет: Figma, секция «🔵 WIP — Дресс-код и инвентарь · Ready for Dev»,
// кадры 556:56 (на себе) и 556:508 (вещи).
const COLORS = [
  { key: 'skin', list: SKIN },
  { key: 'hair', list: HAIR },
  { key: 'shirt', list: SHIRT },   // подменяется офисной рубашкой, см. colorFields()
  { key: 'pants', list: PANTS },
  { key: 'boots', list: BOOTS },
];
const colorFields = () => COLORS.map((f) => (f.key === 'shirt' ? { ...topField(), label: 'shirt' } : f));
const BODY = [
  { key: 'tall', list: [0, 1] },
  { key: 'style', list: [0, 1, 2, 3, 4] },
  { key: 'face', list: FACES },
];
// Слот сетки умеет читать и писать не только S.me[key]: галстук лежит парой
// «цвет + крой», и разложить его на две строки честнее, чем городить
// восемнадцать клеток в одну.
const THINGS = [
  { key: 'head', list: HEADS },
  { key: 'glasses', list: [false, true] },
  { key: 'hands', list: HANDS },
  { key: 'tie', office: true, list: [null, ...TIE],
    get: () => (S.me.tie ? S.me.tie.color : null),
    set: (v) => { S.me.tie = v ? { cut: (S.me.tie && S.me.tie.cut) || 'plain', color: v } : null; } },
  { key: 'cut', office: true, list: CUTS,
    get: () => (S.me.tie ? S.me.tie.cut : null),
    set: (v) => { S.me.tie = { cut: v, color: (S.me.tie && S.me.tie.color) || TIE[0] }; } },
  { key: 'jacket', office: true, list: [null, ...JACKET] },
];
const readSlot = (f) => (f.get ? f.get() : S.me[f.key]);
// Подпись клетки. У галстука и пиджака значение — цвет, и ключа в словаре под
// него не бывает: показываем сам цвет, а «нет» переводим.
const cellTitle = (f, v) => (f.key === 'tie' || f.key === 'jacket'
  ? (v ? String(v) : tr('val.none'))
  : tr(`val.${f.key}.${v}`));
const writeSlot = (f, v) => { if (f.set) f.set(v); else S.me[f.key] = v; };

const FIELDS = [...COLORS, ...BODY];
// Keys take the last slot rather than the third one the first frame showed: the
// tree is already there and working, and moving it for a new neighbour means
// retraining a hand that has learned its digit. Decided 5 September 2026, frame
// «Ключи в инвентаре · Ready for Dev».
const TABS = ['self', 'things', 'office', 'tree', 'keys'];
// Гость вкладку «дерево» не видит: у него чужой этаж, и из чего он собран —
// не его вопрос.
const tabs = () => (isGuest() ? TABS.filter((t) => t !== 'tree') : TABS);
let bagTab = 'self';

// Дресс-код читается отсюда же, из настроек офиса: он общий, а не браузерный.
const dressCode = () => (S.settings && S.settings.dress && S.settings.dress.code) || 'casual';
const officeOn = () => dressCode() === 'office';
// В офисном режиме «верх» правит офисную рубашку, а не свободную кофту: иначе
// переключение туда-обратно съедало бы выбранный цвет.
const topField = () => (officeOn()
  ? { key: 'shirtWork', list: [...SHIRT_WORK, ...BLOUSE.filter((c) => !SHIRT_WORK.includes(c))] }
  : { key: 'shirt', list: SHIRT });
const bottomCut = { key: 'bottom', list: BOTTOMS };

const colorRow = (f) => `<div class="drow"><button data-f="${f.key}" data-d="-1">◀</button>
  <span class="dname">${tr('dress.' + (f.label || f.key))}</span>
  <span class="sw" data-k="${f.key}" style="background:${S.me[f.key]}"></span>
  <button data-f="${f.key}" data-d="1">▶</button></div>`;

const bodyRow = (f) => `<div class="drow"><button data-f="${f.key}" data-d="-1">◀</button>
  <span class="dname">${tr('dress.' + f.key)}</span>
  <span class="dval" data-k="${f.key}">${tr(`val.${f.key}.${S.me[f.key]}`)}</span>
  <button data-f="${f.key}" data-d="1">▶</button></div>`;

const selfHtml = () => `<div class="dbody">
      <canvas id="me" width="72" height="86"></canvas>
      <div class="rows">
        <label class="namerow">${tr('dress.name')} <input id="myname" maxlength="14" value="${esc(S.me.name || '')}" placeholder="${tr('label.me')}"></label>
        <p class="tally">${tr('dress.tally', { water: S.me.drinks || 0, coffee: S.me.coffees || 0 })}</p>
        <p class="dcap">${tr('dress.colors')}</p>
        ${colorFields().map(colorRow).join('')}
      </div>
      <div class="rows">
        <p class="dcap">${tr('bag.body')}</p>
        ${BODY.map(bodyRow).join('')}
        ${officeOn() ? `<p class="dcap">${tr('bag.cut')}</p>${bodyRow(bottomCut)}` : ''}
      </div>
    </div>`;

const thingsHtml = () => `<div class="bbody">
      ${THINGS.map((f) => `<div class="bcat" data-slot="${f.key}">
        <p class="dcap">${tr('dress.' + f.key)}${f.office && !officeOn() ? ` <span class="dim">${tr('bag.onlyOffice')}</span>` : ''}</p>
        <div class="brow">${f.list.map((v, i) => `<button class="bcell${readSlot(f) === v ? ' on' : ''}"
          data-slot="${f.key}" data-i="${i}" title="${cellTitle(f, v)}"><canvas width="48" height="48"></canvas></button>`).join('')}</div>
      </div>`).join('')}
      <p class="hint">${tr('bag.thingsNote')}</p>
    </div>`;

// -------------------------------------------------------------- the keys tab
// A shelf of the office's connections outward. The card is drawn by whoever
// owns the key: the core draws its own (the CLI and the weather), modules draw
// theirs through the 'keys' hook. Hardcoding them here would put the Figma card
// on the shelf of a free build that has no easel behind it.
//
// A card hands in { id, name, state, word, icon(ctx), body(), bind(root) }.
// state is 'on' | 'off' | 'bad': works, not connected, broken. Three words and
// not two, because «not connected» is fixed by pasting a key and «not logged
// in» by a trip to the terminal — merging them sends people to the wrong place.
//
// Frames: section «🔵 WIP — Ключи в инвентаре · Ready for Dev», 564:2 (Figma),
// 565:74 (Claude CLI), 571:2 (Spotify).

// The Claude CLI icon — a terminal window with three lines, as on the frame.
function cliIcon(c) {
  c.fillStyle = '#1c130d'; c.fillRect(0, 0, 48, 36);
  c.fillStyle = '#8c7660';
  c.fillRect(8, 12, 22, 3); c.fillRect(8, 19, 32, 3); c.fillRect(8, 26, 16, 3);
}
// Weather — a sun behind a cloud, the same one the window on the world draws.
// The sun sits up and to the right so that it peeks out: hidden entirely, it
// turned the icon into a grey blob — visible only on a real frame, never in the
// markup.
function skyIcon(c) {
  c.fillStyle = '#1c130d'; c.fillRect(0, 0, 48, 36);
  c.fillStyle = '#ffd166'; c.fillRect(28, 6, 11, 11);
  c.fillStyle = '#c9b391';
  c.fillRect(9, 20, 22, 7); c.fillRect(13, 16, 13, 5); c.fillRect(7, 23, 28, 4);
}

const cliState = () => {
  const d = S.delivery || {};
  if (d.available) return 'on';
  return d.account && d.account.loggedIn === false ? 'bad' : 'off';
};

const coreKeys = () => [
  {
    id: 'cli',
    name: 'Claude CLI',
    state: cliState(),
    word: () => tr('key.cli.' + cliState()),
    icon: cliIcon,
    body: () => {
      const d = S.delivery || {};
      const who = d.account && d.account.email ? `<p class="keynote">${tr('key.cli.who', { email: esc(d.account.email) })}</p>` : '';
      return `<p class="keygives">${tr('key.cli.gives')}</p>
        <div class="keycmd"><code>claude</code><span>${tr('key.cli.then')}</span><code>/login</code>
          <span class="dim">${tr('key.cli.or')}</span><code>claude setup-token</code>
          <button class="obtn" data-copy="claude">${tr('key.copy')}</button></div>
        <p class="hint">${tr('key.cli.note')}</p>
        ${who}
        <div class="keyfoot"><span class="dim">${tr('key.cli.rechecks')}</span>
          <button class="obtn" data-act="recheck">${tr('key.cli.check')}</button></div>`;
    },
    bind: (root) => {
      const b = root.querySelector('[data-act="recheck"]');
      if (b) b.onclick = async () => { await api.recheckCli(); renderBag(); };
    },
  },
  {
    id: 'sky',
    name: tr('key.sky.name'),
    state: (S.settings && S.settings.weather && S.settings.weather.enabled) ? 'on' : 'off',
    word: () => tr('key.sky.' + ((S.settings && S.settings.weather && S.settings.weather.enabled) ? 'on' : 'off')),
    icon: skyIcon,
    // Weather is the one connection without a key: a pair of coordinates goes
    // out, not a secret. Hence no field here, only the way to the window.
    body: () => `<p class="keygives">${tr('key.sky.gives')}</p>
      <p class="hint">${tr('key.sky.note')}</p>
      <div class="keyfoot"><span class="dim">P</span>
        <button class="obtn" data-act="sky">${tr('key.sky.open')}</button></div>`,
    bind: (root) => {
      const b = root.querySelector('[data-act="sky"]');
      if (b) b.onclick = () => { closeBag(); renderSky(); };
    },
  },
];

// Shelf order: the core first, then modules in load order. The shelf is short
// and must not be sorted by state — a card has to lie where it lay yesterday.
const keyCards = () => [...coreKeys(), ...collect('keys')];
let keyIdx = 0;

const keysHtml = () => {
  const cards = keyCards();
  if (!cards.length) return `<div class="bbody"><p class="empty">${tr('key.none')}</p></div>`;
  keyIdx = Math.max(0, Math.min(cards.length - 1, keyIdx));
  const card = cards[keyIdx];
  return `<div class="bbody keysbox">
      <div class="keyshelf">
        ${cards.map((k, i) => `<button class="keycard${i === keyIdx ? ' on' : ''}${k.state === 'on' ? '' : ' dimmed'}" data-i="${i}">
          <canvas width="48" height="36"></canvas>
          <span class="kname">${esc(k.name)}</span>
          <span class="kword ${k.state}">${esc(k.word())}</span>
        </button>`).join('')}
        <span class="bhint">${tr('key.shelf')}</span>
      </div>
      <div class="keydetail${isGuest() ? ' guest' : ''}">
        <div class="keyhead"><b>${esc(card.name)}</b><span class="kword ${card.state}">${esc(card.word())}</span></div>
        ${card.body()}
        ${isGuest() ? `<p class="hint">${tr('key.guest')}</p>` : ''}
      </div>
    </div>`;
};

function bindKeys() {
  const cards = keyCards();
  el.bag.querySelectorAll('.keycard canvas').forEach((cv, i) => {
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    if (cards[i] && cards[i].icon) cards[i].icon(c);
  });
  el.bag.querySelectorAll('.keycard').forEach((b) => b.onclick = () => {
    keyIdx = Number(b.dataset.i);
    renderBag();
  });
  const detail = el.bag.querySelector('.keydetail');
  if (!detail) return;
  // A guest gets the cards to read and no controls at all: POST /api/settings
  // answers him 403 anyway, and saying «the owner sets the keys up» beats
  // letting him press a button and collect a refusal. Hidden by the class, so
  // the fields fall out of the tab order too.
  if (isGuest()) return;
  // Copying is shared by every card: a command, a path, a Redirect URI. Without
  // https the browser has no clipboard, and that has to show on the button
  // rather than in the console.
  detail.querySelectorAll('[data-copy]').forEach((b) => b.onclick = async () => {
    const ok = await copyText(b.dataset.copy);
    toast(tr(ok ? 'key.copied' : 'key.copyFailed'), ok ? '' : 'wait');
  });
  const card = cards[keyIdx];
  if (card && card.bind) card.bind(detail);
  paintBagFocus();
}

// Arrows walk the shelf, ⏎ hands focus to the card — from there it is Tab.
function keysKey(key) {
  const cards = keyCards();
  if (!cards.length) return false;
  const step = { arrowleft: -1, arrowright: 1, arrowup: -1, arrowdown: 1 }[key];
  if (step !== undefined) {
    keyIdx = (keyIdx + step + cards.length) % cards.length;
    renderBag();
    return true;
  }
  if (key === 'enter') {
    const first = el.bag.querySelector('.keydetail input, .keydetail .obtn');
    if (first) first.focus();
    return true;
  }
  return false;
}

// Вкладка «офис». Дресс-код живёт здесь, потому что у него нет предмета в
// офисе: погоду настраивают у окна, язык — у таблички, а «всем надеть
// галстуки» не висит нигде.
const officeHtml = () => {
  const on = officeOn();
  return `<div class="bbody">
      <p class="dcap">${tr('bag.dressCode')}</p>
      <div class="oseg">
        <button class="obtn${on ? '' : ' on'}" data-code="casual">${tr('bag.casual')}</button>
        <button class="obtn${on ? ' on' : ''}" data-code="office">${tr('bag.office')}</button>
        <span class="bhint">${tr('bag.dressWho', { n: S.agents.length })}</span>
      </div>
      <p class="hint">${tr('bag.dressNote')}</p>
      <p class="dcap">${tr('bag.rest')}</p>
      <div class="orow"><b>${tr('bag.langRow')}</b><span>${tr('bag.langSub')}</span>
        <i>${lang().toUpperCase()}</i><button class="obtn" data-act="lang">${tr('bag.switch')}</button></div>
      <div class="orow"><b>${tr('bag.skinRow')}</b><span>${tr('bag.skinSub')}</span>
        <i>U</i><button class="obtn" data-act="skin">${tr('bag.open')}</button></div>
      <div class="orow"><b>${tr('bag.soundRow')}</b><span>${tr('bag.soundSub')}</span>
        <i>M</i><button class="obtn" data-act="sound">${S.soundOn ? tr('bag.off') : tr('bag.on')}</button></div>
    </div>`;
};

// ------------------------------------------------------------ дерево модулей
// Вкладка «дерево»: вся сборка офиса как дерево навыков, три колонки по
// ярусам. Состав — web/library.js; горит то, что ядро (бесплатные ветки) и что
// вернул /api/modules (модули). Ни цен, ни «купить»: касса живёт на valey.dev,
// а здесь видно, из чего офис собран и что из чего растёт.
//
// Выбранный узел и есть фокус: стрелки ходят по дереву — ↑↓ по колонке, ←→ по
// ребру (к родителю и к первому потомку), и карточка под деревом меняется
// сразу, без Enter. Отдельного кольца фокуса нет: подсвечивать одно, а
// показывать другое — это два курсора на одной панели.
// Макет: Figma, Prod, секция «18 · Дерево модулей в инвентаре», кадры 932:2
// (бесплатная сборка) и 934:2 (сборка «Офис»). Принято 4 сентября 2026.
let treeSel = null;
// Цвета иконок — заглушки из четырёх пикселей, как на макете; свои иконки —
// отдельная работа. Ветка и её продолжение красятся одним тоном — кроме
// мольберта: он вырос из доски работ вместе с деревом гита, а два одинаково
// зелёных узла рядом читались бы как один предмет.
const TONE = { floor1: '#c9a06a', bible: '#c9a06a', art: '#d97b6c', easel: '#d97b6c',
  board: '#9fe0a8', gittree: '#9fe0a8', task: '#ffd166', feed: '#ffd166', cctv: '#8fbcff', dossier: '#8fbcff',
  radio: '#c39bff', dress: '#f6e3c0', agents: '#e0a06a', floor: '#e0a06a', talk: '#9fe0a8', meet: '#9fe0a8',
  door: '#8c7660', guest: '#8c7660' };
const L = (v) => (v ? (v[lang()] || v.ru) : '');
// own — горит; office/floor — тусклый с именем тарифа; room — бесплатная
// ветка, у которой не лежит папка (радио без modules/); ghost — «за год».
const treeState = (n) => (n.tier === 'more' ? 'ghost'
  : n.module ? (moduleIds().includes(n.module) ? 'own' : n.tier)
  : n.tier === 'room' ? 'own' : n.tier);
const treeOwn = (n) => treeState(n) === 'own';
const treeCount = (tier) => {
  const all = LIBRARY.filter((n) => n.tier === tier);
  return { t: tier, n: all.filter(treeOwn).length, m: all.length };
};
const treeSub = (c) => (c.t === 'room' ? tr(c.n === c.m ? 'tree.sub.room' : 'tree.sub.roomSome')
  : c.t === 'office' ? tr(c.n === c.m ? 'tree.sub.officeAll' : c.n ? 'tree.sub.officeSome' : 'tree.sub.office')
  : tr('tree.sub.floor'));
// По умолчанию выбран первый модуль «Офиса», которого нет: это и есть ответ на
// «что в следующем тире». Когда есть всё — призрачный узел про год.
const treeDefault = () => LIBRARY.find((n) => n.tier === 'office' && !treeOwn(n)) || byId('more');
const treeCur = () => byId(treeSel) || (treeSel = treeDefault().id, byId(treeSel));
export const treeSelected = () => treeCur().id;

const treeCard = (n) => {
  const st = treeState(n), from = n.parent ? L(byId(n.parent).name) : '';
  const meta = st === 'own' ? tr(n.tier === 'room' ? 'tree.meta.room' : 'tree.meta.owned', { from })
    : st === 'ghost' ? tr('tree.meta.more')
    : tr('tree.meta.' + n.tier, { from });
  return `<div class="lcard">
      <div class="lhead"><b>${esc(L(n.name))}</b><span>${meta}</span></div>
      <p>${tr('tree.gives')} ${esc(L(n.gives))}</p>
      ${n.where ? `<p>${tr('tree.where')} ${esc(L(n.where))}</p>` : ''}
      ${n.without && st !== 'own' ? `<p>${tr('tree.without')} ${esc(L(n.without))}</p>` : ''}
      ${st === 'ghost' ? '' : `<p>${tr('tree.arrives')} ${tr('tree.arrive.' + n.tier)}</p>`}
    </div>`;
};

// Two views of the same tab. The flat columns are the default and stay it: a
// person opening the tree wants one glance — what I have, what I do not, what
// it becomes. The detailed view is for the one who asks for a harder tree, and
// it is entered on purpose, with V.
//
// While it is up, the digits belong to it: 1–6 pick a direction, the way the
// numbers in the transcript own the digits while they are lit. Tabs come back
// with the digits as soon as V returns the flat view, and the bottom line says
// so — a mode may take the keys, but it has to admit that it did.
//
// Design: Figma, Prod, section 22 — both views at 100% and at 175%. The six
// direction frames and the rejected variants B and B-prime are on Legacy: that
// is where «why is it like this?» is answered.
let treeWide = false;
let treeDir = 'work';

const dirSub = (t) => (t.free ? tr('tree.dir.free') : tr('tree.dir.count', { n: t.own, m: t.total }));

// The view switch lives in the tree's own header, not in the row of tabs. That
// row is shared by all four tabs and holds the key hint; a fifth thing that
// belongs to one tab pushed the hint onto a second line at 700 CSS px — before
// any scaling. Here the switch sits with what it switches.
const treeHeadHtml = () => {
  const dir = treeWide ? DIRS.find((d) => d.id === treeDir) : null;
  return `<div class="thead2">
      <b>${tr('tree.title')}${dir ? ' · ' + esc(L(dir.name)) : ''}</b>
      <span class="vsw">${tr('tree.view')}
        <button class="vbtn${treeWide ? '' : ' on'}" data-view="flat">${tr('tree.view.flat')}</button>
        <button class="vbtn${treeWide ? ' on' : ''}" data-view="wide">${tr('tree.view.wide')}</button>
        <kbd>V</kbd></span>
    </div>`;
};

const dirsHtml = () => `<div class="tdirs">${DIRS.map((d, i) => {
  const t = dirTally(d.id, treeOwn);
  return `<button class="tdir${d.id === treeDir ? ' on' : ''}${t.free ? ' free' : ''}" data-dir="${d.id}">
      <b>${i + 1} ${esc(L(d.name))}</b><span>${dirSub(t)}</span>
      ${t.free ? `<em>${tr('tree.dir.noTiers')}</em>`
        : `<i class="tbar"><u style="width:${Math.round(100 * t.own / Math.max(1, t.total))}%"></u></i>`}
    </button>`;
}).join('')}</div>`;

// A keystone with its own switches beside it. The chain is drawn only where the
// panel is wide enough — below that CSS hides it and the card carries the same
// list in one line, because a label over a neighbour is worse than no label.
const wideNode = (n, sel) => {
  const st = treeState(n), subs = SUBS[n.id] || [];
  return `<div class="wkey">
      <button class="tnode ${st}${n.id === sel.id ? ' on' : ''}" data-id="${n.id}">
        ${st === 'ghost' ? '' : `<i class="tico" style="--c:${TONE[n.id] || '#8c7660'}"></i>`}
        <span>${esc(L(n.name))}</span>
        ${st === 'own' || st === 'ghost' ? '' : `<em>${tr('tree.tag.' + n.tier)}</em>`}
      </button>
      ${subs.length ? `<div class="wsubs">${subs.map((x) => `<i class="wsub">${esc(L(x))}</i>`).join('')}</div>` : ''}
    </div>`;
};

const wideHtml = () => {
  const sel = treeCur();
  const here = inDir(treeDir);
  const tierRow = (tier) => {
    // The ghost «+ whatever ships this year» belongs to the flat view: it is a
    // promise about the tier as a whole, and a branch has nothing to hang it on.
    const list = here.filter((n) => n.tier === tier);
    if (!list.length) {
      return `<p class="wempty">${tr(tier === 'floor' ? 'tree.wide.noFloor'
        : treeDir === 'you' ? 'tree.wide.noSale' : 'tree.wide.noOffice')}</p>`;
    }
    return `<div class="wtier">${list.map((n) => wideNode(n, sel)).join('')}</div>`;
  };
  const gate = (tier) => {
    const list = here.filter((n) => n.tier === tier);
    const own = list.filter(treeOwn).length;
    return `<div class="wgate"><b>${tr('tree.tier.' + tier)}</b><span>${
      list.length ? tr('tree.gate.' + tier, { n: own, m: list.length }) : tr('tree.gate.' + tier + 'None')}</span></div>`;
  };
  return `<div class="bbody tbody wide">
      ${treeHeadHtml()}
      ${dirsHtml()}
      <div class="tscroll">
      <div class="wbody">
        <div class="wtree" id="wtree"><svg class="tedges"></svg>
          ${tierRow('floor')}
          ${gate('floor')}
          ${tierRow('office')}
          ${gate('office')}
          ${tierRow('room')}
          <p class="wroom">${tr('tree.wide.room')}</p>
        </div>
        ${treeCard(sel)}
      </div>
      <p class="hint dim">${tr('tree.wide.keys')}</p>
      </div>
    </div>`;
};

const treeHtml = () => {
  const sel = treeCur();
  const cols = TIERS.map(treeCount);
  return `<div class="bbody tbody">
      ${treeHeadHtml()}
      <div class="tscroll">
      <div class="tcols">${cols.map((c) => `<div class="tcol${c.n === c.m ? ' own' : ''}">
        <b>${tr('tree.col.' + c.t, { n: c.n, m: c.m })}</b><span>${treeSub(c)}</span></div>`).join('')}</div>
      <div class="tree" id="tree"><svg class="tedges"></svg>
        ${LIBRARY.map((n) => { const st = treeState(n); return `<button class="tnode ${st}${n.id === sel.id ? ' on' : ''}"
          data-id="${n.id}" data-col="${colOf(n)}" data-row="${n.row}" style="grid-column:${colOf(n) * 2 + 1}; grid-row:${n.row + 1}">
          ${st === 'ghost' ? '' : `<i class="tico" style="--c:${TONE[n.id] || '#8c7660'}"></i>`}<span>${esc(L(n.name))}</span>
          ${st === 'own' || st === 'ghost' ? '' : `<em>${tr('tree.tag.' + n.tier)}</em>`}</button>`; }).join('')}
      </div>
      ${treeCard(sel)}
      <p class="hint dim">${tr('tree.note')} ${tr('tree.keys')}</p>
      </div>
    </div>`;
};

// Рёбра — по настоящей геометрии кнопок, а не по номерам строк: ширина панели
// на узком экране плывёт, а сетка — нет. Ребро идёт от правого края родителя
// к левому краю потомка через середину жёлоба; строка в строку — прямой.
function treeEdges() {
  const box = el.bag.querySelector('#tree'), svg = box && box.querySelector('.tedges');
  if (!svg || !box.getBoundingClientRect) return;          // подставной DOM стенда
  const o = box.getBoundingClientRect();
  const at = (b) => { const r = b.getBoundingClientRect(); return { l: r.left - o.left, r: r.right - o.left, y: r.top - o.top + r.height / 2 }; };
  const nodes = new Map([...box.querySelectorAll('.tnode')].map((b) => [b.dataset.id, b]));
  let out = '';
  for (const n of LIBRARY) {
    const p = n.parent && nodes.get(n.parent), c = nodes.get(n.id);
    if (!p || !c) continue;
    const a = at(p), z = at(c), xm = z.l - 18;
    const d = a.y === z.y ? `M${a.r},${a.y} H${z.l}` : `M${a.r},${a.y} H${xm} V${z.y} H${z.l}`;
    out += `<path d="${d}"${c.classList.contains('own') ? ' class="lit"' : ''}/>`;
  }
  svg.setAttribute('viewBox', `0 0 ${o.width} ${o.height}`);
  svg.innerHTML = out;
}

// Edges in the detailed view join a paid node to the free one it grows out of,
// across the gate between them. Same measuring as the flat view: real geometry,
// because the panel width moves between 700 and 1000 and the rows do not.
function wideEdges() {
  const box = el.bag.querySelector('#wtree'), svg = box && box.querySelector('.tedges');
  if (!svg || !box.getBoundingClientRect) return;
  const o = box.getBoundingClientRect();
  const at = (b) => {
    const r = b.getBoundingClientRect();
    return { x: r.left - o.left + r.width / 2, top: r.top - o.top, bottom: r.bottom - o.top };
  };
  const nodes = new Map([...box.querySelectorAll('.tnode')].map((b) => [b.dataset.id, b]));
  let out = '';
  for (const n of inDir(treeDir)) {
    const p = n.parent && nodes.get(n.parent), c = nodes.get(n.id);
    if (!p || !c) continue;
    const a = at(p), z = at(c), my = (z.bottom + a.top) / 2;
    const d = `M${a.x},${a.top} V${my} H${z.x} V${z.bottom}`;
    out += `<path d="${d}"${c.classList.contains('own') ? ' class="lit"' : ''}/>`;
  }
  svg.setAttribute('viewBox', `0 0 ${o.width} ${o.height}`);
  svg.innerHTML = out;
}

// Entering the detailed view opens the branch of what was being read, rather
// than whatever direction was open last time: the card and the tree have to be
// about the same thing, or the view reads as two panels stuck together.
function toggleWide(to) {
  const want = to === undefined ? !treeWide : to;
  if (want === treeWide) return;
  treeWide = want;
  if (treeWide) {
    const cur = treeCur();
    if (cur && cur.dir) treeDir = cur.dir;
  }
  renderBag();
}

// Thresholds are measured off the panel, not the window: inside `zoom` a media
// query still asks the window, and at 175% it answers about a panel twice the
// size of the real one. The panel's own width in CSS pixels is the rect divided
// by the scale, and that is the number the frames were drawn against.
const uiScale = () => Number(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;

function sizeWide() {
  const wrap = el.bag.querySelector('.bagwrap');
  const body = el.bag.querySelector('.wbody');
  if (!wrap || !body || !wrap.getBoundingClientRect) return;
  const w = wrap.getBoundingClientRect().width / uiScale();
  body.classList.toggle('stack', w < 860);
  body.classList.toggle('nosubs', w < 1000);
}

function bindTreeView() {
  el.bag.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => toggleWide(b.dataset.view === 'wide'));
  el.bag.querySelectorAll('[data-dir]').forEach((b) => b.onclick = () => pickDir(b.dataset.dir));
  if (treeWide) { sizeWide(); wideEdges(); }
}

// Choosing a direction moves the card too: the node you were reading may live in
// another branch, and a card about something off screen is a card about nothing.
function pickDir(dir) {
  if (!DIRS.some((d) => d.id === dir)) return;
  treeDir = dir;
  const here = inDir(dir);
  if (!here.some((n) => n.id === treeSel)) {
    treeSel = (here.find((n) => !treeOwn(n)) || here[0] || {}).id || treeSel;
  }
  renderBag();
}

function bindTree() {
  el.bag.querySelectorAll('.tnode').forEach((b) => b.onclick = () => { treeSel = b.dataset.id; renderBag(); });
  if (treeWide) return;
  treeEdges();
  const on = el.bag.querySelector('.tnode.on');
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
}

// Walking a direction: up and down cross the tiers, left and right step along a
// tier. The tree here is small — five nodes at most — so the whole direction is
// one list in reading order, and the arrows never leave it.
function wideKey(key, cur) {
  const here = inDir(treeDir);
  const rank = (n) => TIERS.indexOf(n.tier === 'more' ? 'office' : n.tier);
  const list = here.slice().sort((a, b) => rank(b) - rank(a) || a.row - b.row);
  const i = Math.max(0, list.indexOf(cur));
  let next = null;
  if (key === 'arrowdown' || key === 'arrowright') next = list[(i + 1) % list.length];
  else if (key === 'arrowup' || key === 'arrowleft') next = list[(i - 1 + list.length) % list.length];
  else if (key === 'enter' || key === ' ') return true;
  else return false;
  if (next && next.id !== cur.id) { treeSel = next.id; renderBag(); }
  return true;
}

// Ближайший по строке узел соседней колонки — когда ребра нет: «за год» не
// растёт ни из чего, а у радио нет продолжения.
const treeNear = (col, row) => LIBRARY.filter((n) => colOf(n) === col)
  .sort((a, b) => Math.abs(a.row - row) - Math.abs(b.row - row))[0] || null;

function treeKey(key) {
  const cur = treeCur();
  // V switches the view either way; in the detailed one the digits pick a
  // direction, and the tiles carry those numbers so the promise is on screen.
  if (key === 'v' || key === 'м') { toggleWide(); return true; }
  if (treeWide) {
    const n = Number(key);
    if (Number.isInteger(n) && n >= 1 && n <= DIRS.length) { pickDir(DIRS[n - 1].id); return true; }
    return wideKey(key, cur);
  }
  let next = null;
  if (key === 'arrowup' || key === 'arrowdown') {
    const col = LIBRARY.filter((n) => colOf(n) === colOf(cur)).sort((a, b) => a.row - b.row);
    const d = key === 'arrowup' ? -1 : 1;
    next = col[(col.indexOf(cur) + d + col.length) % col.length];
  } else if (key === 'arrowleft') {
    next = cur.parent ? byId(cur.parent) : treeNear(colOf(cur) - 1, cur.row);
  } else if (key === 'arrowright') {
    next = children(cur.id)[0] || treeNear(colOf(cur) + 1, cur.row);
  } else if (key === 'enter' || key === ' ') {
    return true;                       // выбранное уже раскрыто карточкой
  } else return false;
  // Край дерева — не повод отдать стрелку офису: панель открыта.
  if (next && next.id !== cur.id) { treeSel = next.id; renderBag(); }
  return true;
}

export function renderBag(tab) {
  if (tab && tabs().includes(tab)) bagTab = tab;
  if (!tabs().includes(bagTab)) bagTab = 'self';
  el.bag.hidden = false;
  // The detailed view is the only place in the inventory that is wider than 700.
  // That is the price of the mode, and it is paid only while the mode is on.
  el.bag.innerHTML = `<div class="rwrap bagwrap${bagTab === 'tree' ? ' steady' : ''}${bagTab === 'tree' && treeWide ? ' wide' : ''}">
    <div class="vhead">${tr('bag.title')} · ${tr('bag.tab.' + bagTab)}<button id="bx">✕</button></div>
    <div class="btabs">
      ${tabs().map((t, i) => `<button class="btab${t === bagTab ? ' on' : ''}" data-tab="${t}">${tr('bag.tab.' + t)}<kbd>${i + 1}</kbd></button>`).join('')}
      <span class="bhint">${tr('bag.tabHint')}</span>
    </div>
    ${bagTab === 'self' ? selfHtml() : bagTab === 'things' ? thingsHtml()
      : bagTab === 'tree' ? (treeWide ? wideHtml() : treeHtml())
      : bagTab === 'keys' ? keysHtml() : officeHtml()}
  </div>`;

  $('#bx').onclick = closeBag;
  el.bag.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => openTab(b.dataset.tab));
  if (bagTab === 'self') bindSelf();
  else if (bagTab === 'things') bindThings();
  else if (bagTab === 'tree') { bindTree(); bindTreeView(); }
  else if (bagTab === 'keys') bindKeys();
  else bindOffice();
}

function bindOffice() {
  el.bag.querySelectorAll('[data-code]').forEach((b) => b.onclick = async () => {
    const code = b.dataset.code;
    if (code === dressCode()) return;
    const r = await api.saveSettings({ dress: { code } });
    if (r && r.error) return toast(tr('bag.notYours'), 'wait');
    renderBag();
    toast(code === 'office' ? tr('bag.nowOffice') : tr('bag.nowCasual'));
  });
  el.bag.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
    const act = b.dataset.act;
    if (act === 'lang') return api.lang();
    if (act === 'skin') { closeBag(); return renderSkin(); }
    if (act === 'sound') { api.sound(); renderBag(); }
  });
  paintBagFocus();
}

function bindSelf() {
  const c = $('#me').getContext('2d');
  const paint = () => {
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2a1f19'; c.fillRect(0, 0, 72, 86);
    c.save(); c.scale(2.4, 2.4);
    // человечек показан одетым по коду офиса: панель обещает то же, что видно
    // на этаже, а не то, что лежит в сохранении
    drawPerson(c, 15, 33, dressMe(S.me, dressCode()), { pose: 'stand', frame: 0 });
    c.restore();
  };
  // строка показывает своё значение, поэтому обновляется вместе с человечком.
  // Перерисовать всю панель было бы короче, но тогда стрелка забирает фокус у
  // поля с именем — прямо посреди того, как его печатают.
  const refresh = () => {
    for (const f of colorFields()) {
      const s = el.bag.querySelector(`.sw[data-k="${f.key}"]`);
      if (s) s.style.background = S.me[f.key];
    }
    for (const f of [...BODY, bottomCut]) {
      const v = el.bag.querySelector(`.dval[data-k="${f.key}"]`);
      if (v) v.textContent = tr(`val.${f.key}.${S.me[f.key]}`);
    }
    paint();
  };
  paint();
  // An empty field is an empty name, not the word «ТЫ» stored as one: that
  // string used to travel outward and label a stranger YOU.
  $('#myname').oninput = (e) => { S.me.name = e.target.value.toUpperCase().slice(0, 14); api.saveMe(); };
  paintBagFocus();
  const rowFields = () => [...colorFields(), ...BODY, bottomCut];
  el.bag.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => {
    const key = b.dataset.f, dir = Number(b.dataset.d);
    const f = rowFields().find((x) => x.key === key);
    if (!f) return;
    S.me[key] = cycle(f.list, S.me[key], dir);
    api.saveMe(); refresh();
  });
}

function bindThings() {
  for (const f of THINGS) {
    el.bag.querySelectorAll(`.bcell[data-slot="${f.key}"]`).forEach((b) => {
      const cv = b.querySelector('canvas');
      if (cv && cv.getContext) {
        const c = cv.getContext('2d');
        c.imageSmoothingEnabled = false;
        c.clearRect(0, 0, 48, 48);
        c.save(); c.scale(4, 4); drawItem(c, f.key, f.list[Number(b.dataset.i)], S.me); c.restore();
      }
      b.onclick = () => {
        writeSlot(f, f.list[Number(b.dataset.i)]);
        api.saveMe();
        el.bag.querySelectorAll(`.bcell[data-slot="${f.key}"]`).forEach((o) => o.classList.toggle('on', o === b));
        // крой рисуется цветом выбранного галстука, и наоборот — поэтому
        // соседняя строка перерисовывается вместе с этой
        if (f.key === 'tie' || f.key === 'cut') renderBag();
      };
    });
  }
  paintBagFocus();
}

// Вкладка «офис» — ряд кнопок, а не список слотов и не сетка: у неё третье
// поведение клавиш, и держать его руками рядом с двумя другими незачем.
const officeRing = focusRing(() => el.bag, '.obtn');

function openTab(tab) {
  if (!tabs().includes(tab) || tab === bagTab) return;
  bagTab = tab; bagIdx = 0; cellIdx = 0;
  officeRing.reset();
  renderBag();
}

export function closeBag() { el.bag.hidden = true; bagIdx = 0; cellIdx = 0; officeRing.reset(); }

// «На себе» — не ряд кнопок, а список слотов, у каждого ◀ и ▶. Поэтому
// вверх-вниз ходят по слотам, а в стороны крутят значение того, на котором
// стоишь: так этот список и читается глазами.
//
// «Вещи» — сетка, и там те же четыре стрелки значат другое: вверх-вниз меняют
// ряд, в стороны ходят по клеткам, ⏎ надевает. Один индекс на оба случая не
// годится, поэтому их два.
let bagIdx = 0;
let cellIdx = 0;
const bagRows = () => [...el.bag.querySelectorAll('.namerow, .drow')];
const bagCats = () => [...el.bag.querySelectorAll('.bcat')];
const catCells = (cat) => (cat ? [...cat.querySelectorAll('.bcell')] : []);

function paintBagFocus() {
  if (bagTab === 'office') { officeRing.paint(); return; }
  if (bagTab === 'tree') return;      // выбранный узел и есть фокус, см. treeHtml()
  // The key shelf lights itself: the class `on` on the picked card is also what
  // draws its border. The focus ring has no business here.
  if (bagTab === 'keys') return;
  if (bagTab === 'things') {
    const cats = bagCats();
    if (!cats.length) return;
    bagIdx = Math.max(0, Math.min(cats.length - 1, bagIdx));
    const cells = catCells(cats[bagIdx]);
    cellIdx = Math.max(0, Math.min(cells.length - 1, cellIdx));
    for (const cat of cats) for (const b of catCells(cat)) b.classList.remove('focus');
    if (cells[cellIdx]) {
      cells[cellIdx].classList.add('focus');
      cells[cellIdx].scrollIntoView({ block: 'nearest' });
    }
    return;
  }
  const list = bagRows();
  if (!list.length) return;
  bagIdx = Math.max(0, Math.min(list.length - 1, bagIdx));
  list.forEach((r, i) => r.classList.toggle('focus', i === bagIdx));
  list[bagIdx].scrollIntoView({ block: 'nearest' });
}

// Escape не трогаем: его ловит closeAll() в main.js.
export function bagKey(raw) {
  if (el.bag.hidden) return false;
  const key = raw.toLowerCase();

  // Цифра — вкладка. Клавиши 1..9 в офисе больше ничем не заняты: масштаб
  // сидит на +, − и 0.
  //
  // The one exception is the detailed tree: while that view is up the digits
  // pick a direction, because the tiles carry those numbers and a number on
  // screen has to do what it says. Tabs get the digits back the moment V
  // returns the flat view, and the line under the tree says so. The precedent
  // is the transcript, where lit numbers own the digits until they go down.
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= tabs().length && !(bagTab === 'tree' && treeWide)) {
    openTab(tabs()[n - 1]);
    return true;
  }
  if (bagTab === 'office') return officeRing.key(key, true);
  if (bagTab === 'tree') return treeKey(key);
  if (bagTab === 'keys') return keysKey(key);
  return bagTab === 'things' ? thingsKey(key) : selfKey(key);
}

function selfKey(key) {
  const list = bagRows();
  if (!list.length) return false;

  const step = { arrowup: -1, arrowdown: 1 }[key];
  if (step !== undefined) {
    bagIdx = (bagIdx + step + list.length) % list.length;
    paintBagFocus();
    return true;
  }

  const row = list[bagIdx];
  const turn = { arrowleft: '-1', arrowright: '1' }[key];
  if (turn !== undefined) {
    const b = row && row.querySelector(`[data-d="${turn}"]`);
    if (b) b.click();
    return true;                 // на строке с именем крутить нечего, но и
                                 // уводить стрелку в офис оттуда незачем
  }
  if (key === 'enter' || key === ' ') {
    // Имя — поле ввода: по Enter отдаём ему настоящий фокус, дальше печатает
    // браузер. У слота Enter делает то же, что ▶.
    const input = row && row.querySelector('input');
    if (input) { input.focus(); return true; }
    const next = row && row.querySelector('[data-d="1"]');
    if (next) next.click();
    return true;
  }
  return false;
}

function thingsKey(key) {
  const cats = bagCats();
  if (!cats.length) return false;

  const down = { arrowup: -1, arrowdown: 1 }[key];
  if (down !== undefined) {
    bagIdx = (bagIdx + down + cats.length) % cats.length;
    paintBagFocus();
    return true;
  }
  const side = { arrowleft: -1, arrowright: 1 }[key];
  if (side !== undefined) {
    const cells = catCells(cats[bagIdx]);
    if (cells.length) cellIdx = (cellIdx + side + cells.length) % cells.length;
    paintBagFocus();
    return true;
  }
  if (key === 'enter' || key === ' ') {
    const cells = catCells(cats[bagIdx]);
    if (cells[cellIdx]) cells[cellIdx].click();
    return true;
  }
  return false;
}

// --------------------------------------------------------- window on the world
let geoTimer = 0;

export function renderSky(results = null, busy = '') {
  const cfg = (S.settings && S.settings.weather) || { enabled: false };
  const live = S.realWeather;
  const w = S.weather || {};
  el.sky.hidden = false;

  const status = !cfg.enabled
    ? tr('sky.fakeNote')
    : live && live.error
      ? tr('sky.noReach', { err: esc(live.error) })
      : live && live.code != null
        ? tr('sky.updated', {
            what: tr('sky.' + w.kind),
            temp: w.temp != null ? `, ${Math.round(w.temp)}°` : '',
            at: live.at ? new Date(live.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '—' })
        : tr('sky.asking');

  el.sky.innerHTML = `<div class="rwrap skywrap">
    <div class="vhead">${tr('sky.title')}<button id="skyx">✕</button></div>
    <div class="skybody">
      <div class="skyrow">
        <button id="skytoggle" class="${cfg.enabled ? 'on' : ''}">${cfg.enabled ? tr('sky.real') : tr('sky.fake')}</button>
        <span class="skyplace">${esc(cfg.label || tr('sky.noPlace'))}</span>
      </div>
      <p class="skystatus">${status}</p>
      <label class="skysearch">${tr('sky.city')}
        <input id="skyq" placeholder="${tr('sky.cityHint')}" value="">
      </label>
      <div id="skyresults" class="skyresults">${busy ? `<p class="hint">${busy}</p>` : renderResults(results)}</div>
      <div class="skyrow">
        <button id="skygeo">${tr('sky.byBrowser')}</button>
      </div>
      <p class="hint">${tr('sky.privacy')}</p>
    </div></div>`;

  skyRing.paint();
  $('#skyx').onclick = closeSky;
  $('#skytoggle').onclick = async () => {
    const on = !cfg.enabled;
    if (on && cfg.lat == null) { renderSky(null, tr('sky.pickFirst')); return; }
    renderSky(null, on ? tr('sky.turningOn') : tr('sky.turningOff'));
    await api.saveSettings({ weather: { enabled: on } });
    renderSky();
    toast(on ? tr('sky.nowReal') : tr('sky.nowFake'));
  };
  $('#skygeo').onclick = () => {
    if (!navigator.geolocation) return renderSky(null, tr('sky.noGeo'));
    renderSky(null, tr('sky.askingBrowser'));
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      await api.saveSettings({ weather: { enabled: true, lat, lon, label: `${lat.toFixed(2)}, ${lon.toFixed(2)}` } });
      renderSky();
      toast(tr('sky.fromBrowser'));
    }, (err) => renderSky(null, tr('sky.refused', { err: err.message })), { timeout: 8000 });
  };

  const q = $('#skyq');
  q.oninput = () => {
    clearTimeout(geoTimer);
    const text = q.value.trim();
    if (text.length < 2) return;
    geoTimer = setTimeout(async () => {
      const r = await api.geocode(text);
      const box = $('#skyresults');
      if (!box) return;
      box.innerHTML = r.error ? `<p class="hint">${tr('sky.searchFailed', { err: esc(r.error) })}</p>` : renderResults(r.results);
      bindResults(text);
    }, 350);
  };
  bindResults();
}

function renderResults(results) {
  if (!results) return '';
  if (!results.length) return `<p class="hint">${tr('sky.nothing')}</p>`;
  // Метки и детали приходят от геокодера — это чужой текст, как и всё снаружи.
  return results.map((r) => `<button class="skyhit" data-lat="${esc(r.lat)}" data-lon="${esc(r.lon)}" data-label="${esc(r.label)}">
    ${esc(r.label)}<span>${esc(r.detail || '')}</span></button>`).join('');
}

function bindResults() {
  el.sky.querySelectorAll('.skyhit').forEach((b) => b.onclick = async () => {
    renderSky(null, tr('sky.looking'));
    await api.saveSettings({ weather: { enabled: true, lat: Number(b.dataset.lat), lon: Number(b.dataset.lon), label: b.dataset.label } });
    renderSky();
    toast(tr('sky.nowAt', { place: b.dataset.label }));
  });
}


// ------------------------------------------------------- кольцо фокуса панели
// Пятая панель подряд повторяла один и тот же кусок: номер выбранной кнопки,
// покраска класса, стрелки по кругу, Enter — клик. Дальше копировать это
// нельзя, поэтому окно в мир и цвет офиса берут общий помощник; лифт, обход,
// заметки и переодевание пока живут своими копиями — их сворачивание
// записано в BACKLOG.md, чтобы не переписывать проверенное посреди ночи.
//
// Ползунки в кольце ведут себя как ползунки: стрелки в стороны крутят
// значение, а не уводят фокус. Иначе громкость и оттенок остаются мышиными.
// Экспортируется: панель модуля водит фокус теми же стрелками, что и панели
// ядра, и заводить второй способ ходить по кнопкам значило бы завести второй
// офис.
// opts.numbers — цифра 1..9 выбирает пункт списка и нажимает его. Идея приехала
// из инвентаря, где так переключаются вкладки, и оказалась общей: список на
// экране почти всегда короткий и пронумерован глазами и без нас.
//   numbers: true          — по всем пунктам кольца
//   numbers: '.rst'        — только по этим (в радио цифра — волна, а не ручка)
//   byData: 'n'            — цифра ищет пункт с data-n="цифра", а не N-й по счёту:
//                            в лифте «3» это третий этаж, даже если он второй в
//                            списке.
export function focusRing(nodeOf, selector, opts = {}) {
  let idx = 0;
  const list = () => (nodeOf() ? [...nodeOf().querySelectorAll(selector)] : []);
  const paint = () => {
    const l = list();
    if (!l.length) return;
    idx = Math.max(0, Math.min(l.length - 1, idx));
    l.forEach((b, i) => b.classList.toggle('focus', i === idx));
    l[idx].scrollIntoView({ block: 'nearest' });
    // Панель, которой мало подсветить кнопку: у языка под кнопками стоит
    // строка «что будет, если нажать», и она обязана меняться вместе с фокусом,
    // а не по нажатию. Без этого цена показывалась бы уже уплаченной.
    if (opts.onMove) opts.onMove(l[idx]);
  };
  return {
    paint,
    reset() { idx = 0; },
    // Поставить фокус на конкретный номер: лифту — на этаж, где ты стоишь,
    // заметкам — на первую строку при выходе из поиска.
    at(i) { idx = i; paint(); },
    key(raw, open) {
      if (!open) return false;
      const key = raw.toLowerCase();
      const l = list();
      if (!l.length) return false;
      const cur = l[idx];

      if (cur && cur.type === 'range' && (key === 'arrowleft' || key === 'arrowright')) {
        const min = Number(cur.min || 0), max = Number(cur.max || 100);
        const by = Math.max(1, Math.round((max - min) / 20));
        cur.value = String(Math.max(min, Math.min(max, Number(cur.value || 0) + (key === 'arrowleft' ? -by : by))));
        if (cur.oninput) cur.oninput({ target: cur });
        return true;
      }

      if (opts.numbers) {
        const n = Number(key);
        if (Number.isInteger(n) && n >= 1 && n <= 9) {
          const pool = opts.numbers === true ? l : [...nodeOf().querySelectorAll(opts.numbers)];
          const hit = opts.byData ? pool.find((b) => Number(b.dataset[opts.byData]) === n) : pool[n - 1];
          // Цифра мимо списка не уезжает в офис: панель открыта, и шаг игрока
          // из-под неё читается как «клавиатура живёт своей жизнью».
          if (!hit) return true;
          const at = l.indexOf(hit);
          if (at >= 0) { idx = at; paint(); }
          if (!hit.disabled) hit.click();
          return true;
        }
      }

      // Панель со строками: ↑↓ переносят между строками, ←→ ходят внутри одной.
      // Плоский обход тут врёт руке — «интерфейс» и «имена агентов» это два
      // разных вопроса, и стрелка вниз должна отвечать на второй, а не
      // доводить до конца первый.
      if (opts.rows) {
        const rows = [...nodeOf().querySelectorAll(opts.rows)]
          .map((r) => l.filter((b) => r.contains(b)))
          .filter((r) => r.length);
        const at = rows.findIndex((r) => r.includes(cur));
        if (at >= 0) {
          const pos = rows[at].indexOf(cur);
          const side = { arrowleft: -1, arrowright: 1 }[key];
          if (side !== undefined) {
            const row = rows[at];
            idx = l.indexOf(row[(pos + side + row.length) % row.length]);
            paint(); return true;
          }
          const down = { arrowup: -1, arrowdown: 1 }[key];
          if (down !== undefined) {
            const row = rows[(at + down + rows.length) % rows.length];
            idx = l.indexOf(row[Math.min(pos, row.length - 1)]);
            paint(); return true;
          }
        }
      }

      const step = { arrowup: -1, arrowdown: 1, arrowleft: -1, arrowright: 1 }[key];
      if (step !== undefined) { idx = (idx + step + l.length) % l.length; paint(); return true; }
      if (key === 'enter' || key === ' ') {
        if (!cur || cur.disabled) return true;
        // Поле ввода получает настоящий фокус, дальше печатает браузер.
        if (cur.tagName === 'INPUT' && cur.type !== 'range') cur.focus();
        else cur.click();
        return true;
      }
      return false;
    },
  };
}

// ------------------------------------------------------------ язык и имена
//
// Человечек в коридоре до 4 сентября 2026 щёлкал язык одним нажатием. Паков
// имён стало два, а со временем будет больше — щелчком по кругу растущий
// список не выбирают, поэтому ПРОБЕЛ открывает панель. Цена названа вслух:
// вместо одного нажатия стало три.
let packs = null;   // ответ /api/names, живёт пока панель открыта

export async function openLang() {
  el.lang.hidden = false;
  langRing.reset();
  renderLang();
  // Цена нажатия приезжает отдельно и может опоздать: сервер однопоточный, и
  // запрос, попавший в обход транскриптов, ждёт вместе со всеми. Панель к тому
  // времени уже нарисована и читается — ждёт только строка про переименование.
  packs = await api.names().catch((e) => ({ error: String(e && e.message), packs: [] }));
  if (!el.lang.hidden) renderLang();
}

export function closeLang() { el.lang.hidden = true; packs = null; langRing.reset(); }

// Что офис получит, нажав на этот пак: сколько имён сменится и пара примеров.
// Считается по живым агентам, а не по всему реестру на диске: обещание «всех
// 12» проверяется глазами по этажу, и число обязано сойтись именно с ним.
function packChange(id) {
  const p = packs && packs.packs.find((x) => x.id === id);
  if (!p) return null;
  const pairs = (S.agents || [])
    .filter((a) => p.names[a.id] && p.names[a.id] !== a.name)
    .map((a) => [a.name, p.names[a.id]]);
  return { n: pairs.length, pairs };
}

// Пак, который получится, если выбрать это значение: «как язык офиса» —
// не пак, а обещание идти за языком.
const packUnder = (choice, lng) => (choice === 'auto' ? lng : choice);

function renderLang() {
  const lng = lang();
  const choice = (packs && packs.choice) || (S.settings && S.settings.namePack) || 'auto';
  const now = packUnder(choice, lng);
  // Кнопки берутся из описи, а не из ответа про цену: список паков должен
  // стоять на месте с первого кадра, иначе панель перерисовывается под рукой.
  const ids = (S.packs || []).map((p) => p.id);
  const mark = (on, text) => (on ? `● ${text}` : text);

  const btn = (cls, attr, val, on, text) =>
    `<button class="${cls}${on ? ' on' : ''}" ${attr}="${val}">${mark(on, text)}</button>`;

  el.lang.innerHTML = `<div class="rwrap langwrap">
    <div class="vhead">${tr('lang.title')}<button id="langx">✕</button></div>
    <div class="langbody">
      <p class="langlabel">${tr('lang.interface')}</p>
      <div class="langrow">
        ${btn('langbtn', 'data-lang', 'ru', lng === 'ru', 'Русский')}
        ${btn('langbtn', 'data-lang', 'en', lng === 'en', 'English')}
      </div>
      <p class="langlabel">${tr('lang.names')}</p>
      <div class="langrow">
        ${btn('packbtn', 'data-pack', 'auto', choice === 'auto', tr('lang.auto'))}
        ${ids.map((id) => btn('packbtn', 'data-pack', id, choice === id, tr('lang.pack.' + id))).join('')}
      </div>
      <p class="langwarn" hidden></p>
      <p class="langstatus">${langStatus(now)}</p>
      <p class="hint">${tr('lang.hint')}</p>
    </div></div>`;

  $('#langx').onclick = closeLang;
  for (const b of el.lang.querySelectorAll('.langbtn')) {
    b.onclick = () => api.setLang(b.dataset.lang);
  }
  for (const b of el.lang.querySelectorAll('.packbtn')) {
    b.onclick = () => applyPack(b.dataset.pack);
  }
  langRing.paint();
}

// Размер и образец берутся из описи, приехавшей с настройками: она статична,
// и ждать её незачем. Круга до сервера ждёт только цена нажатия.
function langStatus(id) {
  const p = (S.packs || []).find((x) => x.id === id);
  if (!p) return tr('lang.counting');
  return tr('lang.status', {
    pack: tr('lang.pack.' + id),
    names: p.sample.join(', '),
    n: p.size - p.sample.length,
  });
}

// Строка «что будет, если нажать» — она же цена. Показывается только у пака,
// который сейчас не работает: у включённого нажимать нечего.
function langWarn(node) {
  const warn = el.lang && el.lang.querySelector('.langwarn');
  const status = el.lang && el.lang.querySelector('.langstatus');
  if (!warn || !status) return;
  const pick = node && node.dataset ? node.dataset.pack : null;
  const choice = (packs && packs.choice) || 'auto';
  const target = pick ? packUnder(pick, lang()) : null;
  const change = target && pick !== choice ? packChange(target) : null;

  // Строка состояния идёт за фокусом: стоишь на «English» — она про английский
  // словарь, а не про включённый. Иначе панель отвечает не на тот вопрос,
  // который человек только что задал стрелкой.
  status.innerHTML = langStatus(target || packUnder(choice, lang()));

  if (!change || !change.n) { warn.hidden = true; warn.textContent = ''; return; }
  const [first, second] = change.pairs;
  const parts = [tr('lang.becomes', { from: first[0], to: first[1] })];
  if (second) parts.push(tr('lang.also', { from: second[0], to: second[1] }));
  warn.hidden = false;
  warn.textContent = tr('lang.warn', { n: change.n, pairs: parts.join(', ') });
}

async function applyPack(pick) {
  // Порядок здесь важнее красоты: сначала действие, потом рассказ о нём.
  //
  // Раньше тост ждал предпросмотр, и если тот не успел приехать, применение
  // висело на его ожидании — офис переименовывался молча, а панель делала вид,
  // что ничего не произошло. Круга до сервера тут два, и второй не должен
  // задерживать первый: страница в этот момент рисует офис каждый кадр, и
  // разбор ответа встаёт в очередь за отрисовкой — 3.6 секунды на стенде
  // 4 сентября 2026 против 2 миллисекунд у curl по тому же адресу.
  const before = packChange(packUnder(pick, lang()));
  await api.saveSettings({ namePack: pick });
  if (packs) packs.choice = pick;
  renderLang();

  // Цену знаем — называем число и пример, как на кадре. Не знаем — говорим
  // хотя бы что переключили: молчание тут читается как «кнопка не сработала».
  const name = tr('lang.pack.' + packUnder(pick, lang()));
  if (!before || !before.n) return toast(tr('toast.namePackPlain', { pack: name }));
  const [from, to] = before.pairs[0];
  toast(tr('toast.namePack', { pack: name, n: before.n, from, to }));
}

const langRing = focusRing(() => el.lang, '.langbtn, .packbtn', {
  rows: '.langrow', onMove: langWarn,
});
export function langKey(raw) { return langRing.key(raw, el.lang && !el.lang.hidden); }
export function langOpen() { return el.lang && !el.lang.hidden; }

const skyRing = focusRing(() => el.sky, '#skytoggle, #skyq, .skyhit, #skygeo');
export function closeSky() { el.sky.hidden = true; skyRing.reset(); clearTimeout(geoTimer); }
export function skyKey(raw) { return skyRing.key(raw, el.sky && !el.sky.hidden); }

// ------------------------------------------------------------- цвет офиса
// Тон крутится живьём: пока тянешь ползунок, панели перекрашиваются под рукой.
// ---------------------------------------------------------------------- лифт
// Панель кабины: этаж — это коридор, а под ним подписаны комнаты, двери которых
// с него открываются. Так понятно, куда едешь, без плана этажа перед глазами.
// ------------------------------------------------------------- приглашение
// Панель хозяина: сделать ссылку, посмотреть выданные, погасить. Ссылка видна
// целиком и копируется руками — «поделиться» кнопкой в чужой сервис офис не
// умеет и не должен.
const when = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

let lastLink = '';

// Имя агента по id: в запросе лежит id, а человеку нужно имя того, кто сидит
// за столом.
const agentName = (id) => (S.agents.find((a) => a.id === id) || {}).name || id.slice(0, 6);

// Запросы доступа. Всё, на чём строится решение, стоит до кнопок: кто, о ком,
// что написал. Кнопки равны по весу — «отказать» не спрятана.
function requestsHtml() {
  const reqs = ((S.access || {}).requests) || [];
  if (!reqs.length) return '';
  return `<p class="hint">${tr('acc.asked')}</p>
    <ul class="notes">${reqs.map((r) => `<li>
      <b>${esc(r.who || tr('acc.someone'))}</b>
      <span>${tr('acc.aboutWhom', { name: esc(agentName(r.agentId)) })}${r.note ? ' · «' + esc(r.note) + '»' : ''}</span>
      <button data-yes="${esc(r.id)}">${tr('acc.open')}</button>
      <button data-no="${esc(r.id)}">${tr('acc.deny')}</button>
    </li>`).join('')}</ul>`;
}

// Что сейчас открыто. Список видит только хозяин, и закрыть можно из строки —
// отзыв должен быть не длиннее выдачи.
function openHtml() {
  const open = ((S.access || {}).open) || [];
  if (!open.length) return '';
  return `<p class="hint">${tr('acc.openNow')}</p>
    <ul class="notes">${open.map((o) => `<li>
      <b>${esc(o.who || tr('acc.someone'))}</b>
      <span>${esc(agentName(o.agentId))}</span>
      <button data-shut="${esc(o.guestId)}|${esc(o.agentId)}">${tr('acc.shut')}</button>
    </li>`).join('')}</ul>`;
}

export function inviteOpen() { return el.invite && !el.invite.hidden; }
export function closeInvite() { if (el.invite) el.invite.hidden = true; }

export async function openInvite() {
  el.invite.hidden = false;
  inviteSig = accessSig();
  await renderInvite();
}

// What the panel is showing right now, as one string. The snapshot arrives every
// couple of seconds; redrawing on each of them would be honest and unusable —
// the caret would jump out of «кого зовём» mid-word.
const accessSig = () => {
  const a = S.access || {};
  return JSON.stringify([
    (a.requests || []).map((r) => [r.id, r.state, r.who, r.agentId]),
    (a.open || []).map((o) => [o.guestId, o.agentId]),
  ]);
};
let inviteSig = '';

// A request that arrives while the panel is open used to be invisible: the panel
// was drawn when it opened and after every button in it, and by nothing else. It
// sat in the snapshot, the owner sat looking at the panel, and the two never met
// — found on a live build on 5 September 2026. Nothing was lost: the request
// waits on the server until it is answered. It simply could not be seen without
// closing the panel and opening it again.
export async function syncInvite() {
  if (!el.invite || el.invite.hidden) return;
  const sig = accessSig();
  if (sig === inviteSig) return;
  inviteSig = sig;
  // Whatever is being typed survives the redraw, caret included: the name is
  // usually half-written exactly when somebody knocks.
  const input = $('#invWho');
  const typed = input ? { value: input.value, at: input.selectionStart, focused: document.activeElement === input } : null;
  await renderInvite();
  if (!typed) return;
  const back = $('#invWho');
  if (!back) return;
  back.value = typed.value;
  if (typed.focused) { back.focus(); try { back.setSelectionRange(typed.at, typed.at); } catch { /* поле могло сменить тип */ } }
}

async function renderInvite() {
  const list = await api.invites();
  const rows = (list.invites || []);
  el.invite.innerHTML = `<div class="rwrap invwrap">
    <div class="vhead">${tr('inv.title')}<button id="invx">✕</button></div>
    <div class="invbody">
      <p class="say">${tr('inv.lead')}</p>
      <div class="sendrow">
        <input id="invWho" placeholder="${tr('inv.who')}" maxlength="24">
        <button id="invMake">${tr('inv.make')}</button>
      </div>
      ${lastLink ? `<div class="sendrow">
        <input id="invLink" readonly value="${esc(lastLink)}">
        <button id="invCopy">${tr('inv.copy')}</button>
      </div>` : ''}
      ${(S.settings && S.settings.access && S.settings.access.mode === 'shared')
        ? `<p class="hint warn">${tr('inv.shared')}</p>` : ''}
      ${requestsHtml()}
      ${openHtml()}
      <p class="hint">${tr('inv.given')}</p>
      ${rows.length ? `<ul class="notes">${rows.map((i) => `<li>
          <b>${esc(i.name || '—')}</b>
          <span>${i.used ? tr('inv.entered', { at: when(i.usedAt) }) : tr('inv.pending', { at: when(i.at) })}</span>
          <button data-douse="${esc(i.id)}">${i.used ? tr('inv.evict') : tr('inv.douse')}</button>
        </li>`).join('')}</ul>` : `<p class="hint dim">${tr('inv.none')}</p>`}
      <p class="hint dim">${tr('inv.note')}</p>
    </div></div>`;

  $('#invx').onclick = closeInvite;
  // Ответ сервера несёт свежий список — берём его сразу, не дожидаясь снимка:
  // тот приходит раз в 2.5 секунды, и всё это время нажатая кнопка выглядела
  // бы ненажатой.
  const took = async (r) => { if (r && r.access) S.access = r.access; inviteSig = accessSig(); await renderInvite(); };
  el.invite.querySelectorAll('[data-yes]').forEach((b) => {
    b.onclick = async () => took(await api.answerAccess(b.dataset.yes, true));
  });
  el.invite.querySelectorAll('[data-no]').forEach((b) => {
    b.onclick = async () => took(await api.answerAccess(b.dataset.no, false));
  });
  el.invite.querySelectorAll('[data-shut]').forEach((b) => {
    b.onclick = async () => {
      const [guestId, agentId] = b.dataset.shut.split('|');
      took(await api.revokeAccess(guestId, agentId));
    };
  });
  $('#invMake').onclick = async () => {
    const who = ($('#invWho') || {}).value || '';
    const r = await api.makeInvite(who.trim());
    if (r && r.url) { lastLink = r.url; toast(tr('inv.title')); }
    await renderInvite();
  };
  const copy = $('#invCopy');
  if (copy) {
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(lastLink); toast(tr('inv.copied')); }
      catch { $('#invLink').select(); }
    };
  }
  el.invite.querySelectorAll('[data-douse]').forEach((b) => {
    b.onclick = async () => { await api.revokeInvite(b.dataset.douse); await renderInvite(); };
  });
}

export function openLift(lift, floorNow, pick) {
  el.lift.hidden = false;
  const label = (f) => tr('lift.floor', { n: f.n });
  el.lift.innerHTML = `<div class="rwrap liftwrap">
    <div class="vhead">${tr('lift.title')}<button id="liftx">✕</button></div>
    <div class="liftbody">
      ${lift.floors.map((f) => `<button class="liftbtn${f.n === floorNow ? ' here' : ''}" data-n="${f.n}">
        <b>${f.n === floorNow ? '▸ ' : ''}${label(f)}</b>
        <span>${esc(f.rooms.join(', ') || tr('lift.empty'))}</span></button>`).join('')}
      <p class="hint">${tr('lift.hint')}</p>
    </div></div>`;
  $('#liftx').onclick = closeLift;
  el.lift.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => {
    const n = Number(b.dataset.n);
    closeLift();
    if (n !== floorNow) pick(n);
  });
  // Фокус встаёт на этаж, где ты сейчас: у него уже есть метка ▸, и от него
  // стрелка вверх-вниз читается как «этажом выше», а не «первый пункт списка».
  const here = lift.floors.findIndex((f) => f.n === floorNow);
  liftRing.at(here < 0 ? 0 : here);
}

// Панель лифта и стойка ресепшена делят один узел el.lift, поэтому клавиатура у
// них общая: фокус ходит по тому, что в открытой панели вообще можно нажать.
// До этого этажи нажимались только мышью — то есть без мыши остальные этажи
// офиса были недостижимы вовсе, а не просто неудобны.
//
// Escape тут не перехватываем: его ловит closeAll() в main.js.
const liftRing = focusRing(() => el.lift, '.liftbtn, .recgo', { numbers: '.liftbtn', byData: 'n' });
export function closeLift() { el.lift.hidden = true; liftRing.reset(); }
export function liftKey(raw) { return liftRing.key(raw, el.lift && !el.lift.hidden); }

// ----------------------------------------------------------------- ресепшен
// Стойка отвечает на один вопрос: что на этом этаже. Счётчики берём из того же
// списка агентов, что и HUD с обходом, — иначе цифры разойдутся между собой.
export function openReception(desk, guide) {
  const rows = desk.rooms.map((title) => {
    const list = S.agents.filter((a) => a.project === title);
    const waiting = list.filter((a) => a.status === 'awaiting');
    const lead = waiting[0] || list.find((a) => a.status === 'working') || list[0];
    return { title, n: list.length, waiting: waiting.length, lead };
  }).filter((r) => r.n);

  const total = rows.reduce((s, r) => s + r.waiting, 0);
  const greet = !rows.length
    ? tr('rec.emptyFloor', { n: desk.n })
    : tr('rec.greet', {
        n: desk.n,
        projects: tr('rec.projects', { n: rows.length, word: tr(pluralKey('rec.project', rows.length)) }),
        waiting: total
          ? tr('rec.waiting', { n: total, word: tr(pluralKey('rec.wait', total)) })
          : tr('rec.nobodyWaits') });

  el.lift.hidden = false;
  el.lift.innerHTML = `<div class="rwrap recwrap">
    <div class="vhead">${tr('rec.title', { n: desk.n })}<button id="recx">✕</button></div>
    <div class="recbody">
      <p class="recgreet">${esc(greet)}</p>
      ${rows.map((r) => `<div class="recrow">
        <span class="reccol"><b>▣ ${esc(r.title)}</b>
          <i>${esc(r.lead ? r.lead.name + ' · ' + (clean(r.lead.title) || actText(r.lead)) : tr('rec.nobody'))}</i></span>
        <span class="reccnt">${tr('rec.agents', { n: r.n, word: tr(pluralKey('rec.agent', r.n)) })}</span>
        <span class="recwait${r.waiting ? ' on' : ''}">! ${r.waiting}</span>
        ${r.lead ? `<button class="recgo" data-go="${r.lead.id}">${tr('rec.lead')}</button>` : ''}
      </div>`).join('')}
      <p class="hint">${tr('rec.hint')}</p>
    </div></div>`;
  $('#recx').onclick = closeLift;
  el.lift.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => {
    closeLift();
    guide(b.dataset.go);
  });
  liftRing.at(0);
}

// В английском форм две, в русском три. Ключи одни и те же, а выбор формы
// делает язык, иначе «2 agents» превращается в «2 agent».
const pluralKey = (base, n) => {
  if (lang() === 'en') return base + (n === 1 ? '.one' : '.many');
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return base + '.many';
  if (b > 1 && b < 5) return base + '.few';
  return base + (b === 1 ? '.one' : '.many');
};
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

export function renderSkin() {
  el.skin.hidden = false;
  el.skin.innerHTML = `<div class="rwrap skinwrap">
    <div class="vhead">${tr('skin.title')}<button id="skinx">✕</button></div>
    <div class="skinbody">
      <div class="swatches">${PRESETS.map((p, i) => `<button class="swatch" data-i="${i}"
        style="background:hsl(${p.hue} ${Math.round(33 * p.sat / 100)}% 22%);
               border-color:hsl(${p.hue} ${Math.round(32 * p.sat / 100)}% 41%)">${tr('skin.' + p.key)}</button>`).join('')}</div>
      <label class="skinrow">${tr('skin.hue')}<input id="skinhue" type="range" min="0" max="359" value="${theme.hue}">
        <span class="skinval" id="skinhuev">${theme.hue}°</span></label>
      <label class="skinrow">${tr('skin.sat')}<input id="skinsat" type="range" min="0" max="160" value="${theme.sat}">
        <span class="skinval" id="skinsatv">${theme.sat}%</span></label>
      <label class="skinrow">${tr('skin.accent')}<input id="skinacc" type="color" value="${theme.accent}">
        <span class="skinval">&nbsp;</span></label>
      <div class="skinrow">${tr('skin.textSize')}
        <div class="sizes">${UI_STEPS.map((v) => `<button class="szbtn${v === ui.scale ? ' on' : ''}"
          data-size="${v}">${Math.round(v * 100)}%</button>`).join('')}</div></div>
      <button id="skinreset" class="thin">${tr('skin.reset')}</button>
      <p class="hint">${tr('skin.hint')}</p>
    </div></div>`;

  const mark = () => {
    el.skin.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on',
      PRESETS[b.dataset.i].hue === theme.hue && PRESETS[b.dataset.i].sat === theme.sat));
  };
  const sync = () => {
    $('#skinhue').value = theme.hue; $('#skinhuev').textContent = theme.hue + '°';
    $('#skinsat').value = theme.sat; $('#skinsatv').textContent = theme.sat + '%';
    $('#skinacc').value = theme.accent;
    mark();
  };
  $('#skinx').onclick = closeSkin;
  // Панель сама внутри .rwrap, поэтому после смены она перерисуется уже в новом
  // размере — видно сразу, не выходя из настройки.
  el.skin.querySelectorAll('[data-size]').forEach((b) => b.onclick = () => {
    applyUiScale(Number(b.dataset.size));
    renderSkin();
  });
  el.skin.querySelectorAll('.swatch').forEach((b) => b.onclick = () => {
    const p = PRESETS[b.dataset.i];
    applyTheme({ hue: p.hue, sat: p.sat, accent: p.accent }); sync();
  });
  $('#skinhue').oninput = (e) => { applyTheme({ hue: Number(e.target.value) }); sync(); };
  $('#skinsat').oninput = (e) => { applyTheme({ sat: Number(e.target.value) }); sync(); };
  $('#skinacc').oninput = (e) => { applyTheme({ accent: e.target.value }); mark(); };
  $('#skinreset').onclick = () => { resetTheme(); sync(); toast(tr('skin.wasReset')); };
  skinRing.paint();
  mark();
}

const skinRing = focusRing(() => el.skin, '.swatch, #skinhue, #skinsat, #skinacc, [data-size], #skinreset');
export function closeSkin() { el.skin.hidden = true; skinRing.reset(); }
export function skinKey(raw) { return skinRing.key(raw, el.skin && !el.skin.hidden); }



// ------------------------------------------------- reading the whole answer
// Открытый разговор живёт своим состоянием: R перечитывает его на месте, стрелки
// листают. Без этого единственный способ увидеть новую реплику — закрыть карточку
// и открыть заново, а это теряет место, до которого дочитал.
let chatView = null;

export async function openTranscript(a, focusTs = null) {
  el.viewer.hidden = false;
  gallery = { items: [], title: '', sel: 0, mode: 'grid' };   // Esc отсюда закрывает, а не возвращает в чужую галерею
  chatView = { agent: a, msgs: [], token: 0, editing: null, pending: null, focusTs };
  // The header in two rows: who is talking — what he is working on. The session
  // name stays in the top right corner at the size it had, and service lines such
  // as a postponed re-read appear in the same place.
  el.viewer.innerHTML = `<div class="vwrap"><div class="vhead vhead2">
      <span class="vrow">${tr('chat.title', { name: esc(a.name) })}
        <span class="zhint" id="chatst">${esc(a.title || '')}</span><button id="vx">✕</button></span>
      <span class="vrow vtask" id="chattask">${chatTask(a)}</span></div>
    <div class="single chatlog" id="chatlog"><p class="hint">${tr('chat.reading')}</p></div>
    <div class="vpath">${tr('chat.keys')}<span class="ncount" id="ncount"></span></div></div>`;
  $('#vx').onclick = closeViewer;
  await loadChat(0);
}

// Карточка заметки. Рисуется из хранилища при каждой перерисовке лога, а не
// живёт в DOM: paintChat пересобирает всё целиком, и пережить это может только
// то, что лежит снаружи.
const noteCard = (n, orphan) => {
  const when = new Date(n.at).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const anchor = orphan && n.ts
    ? `<i class="nanchor">${tr('note.anchor', { when: new Date(n.ts).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) })}</i>`
    : '';
  return `<div class="note" data-note="${n.id}">
    <div class="nhead"><b>${tr('note.label', { when })}${n.edited ? ' · ' + tr('note.edited') : ''}</b>
      <button class="nedit" data-edit="${n.id}" title="${tr('note.edit')}">✎</button>
      <button class="ndel" data-del="${n.id}" title="${tr('note.remove')}">✕</button></div>
    ${anchor}<div class="nbody">${esc(n.text)}</div></div>`;
};

const noteEditor = (ts, text) => `<div class="noteed" data-anchor="${ts == null ? '' : ts}">
    <b>${ts == null ? tr('note.newLoose') : tr('note.newFor', {
      when: new Date(ts).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) })}</b>
    <textarea id="notein" rows="2" placeholder="${tr('note.placeholder')}">${esc(text || '')}</textarea>
    <i>${tr('note.keys')}</i></div>`;

// fresh — сколько реплик в хвосте показать как новые.
// force — наша собственная перерисовка (открыли или закрыли редактор). Данные
// с сервера так рисовать нельзя: они придут посреди набора текста.
function paintChat(msgs, fresh = 0, force = false) {
  const box = $('#chatlog');
  if (!box) return;
  // Пока человек пишет заметку, лог не трогаем: перерисовка сотрёт недописанное.
  // Свежие данные ждут в pending и лягут, как только редактор закроется.
  if (chatView.editing && !force) { chatView.pending = { msgs, fresh }; return; }
  // The same holds while the numbers are up: a repaint rebuilds the log and the
  // badges vanish under the hand that was choosing. Found on 5 September 2026 —
  // the numbers appeared and were gone a second later, and it read as the key
  // not working at all.
  if (pickOn() && !force) { chatView.pending = { msgs, fresh }; return; }
  const a = chatView.agent;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const keep = box.scrollTop;
  const { byTs, orphans } = splitNotes(a.id, msgs);
  const stamp = (ts) => ts ? new Date(ts).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // Правится заметка — на её месте стоит редактор, а не карточка
  const ed = chatView.editing;
  const renderNotes = (list, orphan) => list.map((n) =>
    (ed && ed.id === n.id) ? noteEditor(n.ts, ed.text) : noteCard(n, orphan)).join('');

  const loose = orphans.length
    ? `<div class="orphans"><div class="ohead">▾ ${tr('note.outside', { n: orphans.length })}
         <i>${tr('note.window')}</i></div>${renderNotes(orphans, true)}</div>`
    : '';

  box.innerHTML = msgs.length
    ? loose + msgs.map((m, i) => `<div class="msg ${m.role}${i >= msgs.length - fresh ? ' fresh' : ''}" data-ts="${m.ts == null ? '' : m.ts}">
        <div class="mwho">${m.role === 'user' ? tr('chat.you') : esc(a.name)}<span>${stamp(m.ts)}</span></div>
        <div class="md">${renderMarkdown(m.text)}</div></div>`
        + renderNotes(byTs.get(m.ts) || [], false)
        + (ed && !ed.id && ed.ts === m.ts ? noteEditor(m.ts, ed.text) : '')).join('')
    : loose + `<p class="empty">${tr('chat.empty')}</p>`;
  chatView.msgs = msgs;
  // The conversation was opened with a snapshot of the agent, while the task is
  // rewritten by every new answer: take the fresh one from the list, or the head
  // freezes on whatever he was doing when the panel was opened.
  const head = $('#chattask');
  const live = (S.agents || []).find((x) => x.id === a.id) || a;
  if (head) {
    const html = chatTask(live);
    if (head.innerHTML !== html) head.innerHTML = html;
  }
  paintNoteCount();
  bindNoteControls();
  // Пришли из панели заметок — встаём на ту реплику, к которой она привязана,
  // и подсвечиваем её: иначе непонятно, ради чего разговор открылся.
  const target = chatView.focusTs != null ? box.querySelector(`.msg[data-ts="${chatView.focusTs}"]`) : null;
  if (target) {
    target.classList.add('anchored');
    box.scrollTop = Math.max(0, target.offsetTop - box.offsetTop - 12);
    chatView.focusTs = null;
    setTimeout(() => target.classList.remove('anchored'), 2000);
    return;
  }
  const first = fresh ? box.querySelector('.msg.fresh') : null;
  if (first) box.scrollTop = Math.max(0, first.offsetTop - box.offsetTop - 12);
  else if (atBottom || !keep) box.scrollTop = box.scrollHeight;
  else box.scrollTop = keep;
  paintCopyHint();
}

function paintNoteCount() {
  const c = $('#ncount');
  if (!c || !chatView) return;
  const n = noteCount(chatView.agent.id);
  c.textContent = n ? tr('note.count', { n }) : '';
}

// Перерисовать лог по своей воле, не дожидаясь сервера.
const repaintChat = () => paintChat(chatView.msgs, 0, true);

// Реплика, на которую сейчас смотришь, — первая, чей низ ниже верхней кромки
// окна. Именно к ней и цепляется заметка, и она обводится, пока пишешь, чтобы
// привязку было видно, а не приходилось угадывать.
function topMessageTs() {
  const box = $('#chatlog');
  if (!box) return null;
  const msgs = [...box.querySelectorAll('.msg[data-ts]')].filter((m) => m.dataset.ts);
  if (!msgs.length) return null;
  const edge = box.scrollTop + 4;
  const hit = msgs.find((m) => m.offsetTop - box.offsetTop + m.offsetHeight > edge) || msgs[msgs.length - 1];
  return Number(hit.dataset.ts);
}

function openNoteEditor(ts, note) {
  if (!chatView) return;
  chatView.editing = note ? { ts: note.ts, id: note.id, text: note.text } : { ts, id: null, text: '' };
  repaintChat();
  const box = $('#chatlog');
  const ta = $('#notein');
  if (!ta) return;
  // Обводим реплику-якорь: без этого непонятно, к чему привяжется заметка
  const anchor = box.querySelector(`.msg[data-ts="${chatView.editing.ts}"]`);
  if (anchor) anchor.classList.add('anchored');
  const ed = ta.closest('.noteed');
  if (ed) box.scrollTop = Math.max(0, ed.offsetTop - box.offsetTop - 80);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  chatStatus(tr('note.paused'));
  ta.onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNoteEditor(); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(ta.value); }
  };
}

function saveNote(text) {
  const ed = chatView && chatView.editing;
  if (!ed) return;
  const a = chatView.agent;
  // Снимок контекста кладётся один раз, при записи: потом сессия умрёт, и взять
  // его будет неоткуда — ни имени агента, ни того, что ты в этот момент читал.
  const anchor = (chatView.msgs || []).find((m) => m.ts === ed.ts);
  const ctx = { agent: a.name, project: a.project, title: a.title,
    quote: anchor ? clean(anchor.text) : '' };
  const ok = ed.id ? editNote(a.id, ed.id, text) : addNote(a.id, ed.ts, text, ctx);
  if (!ok && String(text || '').trim()) { chatStatus(tr('note.failed')); return; }
  closeNoteEditor(ed.id ? tr('note.saved') : tr('note.added'));
}

// Редактор закрылся — можно наконец положить то, что пришло, пока писали.
function closeNoteEditor(status) {
  if (!chatView) return;
  chatView.editing = null;
  const waiting = chatView.pending;
  chatView.pending = null;
  if (waiting) paintChat(waiting.msgs, waiting.fresh, true);
  else repaintChat();
  chatStatus(status || (chatView.agent.title || ''));
  const box = $('#chatlog');
  if (box) box.focus?.();
}

function bindNoteControls() {
  const box = $('#chatlog');
  if (!box || !chatView) return;
  const a = chatView.agent;
  const find = (id) => notesOf(a.id).find((n) => n.id === id);
  box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const n = find(b.dataset.edit);
    if (n) openNoteEditor(n.ts, n);
  });
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    // Второй клик подтверждает: заметку писали руками, случайный промах обиден
    if (b.dataset.armed !== 'yes') { b.dataset.armed = 'yes'; b.textContent = '✕?'; b.classList.add('arm'); return; }
    removeNote(a.id, b.dataset.del);
    repaintChat();
    chatStatus(tr('note.removed'));
  });
}

const chatStatus = (text) => { const st = $('#chatst'); if (st) st.textContent = text; };

async function loadChat(fresh) {
  const a = chatView.agent;
  const mine = ++chatView.token;
  const r = await fetch('/api/chat?id=' + encodeURIComponent(a.id), { headers: owned() })
    .then((x) => x.json()).catch((e) => ({ error: e.message }));
  if (!chatView || chatView.token !== mine || el.viewer.hidden) return;
  const box = $('#chatlog');
  if (!box) return;
  if (r.error) {
    if (chatView.msgs.length) chatStatus(tr('chat.rereadFailed', { err: esc(r.error) }));
    else box.innerHTML = `<p class="empty">${esc(r.error)}</p>`;
    return;
  }
  const msgs = r.messages || [];
  const was = chatView.msgs;
  // Хвост мог не прибавиться, а дописаться — растущий ответ это одна и та же реплика.
  const grew = msgs.length > was.length
    || (msgs.length && was.length && msgs[msgs.length - 1].text !== was[was.length - 1].text);
  if (fresh && !grew) { chatStatus(tr('chat.noNew') + ' · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); return; }
  paintChat(msgs, fresh ? Math.max(1, msgs.length - was.length) : 0);
  if (fresh) {
    const added = msgs.length - was.length;
    chatStatus(added > 0 ? tr('chat.newBelow', { n: added }) : tr('chat.appended'));
    toast(added > 0 ? tr('chat.newToast', { name: a.name, n: added, a: added === 1 ? 'а' : '' })
                    : tr('chat.appendedToast', { name: a.name }));
  } else chatStatus(a.title || '');
}

// Стрелки листают лог; SHIFT — почти на экран за нажатие.
function scrollChat(dir, big) {
  const box = $('#chatlog');
  if (!box) return;
  box.scrollTop += dir * (big ? Math.max(120, box.clientHeight * 0.9) : 64);
}

export function transcriptKey(key, big) {
  if (!chatView || el.viewer.hidden || !$('#chatlog')) return false;
  // Пока открыт редактор, клавиши забирает textarea; сюда долетает только то,
  // что мимо неё, и трогать лог в этот момент нельзя.
  if (chatView.editing) return key === 'escape' ? (closeNoteEditor(), true) : true;
  if (key === 'n' || key === 'т') { openNoteEditor(topMessageTs(), null); return true; }
  if (key === 'arrowup') { scrollChat(-1, big); return true; }
  if (key === 'arrowdown') { scrollChat(1, big); return true; }
  if (key === 'pageup') { scrollChat(-1, true); return true; }
  if (key === 'pagedown' || key === ' ') { scrollChat(1, true); return true; }
  if (key === 'home') { $('#chatlog').scrollTop = 0; return true; }
  if (key === 'end') { const b = $('#chatlog'); b.scrollTop = b.scrollHeight; return true; }
  if (key === 'r' || key === 'к') { chatStatus(tr('chat.rereading')); loadChat(1); return true; }
  if (key === 'escape') { closeViewer(); return true; }
  return false;
}

// ----------------------------------------------------- все заметки разом
// Заметка, записанная в разговоре, живёт внутри него — а найти её потом нужно,
// не помня, у какого агента она осталась. Панель собирает все и группирует по
// проекту из снимка контекста, а не из живого офиса: офиса к этому моменту
// может уже не быть.
let notesQuery = '';

export function renderNotes() {
  el.notes.hidden = false;
  const all = allNotes();
  const q = notesQuery.trim().toLowerCase();
  const hit = q ? all.filter((n) => (n.text + ' ' + ((n.ctx && n.ctx.quote) || '')).toLowerCase().includes(q)) : all;

  // группировка по проекту; у старых заметок снимка нет — им отдельная куча
  const groups = new Map();
  for (const n of hit) {
    const key = (n.ctx && n.ctx.project) || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const alive = new Set(S.agents.map((a) => a.id));
  const stamp = (ms) => new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // A note whose address is not a session belongs to somebody else, and the
  // core does not read it: it shows the address to every module and takes the
  // first that answers. The answer carries a label for the button and what to
  // do on a press. Nobody answered — the row says so, as it does for a closed
  // chat, and the note still reads, because its line of context is stored.
  const claims = new Map();
  for (const n of hit) {
    if (!n.anchor || n.anchor.kind === 'agent') continue;
    const claim = first('note', n.key, n.ctx || {});
    if (claim && typeof claim.open === 'function') claims.set(n.id, claim);
  }

  const rows = [...groups.entries()].map(([project, list]) => `
    <div class="ngroup"><h4>${project ? '▣ ' + esc(project) : tr('notes.noProject')}</h4>
      ${list.map((n) => {
        const a = n.anchor || { kind: 'agent' };
        const foreign = a.kind !== 'agent';
        const live = !foreign && alive.has(n.agentId);
        const who = n.ctx && n.ctx.agent
          ? esc(n.ctx.agent) + (n.ctx.title ? ' · ' + esc(n.ctx.title) : '')
          : '';
        const claim = claims.get(n.id);
        const tail = foreign
          ? (claim
            ? `<button class="ngo" data-open="${n.id}">${esc(claim.label || tr('notes.open'))}</button>`
            : `<span class="ndead">${tr('notes.noOpener')}</span>`)
          : live
            ? `<button class="ngo" data-go="${n.agentId}" data-ts="${n.ts == null ? '' : n.ts}">${tr('notes.open')}</button>`
            : `<span class="ndead">${tr('notes.closed')}</span>`;
        // Under the text goes what the note hangs on. For a foreign address it
        // is the line its owner wrote when the note was made — the core has no
        // words of its own for something it does not interpret, and a made-up
        // phrasing would be a second truth about somebody else's anchor.
        const under = foreign
          ? (n.ctx && n.ctx.line ? esc(n.ctx.line) : tr('notes.noCtx'))
          : live ? who : (n.ctx && n.ctx.quote ? '«' + esc(n.ctx.quote) + '»' + (who ? ' · ' + who : '') : tr('notes.noCtx'));
        return `<div class="nrow" data-note="${n.id}" data-agent="${n.agentId}">
          <div class="nline"><span class="ntext">${esc(n.text)}</span><i>${stamp(n.at)}</i></div>
          <div class="nmeta"><span>${under}</span>${tail}
            <button class="ndel" data-del="${n.id}" data-agent="${n.agentId}">✕</button></div></div>`;
      }).join('')}</div>`).join('');

  el.notes.innerHTML = `<div class="rwrap noteswrap">
    <div class="vhead"><span>${tr('notes.title')}</span>
      <span class="zhint">${all.length ? tr('notes.count', { n: all.length }) : ''}</span>
      <button id="notesx">✕</button></div>
    <div class="nsearch"><input id="notesq" placeholder="${tr('notes.search')}" value="${esc(notesQuery)}"></div>
    <div class="rbody">${all.length
      ? (hit.length ? rows : `<p class="empty">${tr('notes.nothingFound')}</p>`)
      : `<p class="empty">${tr('notes.emptyHead')}<span>${tr('notes.emptyWhy')}</span></p>`}</div>
    </div>`;

  $('#notesx').onclick = closeNotes;
  const input = $('#notesq');
  input.oninput = () => { notesQuery = input.value; const at = input.selectionStart; renderNotes(); const f = $('#notesq'); if (f) { f.focus(); f.setSelectionRange(at, at); } };
  // Поиск держит настоящий фокус, пока в него печатают, и стрелки туда не
  // доходят. Стрелка вниз — выход из него в найденное: ровно тот ход, ради
  // которого этот поиск и нужен.
  input.onkeydown = (e) => {
    if (e.key !== 'ArrowDown') return;
    e.preventDefault();
    input.blur();
    notesRing.at(0);
  };
  el.notes.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => {
    const claim = claims.get(b.dataset.open);
    if (!claim) { renderNotes(); return; }     // the module left while the panel was open
    closeNotes();
    claim.open();
  });
  el.notes.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => {
    const agent = S.agents.find((a) => a.id === b.dataset.go);
    if (!agent) { renderNotes(); return; }      // успел закрыться, пока смотрел
    closeNotes();
    openTranscript(agent, b.dataset.ts ? Number(b.dataset.ts) : null);
  });
  el.notes.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    if (b.dataset.armed !== 'yes') { b.dataset.armed = 'yes'; b.textContent = '✕?'; b.classList.add('arm'); return; }
    removeNote(b.dataset.agent, b.dataset.del);
    renderNotes();
  });
  notesRing.paint();
}

// Панель заметок открывается по N и до сих пор требовала мыши на всё: открыть
// разговор по заметке и удалить её. Обе кнопки стоят в одном кольце, в порядке
// разметки — сначала «открыть» строки, потом её ✕.
const notesRing = focusRing(() => el.notes, '.ngo, .ndel');
export function closeNotes() { el.notes.hidden = true; notesRing.reset(); }
export function notesKey(raw) { return notesRing.key(raw, el.notes && !el.notes.hidden); }
export function notesOpen() { return !el.notes.hidden; }


export function relabel() {
  renderHud();
  // Диалог и обход перерисовываются только когда меняется их ключ — иначе
  // панель мигала бы каждые две секунды на живых данных. Смена языка данные не
  // трогает, поэтому ключ надо сбросить руками, иначе половина панели остаётся
  // на прежнем языке: подписи из buildDialog не обновляются вовсе.
  dialogKey = ''; rosterSig = '';
  // Панель модуля тоже осталась бы на прежнем языке: свой текст она рисует
  // сама, и перерисовать его может только она.
  collect('lang');
  if (S && S.dialogOpen) renderDialog();
  if (el.roster && !el.roster.hidden) renderRoster();
  if (el.bag && !el.bag.hidden) renderBag();
  if (el.sky && !el.sky.hidden) renderSky();
  if (el.skin && !el.skin.hidden) renderSkin();
}
