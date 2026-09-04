// Every panel that is HTML rather than pixels: dialog, board viewer,
// morning round, your own look, toasts.
import { drawPerson, drawItem, dressMe, cycle, hash, SKIN, HAIR, SHIRT, PANTS, BOOTS, HEADS, FACES, HANDS,
  SHIRT_WORK, BLOUSE, JACKET, TIE, CUTS, BOTTOMS } from './sprites.js';
import { renderMarkdown } from './markdown.js';
import { highlight, langOf } from './highlight.js';
import { collect } from './modules.js';
import { theme, applyTheme, resetTheme, PRESETS, ui, UI_STEPS, applyUiScale } from './theme.js';
import { notesOf, noteCount, addNote, editNote, removeNote, splitNotes, allNotes } from './notes.js';
import { esc } from './esc.js';

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
// tr, а не t: в ui.js `t` уже занят локальными переменными в нескольких
// функциях, и импорт там молча перекрывался
import { t as tr, lang } from './i18n.js';

const WEATHER_ICON = { clear: '☀', clouds: '☁', rain: '☂', storm: '⚡', snow: '❄', fog: '≋' };

// Свой плеер знает трек поимённо, встроенный — только волну, на которую настроен.

export function renderHud() {
  const waiting = S.agents.filter((a) => a.status === 'awaiting').length;
  const working = S.agents.filter((a) => a.status === 'working').length;
  const d = new Date();
  const room = S.currentRoom ? `<span class="chip room">▣ ${esc(S.currentRoom.title)}</span>` : `<span class="chip room">${tr('hud.corridor')}</span>`;
  const w = S.weather || { kind: 'clear' };
  const temp = w.temp != null ? ` ${Math.round(w.temp)}°` : '';
  const z = S.zoom || { dev: 1, auto: true, clamped: false };
  const place = w.label ? ` · ${esc(w.label)}` : '';
  el.hud.innerHTML = `<b>VALEY</b> · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}
    <span class="chip sky" title="${tr('hud.skyTitle', { source: w.source === 'выдумана' ? tr('sky.made') : esc(w.source || '') })}">${WEATHER_ICON[w.kind] || '·'} ${tr('sky.' + w.kind)}${temp}${place}</span>
    ${room}<span class="chip work">⌨ ${working}</span><span class="chip wait">! ${waiting}</span>
    <span class="chip">👥 ${S.agents.length}</span>
    <span class="chip zoom${z.tight ? ' wait' : ''}" title="${tr('hud.zoomTitle')}${
      z.tight ? tr('hud.zoomTitleTight') : z.clamped ? tr('hud.zoomTitleClamped', { n: z.dev }) : ''
    }">⛶ ×${z.dev}${z.auto ? tr('hud.zoomAuto') : ''}${z.tight ? tr('hud.zoomTight') : z.clamped ? tr('hud.zoomMax') : ''}</span>
    <span class="chip dim">${S.soundOn ? '🔊' : '🔇'} M</span>
    ${collect('hud', S).map((c) => `<span class="chip ${esc(c.kind || 'dim')}" title="${esc(c.title || '')}">${esc(c.text || '')}</span>`).join('')}
    <span class="chip dim">${tr('hud.round')}</span>`;
}

// ------------------------------------------------------------------- dialog
let dialogKey = '';

// Сервер отдаёт и русский текст ошибки, и ключ, если ошибка его собственная.
// Знаем ключ — переводим; не знаем — показываем как есть: то, что вернул claude,
// в словаре не лежит и лежать не может.
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
// Сервер присылает ключ занятия, а готовую русскую фразу оставляет для
// совместимости: если ключа нет — показываем её как есть.
const FALLBACK_ARG = { edit: 'act.someCode', read: 'act.someFile' };
export const actText = (a) => {
  if (!a || !a.act || !a.act.key) return (a && a.activity) || '';
  const arg = a.act.arg || (FALLBACK_ARG[a.act.key] ? tr(FALLBACK_ARG[a.act.key]) : '');
  return tr('act.' + a.act.key, { arg });
};
export const roleText = (a) => (a && a.roleKey ? tr('role.' + a.roleKey) : (a && a.role) || '');
// actText и roleText — текст: их же кладут в textContent. В разметку они
// входят только через esc, потому что arg занятия — имя файла или команда из
// транскрипта, а неизвестный ключ tr возвращает как есть.
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
  const key = a.id + '|' + S.page + '|' + accessOf(a.id);
  if (key === dialogKey && el.dialog.firstChild) return patchDialog(a);
  dialogKey = key;
  buildDialog(a);
}

