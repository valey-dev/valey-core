// node tools/test-viewport.mjs — how much world is visible and at what scale.
//
// It breaks quietly. A fractional scale turns a pixel into soap and only a real frame
// shows it; a zero or negative canvas size kills the drawing outright; and a "+" that
// shrinks the office lives in the code for months, because nobody presses it often and
// everybody blames their own hands. All of that arithmetic is checked here.
import { viewport, stepScale, BASE_W, BASE_H, SCALE_MIN, SCALE_MAX } from '../web/viewport.js';

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('FAIL  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};
const whole = (n) => Number.isInteger(n);

// ------------------------------------------------------------- whole numbers

for (const [w, h, dpr] of [[1440, 900, 1], [1440, 900, 2], [1080, 1920, 1], [900, 600, 1.5], [3440, 1440, 1]]) {
  const v = viewport(w, h, dpr);
  ok(`${w}×${h}@${dpr}: integer scale`, whole(v.scale), v.scale);
  ok(`${w}×${h}@${dpr}: canvas is whole and positive`, whole(v.vw) && whole(v.vh) && v.vw > 0 && v.vh > 0, v);
  ok(`${w}×${h}@${dpr}: scale within`, v.scale >= SCALE_MIN && v.scale <= SCALE_MAX, v.scale);
}

// --------------------------------------------------- the canvas fills the window

const fills = (w, h, dpr) => {
  const v = viewport(w, h, dpr);
  // The shortfall is only the rounding remainder — less than one step.
  return (w * dpr - v.vw * v.scale) < v.scale && (h * dpr - v.vh * v.scale) < v.scale;
};
ok('1440×900 canvas fills the window', fills(1440, 900, 1));
ok('vertical 1080x1920 fills window', fills(1080, 1920, 1));
ok('close 900x600 fills the window', fills(900, 600, 1));
ok('retina 1440×900@2 fills the window', fills(1440, 900, 2));

// ------------------------------------------------- the promise about the width

for (const [w, h] of [[1440, 900], [1080, 1920], [1920, 1080], [3440, 1440]]) {
  const v = viewport(w, h, 1);
  ok(`${w}×${h}: the world width is at least ${BASE_W}`, v.vw >= BASE_W, v.vw);
  ok(`${w}×${h}: and “closely” does not burn`, !v.tight, v);
}
const narrow = viewport(700, 900, 1);
ok('on a narrow window smaller than ×2 we don’t go away', narrow.scale === SCALE_MIN, narrow.scale);
ok('and honestly we say “closely”', narrow.tight && narrow.vw < BASE_W, narrow);

// ------------------------------------------------- the vertical monitor

const tall = viewport(1080, 1920, 1);
const wide = viewport(1440, 900, 1);
ok('on a vertical world monitor you can see more in height than on a horizontal one',
  tall.vh > wide.vh, [tall.vh, wide.vh]);
ok('and more than the previous 225 pixels', tall.vh > BASE_H, tall.vh);
ok('On a vertical monitor, more height is visible than width', tall.vh > tall.vw, tall);

// ------------------------------------------------------------- a manual step

const manual = viewport(1440, 900, 1, 6);
ok('the chosen step is respected', manual.scale === 6, manual.scale);
ok('and auto goes out', manual.auto === false, manual);
ok('the selected step narrows the view rather than adding fields',
  manual.vw < viewport(1440, 900, 1).vw && manual.vw * manual.scale <= 1440, manual);
ok('step behind the ceiling is clamped', viewport(1440, 900, 1, 99).scale === SCALE_MAX);
ok('step behind the floor is clamped', viewport(1440, 900, 1, 1).scale === SCALE_MIN);

// The "+" that shrinks. Exactly the breakage the rule was changed for: auto gave ×10 on
// a large screen while the step was clamped to eight.
const big = viewport(3440, 1440, 1);
ok('on a wide screen the car does not jump out of the ceiling', big.scale <= SCALE_MAX, big.scale);
const up = stepScale(big.scale, 1);
ok('and the “plus” from there either increases the scale or honestly refuses',
  up === null || up > big.scale, up);

ok('step up from the floor grows', stepScale(SCALE_MIN, 1) === SCALE_MIN + 1);
ok('step down from the floor fails', stepScale(SCALE_MIN, -1) === null);
ok('step up from the ceiling fails', stepScale(SCALE_MAX, 1) === null);
ok('step down from the ceiling reduces', stepScale(SCALE_MAX, -1) === SCALE_MAX - 1);

// --------------------------------------------------------- the entrance

const title = viewport(1440, 900, 1, 0, true);
ok('the entrance scene remains 400x225', title.vw === BASE_W && title.vh === BASE_H, title);
ok('and fits entirely into the window', title.scale * BASE_W <= 1440 && title.scale * BASE_H <= 900, title.scale);
const titleSmall = viewport(500, 300, 1, 0, true);
ok('the tiny window still shows the entrance scene', titleSmall.scale >= 1, titleSmall);
ok('the office does not obey the entrance scene',
  viewport(1440, 900, 1).vw !== BASE_W);

// ------------------------------------------------------------ degenerate

const zero = viewport(0, 0, 1);
ok('null window does not give null canvas', zero.vw > 0 && zero.vh > 0, zero);

console.log(bad ? `\n${bad} упало` : '\nall intact');
process.exit(bad ? 1 : 0);
