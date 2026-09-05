// The pager: an incoming question from one of your own agents.
//
// Why not a line in the header (which is how it was in v1): the header is the
// quietest place on the screen, next to the weather and the counters, while at
// the other end there is a live agent with a raised hand, waiting. A notification
// has to come to the person rather than wait for them to raise their eyes.
//
// Three answers, and all three are answers:
//  - Enter opens the permission card where you stand: no need to walk to the desk;
//  - Esc is "I will call back": nothing goes to the agent, the question keeps
//    hanging, the counter stays in the header, H brings the pager back;
//  - nothing — in nine minutes the server itself releases the question into the
//    terminal.
//
// The mock-up: [«Пейджер · входящий»](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=958-2)
// The queue: [«Пейджер · очередь из двух»](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=958-66)
// The chip in the header: [«HUD · пейджер отложен»](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=958-20)
import { t as tr } from './i18n.js';
import { sound } from './sound.js';

const $ = (s) => document.querySelector(s);
let el = null, S = null, api = null;

// The deferred ones — "I will call back" on this id. It lives in the memory of
// the tab and dies with it: a deferred question must not silently outlive a reload
// of the page, and the server remembers it anyway — after F5 the pager rings again.
const deferred = new Set();
// The ones given to the card. The pager does not show them — the question is
// already on the screen whole, and holding it in the corner as well means asking
// twice. They do not go into the counter of deferred ones: they are not waiting,
// they are being looked at.
const opened = new Set();
// Who has already been called. One signal per request: a pager that rings again
// is an alarm clock, not a notification.
const rung = new Set();

export function initPager(state, callbacks) {
  el = $('#pager'); S = state; api = callbacks;
}

// What to show right now: the earliest request that has not been deferred.
const current = () => (S.permits || []).find((p) => !deferred.has(p.id) && !opened.has(p.id)) || null;
export const waitingCount = () => (S.permits || []).filter((p) => deferred.has(p.id)).length;
export const pagerOpen = () => !!el && !el.hidden;

// The agent's name for the pager screen. The session may not have reached the
// snapshot yet — then it is more honest to say "an agent" than to draw an empty
// space.
const whoOf = (p) => {
  const a = (S.agents || []).find((x) => x.id === p.agentId);
  return a ? a.name : tr('pager.someone');
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The seconds of waiting. Not "12:34" but "12 s": what matters is not the time of
// day but how long the person has been holding the agent up.
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

// A new snapshot of the requests has arrived. We ring on exactly the new ones —
// and only if nobody has deferred this question yet.
export function seePermits(list) {
  S.permits = list || [];
  const live = new Set(S.permits.map((p) => p.id));
  for (const id of [...deferred]) if (!live.has(id)) deferred.delete(id);
  for (const id of [...opened]) if (!live.has(id)) opened.delete(id);
  for (const id of [...rung]) if (!live.has(id)) rung.delete(id);
  ring();
  renderPager();
}

// The ring is for what is on the screen right now, and once per question. It is
// called from everywhere the queue can move, not only from the snapshot:
// "I will call back" to the first one brings the second forward, and it is as new
// as if it had come by itself. A different loudness for one and the same event
// depending on where it came from is what reads as "it beeps sometimes, sometimes
// not".
function ring() {
  const p = current();
  if (!p || rung.has(p.id)) return;
  rung.add(p.id);
  // The sound is on by default, until the person switches it off on M. This is the
  // only thing in the office that calls you to the screen rather than accompanying
  // what is visible on it anyway.
  sound.pager();
}

// Enter: the permission card of the agent that asked. The pager leaves — the
// question is now on the screen whole, and there is no point holding it in the
// corner as well.
function answer() {
  const p = current();
  if (!p) return;
  opened.add(p.id);
  renderPager();                       // the next in the queue comes out by itself
  api.openPermit(p);
}

// The card was closed without an answer. The question has not gone anywhere, so
// it goes back to the deferred ones: otherwise it disappears from the screen
// entirely — no pager, no counter — and the agent waits nine minutes in silence.
export function cardClosed() {
  if (!opened.size) return;
  for (const id of opened) deferred.add(id);
  opened.clear();
  renderPager();
  api.hudChanged();
}

// Esc: "I will call back". Neither a refusal nor an answer — nothing goes to the agent.
function later() {
  const p = current();
  if (!p) return;
  deferred.add(p.id);
  ring();
  renderPager();
  api.hudChanged();
  api.toast(tr('toast.pagerLater', { who: whoOf(p) }), 'wait');
}

// H: bring back what was deferred. Not E — in the office that one is the same as SPACE.
export function recall() {
  if (!deferred.size) return false;
  deferred.clear();
  renderPager();
  api.hudChanged();
  return true;
}

// The pager's keys go above the office ones: while it is on the screen, Esc
// belongs to it rather than to "close everything". Enter in the rest of the office
// is taken by nothing except the dialog, and the dialog is not open over the pager
// — the pager leaves when it opens.
export function pagerKey(raw) {
  if (!pagerOpen()) return false;
  const k = String(raw || '').toLowerCase();
  if (k === 'enter') { answer(); return true; }
  if (k === 'escape') { later(); return true; }
  return false;
}

// The request was answered or left by itself — take it off the desk without waiting for a snapshot.
export function forgetPermit(id) {
  S.permits = (S.permits || []).filter((p) => p.id !== id);
  deferred.delete(id); opened.delete(id);
  renderPager();
}
