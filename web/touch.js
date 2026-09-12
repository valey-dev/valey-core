// Touch: the stick and the three buttons of a tablet, as arithmetic. No DOM and
// no state, the same way pad.js is kept — which is why it is checked by a stand
// (tools/test-touch.mjs) rather than on a tablet every time.
//
// Drawn in «WIP — Тач-управление на планшете», approved 12 September 2026 with
// three decisions: the stick comes first and tapping the floor waits; --ui stays
// where it is on touch; ≡ is on the entrance screen too.
//
// The layer answers in the gamepad's own shape — { x, y, down } — and main.js
// runs it through the gamepad's loop. So the analogue axes walk, the stick past
// half-way is an arrow for the menus, the rim is Shift, ● is SPACE and ✕ is ESC,
// and not one panel learns that a finger exists.
import { stick as deadzoned, DIGITAL } from './pad.js';

// Sizes off the frame «Схема · зоны большого пальца», in CSS pixels: a ring of
// 140 with a knob of 56, buttons of 88 / 64 / 48, everything 40 off the edges.
export const RING = 140, KNOB = 56, EDGE = 40;
export const ACTION = 88, BACK = 64, MENU = 48;
const R = RING / 2;
// Past this share of the radius the stick is at the rim, and the rim is running —
// the analogue of the triggers, which a thumb on glass does not have.
export const RUN = 0.9;
// A finger is fatter than a stick's play: the dead zone is the gamepad's, a
// little wider, so resting a thumb on the ring does not walk anyone.
export const DEADZONE = 0.25;

// Where the ring rests when nobody is touching it: bottom left, 40 off both edges.
export function restCentre(w, h) {
  return { x: EDGE + R, y: h - EDGE - R };
}

// A finger landing in the left third takes the ring with it: a thumb finds its
// own place, and a ring that insists on one spot is a ring people miss. The
// centre is kept far enough in for the whole ring to stay on the screen.
// Anywhere else is not the stick's — null.
export function grab(px, py, w, h) {
  if (!(px >= 0 && px < w / 3 && py >= 0 && py <= h)) return null;
  return {
    x: Math.min(Math.max(px, EDGE / 2 + R), w / 3),
    y: Math.min(Math.max(py, EDGE / 2 + R), h - EDGE / 2 - R),
  };
}

// The finger at (px, py), the ring at `centre` → the axes, the knob and whether
// that is the rim. Tilt is speed, as on a gamepad: past the dead zone the scale
// starts from zero, so walking begins smoothly rather than with a jerk.
export function tilt(centre, px, py) {
  const dx = px - centre.x, dy = py - centre.y;
  const d = Math.hypot(dx, dy);
  const k = d > R ? R / d : 1;
  const knob = { x: centre.x + dx * k, y: centre.y + dy * k };
  const raw = { x: (dx * k) / R, y: (dy * k) / R };
  const axes = deadzoned(raw.x, raw.y, DEADZONE);
  return { ...axes, knob, run: Math.hypot(raw.x, raw.y) >= RUN };
}

// Everything the layer holds right now → the gamepad's snapshot. `buttons` are
// the names of the buttons under a finger: 'action' and 'back'. ≡ is not here —
// it opens a sheet rather than holding a key.
export function snapshot(axes, buttons = []) {
  const down = new Set();
  const x = axes ? axes.x : 0, y = axes ? axes.y : 0;
  if (x >= DIGITAL) down.add('ArrowRight'); else if (x <= -DIGITAL) down.add('ArrowLeft');
  if (y >= DIGITAL) down.add('ArrowDown'); else if (y <= -DIGITAL) down.add('ArrowUp');
  if (axes && axes.run && (x || y)) down.add('Shift');
  if (buttons.includes('action')) down.add(' ');
  if (buttons.includes('back')) down.add('Escape');
  return { x, y, down };
}

// Where the three buttons sit, bottom right, off the frame: ● in the corner, ✕
// to its left, ≡ above it. Circles, as { x, y, r } of their centres.
export function buttonsAt(w, h) {
  const action = { x: w - EDGE - ACTION / 2, y: h - EDGE - ACTION / 2, r: ACTION / 2 };
  return {
    action,
    back: { x: action.x - ACTION / 2 - 36 - BACK / 2, y: action.y, r: BACK / 2 },
    menu: { x: action.x, y: action.y - ACTION / 2 - 28 - MENU / 2, r: MENU / 2 },
  };
}

// Which button a point falls on, with a little grace around each circle: a
// thumb lands off-centre, and a miss by four pixels is still meant.
export function buttonAt(px, py, w, h, grace = 8) {
  for (const [name, c] of Object.entries(buttonsAt(w, h))) {
    if (Math.hypot(px - c.x, py - c.y) <= c.r + grace) return name;
  }
  return null;
}

// A button on the ≡ sheet presses a key, and some panels still compare `key`
// rather than `code`: `UI.notesKey(e.key)` wants «n», not «KeyN». So the sheet
// sends both, and the key is read back off the registry's code here.
const NAMED = { Space: ' ', Slash: '/', Equal: '+', Minus: '-', ShiftLeft: 'Shift', ShiftRight: 'Shift' };
export function keyOfCode(code) {
  if (NAMED[code]) return NAMED[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1].toLowerCase();
  m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (m) return m[1];
  return code;                       // Tab, Escape, the arrows, F9 are their own names
}

// A hint over a thing names the key; on touch it names the button. Only what
// is in the brackets changes: «[ ПРОБЕЛ ] попить воды» → «[ ● ] попить воды».
export function touchHint(text) {
  return String(text).replace(/\[\s*(ПРОБЕЛ|SPACE)\s*\]/, '[ ● ]');
}
