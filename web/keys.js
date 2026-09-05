// The keys panel: the whole keyboard, with what each key does in this office.
//
// The strip along the bottom of the screen used to carry this, and it had
// outgrown itself — 322 characters over two lines, growing with every module,
// and still only able to show one binding per action. A keyboard shows what a
// sentence cannot: what is next to what, and what is still free.
//
// Drawn from the approved frame «Раскладка · офис» — same rows, same group
// colours, same idea that a free key is a key with no outline. The colours are
// read off that frame rather than picked here, and the note in the layout frame
// says the same thing the legend at the bottom of this panel says.
//
// The keyboard is data, not a picture: every cap asks the registry what lives
// on it, so a key that moves moves here too. That is the whole reason the
// registry came first.
import { all, actionOf, groupOf, labelFor } from './keymap.js';
import { t as tr } from './i18n.js';
import { esc } from './esc.js';

// Group → outline, straight off the legend of the layout frame.
const COLOUR = {
  move: '#9fe0a8',
  act: '#ffd166',
  panel: '#8fc8ff',
  zoom: '#c39bff',
  service: '#a08a72',
  inpanel: '#8a6247',
};

// Keys the office answers to only while a panel is open. They are deliberately
// absent from the registry — one way to walk a panel is the rule here, and
// making them configurable would buy a second office — but they are not free
// either, and a keyboard that showed them blank would be lying.
const IN_PANEL = new Set([
  'Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End',
  // Z — лупа в просмотрщике одного файла, R там же перечитывает. R занята и на
  // этаже радио, поэтому в реестре она уже есть; Z не занята нигде больше и без
  // этой строки считалась бы свободной.
  'KeyZ',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
]);

// The board, as a keyboard is actually laid out. Width is in units of one cap;
// `null` marks a key the office never sees, because the browser or the system
// takes it first.
const ROWS = [
  [['Escape', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1],
    ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1]],
  [['Backquote', 1], ['Digit1', 1], ['Digit2', 1], ['Digit3', 1], ['Digit4', 1], ['Digit5', 1], ['Digit6', 1],
    ['Digit7', 1], ['Digit8', 1], ['Digit9', 1], ['Digit0', 1], ['Minus', 1], ['Equal', 1], ['Backspace', 2]],
  [['Tab', 1.5], ['KeyQ', 1], ['KeyW', 1], ['KeyE', 1], ['KeyR', 1], ['KeyT', 1], ['KeyY', 1], ['KeyU', 1],
    ['KeyI', 1], ['KeyO', 1], ['KeyP', 1], ['BracketLeft', 1], ['BracketRight', 1], ['Backslash', 1.5]],
  [['CapsLock', 1.8], ['KeyA', 1], ['KeyS', 1], ['KeyD', 1], ['KeyF', 1], ['KeyG', 1], ['KeyH', 1], ['KeyJ', 1],
    ['KeyK', 1], ['KeyL', 1], ['Semicolon', 1], ['Quote', 1], ['Enter', 2.2]],
  [['ShiftLeft', 2.3], ['KeyZ', 1], ['KeyX', 1], ['KeyC', 1], ['KeyV', 1], ['KeyB', 1], ['KeyN', 1], ['KeyM', 1],
    ['Comma', 1], ['Period', 1], ['Slash', 1], ['ShiftRight', 2.7]],
  [['ControlLeft', 1.3], ['AltLeft', 1.3], ['MetaLeft', 1.3], ['Space', 6.8], ['MetaRight', 1.3], ['AltRight', 1.3]],
];

// The arrows sit apart, as they do on a keyboard.
const ARROWS = [[null, 'ArrowUp', null], ['ArrowLeft', 'ArrowDown', 'ArrowRight']];

