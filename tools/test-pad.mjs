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
  bad++; console.log('УПАЛ  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
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
ok('без геймпада — покой, не исключение', none.x === 0 && none.y === 0 && none.down.size === 0);
ok('дырка из getGamepads() — тоже покой', readPad(undefined).down.size === 0);

// ------------------------------------------------------------ the dead zone

ok('дрожь стика в покое не двигает', stick(0.1, -0.15).x === 0 && stick(0.1, -0.15).y === 0);
ok('зона радиальная: вбок на 0.19 при дрожи по второй оси — стоим', stick(0.19, 0.05).x === 0);
const edge = stick(DEADZONE + 0.001, 0);
ok('сразу за зоной движение начинается с нуля, а не рывком', edge.x > 0 && edge.x < 0.01, edge);
ok('полный наклон — полная скорость', near(stick(1, 0).x, 1));
ok('и по диагонали не быстрее, чем прямо', Math.hypot(stick(1, 1).x, stick(1, 1).y) <= 1 + 1e-9);
ok('полнаклона — примерно полскорости', Math.abs(stick(0.6, 0).x - 0.5) < 0.01, stick(0.6, 0).x);

// ------------------------------------------------------------- the stick

const right = readPad(pad({ axes: [1, 0] }));
ok('стик вправо — идём вправо', near(right.x, 1) && right.y === 0, right);
ok('и это же стрелка вправо для меню', has(right, 'ArrowRight') && !has(right, 'ArrowLeft'));

const soft = readPad(pad({ axes: [0, -(DEADZONE + (DIGITAL - DEADZONE) * 0.5)] }));
ok('лёгкий наклон — идём медленно', soft.y < 0 && soft.y > -0.5, soft.y);
ok('но стрелкой это ещё не считается', !has(soft, 'ArrowUp'), [...soft.down]);

const up = readPad(pad({ axes: [0, -1] }));
ok('стик вверх — ArrowUp, и только он', has(up, 'ArrowUp') && !has(up, 'ArrowDown') && !has(up, 'ArrowLeft') && !has(up, 'ArrowRight'));
ok('ось Y экрана: вверх — отрицательная', up.y < 0);

// --------------------------------------------------------------- the d-pad

const dpad = readPad(pad({ held: [13, 14] }));
ok('крестовина ходит целым шагом', dpad.x === -1 && dpad.y === 1, dpad);
ok('и стрелками же', has(dpad, 'ArrowDown') && has(dpad, 'ArrowLeft'));
const both = readPad(pad({ axes: [0.6, 0], held: [14] }));
ok('стик и крестовина в разные стороны — стик главнее', both.x > 0, both.x);

// ------------------------------------------------------------- the buttons

const face = readPad(pad({ held: [0, 1, 2, 3] }));
ok('A — пробел', has(face, ' '));
ok('B — Escape', has(face, 'Escape'));
ok('X — скейт (b)', has(face, 'b'));
ok('Y — планёрка (Tab)', has(face, 'Tab'));
const trig = readPad(pad({ held: [6] }));
ok('курок — Shift', has(trig, 'Shift'));
ok('оба курка — один Shift, не два', readPad(pad({ held: [6, 7] })).down.size === 1);
ok('bumpers — масштаб', has(readPad(pad({ held: [4, 5] })), '-') && has(readPad(pad({ held: [4, 5] })), '+'));
// an Xbox trigger is analogue: pressed may not be set while value is already past the threshold
const analog = pad();
analog.buttons[7] = { pressed: false, value: 0.8 };
ok('полунажатый курок уже держит Shift', has(readPad(analog), 'Shift'));
analog.buttons[7] = { pressed: false, value: 0.3 };
ok('а едва тронутый — нет', !has(readPad(analog), 'Shift'));
ok('все кнопки раскладки существуют в стандартных 16', Object.keys(BUTTONS).every((i) => +i >= 0 && +i < 16));

// ------------------------------------------------------------- the edges

const idle = readPad(null);
const a = readPad(pad({ held: [0] }));
ok('нажатие видно один раз', edges(idle, a).pressed.join() === ' ' && edges(idle, a).released.length === 0);
ok('удержание не повторяется', edges(a, a).pressed.length === 0 && edges(a, a).released.length === 0);
ok('отпускание видно один раз', edges(a, idle).released.join() === ' ' && edges(a, idle).pressed.length === 0);
const ab = readPad(pad({ held: [0, 1] }));
ok('вторая кнопка при зажатой первой — только она', edges(a, ab).pressed.join() === 'Escape');
// a stick swung through the centre from left to right releases one arrow and
// presses the other within a single frame
const l = readPad(pad({ axes: [-1, 0] })), r = readPad(pad({ axes: [1, 0] }));
const flip = edges(l, r);
ok('переброс стика: ArrowLeft отпущена, ArrowRight нажата', flip.released.join() === 'ArrowLeft' && flip.pressed.join() === 'ArrowRight', flip);

console.log(bad ? `\n${bad} упало` : '\nвсё цело');
process.exit(bad ? 1 : 0);