function patchDialog(a) {
  const set = (sel, html) => { const n = el.dialog.querySelector(sel); if (n && n.innerHTML !== html) n.innerHTML = html; };
  set('.meta', metaLine(a));
  set('.act', actLine(a));
  const chat = el.dialog.querySelector('.chatname');
  if (chat && a.title && chat.textContent !== `💬 ${a.title}`) chat.textContent = `💬 ${a.title}`;

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

  el.dialog.innerHTML = `
    <div class="portrait"><canvas width="48" height="48" id="pf"></canvas></div>
    <div class="content">
      <div class="who"><b>${esc(a.name)}</b> <span class="role r-${esc(a.roleKey)}">${esc(roleText(a))}</span>
        <span class="meta">${metaLine(a)}</span>${chatLine(a)}</div>
      <div class="act">${actLine(a)}</div>
      <div class="body">${body}</div>
      <div class="acts">
        <button data-p="talk" class="${S.page === 'talk' ? 'on' : ''}">${tr('tab.talk')} <kbd>1</kbd></button>
        <button data-p="work" class="${S.page === 'work' ? 'on' : ''}">${tr('tab.work')} <kbd>2</kbd></button>
        <button data-p="task" class="${S.page === 'task' ? 'on' : ''}">${tr('tab.task')} <kbd>3</kbd></button>
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
const bodyRows = () => [...el.dialog.querySelectorAll(
  '.files li, .notes [data-retry], .notes [data-send], .notes [data-edit], .notes [data-del]')];

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
    const txt = await fetch(url).then((r) => r.ok ? r.text() : tr('gal.notServed') + r.status).catch((e) => e.message);
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
export function viewerKey(raw, big = false) {
  if (el.viewer.hidden) return false;
  const key = raw.toLowerCase();
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
const TABS = ['self', 'things', 'office'];
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
        <label class="namerow">${tr('dress.name')} <input id="myname" maxlength="14" value="${S.me.name || tr('label.me')}"></label>
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

export function renderBag(tab) {
  if (tab && TABS.includes(tab)) bagTab = tab;
  el.bag.hidden = false;
  el.bag.innerHTML = `<div class="rwrap bagwrap">
    <div class="vhead">${tr('bag.title')} · ${tr('bag.tab.' + bagTab)}<button id="bx">✕</button></div>
    <div class="btabs">
      ${TABS.map((t, i) => `<button class="btab${t === bagTab ? ' on' : ''}" data-tab="${t}">${tr('bag.tab.' + t)}<kbd>${i + 1}</kbd></button>`).join('')}
      <span class="bhint">${tr('bag.tabHint')}</span>
    </div>
    ${bagTab === 'self' ? selfHtml() : bagTab === 'things' ? thingsHtml() : officeHtml()}
  </div>`;

  $('#bx').onclick = closeBag;
  el.bag.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => openTab(b.dataset.tab));
  if (bagTab === 'self') bindSelf();
  else if (bagTab === 'things') bindThings();
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
  $('#myname').oninput = (e) => { S.me.name = e.target.value.toUpperCase().slice(0, 14) || tr('label.me'); api.saveMe(); };
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
  if (!TABS.includes(tab) || tab === bagTab) return;
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
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= TABS.length) {
    openTab(TABS[n - 1]);
    return true;
  }
  if (bagTab === 'office') return officeRing.key(key, true);
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
  await renderInvite();
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
  const took = async (r) => { if (r && r.access) S.access = r.access; await renderInvite(); };
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
  el.viewer.innerHTML = `<div class="vwrap"><div class="vhead">${tr('chat.title', { name: esc(a.name) })}
      <span class="zhint" id="chatst">${esc(a.title || '')}</span><button id="vx">✕</button></div>
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
  const r = await fetch('/api/chat?id=' + encodeURIComponent(a.id))
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

  const rows = [...groups.entries()].map(([project, list]) => `
    <div class="ngroup"><h4>${project ? '▣ ' + esc(project) : tr('notes.noProject')}</h4>
      ${list.map((n) => {
        const live = alive.has(n.agentId);
        const who = n.ctx && n.ctx.agent
          ? esc(n.ctx.agent) + (n.ctx.title ? ' · ' + esc(n.ctx.title) : '')
          : '';
        const tail = live
          ? `<button class="ngo" data-go="${n.agentId}" data-ts="${n.ts == null ? '' : n.ts}">${tr('notes.open')}</button>`
          : `<span class="ndead">${tr('notes.closed')}</span>`;
        const under = live ? who : (n.ctx && n.ctx.quote ? '«' + esc(n.ctx.quote) + '»' + (who ? ' · ' + who : '') : tr('notes.noCtx'));
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
