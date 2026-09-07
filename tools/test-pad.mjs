// node tools/test-pad.mjs — the gamepad, without a browser.
//
// It breaks quietly: a slightly smaller dead zone and the person "floats" down
// the corridor with the stick released; a slightly higher arrow threshold and
// the menu will not scroll; a held button that repeats and "A" opens the card
// and closes it again. All of it is arithmetic over a snapshot, and checking it
// here beats checking it by eye.
import { readPad, edges, stick, DEADZONE, DIGITAL, BUTTONS } from '../web/pad.js';

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('FAIL  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

// A gamepad snapshot: axes and the 16 buttons of the standard layout
const pad = ({ axes = [0, 0, 0, 0], held = [] } = {}) => ({
  mapping: 'standard', axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })),
});
const has = (r, k) => r.down.has(k);

// ------------------------------------------------------------ no gamepad

const none = readPad(null);
ok('without a gamepad - peace, no exception', none.x === 0 && none.y === 0 && none.down.size === 0);
ok('hole from getGamepads() - also peace', readPad(undefined).down.size === 0);

// ------------------------------------------------------------ the dead zone

ok('stick shake does not move at rest', stick(0.1, -0.15).x === 0 && stick(0.1, -0.15).y === 0);
ok('radial zone: sideways by 0.19 with trembling along the second axis - standing', stick(0.19, 0.05).x === 0);
const edge = stick(DEADZONE + 0.001, 0);
ok('immediately beyond the zone, the movement begins from scratch, and not with a jerk', edge.x > 0 && edge.x < 0.01, edge);
ok('full tilt - full speed', near(stick(1, 0).x, 1));
ok('and diagonally is no faster than straight', Math.hypot(stick(1, 1).x, stick(1, 1).y) <= 1 + 1e-9);
ok('full tilt - approximately half speed', Math.abs(stick(0.6, 0).x - 0.5) < 0.01, stick(0.6, 0).x);

// ------------------------------------------------------------- the stick

const right = readPad(pad({ axes: [1, 0] }));
ok('stick to the right - go right', near(right.x, 1) && right.y === 0, right);
ok('and this is the right arrow for the menu', has(right, 'ArrowRight') && !has(right, 'ArrowLeft'));

const soft = readPad(pad({ axes: [0, -(DEADZONE + (DIGITAL - DEADZONE) * 0.5)] }));
ok('slight incline - walk slowly', soft.y < 0 && soft.y > -0.5, soft.y);
ok('but this is not considered an arrow yet', !has(soft, 'ArrowUp'), [...soft.down]);

const up = readPad(pad({ axes: [0, -1] }));
ok('stick up - ArrowUp, and only it', has(up, 'ArrowUp') && !has(up, 'ArrowDown') && !has(up, 'ArrowLeft') && !has(up, 'ArrowRight'));
ok('Screen Y axis: up - negative', up.y < 0);

// --------------------------------------------------------------- the d-pad

const dpad = readPad(pad({ held: [13, 14] }));
ok('the cross walks with a whole step', dpad.x === -1 && dpad.y === 1, dpad);
ok('and arrows', has(dpad, 'ArrowDown') && has(dpad, 'ArrowLeft'));
const both = readPad(pad({ axes: [0.6, 0], held: [14] }));
ok('stick and cross in different directions - stick is more important', both.x > 0, both.x);

// ------------------------------------------------------------- the buttons

const face = readPad(pad({ held: [0, 1, 2, 3] }));
ok('A - space', has(face, ' '));
ok('B — Escape', has(face, 'Escape'));
ok('X - skate (b)', has(face, 'b'));
ok('Y - planner (Tab)', has(face, 'Tab'));
const trig = readPad(pad({ held: [6] }));
ok('trigger - Shift', has(trig, 'Shift'));
ok('both triggers - one Shift, not two', readPad(pad({ held: [6, 7] })).down.size === 1);
ok('bumpers - scale', has(readPad(pad({ held: [4, 5] })), '-') && has(readPad(pad({ held: [4, 5] })), '+'));
// an Xbox trigger is analogue: pressed may not be set while value is already past the threshold
const analog = pad();
analog.buttons[7] = { pressed: false, value: 0.8 };
ok('the half-pressed trigger is already holding Shift', has(readPad(analog), 'Shift'));
analog.buttons[7] = { pressed: false, value: 0.3 };
ok('but barely touched - no', !has(readPad(analog), 'Shift'));
ok('all layout buttons exist in standard 16', Object.keys(BUTTONS).every((i) => +i >= 0 && +i < 16));

// ------------------------------------------------------------- the edges

const idle = readPad(null);
const a = readPad(pad({ held: [0] }));
ok('pressing is visible once', edges(idle, a).pressed.join() === ' ' && edges(idle, a).released.length === 0);
ok('hold is not repeated', edges(a, a).pressed.length === 0 && edges(a, a).released.length === 0);
ok('release is visible once', edges(a, idle).released.join() === ' ' && edges(a, idle).pressed.length === 0);
const ab = readPad(pad({ held: [0, 1] }));
ok('the second button while holding the first one is the only one', edges(a, ab).pressed.join() === 'Escape');
// a stick swung through the centre from left to right releases one arrow and
// presses the other within a single frame
const l = readPad(pad({ axes: [-1, 0] })), r = readPad(pad({ axes: [1, 0] }));
const flip = edges(l, r);
ok('Stick Flip: ArrowLeft released, ArrowRight pressed', flip.released.join() === 'ArrowLeft' && flip.pressed.join() === 'ArrowRight', flip);

console.log(bad ? `\n${bad} упало` : '\nall intact');
process.exit(bad ? 1 : 0);