// What is printed on a cap. The office assumes QWERTY and says so; a browser
// that knows the real engraving is asked for it below, because a Russian
// keyboard has «т» where this says N and a French one has A where it says Q.
const PRINTED = {
  Backquote: '`', Minus: '−', Equal: '=', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Backspace: '⌫', CapsLock: 'CAPS', Enter: '⏎', Escape: 'ESC', Tab: 'TAB',
  ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', AltLeft: 'ALT',
  MetaLeft: 'CMD', MetaRight: 'CMD', AltRight: 'ALT', Space: '',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

const printed = (code) => (code in PRINTED ? PRINTED[code] : labelFor(code));

// The character this key really produces, when the browser will say. Chromium
// answers; the rest do not, and then the cap simply shows nothing extra rather
// than a hard-coded ЙЦУКЕН table that would be wrong on every other layout.
let engraved = new Map();
export async function readLayout() {
  try {
    const map = await navigator.keyboard.getLayoutMap();
    engraved = new Map([...map].map(([code, ch]) => [code, ch]));
  } catch { engraved = new Map(); }
}

let el = null;
export function keysOpen() { return !!el && !el.hidden; }

function capHtml(code, units) {
  const id = actionOf({ code });
  const group = id ? groupOf(id) : (IN_PANEL.has(code) ? 'inpanel' : null);
  const action = id ? all().find((a) => a.id === id) : null;
  const caption = action && action.hint ? tr(action.hint)
    : IN_PANEL.has(code) ? tr('keys.inPanel')
    : '';
  const outline = group ? COLOUR[group] : '';
  const face = printed(code);
  // Вторая подпись — то, что на этой клавише написано на самом деле, если
  // браузер знает раскладку. Для латиницы она совпадает с первой и не рисуется.
  const real = engraved.get(code);
  const twin = real && real.toUpperCase() !== face ? real.toUpperCase() : '';
  return `<div class="kcap${outline ? '' : ' free'}" style="--u:${units}${outline ? `;--edge:${outline}` : ''}"
    data-code="${esc(code)}"${id ? ` data-action="${esc(id)}"` : ''}>
    <span class="kface">${esc(face)}</span>${twin ? `<i class="ktwin">${esc(twin)}</i>` : ''}
    ${caption ? `<span class="kwhat" title="${esc(caption)}">${esc(caption)}</span>` : ''}
  </div>`;
}

function boardHtml() {
  const rows = ROWS.map((row) => `<div class="krow">${row.map(([c, u]) => capHtml(c, u)).join('')}</div>`).join('');
  const arrows = ARROWS.map((row) => `<div class="krow">${row
    .map((c) => (c ? capHtml(c, 1) : '<div class="kcap gap" style="--u:1"></div>')).join('')}</div>`).join('');
  return `<div class="kboard">${rows}</div><div class="karrows">${arrows}</div>`;
}

function legendHtml() {
  const items = [
    ['move', 'keys.lgMove'], ['act', 'keys.lgAct'], ['panel', 'keys.lgPanel'],
    ['zoom', 'keys.lgZoom'], ['inpanel', 'keys.lgInPanel'], ['service', 'keys.lgService'],
  ].map(([g, k]) => `<span><s style="--edge:${COLOUR[g]}"></s>${tr(k)}</span>`).join('');
  return `${items}<span><s class="free"></s>${tr('keys.lgFree')}</span>`;
}

export function renderKeys() {
  if (!el) {
    el = document.createElement('div');
    el.id = 'keys';
    document.body.appendChild(el);
  }
  const free = ROWS.flat().filter(([c]) => !actionOf({ code: c }) && !IN_PANEL.has(c) && /^Key/.test(c)).length;
  el.hidden = false;
  el.innerHTML = `<div class="rwrap keyswrap">
    <div class="vhead"><span>${tr('keys.title')} <i>${tr('keys.free', { n: free })}</i></span><button id="keysx">✕</button></div>
    <div class="keysbody">${boardHtml()}</div>
    <div class="keyslegend">${legendHtml()}<span class="k">${tr('keys.hint')}</span></div>
  </div>`;
  const x = document.getElementById('keysx');
  if (x) x.onclick = closeKeys;
}

export function closeKeys() { if (el) el.hidden = true; }
