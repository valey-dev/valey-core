// The gamepad. Pure arithmetic over a snapshot from navigator.getGamepads():
// no DOM and no state — which is why it is checked by a stand rather than by hand.
//
// Why it exists at all: the office reads from the keyboard whole, but walking
// around it with a stick is nicer, while typing is from the keyboard anyway.
// Those two inputs do not get in each other's way by themselves: text is typed
// only in open panels, and an open panel stops the walking as it is.
//
// Two channels outwards. The axes are analogue: the stick tilted a third of the
// way means walking at a third of the speed. The buttons are the names of keys:
// "A" turns into a space, "B" into Escape, the d-pad into the arrows. main.js
// runs them through the same handler as the keyboard, and every panel — the
// roster, the card, the lift, the entrance screen — answers the gamepad without
// knowing about it.
//
// The mapping is the standard one (mapping: 'standard'): that is how an Elite
// Series 2 and any Xbox gamepad are seen from Chrome and Safari on macOS. The
// Elite paddles do not reach here — they are assigned to buttons in the gamepad
// itself and arrive as those buttons.

export const DEADZONE = 0.2;
// The stick as a d-pad: past this mark it is "pressed" for the menus and the panels.
export const DIGITAL = 0.5;

// A button → a key. The bumpers for the zoom, the triggers for running: both are
// held rather than pressed, so they sit on what is always under a finger.
export const BUTTONS = {
  0: ' ',        // A — talk, drink, press what is selected
  1: 'Escape',   // B — back
  2: 'b',        // X — the skateboard
  3: 'Tab',      // Y — the round
  4: '-',        // LB — smaller
  5: '+',        // RB — larger
  6: 'Shift',    // LT — run / push off
  7: 'Shift',    // RT
  // View (two cards) — the office plan: on gamepads the "see who is where" button
  // is called that; it opens the same thing as K from the keyboard.
  8: 'k',
  12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight',
};

const IDLE = Object.freeze({ x: 0, y: 0, down: new Set() });

// A radial dead zone, not a per-axis one: with a per-axis one a stick tilted
// strictly sideways trembles on the second axis and the person "floats". Past the
// zone the scale is stretched from zero, so that movement starts smoothly rather
// than with a jerk.
export function stick(ax = 0, ay = 0, dz = DEADZONE) {
  const mag = Math.hypot(ax, ay);
  if (!(mag > dz)) return { x: 0, y: 0 };
  const k = Math.min(1, (mag - dz) / (1 - dz)) / mag;
  return { x: ax * k, y: ay * k };
}

// A snapshot of the gamepad → { x, y, down }. With no gamepad it is rest, not an
// exception: getGamepads() gives out an array with nulls in the holes, and that is
// normal.
export function readPad(gp) {
  if (!gp || !gp.buttons) return IDLE;
  const pressed = (i) => { const b = gp.buttons[i]; return !!(b && (b.pressed || b.value > 0.5)); };
  const down = new Set();
  for (const i of Object.keys(BUTTONS)) if (pressed(+i)) down.add(BUTTONS[i]);

  const s = stick(gp.axes[0] || 0, gp.axes[1] || 0);
  // A stick past the threshold is an arrow too: the menus and panels are walked with it as well.
  if (s.x >= DIGITAL) down.add('ArrowRight'); else if (s.x <= -DIGITAL) down.add('ArrowLeft');
  if (s.y >= DIGITAL) down.add('ArrowDown'); else if (s.y <= -DIGITAL) down.add('ArrowUp');

  // The d-pad walks too, like the arrows from the keyboard — by a whole step.
  let x = s.x, y = s.y;
  if (!x) x = (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0);
  if (!y) y = (pressed(13) ? 1 : 0) - (pressed(12) ? 1 : 0);
  return { x, y, down };
}

// What changed between frames: the keys pressed and released. A button being held
// is not repeated — that is the business of whoever received the keydown.
export function edges(prev, next) {
  const pressed = [], released = [];
  for (const k of next.down) if (!prev.down.has(k)) pressed.push(k);
  for (const k of prev.down) if (!next.down.has(k)) released.push(k);
  return { pressed, released };
}
