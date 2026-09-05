// Пейджер: входящий вопрос от своего же агента.
//
// Почему не строка в шапке (так было в v1): шапка — самое тихое место экрана,
// рядом с погодой и счётчиками, а на том конце стоит живой агент с поднятой
// рукой и ждёт. Уведомление должно прийти к человеку, а не ждать, пока он
// поднимет глаза.
//
// Три ответа и все три — ответы:
//  - Enter открывает карточку разрешения там, где стоишь: ходить к столу не надо;
//  - Esc — «перезвоню»: агенту не уходит ничего, вопрос продолжает висеть,
//    в шапке остаётся счётчик, H возвращает пейджер;
//  - ничего — через девять минут сервер сам отпустит вопрос в терминал.
//
// Макет: [Пейджер · входящий](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=958-2)
// Очередь: [Пейджер · очередь из двух](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=958-66)
// Чип в шапке: [HUD · пейджер отложен](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=958-20)
import { t as tr } from './i18n.js';
import { sound } from './sound.js';

const $ = (s) => document.querySelector(s);
let el = null, S = null, api = null;

// Отложенные — «перезвоню» по этому id. Живёт в памяти вкладки и умирает с
// ней: отложенный вопрос не должен пережить перезагрузку страницы молча, а
// сервер о нём и так помнит — после F5 пейджер зазвонит снова.
const deferred = new Set();
// Отданные карточке. Пейджер их не показывает — вопрос уже на экране целиком,
// и держать его ещё и в углу значит спрашивать дважды. В счётчик отложенных не
// идут: они не ждут, на них смотрят.
const opened = new Set();
// Кому уже звонили. Один сигнал на запрос: пейджер, зовущий повторно, — это
// будильник, а не уведомление.
const rung = new Set();

export function initPager(state, callbacks) {
  el = $('#pager'); S = state; api = callbacks;
}

// Что показывать прямо сейчас: первый по времени неотложенный запрос.
const current = () => (S.permits || []).find((p) => !deferred.has(p.id) && !opened.has(p.id)) || null;
export const waitingCount = () => (S.permits || []).filter((p) => deferred.has(p.id)).length;
export const pagerOpen = () => !!el && !el.hidden;

// Имя агента для экрана пейджера. Сессия могла ещё не доехать в снимке —
// тогда честнее сказать «агент», чем нарисовать пустое место.
const whoOf = (p) => {
  const a = (S.agents || []).find((x) => x.id === p.agentId);
  return a ? a.name : tr('pager.someone');
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Секунды ожидания. Не «12:34», а «12 с»: важно не время суток, а сколько
// человек уже держит агента.
const held = (p) => {
  const sec = Math.max(0, Math.round((Date.now() - p.at) / 1000));
  return sec < 60 ? tr('pager.sec', { n: sec }) : tr('pager.min', { n: Math.round(sec / 60) });
};

export function renderPager() {
  if (!el) return;
  const p = current();
  if (!p) { el.hidden = true; return; }
  const queue = (S.permits || []).filter((x) => !deferred.has(x.id) && !opened.has(x.id)).length;
  el.hidden = false;
  el.innerHTML = `
    <div class="phead"><span class="pbrand">VALEY · PAGER</span><span class="plamp">●</span></div>
    <div class="lcd">
      <div class="l1"><b>${esc(whoOf(p).toUpperCase())}</b> · ${esc(p.tool)} · ${esc(held(p))}
        ${queue > 1 ? `<span class="pn">1/${queue}</span>` : ''}</div>
      <div class="l2">${esc(tr('pager.may'))} ${esc(p.command)}</div>
      ${p.description ? `<div class="l3">${esc(p.description)}</div>` : ''}
    </div>
    <div class="pkeys">
      <button id="pAnswer" class="primary">${tr('pager.answer')} <kbd>⏎</kbd></button>
      <button id="pLater">${tr('pager.later')} <kbd>Esc</kbd></button>
      <span class="pmore">${queue > 1 ? tr('pager.more', { n: queue - 1 }) : (S.soundOn ? tr('pager.beep') : '')}</span>
    </div>`;
  $('#pAnswer').onclick = () => answer();
  $('#pLater').onclick = () => later();
}

// Пришёл новый снимок запросов. Звоним ровно на новых — и только если этот
// вопрос ещё никто не откладывал.
export function seePermits(list) {
  S.permits = list || [];
  const live = new Set(S.permits.map((p) => p.id));
  for (const id of [...deferred]) if (!live.has(id)) deferred.delete(id);
  for (const id of [...opened]) if (!live.has(id)) opened.delete(id);
  for (const id of [...rung]) if (!live.has(id)) rung.delete(id);
  ring();
  renderPager();
}

// Звонок — на то, что сейчас на экране, и один раз за вопрос. Зовётся отовсюду,
// где очередь может сдвинуться, а не только из снимка: «перезвоню» первому
// выводит вперёд второго, и он такой же новый, как если бы пришёл сам.
// Разная громкость у одного и того же события, смотря откуда оно пришло, —
// это то, что читается как «иногда пищит, иногда нет».
function ring() {
  const p = current();
  if (!p || rung.has(p.id)) return;
  rung.add(p.id);
  // Звук по умолчанию: включён, пока человек сам не выключил его на M. Это
  // единственное в офисе, что зовёт к экрану, а не сопровождает то, что на
  // нём и так видно.
  sound.pager();
}

// Enter: карточка разрешения у того агента, который спросил. Пейджер уезжает —
// вопрос теперь на экране целиком, и держать его ещё и в углу незачем.
function answer() {
  const p = current();
  if (!p) return;
  opened.add(p.id);
  renderPager();                       // следующий в очереди выйдет сам
  api.openPermit(p);
}

// Карточку закрыли, ничего не ответив. Вопрос никуда не делся, поэтому он
// возвращается в отложенные: иначе он исчезает с экрана целиком — ни пейджера,
// ни счётчика, — и агент ждёт девять минут молча.
export function cardClosed() {
  if (!opened.size) return;
  for (const id of opened) deferred.add(id);
  opened.clear();
  renderPager();
  api.hudChanged();
}

// Esc: «перезвоню». Не отказ и не ответ — агенту не уходит ничего.
function later() {
  const p = current();
  if (!p) return;
  deferred.add(p.id);
  ring();
  renderPager();
  api.hudChanged();
  api.toast(tr('toast.pagerLater', { who: whoOf(p) }), 'wait');
}

// H: вернуть отложенное. Не E — она в офисе равна ПРОБЕЛу.
export function recall() {
  if (!deferred.size) return false;
  deferred.clear();
  renderPager();
  api.hudChanged();
  return true;
}

// Клавиши пейджера идут выше офисных: пока он на экране, Esc принадлежит ему,
// а не «закрыть всё». Enter в остальном офисе не занят ничем, кроме диалога, а
// диалог поверх пейджера не открыт — пейджер уезжает, когда тот открывается.
export function pagerKey(raw) {
  if (!pagerOpen()) return false;
  const k = String(raw || '').toLowerCase();
  if (k === 'enter') { answer(); return true; }
  if (k === 'escape') { later(); return true; }
  return false;
}

// Запрос ответили или он ушёл сам — убрать со стола, не дожидаясь снимка.
export function forgetPermit(id) {
  S.permits = (S.permits || []).filter((p) => p.id !== id);
  deferred.delete(id); opened.delete(id);
  renderPager();
}
