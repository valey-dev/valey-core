// The office when the server behind it is gone.
//
// EventSource reopens a stream it has closed, and main.js walks that retry up
// to half a minute — quietly. A page whose server died therefore goes on
// drawing the last snapshot it was given, with nothing on the screen to say so.
// On 16 September 2026 an office was killed by a terminal update and the tab
// sat there: the agents stood with their «z z» of idle, every re-read of a
// transcript answered `Failed to fetch`, and the whole thing read as a bug in
// the agents rather than as a server that was not there.
//
// Three phases, and the middle one is the reason this is a machine and not a
// flag. A blink of the network must not black out the floor: the first failed
// reconnect only lights a chip in the HUD, and the lights go out on the third —
// about fourteen seconds with the backoff main.js uses, which is longer than
// restarting a terminal costs.
import { t as tr, onLang, fmtClock } from './i18n.js';

// How many failed reconnects in a row mean the office is gone rather than blinking.
export const DOWN_AFTER = 3;

export const LINK = {
  phase: 'live',        // live · retrying · down
  fails: 0,
  // When the last snapshot arrived. It is what the plaque shows: the person is
  // looking at that moment, not at now.
  lastSeen: 0,
  // When the next reconnect is due, so the countdown can be the truth rather
  // than a spinner. 0 while a reconnect is in flight.
  nextTry: 0,
};

export const linkDown = () => LINK.phase === 'down';
export const linkRetrying = () => LINK.phase === 'retrying';

// A snapshot arrived. Answers whether this was the return of a dead office —
// the caller turns the lights back on, and says so out loud, only then.
export function linkSeen(now = Date.now()) {
  const wasDown = LINK.phase === 'down';
  const was = LINK.phase;
  LINK.phase = 'live';
  LINK.fails = 0;
  LINK.nextTry = 0;
  LINK.lastSeen = now;
  if (was !== 'live') phaseHook();
  paint(now);
  return wasDown;
}

// A reconnect failed and the next one is scheduled in `wait` ms. Answers
// whether this is the failure that crossed the threshold, so that the power cut
// happens once and not on every attempt after it.
export function linkLost(wait, now = Date.now()) {
  const was = LINK.phase;
  LINK.fails += 1;
  LINK.nextTry = now + wait;
  const crossed = LINK.fails === DOWN_AFTER;
  LINK.phase = LINK.fails >= DOWN_AFTER ? 'down' : 'retrying';
  if (was !== LINK.phase) phaseHook();
  paint(now);
  return crossed;
}

// A reconnect is in flight: there is nothing to count down to until it fails.
export function linkTrying(now = Date.now()) {
  LINK.nextTry = 0;
  paint(now);
}

// ------------------------------------------------------------------- plaque
let box = null;
let retryNow = () => {};
// Called when the phase changes. The HUD chip is the only sign of the middle
// phase, and no snapshot is coming to redraw the HUD — the office is not
// answering, that is the point — so the change has to say so itself.
let phaseHook = () => {};
let painted = '';

export function initLink({ onRetry, onPhase }) {
  box = document.getElementById('offline');
  retryNow = onRetry || retryNow;
  phaseHook = onPhase || phaseHook;
  if (!box) return;
  build();
  // The wording is rebuilt on a language switch: the plaque can be on the
  // screen while somebody flips the language in another tab.
  onLang(() => { painted = ''; build(); paint(); });
}

function build() {
  if (!box) return;
  box.textContent = '';
  const head = document.createElement('div');
  head.className = 'ohead';
  head.textContent = tr('link.title');
  const body = document.createElement('div');
  body.className = 'obody';
  const line = document.createElement('p');
  line.className = 'oline';
  const count = document.createElement('p');
  count.className = 'ocount';
  const acts = document.createElement('div');
  acts.className = 'acts';
  const retry = document.createElement('button');
  retry.className = 'primary';
  retry.textContent = tr('link.retry');
  retry.onclick = () => retryNow();
  const reload = document.createElement('button');
  reload.textContent = tr('link.reload');
  // The office may be back on the same port with newer page code, and then only
  // a reload gets the person onto it. That is this button's whole job, so it
  // stays a second choice rather than the thing the plaque pushes.
  reload.onclick = () => location.reload();
  acts.append(retry, reload);
  body.append(line, count, acts);
  box.append(head, body);
}

// Called from the frame loop. Cheap on purpose: the text is rewritten only when
// the second it shows has changed.
export function paintLink(now = Date.now()) { paint(now); }

function paint(now = Date.now()) {
  if (!box) return;
  const down = LINK.phase === 'down';
  box.hidden = !down;
  if (!down) { painted = ''; return; }
  const left = LINK.nextTry ? Math.max(0, Math.ceil((LINK.nextTry - now) / 1000)) : 0;
  const key = `${left}·${LINK.fails}·${LINK.lastSeen}`;
  if (key === painted) return;
  painted = key;
  const line = box.querySelector('.oline');
  const count = box.querySelector('.ocount');
  if (line) {
    line.textContent = LINK.lastSeen
      ? tr('link.line', { at: fmtClock(LINK.lastSeen) })
      : tr('link.lineCold');
  }
  if (count) {
    count.textContent = LINK.nextTry
      ? tr('link.count', { sec: left, n: LINK.fails })
      : tr('link.trying', { n: LINK.fails });
  }
}
