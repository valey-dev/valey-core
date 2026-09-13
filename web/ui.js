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
// The standup catches its own key by the physical code rather than by the
// letter — see rosterKey below.
import { codeOf } from './keymap.js';

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
import { t as tr, lang, onLang, fmtStamp, fmtClock } from './i18n.js';
import { cardClosed } from './pager.js';

const WEATHER_ICON = { clear: '☀', clouds: '☁', rain: '☂', storm: '⚡', snow: '❄', fog: '≋' };

// Our own player knows the track by name, the built-in one only the wave it is tuned to.

export function renderHud() {
  const waiting = S.agents.filter((a) => a.status === 'awaiting').length;
  const working = S.agents.filter((a) => a.status === 'working').length;
  const stopped = S.agents.filter((a) => a.status === 'stopped').length;
  const d = new Date();
  const room = S.currentRoom ? `<span class="chip room">▣ ${esc(S.currentRoom.title)}</span>` : `<span class="chip room">${tr('hud.corridor')}</span>`;
  const w = S.weather || { kind: 'clear' };
  const temp = w.temp != null ? ` ${Math.round(w.temp)}°` : '';
  const z = S.zoom || { dev: 1, auto: true, tight: false };
  const place = w.label ? ` · ${esc(w.label)}` : '';
  el.hud.innerHTML = `<b>VALEY</b> · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}
    <span class="chip sky" title="${tr('hud.skyTitle', { source: w.source === 'procedural' ? tr('sky.made') : w.source === 'real' ? tr('sky.realSource') : esc(w.source || '') })}">${WEATHER_ICON[w.kind] || '·'} ${tr('sky.' + w.kind)}${temp}${place}</span>
    ${room}<span class="chip work" title="${tr('hud.workTitle')}">⌨ ${working}</span>${waiting
      // A bare number in the corner is read as «three messages» and pressed at:
      // on 6 September 2026 it was mistaken for the pager badge, and H — which
      // brings the pager back — did nothing, because there was nothing to bring.
      // The counter says what it counts and opens the round, where those very
      // agents are listed.
      ? `<button id="waitChip" class="chip wait" title="${tr('hud.waitTitle')}">! ${waiting}</button>`
      : ''}${stopped
      // Its own count rather than a share of «! N»: the stopped ask for nothing,
      // but a restart of the app cuts every agent off at once, and without a
      // number here that is found only by walking the floor. Not a button —
      // the way on is «continue» in the session's chat, which is the person's.
      // Design: [HUD · stopped chip](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=2126-3686)
      ? `<span class="chip stop" title="${tr('hud.stopTitle')}">‖ ${stopped}</span>`
      : ''}
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
  const wait = $('#waitChip');
  if (wait) wait.onclick = () => api.openRound();
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

const STATUS_WORDS = ['awaiting', 'stopped', 'idle'];
const statusWord = (a) => tr('status.' + (STATUS_WORDS.includes(a.status) ? a.status : 'working'));
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
  // Both notice and why contain text returned by Claude, or the error it failed
  // with. It is not in the dictionary, so it cannot be trusted as markup.
  if (S.notice) return esc(S.notice);
  const d = S.delivery || {};
  if (!d.available) return tr('hint.noCli', { why: esc(said(d, 'hint') || said(d) || tr('hint.noCliDefault')) });
  const mode = (S.settings && S.settings.delivery && S.settings.delivery.mode) || 'acceptEdits';
  return tr('hint.deliver', { note: modeNote(mode) });
}

// A guest may leave a note, but may not send it into the chat. They get neither
// the button nor the mode selector: a disabled button promises it might work
// later, while this one will never work for them.
//
// The hint is chosen here rather than at the call sites because there are two:
// the panel is built in full when opened and patched on every tick. On 30 August
// 2026 the latter overwrote the guest hint with the owner's: the button was
// already gone, while the text still promised delivery.
const isGuest = () => S.owner === false;
const taskHint = () => (isGuest() ? tr('hint.guest') : hintText());

let btnIndex = 0;   // which of the bottom buttons the arrows are standing on

// Live data arrives every couple of seconds. Rebuilding the panel each time would
// yank the caret out of the task field, so a repeat render only patches the text.
export function renderDialog() {
  const a = S.focus;
  if (!a) return;
  el.dialog.hidden = false;
  // Access state is part of the key: without it, moving through "closed → asked →
  // denied" does not rebuild the body and a person clicks a dead button.
  // The request is part of the key too: it disappears after any answer, ours or
  // another tab's, and the card must rebuild instead of leaving dead buttons.
  // So is being stopped: the talk page shows a notice instead of the reply, and
  // an agent cut off while its card was open must not keep typing its last words.
  const key = a.id + '|' + S.page + '|' + accessOf(a.id) + '|' + ((permitOf(a.id) || {}).id || '') + '|' + (denying ? 'deny' : '')
    + '|' + (a.status === 'stopped' ? 'stop' : '');
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
    // While the link is selected the person is aiming at it, not reading. Restarting
    // the typewriter then only jerks the card, so append the answer silently.
    if (said !== S.sayText) {
      S.sayText = said;
      if (linkFocused) { S.typed = said.length; finishTypewriter(); }
      else { S.typed = 0; typewriter(); }
    }
    // The answer grows inside the open card, and "N more characters" lies unless
    // its caption is updated with the answer.
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
  // Paint the highlight again: an update may have replaced the node and its class.
  paintDialogFocus();
}

// The permission request this agent is waiting on. A guest has no such list—the
// server never sends it—so there is no need to check ownership here.
const permitOf = (id) => (S.permits || []).find((p) => p.agentId === id) || null;

// What the guest knows about access to this agent. There are three states and a
// default: closed, requested, denied. "Open" needs no separate state because
// the guest then simply sees what the owner sees.
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
    // There is no reply to show a guest: the server never sent it. Instead of an
    // empty space, explain what is closed and what can be done about it. Saying it
    // "never left the machine" would be false here: these sessions belong to this
    // office and the server simply withholds them.
    const st = isGuest() ? accessOf(a.id) : 'open';
    if (st !== 'open') {
      const btn = st === 'pending' ? ''
        : `<button id="askAccess">${tr(st === 'refused' ? 'acc.askAgain' : 'acc.ask')}</button>`;
      body = `<p class="q">${tr('dlg.whatUp')}</p>
        <p class="say">${tr('acc.projectionOnly')}</p>
        <p class="hint">${tr(st === 'refused' ? 'acc.refused' : st === 'pending' ? 'acc.waiting' : 'acc.closed')}</p>
        ${btn}
        <p class="hint dim">${tr('acc.note')}</p>`;
    }
    // Cut off mid-step: the notice stands where the reply would, as the limit's
    // does, because the last thing said was not an answer to anything. The hint
    // names the one way on — «continue» in the session's own chat — and that
    // sending there stays the person's word.
    // Design: [Dialog · stopped](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=2122-6434)
    else if (a.status === 'stopped') {
      body = `<p class="q">${tr('dlg.whatUp')}</p>
        <p class="say stopline">‖ ${tr('dlg.stopped')}</p>
        <p class="hint">${tr('dlg.stoppedHint')}</p>`;
    }
    // The subscription limit is a notice on the door, not the agent's words: it did not reply.
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

  // Design: [Permission dialog · Bash](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=947-2)
  // Denial with a note: [Permission dialog · denied](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=947-230)
  else if (S.page === 'permit') {
    const p = permitOf(a.id);
    // The request may have been answered in another tab or expired while this
    // card was open. An empty space here would look like a broken UI.
    if (!p) body = `<p class="say">${tr('permit.gone')}</p>`;
    else if (denying) {
      body = `<p class="q">${tr('permit.denyQ')}</p>
        <p class="say">${esc(p.description || (p.question ? p.question.text : '') || tr('permit.noDesc'))}</p>
        ${p.question ? '' : `<pre class="cmd">${esc(p.command)}</pre>`}
        <textarea id="denyNote" rows="3" placeholder="${tr('permit.denyHint')}"></textarea>
        <div class="prow">
          <button data-a="deny" class="primary">${tr('permit.deny')} <kbd>⏎</kbd></button>
          <button data-a="back">${tr('permit.back')} <kbd>Esc</kbd></button>
        </div>
        <p class="hint">${tr('permit.denyNote')}</p>`;
    } else {
      body = `<p class="q">${p.question ? tr('permit.askQ') : tr('permit.q')}</p>
        <p class="say">${esc(p.description || (p.question ? p.question.text : '') || tr('permit.noDesc'))}</p>
        ${p.question
          // A question is not a command, and a <pre> full of braces is what the
          // office used to show instead of it. The options are the whole point:
          // «разрешить или отказать» says nothing about a question whose answer
          // is one of four.
          ? (p.question.options.length
            // The note under an option is the half a person decides on. It is
            // shown dimmer than the label rather than hidden behind a hover:
            // a comment you have to go looking for is a comment nobody read.
            ? `<div class="qopts">${p.question.options.map((o, i) => {
              const label = typeof o === 'string' ? o : (o.label || '');
              const note = typeof o === 'string' ? '' : (o.note || '');
              return `<button class="qopt" data-opt="${i}"><b>${esc(label)}</b>${
                note ? `<span>${esc(note)}</span>` : ''}</button>`;
            }).join('')}</div>`
            : '')
          : `<pre class="cmd">${esc(p.command)}</pre>`}
        ${p.rule ? `<p class="hint">${tr('permit.rule', { rule: esc(p.rule) })}</p>` : ''}
        <div class="prow">
          ${p.question
            // A question has nothing to allow and no rule to write, so the row
            // under it is two: refuse to answer, or go and answer in the
            // terminal. The answer itself is the option above.
            ? `<button data-a="deny">${tr('permit.noAnswer')}</button>
               <button data-a="terminal">${tr('permit.terminal')}</button>`
            : `<button data-a="allow" class="primary">${tr('permit.allow')} <kbd>⏎</kbd></button>
               <button data-a="always" ${p.rule ? '' : 'disabled'}>${tr('permit.always')}</button>
               <button data-a="deny">${tr('permit.deny')}</button>
               <button data-a="terminal">${tr('permit.terminal')}</button>`}
        </div>
        <p class="hint">${tr(p.question ? 'permit.askNote' : 'permit.note')}</p>`;
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

  // A request is sent once and replaces the previous one; a retry does not create
  // a second entry or make the owner receive two identical requests in a row.
  const askBtn = $('#askAccess');
  if (askBtn) {
    askBtn.onclick = async () => {
      askBtn.disabled = true;
      await api.askAccess(a.id);
      // Set "waiting" locally rather than waiting for the snapshot, which arrives
      // every 2.5 seconds; otherwise the button looks untouched in the meantime.
      const acc = (S.access = S.access || {});
      acc.pending = [...new Set([...(acc.pending || []), a.id])];
      acc.refused = (acc.refused || []).filter((x) => x !== a.id);
      renderDialog();
    };
  }

  const ta = $('#taskInput');
  if (ta) {
    const submit = async (wanted) => {
      // A guest always leaves the note on the desk. Keyboard shortcuts outlive
      // buttons, and otherwise Ctrl+Enter would still reach the server and be denied.
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
// Answer a permission request. Remove the buttons immediately rather than
// waiting for a snapshot: the agent on the other side is waiting live, and the
// person should never have to wonder whether the click registered.
function bindPermit(a) {
  const rows = [...el.dialog.querySelectorAll('.prow button')];
  if (!rows.length) return;
  const p = permitOf(a.id);
  // Focus the first button: the card was opened to answer, so Enter should answer
  // rather than switch the tab under the cursor.
  fileIdx = 0;
  paintDialogFocus();
  // The note field uses the same keys as the task field: Enter sends, Shift+Enter
  // inserts a line break, and Esc returns to the buttons. Giving adjacent fields
  // in one card different bindings is an easy mistake to make by hand.
  const note = $('#denyNote');
  if (note) note.onkeydown = (e) => {
    if (e.key === 'Escape') { denying = false; renderDialog(); return; }
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    el.dialog.querySelector('.prow [data-a="deny"]')?.click();
  };
  // An option is the answer, and it goes out as one: the label travels to the
  // hook, which hands it back to Claude Code as `answers` — the agent gets the
  // choice exactly as if it had been clicked in the client's own picker. Until
  // 11 September 2026 it went out as the message of a deny, and the desktop app
  // ignored it: its picker was already up, and every press ended in «this
  // question is already closed».
  for (const b of [...el.dialog.querySelectorAll('.qopt')]) {
    b.onclick = async () => {
      if (!p || !p.question) return;
      const o = p.question.options[Number(b.dataset.opt)];
      if (!o) return;
      const label = typeof o === 'string' ? o : (o.label || '');
      for (const x of el.dialog.querySelectorAll('.qopt, .prow button')) x.disabled = true;
      const r = await api.answerPermit(p.id, 'answer', '', label);
      denying = false;
      if (r && r.error) UI_toastKey(r);
      else api.toast(tr('toast.permitAnswered', { who: a.name, answer: label, a: a.gender === 'f' ? 'а' : '' }));
      api.forgetPermit(p.id);
      S.page = 'talk';
      renderDialog();
    };
  }
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
    // The server may not find the request because another tab answered it or it
    // expired. In that case the card simply rebuilds and says so.
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

  // Use our text for a known server error key, and the external text otherwise.
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
  clearInterval(S.tw);   // Otherwise the typewriter would append into a closed card.
  denying = false;
  // Tell the pager when the card closes; otherwise the question handed to the
  // card disappears from the screen entirely.
  cardClosed();
}

// On the "deny with a note" step, Esc means "back to the buttons," not "close
// the card": the person has just chosen denial but sent nothing yet. main.js
// calls this before its general close handler.
export function permitEscape() {
  if (!denying) return false;
  denying = false;
  renderDialog();
  return true;
}

// The pager opens the permission card because it knows which agent was requested.
export function openPermit(agentId) {
  const a = (S.agents || []).find((x) => x.id === agentId);
  if (!a) return false;
  S.focus = a; S.dialogOpen = true; S.page = 'permit'; denying = false; S.notice = '';
  renderDialog();
  return true;
}

// ---- arrows walk along the bottom row, Enter presses ----
const actButtons = () => [...el.dialog.querySelectorAll('.acts button')];

// A number switches card tabs: 1—current work, 2—show work, 3—give a task.
// Close gets no number because it already has Esc. While a note is being typed,
// this handler is not reached at all: main.js gives the keys to the field.
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
// File rows on "Show work" and note buttons on "Give a task" occupy the same
// place in the card: the list below the text, reached with Arrow Up. The tabs
// are never open together, so combining selectors is enough; separate page
// logic would add nothing.
// «попросить доступ» belongs here too: until 5 September 2026 it was in no
// focus list at all, and a guest could press it with a mouse and by no other
// means — the one button in the office the keyboard could not reach. The tabs
// are never open at the same time, so the selectors can share one list.
const bodyRows = () => [...el.dialog.querySelectorAll(
  '.files li, .notes [data-retry], .notes [data-send], .notes [data-edit], .notes [data-del], .prow button, #askAccess, .qopt')];

// Arrow Up on a truncated answer focuses "read more": a long reply will be read
// in full anyway, and reaching for the mouse adds an unnecessary step.
let linkFocused = false;

// The same applies to the card body, only with several targets. The file list
// and note buttons used to be clickable only: neither opening an agent's work
// nor forwarding a note was possible without a mouse.
let fileIdx = -1;

// Focus lives in a variable but is shown by a class on a node, and a redraw
// replaces that node. Repaint it after every card update. If the new tab has no
// link, return focus to the buttons; otherwise no highlight is visible and
// there is nothing to activate.
function paintDialogFocus() {
  if (linkFocused && !readLink()) linkFocused = false;
  const rows = bodyRows();
  // Files and notes arrive in a live stream, so the row under the cursor may
  // disappear. Return focus to the buttons instead of leaving it on empty space.
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

// While a reply is being typed, the first Enter or SPACE completes it instead
// of activating the focused control. The mouse already did this by clicking
// the text; there was no keyboard equivalent, so people had to wait silently.
const stillTyping = () => S.page === 'talk' && !!$('#say') && !!S.sayText
  && S.typed < S.sayText.length;

export function pressDialogFocus() {
  // Only an Enter that would otherwise activate the focused button may complete
  // the typewriter. Moving up to the transcript link or a file already expresses
  // an action, so the key must not be intercepted. On 3 September 2026 it was:
  // opening the full transcript took two presses, and the first looked broken.
  if (stillTyping() && !linkFocused && fileIdx < 0) { finishTypewriter(); return; }
  if (linkFocused) {
    const link = readLink();
    if (link) link.click();
    return;
  }
  if (fileIdx >= 0) {
    const row = bodyRows()[fileIdx];
    // A snapshot update may remove the row between drawing and activation. Doing
    // nothing silently reads as "Enter is broken."
    if (row) { row.click(); return; }
    fileIdx = -1;
    paintDialogFocus();
  }
  const b = actButtons()[btnIndex];
  if (b && !b.disabled) b.click();
}

// Up first scrolls the text to the top, then jumps from the top line to the link.
// A newly opened card already shows the top, so the first press reaches the
// link—which is exactly why this path exists.
export function dialogUp() {
  const body = el.dialog.querySelector('.body');
  const rows = bodyRows();
  if (rows.length) {
    // Enter the list from below at the last file: the buttons are underneath it,
    // so Up moves to the nearest row rather than jumping across the whole list.
    if (fileIdx < 0) fileIdx = rows.length - 1;
    else if (fileIdx > 0) fileIdx -= 1;
    else return scrollDialogBody(-1);   // Above the first row, scroll rather than leave.
    paintDialogFocus();
    rows[fileIdx].scrollIntoView({ block: 'nearest' });
    return;
  }
  if (!linkFocused && readLink() && (!body || body.scrollTop <= 2)) {
    linkFocused = true;
    // Focusing the transcript block means the person will read there, so the
    // local typewriter is no longer useful: it completes the text and pulls
    // attention back. The core already applied this rule to a new reply arriving
    // while the link was selected; here it also applies to selecting the link.
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
    // Down from the last row returns to the buttons; a dead end at the bottom of
    // a list reads as "the keyboard is broken."
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
  // Bind the handler in code rather than through an onerror attribute: an
  // attribute is a script assembled from text, and a dictionary quote would
  // eventually break it. A future CSP would reject it as well.
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

// ---------------------------------------------------- copying code blocks
// markdown.js draws the button; one delegated handler on the panel catches its
// clicks. A transcript may contain hundreds of blocks, and attaching a handler
// to every one would leave hundreds of handlers alive across redraws.
//
// The browser clipboard is available only on localhost or over HTTPS. The
// office is also opened through tunnels and LAN addresses, where
// `navigator.clipboard` is absent or rejects the call, so the old `execCommand`
// is the fallback. If that fails too, the button says so instead of lying in
// green.
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* A tunnel or plain HTTP: fall back to the legacy path. */ }
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

// State lives on the button for 1.5 seconds and then returns to idle. There is
// deliberately no separate status line: the button itself is the response.
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

// The same behavior as copyBlock for a standalone button with no adjacent code
// block, such as a key card that copies the neighboring field. This deliberately
// reuses the pattern: the button itself is the response, with no status line.
async function copyOnBtn(btn, text) {
  const was = btn.dataset.was || btn.textContent;
  btn.dataset.was = was;
  const ok = await copyText(text);
  btn.classList.remove('done', 'fail');
  btn.classList.add(ok ? 'done' : 'fail');
  btn.textContent = tr(ok ? 'key.copied' : 'key.copyFailed');
  clearTimeout(btn._back);
  btn._back = setTimeout(() => {
    btn.classList.remove('done', 'fail');
    btn.textContent = was;
  }, ok ? 1500 : 4000);
  return ok;
}

// The key copies the topmost visible block—the one being read. There are almost
// always more blocks below the viewport, so copying the first document block
// would often copy something other than what is visible.
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

// The shortcut bar lists what actually works. C copies only when the panel has
// a code block, so the hint appears only then. The office already had a hollow
// shortcut promise when “R — radio” appeared in the free build.
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

// Delegate once on the viewer panel. Its contents redraw constantly, while the
// handler survives because it lives above them.
export function bindCopyButtons() {
  // The keyboard stands' fake DOM has no event listeners. That should not make
  // them fail: they test state, not subscriptions.
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

// The open file's header buttons switch to source and permit scripts in the
// sandbox. Scripts deliberately have no letter shortcut: an accidental key
// must not run somebody else's code, so the person must reach and press it.
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
  // Three screens share this one element, and they take different keys. The
  // transcript is the one worth telling apart by name: C copies there, where in
  // the office it opens the wardrobe.
  if (chatView && $('#chatlog')) return 'transcript';
  return gallery.mode === 'single' ? 'single' : 'gallery';
}
export function liftOpen() { return !!(el.lift && !el.lift.hidden); }
// The tab the card is reading. In «поговорить» the cursor sits in the field, and
// that is a different place from the card itself: there the letters type.
export function cardPage() { return S.page; }

// The box that scrolls in the open file: the image sits in its own frame, text
// scrolls in the panel body.
function scrollSingle(key) {
  const can = (b) => b && b.scrollHeight > b.clientHeight + 1;
  const zoom = el.viewer.querySelector('.zoomwrap');
  const box = can(zoom) ? zoom : el.viewer.querySelector('.single') || zoom;
  if (!box) return;
  if (key === 'home') { box.scrollTop = 0; return; }
  if (key === 'end') { box.scrollTop = box.scrollHeight; return; }
  const step = Math.max(120, box.clientHeight * 0.9);
  box.scrollTop += key === 'pageup' ? -step : step;
}

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
    // A tall image runs off the bottom of the screen and the mouse could reach
    // it while the keyboard could not: PageUp/PageDown were in VIEWER_KEYS, so
    // the viewer swallowed them and did nothing. On a Mac keyboard without a
    // numeric block these are Fn+↑/↓, which is how this was noticed.
    if (['pageup', 'pagedown', 'home', 'end'].includes(key)) { scrollSingle(key); return true; }
    if (key === 'r' || key === 'к') return toggleMarkdownRaw();
    // Pixel zoom is an action on the image itself and has no button. The mouse
    // used to be the only way to inspect an individual pixel.
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

// --------------------------------------------------------- the standup (Tab)
// Who is on what — everybody at once, by teams. Frames: Figma, the section
// «WIP — Планёрка: кто над чем», accepted on 6 September 2026.
//
// This is the morning round's place, and the standup does not stand next to it
// — it replaces it. The round showed only those with `status` awaiting and
// dimmed the ones already visited: of the nine people in the office three were
// on the screen, and those faded as you walked. That answers "who do I go to",
// while what is asked of the office is the other question — "what is the team
// on". A panel that hides half the floor cannot answer the second one, so this
// is the whole floor rather than a filter.
//
// The task comes from the tail of the report rather than from the tools:
// reportTail() in server/agents.js parses «Текущая фича/задача», «Статус» and
// «Что нужно от меня» and puts them in the snapshot as `task`. This panel
// counts nothing new — it is the first place that shows it about everyone.
//
// Whoever does not report in three lines stands here with no task: the chat
// name, the last thing said, what he is doing now. Inventing a task for him is
// out of the question — the task is what this is opened for, and the lie would
// sit exactly where the eye goes.

// A stopped agent ranks right after the waiting ones: it will not go on until
// somebody says so, which makes it the second thing a person looks for.
// Design: [Person card · four states](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=2122-6385)
const CARD_STATE = (a) => (a.status === 'awaiting' ? 'wait' : a.status === 'stopped' ? 'stop'
  : a.status === 'working' ? 'work' : 'idle');
const CARD_ORDER = { wait: 0, stop: 1, work: 2, idle: 3 };

/**
 * The teams in the order their rooms stand on the floor. The order is held by
 * the layout — a slot belongs to a project for as long as the project lives —
 * and it is held there for the very reason it is wanted here: a board that
 * reshuffles every two seconds cannot be read. A project whose room has not
 * been built yet goes last, alphabetically, rather than disappearing.
 */
export function standupTeams(agents, rooms = []) {
  const by = new Map();
  for (const a of agents) {
    if (!by.has(a.project)) by.set(a.project, []);
    by.get(a.project).push(a);
  }
  const order = (rooms || []).map((r) => r.key);
  const place = (p) => { const i = order.indexOf(p); return i < 0 ? order.length : i; };
  return [...by.keys()]
    .sort((x, y) => place(x) - place(y) || String(x).localeCompare(String(y)))
    .map((project) => ({
      project,
      // Those waiting rise to the top — the only reordering inside a team, and
      // it is about the work. Below them the desk seat decides: a seat belongs
      // to a session, so the order holds by itself.
      list: by.get(project).slice().sort((p, q) =>
        CARD_ORDER[CARD_STATE(p)] - CARD_ORDER[CARD_STATE(q)]
        || (p.seat || 0) - (q.seat || 0)
        || String(p.name).localeCompare(String(q.name))),
      waiting: by.get(project).filter((a) => a.status === 'awaiting').length,
    }));
}

/**
 * The lines of one card. Kept apart from the markup because what is decided
 * here is not layout: it is what to show instead of a task when there is none,
 * and when a task stops counting as "now".
 */
export function standupCard(a) {
  const t = a.task && a.task.what ? a.task : null;
  return {
    state: CARD_STATE(a),
    reported: !!t,
    // An empty string is a string too: on the live floor there was a card with
    // no tail, no chat name, and a last reply that cleaned down to nothing —
    // and the board carried a lone «· без отчёта» with no line in front of it.
    task: (t ? t.what : (a.title || clean(a.lastSaid).slice(0, 60)) || '').trim(),
    // With no report the line is dim always: it is not a task, it is what could
    // be found instead of one. Only a real task goes cold — said an hour ago
    // and silent since.
    cold: !t || (a.status !== 'working' && (a.idleFor || 0) > COLD_TASK),
    status: t ? (t.status || '') : '',
    need: t ? (t.need || '') : '',
    now: a.status === 'working' || a.status === 'stopped' ? actText(a) : '',
  };
}

const cardToken = (a) => {
  const when = ago(a.idleFor);
  const s = CARD_STATE(a);
  if (s === 'work') return '● ' + tr('status.working');
  const [mark, word] = s === 'wait' ? ['⚑ ', 'awaiting'] : s === 'stop' ? ['‖ ', 'stopped'] : ['○ ', 'idle'];
  return mark + tr('status.' + word) + (when ? ' · ' + when : '');
};
const cardFoot = (c) => (c.now ? '▸ ' + c.now : c.status ? tr('task.status', { s: c.status }) : '');
const headLine = (teams, people, waiting) => [
  tr('standup.title'),
  tr('standup.people', { n: people }),
  tr('standup.teams', { n: teams }),
  waiting ? tr('standup.waiting', { n: waiting }) : tr('standup.nobodyWaits'),
].join(' · ');

// Rebuilding the whole panel is only expensive to the eye: it is live, the
// snapshot arrives every two seconds, and swapping the markup under a reading
// person buys nothing. So the key is made of the cast and the states — of what
// the cards themselves are built from — and the words inside them are patched
// in place.
let rosterSig = '';
const cardSig = (a) => {
  const c = standupCard(a);
  return [a.id, c.state, c.need ? '!' : '', S.visited.has(a.id) ? '✓' : ''].join('');
};

const cardHtml = (a) => {
  const c = standupCard(a);
  const foot = cardFoot(c);
  return `<div class="pcard ${c.state}" role="button" data-id="${esc(a.id)}">
    <canvas class="pface" width="28" height="30" data-face="${esc(a.id)}"></canvas>
    <span class="pname">${S.visited.has(a.id) ? '✓ ' : ''}${esc(a.name)}</span>
    <span class="ptok">${esc(cardToken(a))}</span>
    <span class="pmeta">${esc(roleText(a))}${a.branch ? ' · ' + esc(a.branch) : ''}</span>
    <span class="ptask${c.cold ? ' cold' : ''}">${esc(c.task || tr('standup.untitled'))}${
      c.reported ? '' : ` <i>· ${tr('standup.noReport')}</i>`}</span>
    <span class="pfoot${c.now && c.state === 'work' ? ' now' : ''}">${esc(foot)}</span>
    ${c.need ? `<span class="pneed">⚑ ${tr('task.need', { s: esc(c.need) })}</span>` : ''}
    <button class="plead" data-go="${esc(a.id)}" title="${tr('standup.lead')}">⇢</button>
  </div>`;
};

export function renderRoster() {
  const teams = standupTeams(S.agents, S.layout && S.layout.projectRooms);
  const waiting = S.agents.filter((a) => a.status === 'awaiting').length;
  el.roster.hidden = false;

  const key = teams.map((t) => t.project + ':' + t.list.map(cardSig).join(',')).join('|');
  if (key === rosterSig && el.roster.querySelector('.rbody')) { patchRoster(teams, waiting); return; }
  rosterSig = key;

  const body = el.roster.querySelector('.rbody');
  const scroll = body ? body.scrollTop : 0;

  el.roster.innerHTML = `<div class="rwrap pwrap">
    <div class="vhead"><span id="rcount">${headLine(teams.length, S.agents.length, waiting)}</span><button id="rx">✕</button></div>
    <div class="rbody">${teams.length ? `<div class="pcols">${teams.map((t) => `
      <div class="pcol"><h4>▣ ${esc(t.project)}<i>${t.list.length}${t.waiting ? ' · ⚑' + t.waiting : ''}</i></h4>
        ${t.list.map(cardHtml).join('')}</div>`).join('')}</div>`
    : `<p class="empty">${tr('standup.nobody')}<span>${tr('standup.nobodyWhy')}</span></p>`}</div>
    <p class="pkeys">${tr('standup.keys')}</p>
  </div>`;

  const fresh = el.roster.querySelector('.rbody');
  if (fresh) fresh.scrollTop = scroll;

  $('#rx').onclick = closeRoster;
  el.roster.querySelectorAll('.pcard').forEach((c) => c.onclick = () => openFromStandup(c.dataset.id));
  el.roster.querySelectorAll('.plead').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();                    // a button inside a card: lead me, not open
    api.guideTo(b.dataset.go);
    closeRoster();
  });
  paintFaces();
  rosterRing.paint();
}

// The portrait is the one from the desk and is drawn by the same code: a person
// is recognised by it rather than by his name — there are more names on the
// floor than a memory holds faces.
function paintFaces() {
  if (!S.looks) return;
  el.roster.querySelectorAll('canvas[data-face]').forEach((cv) => {
    if (!cv.getContext) return;             // a stand's stand-in DOM: nothing to draw with
    const look = S.looks.get(cv.dataset.face);
    if (!look) return;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 28, 30);
    drawPerson(g, 14, 29, look, { pose: 'stand', frame: 0 });
  });
}

function patchRoster(teams, waiting) {
  const count = $('#rcount');
  const label = headLine(teams.length, S.agents.length, waiting);
  if (count && count.textContent !== label) count.textContent = label;
  for (const t of teams) for (const a of t.list) {
    const card = el.roster.querySelector(`.pcard[data-id="${a.id}"]`);
    if (!card) continue;
    const c = standupCard(a);
    const put = (sel, text) => {
      const n = card.querySelector(sel);
      if (n && n.textContent !== text) n.textContent = text;
    };
    put('.ptok', cardToken(a));
    put('.pfoot', cardFoot(c));
    if (c.need) put('.pneed', '⚑ ' + tr('task.need', { s: c.need }));
    // The task line is two pieces — the task and the "no report" aside — so
    // replacing its text would drop the second one. Whether the aside is there
    // at all is part of the key, so a card that gains one is rebuilt, not
    // patched; here only the task itself can have changed.
    const task = card.querySelector('.ptask');
    const first = task && task.firstChild;
    if (first && first.textContent !== c.task) first.textContent = c.task;
  }
}

// Open a person's card without walking to the desk. The standup is "walked up
// to everyone at once"; sending you on foot afterwards answers "go and look" to
// the question the panel has just closed.
function openFromStandup(id) {
  const a = S.agents.find((x) => x.id === id);
  if (!a) { renderRoster(); return; }       // gone while the panel was open
  closeRoster();
  api.openAgent(a.id);
}

// The ring walks the cards: up and down inside a column, sideways between
// columns. A card is one thing rather than a row of buttons, so in the ring it
// is one thing too.
const rosterRing = focusRing(() => el.roster, '.pcard', { cols: '.pcol', noWrap: true });
export function closeRoster() { el.roster.hidden = true; rosterSig = ''; rosterRing.reset(); }
export function rosterOpen() { return !!(el.roster && !el.roster.hidden); }

/**
 * The standup's keys. Arrows, ENTER and ESC are the shared panel machinery;
 * one is its own: G leads you to whoever you are standing on.
 *
 * The event arrives whole rather than as a single letter, because it carries
 * the physical key code and that is what «вести» is caught by. Otherwise on
 * "ЙЦУКЕН" this is the letter «п», and it would have to be written in as a
 * pair — the very thing web/keymap.js removed. A plain string comes from the
 * gamepad and from the stands, which have no layout at all.
 */
export function rosterKey(raw) {
  if (!rosterOpen()) return false;
  const code = raw && typeof raw === 'object' ? codeOf(raw) : null;
  const key = String(raw && typeof raw === 'object' ? (raw.key || '') : raw).toLowerCase();
  if (code === 'KeyG' || (!code && key === 'g')) {
    const cur = el.roster.querySelector('.pcard.focus');
    if (!cur) return true;
    api.guideTo(cur.dataset.id);
    closeRoster();
    return true;
  }
  return rosterRing.key(key, true);
}

// -------------------------------------------------------------------- inventory
// The "How you look" panel moved here in full and became the "on you" tab:
// colours on the left, body on the right. Removable items moved to "things" and
// use a grid rather than ◀▶ rows—there will be eighteen dress-code ties, and
// cycling through those with an arrow is paging, not choosing.
//
// Tabs live in a list rather than three if branches: "keys" and "office" from
// the same design arrive in later commits and each adds one line here.
// Design: Figma section "🔵 WIP — Dress code and inventory · Ready for Dev",
// frames 556:56 (on you) and 556:508 (things).
const COLORS = [
  { key: 'skin', list: SKIN },
  { key: 'hair', list: HAIR },
  { key: 'shirt', list: SHIRT },   // Replaced by the office shirt; see colorFields().
  { key: 'pants', list: PANTS },
  { key: 'boots', list: BOOTS },
];
const colorFields = () => COLORS.map((f) => (f.key === 'shirt' ? { ...topField(), label: 'shirt' } : f));
const BODY = [
  { key: 'tall', list: [0, 1] },
  { key: 'style', list: [0, 1, 2, 3, 4] },
  { key: 'face', list: FACES },
];
// A grid slot can read and write more than S.me[key]: a tie is stored as a
// "colour + cut" pair, and two rows represent it more honestly than eighteen
// cells in one row.
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
// Cell caption. A tie or jacket value is a colour and has no dictionary key, so
// show the colour itself and translate only "none."
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
// A guest cannot see the "tree" tab: this is somebody else's floor, and how it
// is assembled is not theirs to inspect.
const tabs = () => (isGuest() ? TABS.filter((t) => t !== 'tree') : TABS);
let bagTab = 'self';

// Read the dress code from office settings too: it is shared, not browser-local.
const dressCode = () => (S.settings && S.settings.dress && S.settings.dress.code) || 'casual';
const officeOn = () => dressCode() === 'office';
// In office mode, "top" edits the office shirt rather than the casual top;
// otherwise switching back and forth would discard the selected colour.
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
  if (keysIn) keysRing.paint();
  // A guest gets the cards to read and no controls at all: POST /api/settings
  // answers him 403 anyway, and saying «the owner sets the keys up» beats
  // letting him press a button and collect a refusal. Hidden by the class, so
  // the fields fall out of the tab order too.
  if (isGuest()) return;
  // Copying is shared by every card: a command, a path, a Redirect URI. Without
  // https the browser has no clipboard, and that has to show on the button
  // rather than in the console.
  // Put the answer on the pressed button, as with code blocks in a transcript.
  // A toast moved up to the office status while the hand was looking at the
  // button it had just pressed, making the action appear to do nothing.
  // Delegate rather than binding named buttons: a card may learn what to copy
  // only after rendering—the easel asks the server for the settings path and
  // adds data-copy when the answer arrives. A handler attached by name would
  // never see that button.
  detail.onclick = (e) => {
    const b = e.target.closest && e.target.closest('[data-copy]');
    if (b && detail.contains(b)) copyOnBtn(b, b.dataset.copy);
  };
  const card = cards[keyIdx];
  if (card && card.bind) card.bind(detail);
  // A field holding the focus makes the office blind to its keys, so the way out
  // of a field has to be the field's own. Escape hands the ring back rather than
  // shutting the shelf: el.bag is selfClosing, and without this an Escape typed
  // into a half-filled Client ID threw the whole inventory away. A second Escape,
  // with the ring back on, still closes it — the two steps are the point.
  //
  // A listener rather than onkeydown: a module binds its own handler to the same
  // field, and assigning would wipe it.
  detail.querySelectorAll('input').forEach((f) => f.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    f.blur();
    paintBagFocus();
  }));
  paintBagFocus();
}

// Arrows walk the shelf, ⏎ hands focus to the card — from there it is Tab.
// The shelf is two floors, and the arrows say which one you are on. Left and
// right walk the cards; down steps into the open card and then walks its rows;
// up from the first row comes back out to the shelf.
//
// Enter used to hand the browser's own focus to the first control and leave the
// rest to Tab. That was enough while a card was one button — the CLI has one —
// and stopped being enough the moment Spotify arrived with four steps, two
// fields and five buttons. This office is walked with the keyboard; a card that
// needs the mouse is a card nobody set up.
const KEY_ROWS = '.keystep, .keycmd, .keywarn, .keyfoot';
const keysRing = focusRing(() => el.bag.querySelector('.keydetail'), 'input, .obtn', { rows: KEY_ROWS });
let keysIn = false;

// Leaving the card: on a card switch, on a tab switch, on closing the bag. The
// flag outliving its card would swallow the arrows on the shelf.
export function keysOut() { keysIn = false; keysRing.reset(); }

function keysKey(key) {
  const cards = keyCards();
  if (!cards.length) return false;

  if (!keysIn) {
    const step = { arrowleft: -1, arrowright: 1 }[key];
    if (step !== undefined) {
      keyIdx = (keyIdx + step + cards.length) % cards.length;
      keysRing.reset();
      renderBag();
      return true;
    }
    if (key === 'arrowdown' || key === 'enter' || key === ' ') {
      if (!el.bag.querySelector('.keydetail input, .keydetail .obtn')) return true;
      keysIn = true;
      keysRing.reset();
      keysRing.paint();
      return true;
    }
    // Up on the shelf is nobody's: the tabs are digits, and the office below is
    // not walked from inside a panel.
    return key === 'arrowup';
  }

  // Up out of the first row leaves the card rather than wrapping round to the
  // last: a ring that swallows the way back is how a panel traps a hand.
  if (key === 'arrowup') {
    const detail = el.bag.querySelector('.keydetail');
    const cur = detail && detail.querySelector('.focus');
    const rows = detail ? [...detail.querySelectorAll(KEY_ROWS)] : [];
    if (!cur || !rows.length || rows[0].contains(cur)) {
      keysOut();
      el.bag.querySelectorAll('.keydetail .focus').forEach((n) => n.classList.remove('focus'));
      return true;
    }
  }
  return keysRing.key(key, true);
}

// The "office" tab. Dress code lives here because it has no object in the
// office: weather is set at the window, language at the sign, while "put ties
// on everyone" hangs nowhere.
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

// ------------------------------------------------------------- module tree
// The "tree" tab shows the whole office build as a three-tier skill tree. Its
// contents come from web/library.js; core branches and modules returned by
// /api/modules are lit. There are no prices or "buy" links: checkout belongs on
// valey.dev, while this view explains what the office contains and depends on.
//
// The selected node is the focus: arrows move through the tree—↑↓ within a
// column and ←→ along an edge to the parent or first child—and the card below
// changes immediately without Enter. There is no separate focus ring: lighting
// one thing while showing another would create two cursors in one panel.
// Design: Figma, Prod, section "18 · Module tree in inventory," frames 932:2
// (free build) and 934:2 (Office build). Accepted 4 September 2026.
let treeSel = null;
// Icon colours are four-pixel placeholders from the design; bespoke icons are
// separate work. A branch and its continuation share a tone, except the easel:
// it grew from the work board alongside the Git tree, and two adjacent green
// nodes read as a single object.
const TONE = { floor1: '#c9a06a', bible: '#c9a06a', art: '#d97b6c', easel: '#d97b6c',
  board: '#9fe0a8', gittree: '#9fe0a8', task: '#ffd166', feed: '#ffd166', cctv: '#8fbcff', dossier: '#8fbcff',
  radio: '#c39bff', dress: '#f6e3c0', agents: '#e0a06a', floor: '#e0a06a', talk: '#9fe0a8', meet: '#9fe0a8',
  door: '#8c7660', guest: '#8c7660' };
const L = (v) => (v ? (v[lang()] || v.en) : '');
// own is lit; office/floor is dim with the tier name; room is a free branch
// whose folder is absent (radio without modules/); ghost is "in a year."
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
// Select the first missing Office module by default: that directly answers
// "what is in the next tier." When everything is installed, select the ghost
// node about the coming year.
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

// Draw edges from the buttons' real geometry, not row numbers: panel width
// shifts on a narrow screen while the grid does not. An edge runs from the
// parent's right side to the child's left through the gutter; same-row edges
// are straight.
function treeEdges() {
  const box = el.bag.querySelector('#tree'), svg = box && box.querySelector('.tedges');
  if (!svg || !box.getBoundingClientRect) return;          // The stand's substitute DOM.
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
  if (key === 'arrowdown') next = list[Math.min(i + 1, list.length - 1)];
  else if (key === 'arrowright') next = list[(i + 1) % list.length];
  else if (key === 'arrowup' || key === 'arrowleft') next = list[(i - 1 + list.length) % list.length];
  else if (key === 'enter' || key === ' ') return true;
  else return false;
  if (next && next.id !== cur.id) { treeSel = next.id; renderBag(); }
  return true;
}

// When there is no edge, use the closest row in the adjacent column: "in a
// year" grows from nothing, while radio has no continuation.
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
    const i = col.indexOf(cur);
    next = key === 'arrowup'
      ? col[(i - 1 + col.length) % col.length]
      : col[Math.min(i + 1, col.length - 1)];
  } else if (key === 'arrowleft') {
    next = cur.parent ? byId(cur.parent) : treeNear(colOf(cur) - 1, cur.row);
  } else if (key === 'arrowright') {
    next = children(cur.id)[0] || treeNear(colOf(cur) + 1, cur.row);
  } else if (key === 'enter' || key === ' ') {
    return true;                       // The selected item is already open in the card.
  } else return false;
  // The edge of the tree is not a reason to hand the arrow back to the office.
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
  markScrollable(el.bag.querySelector('.bbody'));
}

// The inventory body has scrolled since it was built, and nothing ever said so:
// no bar, no edge, and the cut lands mid-line, so a long card reads as broken
// markup rather than as «there is more below». Measured 7 September 2026 on the
// unconnected mail key: 596 against 478, and the 118 hidden pixels held exactly
// the sentence about where the Google secret is kept — the one a person should
// read before pasting it.
//
// The class is what the fade hangs on, and it is set from the real numbers
// rather than guessed from the tab: every tab has its own content and the same
// question. Recomputed on scroll, because the answer changes at the bottom.
function markScrollable(body) {
  if (!body) return;
  const mark = () => body.classList.toggle('more',
    body.scrollHeight - body.scrollTop - body.clientHeight > 2);
  body.addEventListener('scroll', mark, { passive: true });
  mark();
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
    // Dress the figure according to the office mode: the panel promises what is
    // visible on the floor, not the raw saved values.
    drawPerson(c, 15, 33, dressMe(S.me, dressCode()), { pose: 'stand', frame: 0 });
    c.restore();
  };
  // Each row shows its value, so update it with the figure. Redrawing the whole
  // panel would be shorter, but the arrow would steal focus from the name field
  // in the middle of typing.
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
        // The cut is drawn in the selected tie colour and vice versa, so redraw
        // the neighbouring row with this one.
        if (f.key === 'tie' || f.key === 'cut') renderBag();
      };
    });
  }
  paintBagFocus();
}

// The "office" tab is a row of buttons, not a slot list or a grid. It has a
// third keyboard behaviour, which need not be maintained beside the other two.
const officeRing = focusRing(() => el.bag, '.obtn');

function openTab(tab) {
  if (!tabs().includes(tab) || tab === bagTab) return;
  bagTab = tab; bagIdx = 0; cellIdx = 0;
  keysOut();
  officeRing.reset();
  renderBag();
}

export function closeBag() { el.bag.hidden = true; bagIdx = 0; cellIdx = 0; officeRing.reset(); keysOut(); }

// Open the shelf on one particular key. The thing that uses a key is the natural
// place to ask for it — the receiver knows the office has no Spotify long before
// anybody walks to the inventory — so it needs a way to say «this one», not just
// «the keys tab». Unknown id opens the shelf as it was rather than throwing: a
// module can be switched off while its neighbour still points at it.
export function openKeyCard(id) {
  const at = keyCards().findIndex((c) => c.id === id);
  if (at >= 0) keyIdx = at;
  keysOut();
  renderBag('keys');
}

// "On you" is a slot list rather than a row of buttons, each with ◀ and ▶.
// Up and down move among slots; sideways changes the selected slot's value,
// matching the way the list is read.
//
// "Things" is a grid where the same arrows mean something else: up and down
// change rows, sideways moves among cells, and ⏎ equips. One index cannot
// represent both interactions, so there are two.
let bagIdx = 0;
let cellIdx = 0;
const bagRows = () => [...el.bag.querySelectorAll('.namerow, .drow')];
const bagCats = () => [...el.bag.querySelectorAll('.bcat')];
const catCells = (cat) => (cat ? [...cat.querySelectorAll('.bcell')] : []);

function paintBagFocus() {
  if (bagTab === 'office') { officeRing.paint(); return; }
  if (bagTab === 'tree') return;      // The selected node is the focus; see treeHtml().
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

// Leave Escape alone: closeAll() in main.js handles it.
export function bagKey(raw) {
  if (el.bag.hidden) return false;
  const key = raw.toLowerCase();

  // A digit selects a tab. Keys 1–9 have no other office role; scale uses +, −,
  // and 0.
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

// Where the next arrow press lands. Wrapping is the default and stays it: in the
// lift, the language panel or the radio a list is a handful of items and a ring
// is the shorter way round. In a list long enough to be scrolled it is not — you
// arrow down to read to the end, and the last press throws you back to the top
// with no way to tell that from a redraw. So a panel that scrolls asks for
// noWrap and stops at the edge instead.
// Declarations rather than const arrows: focusRing is called while this module
// is still being evaluated — the standup builds its ring at line ~1540, above
// this point — and a const would still be in its dead zone there.
function stopAt(pos, by, len) { return Math.max(0, Math.min(len - 1, pos + by)); }
function wrapAt(pos, by, len) { return (pos + by + len) % len; }

function selfKey(key) {
  const list = bagRows();
  if (!list.length) return false;

  const step = { arrowup: -1, arrowdown: 1 }[key];
  if (step !== undefined) {
    bagIdx = stopAt(bagIdx, step, list.length);
    paintBagFocus();
    return true;
  }

  const row = list[bagIdx];
  const turn = { arrowleft: '-1', arrowright: '1' }[key];
  if (turn !== undefined) {
    const b = row && row.querySelector(`[data-d="${turn}"]`);
    if (b) b.click();
    return true;                 // The name row has nothing to turn, but the
                                 // arrow should not escape into the office.
  }
  if (key === 'enter' || key === ' ') {
    // The name is an input: Enter gives it real focus, then the browser types.
    // On a slot, Enter does the same thing as ▶.
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

  // Down the categories the shelf scrolls, so it stops at the last one rather
  // than wrapping; sideways a category is four to eight cells that all fit at
  // once, and there a ring is still the shorter way to the far end.
  const down = { arrowup: -1, arrowdown: 1 }[key];
  if (down !== undefined) {
    bagIdx = stopAt(bagIdx, down, cats.length);
    paintBagFocus();
    return true;
  }
  const side = { arrowleft: -1, arrowright: 1 }[key];
  if (side !== undefined) {
    const cells = catCells(cats[bagIdx]);
    if (cells.length) cellIdx = wrapAt(cellIdx, side, cells.length);
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
            at: live.at ? fmtClock(live.at) : '—' })
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
  // Labels and details come from the geocoder and are external text like any other input.
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


// ---------------------------------------------------------- panel focus ring
// A fifth panel repeated the same machinery: selected-button index, focus class,
// wrapping arrows, Enter as click. Copying it again was no longer defensible, so
// the world window and office colour share this helper. The lift, round, notes,
// and wardrobe still have their own copies; consolidating those is in BACKLOG.md
// rather than rewriting proven code in the middle of the night.
//
// Range controls in the ring behave like range controls: sideways arrows change
// the value rather than move focus. Otherwise volume and hue remain mouse-only.
// This is exported so module panels use the same arrows as core panels; a second
// way to move among buttons would create a second office.
// opts.numbers makes digits 1–9 select and press a list item. It came from the
// inventory tabs and proved general: on-screen lists are usually short and
// visually numbered already.
//   numbers: true          — every item in the ring
//   numbers: '.rst'        — only these (in radio a digit is a station, not a knob)
// opts.cols — the mirror of opts.rows for a panel laid out in columns.
//   byData: 'n'            — find data-n="digit" instead of the Nth item: in the
//                            lift, "3" is floor three even if it is second in the list.
export function focusRing(nodeOf, selector, opts = {}) {
  const stepTo = opts.noWrap ? stopAt : wrapAt;
  let idx = 0;
  // Only what has a box is in the ring. The radio's volume knob sits under a
  // `hidden` row until the full Spotify player connects, and until 11 September
  // 2026 one press of the down arrow went into it: the outline vanished and the
  // key read as stuck. The panel's own box is asked first, because some panels
  // paint the ring a moment before they open, and a closed panel would otherwise
  // hand over an empty ring. The keyboard stands' nodes have no boxes to ask.
  const boxed = (n) => !n.getClientRects || n.getClientRects().length > 0;
  const list = () => {
    const node = nodeOf();
    if (!node) return [];
    const all = [...node.querySelectorAll(selector)];
    return boxed(node) ? all.filter(boxed) : all;
  };

  // Tab inside a panel belongs to the browser — main.js hands it back while the
  // focus sits on a control — and the browser moves the focus without telling
  // the ring. Until 8 September 2026 the yellow outline stayed on the field you
  // had left while the browser drew its own blue one on the field you had
  // arrived at: two highlights, neither of them where the office thought it was.
  // Found by Sergey tabbing from Client ID to Client secret on the mail card.
  //
  // So the ring listens instead of guessing: whatever moves the focus — Tab,
  // Shift+Tab, a mouse — the highlight goes with it. Classes only, never paint():
  // paint() scrolls and calls onMove, and one of those would fire on every Tab.
  const follow = () => {
    const node = nodeOf();
    // A panel may hand the ring a node of its own making rather than an element —
    // the radio does, and so do the keyboard stands. Nothing to listen on there.
    if (!node || !node.dataset || !node.addEventListener || node.dataset.ringFollow) return;
    node.dataset.ringFollow = '1';
    node.addEventListener('focusin', (e) => {
      const l = list();
      const at = l.indexOf(e.target);
      if (at < 0 || at === idx) return;
      idx = at;
      l.forEach((b, i) => b.classList.toggle('focus', i === at));
    });
  };

  const paint = () => {
    const l = list();
    if (!l.length) return;
    idx = Math.max(0, Math.min(l.length - 1, idx));
    l.forEach((b, i) => b.classList.toggle('focus', i === idx));
    l[idx].scrollIntoView({ block: 'nearest' });
    follow();
    // Some panels need more than a highlighted button. The language panel has a
    // "what happens if pressed" line below, which must follow focus, not a click.
    // Otherwise the cost would be shown only after it had already been paid.
    if (opts.onMove) opts.onMove(l[idx]);
  };
  return {
    paint,
    reset() { idx = 0; },
    // Focus a particular index: the current floor in the lift, or the first note
    // after leaving search.
    at(i) { idx = i; paint(); },
    // Focus a particular element. Counting it in a list of one's own goes wrong
    // as soon as the ring skips something hidden that the list did not.
    on(b) { const at = list().indexOf(b); if (at >= 0) { idx = at; paint(); } },
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
          const pool = opts.numbers === true ? l
            : [...nodeOf().querySelectorAll(opts.numbers)].filter((b) => !boxed(nodeOf()) || boxed(b));
          const hit = opts.byData ? pool.find((b) => Number(b.dataset[opts.byData]) === n) : pool[n - 1];
          // A digit outside the list does not escape into the office. The panel
          // is open, and a player moving underneath reads as erratic keyboard input.
          if (!hit) return true;
          const at = l.indexOf(hit);
          if (at >= 0) { idx = at; paint(); }
          if (!hit.disabled) hit.click();
          return true;
        }
      }

      // In a row-based panel, ↑↓ move between rows and ←→ within a row. A flat
      // traversal misleads the hand: "interface" and "agent names" are separate
      // questions, so Down should reach the second instead of finishing the first.
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

      // A panel laid out in columns is the same thing on its side: up and down
      // walk inside a column, sideways carries you to the same place in the
      // next one. The standup is read down a team, and the down arrow has to
      // stay inside it.
      if (opts.cols) {
        const cols = [...nodeOf().querySelectorAll(opts.cols)]
          .map((c) => l.filter((b) => c.contains(b)))
          .filter((c) => c.length);
        const at = cols.findIndex((c) => c.includes(cur));
        if (at >= 0) {
          const pos = cols[at].indexOf(cur);
          const down = { arrowup: -1, arrowdown: 1 }[key];
          if (down !== undefined) {
            const col = cols[at];
            idx = l.indexOf(col[stepTo(pos, down, col.length)]);
            paint(); return true;
          }
          const side = { arrowleft: -1, arrowright: 1 }[key];
          if (side !== undefined) {
            const col = cols[(at + side + cols.length) % cols.length];
            idx = l.indexOf(col[Math.min(pos, col.length - 1)]);
            paint(); return true;
          }
        }
      }

      const step = { arrowup: -1, arrowdown: 1, arrowleft: -1, arrowright: 1 }[key];
      if (step !== undefined) { idx = stepTo(idx, step, l.length); paint(); return true; }
      if (key === 'enter' || key === ' ') {
        if (!cur || cur.disabled) return true;
        // Give an input real focus, then let the browser type.
        if (cur.tagName === 'INPUT' && cur.type !== 'range') cur.focus();
        else cur.click();
        return true;
      }
      return false;
    },
  };
}

// ------------------------------------------------------- language and names
//
// Until 4 September 2026 the small figure in the corridor switched language in
// one press. There are now two name packs and more will follow; cycling is not
// how a growing list is selected, so SPACE opens a panel. The cost is explicit:
// one press became three.
let packs = null;   // The /api/names response; lives while the panel is open.

export async function openLang() {
  el.lang.hidden = false;
  langRing.reset();
  renderLang();
  // The cost of pressing arrives separately and may be late: the server is
  // single-threaded, so a request caught behind transcript scanning waits too.
  // By then the panel is drawn and readable; only the rename line is waiting.
  packs = await api.names().catch((e) => ({ error: String(e && e.message), packs: [] }));
  if (!el.lang.hidden) renderLang();
}

export function closeLang() { el.lang.hidden = true; packs = null; langRing.reset(); }

// What selecting a pack will do: the number of changed names and two examples.
// Count live agents rather than the entire on-disk registry. The promise "all
// 12" is checked against the visible floor, so this number must match it.
function packChange(id) {
  const p = packs && packs.packs.find((x) => x.id === id);
  if (!p) return null;
  const pairs = (S.agents || [])
    .filter((a) => p.names[a.id] && p.names[a.id] !== a.name)
    .map((a) => [a.name, p.names[a.id]]);
  return { n: pairs.length, pairs };
}

// The effective pack for this choice: "follows the office language" is not a
// pack, but a promise to follow the language.
const packUnder = (choice, lng) => (choice === 'auto' ? lng : choice);

function renderLang() {
  const lng = lang();
  const choice = (packs && packs.choice) || (S.settings && S.settings.namePack) || 'auto';
  const now = packUnder(choice, lng);
  // Build buttons from the inventory, not the cost response. The pack list must
  // be stable from the first frame or the panel redraws under the person's hand.
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

// Size and sample come from the inventory delivered with settings; it is static
// and needs no waiting. Only the cost of pressing requires a server round trip.
function langStatus(id) {
  const p = (S.packs || []).find((x) => x.id === id);
  if (!p) return tr('lang.counting');
  return tr('lang.status', {
    pack: tr('lang.pack.' + id),
    names: p.sample.join(', '),
    n: p.size - p.sample.length,
  });
}

// The "what happens if pressed" line is the cost. Show it only for a pack that
// is not active; pressing the active one would do nothing.
function langWarn(node) {
  const warn = el.lang && el.lang.querySelector('.langwarn');
  const status = el.lang && el.lang.querySelector('.langstatus');
  if (!warn || !status) return;
  const pick = node && node.dataset ? node.dataset.pack : null;
  const choice = (packs && packs.choice) || 'auto';
  const target = pick ? packUnder(pick, lang()) : null;
  const change = target && pick !== choice ? packChange(target) : null;

  // The status line follows focus: when "English" is selected it describes the
  // English dictionary, not the active one. Otherwise the panel answers a
  // different question from the one the arrow just asked.
  status.innerHTML = langStatus(target || packUnder(choice, lang()));

  if (!change || !change.n) { warn.hidden = true; warn.textContent = ''; return; }
  const [first, second] = change.pairs;
  const parts = [tr('lang.becomes', { from: first[0], to: first[1] })];
  if (second) parts.push(tr('lang.also', { from: second[0], to: second[1] }));
  warn.hidden = false;
  warn.textContent = tr('lang.warn', { n: change.n, pairs: parts.join(', ') });
}

async function applyPack(pick) {
  // Order matters more than symmetry here: perform the action, then describe it.
  //
  // The toast used to wait for the preview. If the preview was late, applying
  // the pack waited too: the office renamed silently while the panel pretended
  // nothing happened. There are two server round trips, and the second must not
  // delay the first. The page renders the office every frame, and response
  // parsing queues behind that work—3.6 seconds in the 4 September 2026 stand,
  // versus 2 milliseconds for curl against the same address.
  const before = packChange(packUnder(pick, lang()));
  await api.saveSettings({ namePack: pick });
  if (packs) packs.choice = pick;
  renderLang();

  // When the cost is known, name the count and example from the frame. When it
  // is not, at least say what changed; silence reads as a broken button.
  const name = tr('lang.pack.' + packUnder(pick, lang()));
  if (!before || !before.n) return toast(tr('toast.namePackPlain', { pack: name }));
  const [from, to] = before.pairs[0];
  toast(tr('toast.namePack', { pack: name, n: before.n, from, to }));
}

const langRing = focusRing(() => el.lang, '.langbtn, .packbtn', {
  rows: '.langrow', onMove: langWarn,
});
export function langKey(raw) { return langRing.key(raw, el.lang && !el.lang.hidden); }
// The panel's two rows carry the mark of the current language and pack, and
// until 12 September 2026 nothing redrew them when the language changed: Enter
// on «English» switched the office and left ● on «Русский» for as long as the
// panel stayed open. The panel listens to the dictionary itself rather than
// riding relabel(), so it follows a switch from a neighbouring tab as well.
onLang(() => { if (el.lang && !el.lang.hidden) renderLang(); });
export function langOpen() { return el.lang && !el.lang.hidden; }

const skyRing = focusRing(() => el.sky, '#skytoggle, #skyq, .skyhit, #skygeo');
export function closeSky() { el.sky.hidden = true; skyRing.reset(); clearTimeout(geoTimer); }
export function skyKey(raw) { return skyRing.key(raw, el.sky && !el.sky.hidden); }

// ------------------------------------------------------------- office colour
// Hue changes live: while the slider moves, panels repaint under the hand.
// ----------------------------------------------------------------------- lift
// The cabin panel treats a floor as a corridor and labels the rooms whose doors
// open from it. The destination is clear without keeping a floor plan in mind.
// ---------------------------------------------------------------- invitation
// The owner panel creates a link, lists issued invitations, and revokes them.
// The full link is visible and copied by hand; the office neither can nor should
// "share" it through an external service.
const when = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

let lastLink = '';

// Resolve an agent name from an id: the request stores an id, while a person
// needs the name of whoever sits at the desk.
const agentName = (id) => (S.agents.find((a) => a.id === id) || {}).name || id.slice(0, 6);

// Access requests. Everything needed for a decision precedes the buttons: who
// asked, about whom, and what they wrote. The buttons have equal weight; Deny
// is not hidden.
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

// What is open right now. Only the owner sees this list, and each row can close
// its own grant, keeping revocation no longer than issuance.
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
  if (typed.focused) { back.focus(); try { back.setSelectionRange(typed.at, typed.at); } catch { /* The field may have changed type. */ } }
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
  // The server response carries a fresh list, so use it immediately rather than
  // waiting for the 2.5-second snapshot. Otherwise the clicked button would look
  // untouched during that entire interval.
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
  // Focus the current floor: it already has the ▸ marker, and moving up or down
  // from it reads as “one floor up,” not “the first item in a list.”
  const here = lift.floors.findIndex((f) => f.n === floorNow);
  liftRing.at(here < 0 ? 0 : here);
}

// The lift panel and reception desk share the el.lift node, so they share their
// keyboard handling: focus moves across whatever the open panel can activate.
// Floors used to be mouse-only, making the rest of the office unreachable—not
// merely inconvenient—without a mouse.
//
// Escape is left to closeAll() in main.js.
const liftRing = focusRing(() => el.lift, '.liftbtn, .recgo', { numbers: '.liftbtn', byData: 'n' });
export function closeLift() { el.lift.hidden = true; liftRing.reset(); }
export function liftKey(raw) { return liftRing.key(raw, el.lift && !el.lift.hidden); }

// ---------------------------------------------------------------- reception
// The desk answers one question: what is on this floor. Counts come from the
// same agent list as the HUD tour so the two cannot disagree.
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

// English has two forms and Russian has three. Both use the same keys, while the
// active language chooses the form; otherwise “2 agents” becomes “2 agent.”
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
  // The panel itself is inside .rwrap, so after the change it redraws at the new
  // size immediately, without leaving the setting.
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
// An open conversation has its own state: R rereads it in place and arrows
// scroll. Otherwise the only way to see a new reply is to close and reopen the
// card, losing the place already reached.
let chatView = null;

export async function openTranscript(a, focusTs = null) {
  el.viewer.hidden = false;
  gallery = { items: [], title: '', sel: 0, mode: 'grid' };   // Esc closes here, not into another gallery.
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

// A note card is drawn from storage on every log repaint rather than living in
// the DOM: paintChat rebuilds everything, and only outside state can survive it.
const noteCard = (n, orphan) => {
  const when = fmtStamp(n.at);
  const anchor = orphan && n.ts
    ? `<i class="nanchor">${tr('note.anchor', { when: fmtStamp(n.ts) })}</i>`
    : '';
  return `<div class="note" data-note="${n.id}">
    <div class="nhead"><b>${tr('note.label', { when })}${n.edited ? ' · ' + tr('note.edited') : ''}</b>
      <button class="nedit" data-edit="${n.id}" title="${tr('note.edit')}">✎</button>
      <button class="ndel" data-del="${n.id}" title="${tr('note.remove')}">✕</button></div>
    ${anchor}<div class="nbody">${esc(n.text)}</div></div>`;
};

const noteEditor = (ts, text) => `<div class="noteed" data-anchor="${ts == null ? '' : ts}">
    <b>${ts == null ? tr('note.newLoose') : tr('note.newFor', {
      when: fmtStamp(ts) })}</b>
    <textarea id="notein" rows="2" placeholder="${tr('note.placeholder')}">${esc(text || '')}</textarea>
    <i>${tr('note.keys')}</i></div>`;

// fresh is the number of tail messages to show as new.
// force marks our own repaint after opening or closing the editor. Server data
// must not be drawn this way because it may arrive in the middle of typing.
function paintChat(msgs, fresh = 0, force = false) {
  const box = $('#chatlog');
  if (!box) return;
  // Do not touch the log while a note is being written; a repaint would erase
  // unfinished text. Fresh data waits in pending until the editor closes.
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
  const stamp = (ts) => ts ? fmtStamp(ts) : '';

  // An edited note is replaced by the editor rather than its card.
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
  // When arriving from the notes panel, move to and highlight the anchored
  // message; otherwise the reason for opening the conversation is unclear.
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

// Repaint the log on demand without waiting for the server.
const repaintChat = () => paintChat(chatView.msgs, 0, true);

// The message currently being viewed is the first whose bottom is below the
// viewport's top edge. A note attaches to that message, which is outlined while
// writing so the anchor is visible instead of guessed.
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
  // Outline the anchor message so it is clear what the note will attach to.
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
  // Store the context snapshot once, when saving. The session will eventually
  // die, leaving nowhere to recover the agent name or what was being read.
  const anchor = (chatView.msgs || []).find((m) => m.ts === ed.ts);
  const ctx = { agent: a.name, project: a.project, title: a.title,
    quote: anchor ? clean(anchor.text) : '' };
  const ok = ed.id ? editNote(a.id, ed.id, text) : addNote(a.id, ed.ts, text, ctx);
  if (!ok && String(text || '').trim()) { chatStatus(tr('note.failed')); return; }
  closeNoteEditor(ed.id ? tr('note.saved') : tr('note.added'));
}

// Once the editor closes, apply what arrived while the person was writing.
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
    // A second click confirms deletion: notes are handwritten, so a miss hurts.
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
  // The tail may grow in place rather than gain an item; a growing answer is one message.
  const grew = msgs.length > was.length
    || (msgs.length && was.length && msgs[msgs.length - 1].text !== was[was.length - 1].text);
  if (fresh && !grew) { chatStatus(tr('chat.noNew') + ' · ' + fmtClock(Date.now())); return; }
  paintChat(msgs, fresh ? Math.max(1, msgs.length - was.length) : 0);
  if (fresh) {
    const added = msgs.length - was.length;
    chatStatus(added > 0 ? tr('chat.newBelow', { n: added }) : tr('chat.appended'));
    toast(added > 0 ? tr('chat.newToast', { name: a.name, n: added, a: added === 1 ? 'а' : '' })
                    : tr('chat.appendedToast', { name: a.name }));
  } else chatStatus(a.title || '');
}

// Arrows scroll the log; SHIFT moves almost one viewport per press.
function scrollChat(dir, big) {
  const box = $('#chatlog');
  if (!box) return;
  box.scrollTop += dir * (big ? Math.max(120, box.clientHeight * 0.9) : 64);
}

export function transcriptKey(key, big) {
  if (!chatView || el.viewer.hidden || !$('#chatlog')) return false;
  // While the editor is open, textarea owns the keys. Only misses arrive here,
  // and the log must not move at that point.
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

// ---------------------------------------------------------- all notes at once
// A note written in a conversation lives there, but must be discoverable later
// without remembering which agent held it. The panel gathers all notes and
// groups by the project in their context snapshot, not the live office, which
// may no longer exist.
let notesQuery = '';

export function renderNotes() {
  el.notes.hidden = false;
  const all = allNotes();
  const q = notesQuery.trim().toLowerCase();
  const hit = q ? all.filter((n) => (n.text + ' ' + ((n.ctx && n.ctx.quote) || '')).toLowerCase().includes(q)) : all;

  // Group by project; old notes without a snapshot get their own pile.
  const groups = new Map();
  for (const n of hit) {
    const key = (n.ctx && n.ctx.project) || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const alive = new Set(S.agents.map((a) => a.id));
  const stamp = (ms) => fmtStamp(ms);

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
  // Search holds real focus while typing, so arrows do not reach this handler.
  // Arrow Down exits into the results, exactly the move this search needs.
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
    if (!agent) { renderNotes(); return; }      // It closed while the person was looking.
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

// The notes panel opens with N but used to require a mouse for every action:
// opening a note's conversation and deleting it. Both buttons share one ring in
// markup order—the row's Open first, then its ✕.
const notesRing = focusRing(() => el.notes, '.ngo, .ndel', { noWrap: true });
export function closeNotes() { el.notes.hidden = true; notesRing.reset(); }
export function notesKey(raw) { return notesRing.key(raw, el.notes && !el.notes.hidden); }
export function notesOpen() { return !el.notes.hidden; }


export function relabel() {
  renderHud();
  // Dialog and standup redraw only when their key changes; otherwise live data
  // would flash the panel every two seconds. Language changes do not touch the
  // data, so reset the key explicitly or half the panel stays in the old
  // language because buildDialog labels are never patched.
  dialogKey = ''; rosterSig = '';
  // A module panel would stay in the old language too: it draws its own text,
  // and only the module can redraw it.
  collect('lang');
  if (S && S.dialogOpen) renderDialog();
  if (el.roster && !el.roster.hidden) renderRoster();
  if (el.bag && !el.bag.hidden) renderBag();
  if (el.sky && !el.sky.hidden) renderSky();
  if (el.skin && !el.skin.hidden) renderSkin();
}
