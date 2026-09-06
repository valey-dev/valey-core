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
  bad++; console.log('УПАЛ  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};
const whole = (n) => Number.isInteger(n);

// ------------------------------------------------------------- whole numbers

for (const [w, h, dpr] of [[1440, 900, 1], [1440, 900, 2], [1080, 1920, 1], [900, 600, 1.5], [3440, 1440, 1]]) {
  const v = viewport(w, h, dpr);
  ok(`${w}×${h}@${dpr}: масштаб целый`, whole(v.scale), v.scale);
  ok(`${w}×${h}@${dpr}: холст целый и положительный`, whole(v.vw) && whole(v.vh) && v.vw > 0 && v.vh > 0, v);
  ok(`${w}×${h}@${dpr}: масштаб в границах`, v.scale >= SCALE_MIN && v.scale <= SCALE_MAX, v.scale);
}

// --------------------------------------------------- the canvas fills the window

const fills = (w, h, dpr) => {
  const v = viewport(w, h, dpr);
  // The shortfall is only the rounding remainder — less than one step.
  return (w * dpr - v.vw * v.scale) < v.scale && (h * dpr - v.vh * v.scale) < v.scale;
};
ok('1440×900 холст заполняет окно', fills(1440, 900, 1));
ok('вертикальный 1080×1920 заполняет окно', fills(1080, 1920, 1));
ok('тесное 900×600 заполняет окно', fills(900, 600, 1));
ok('ретина 1440×900@2 заполняет окно', fills(1440, 900, 2));

// ------------------------------------------------- the promise about the width

for (const [w, h] of [[1440, 900], [1080, 1920], [1920, 1080], [3440, 1440]]) {
  const v = viewport(w, h, 1);
  ok(`${w}×${h}: мира по ширине не меньше ${BASE_W}`, v.vw >= BASE_W, v.vw);
  ok(`${w}×${h}: и «тесно» не горит`, !v.tight, v);
}
const narrow = viewport(700, 900, 1);
ok('на узком окне мельче ×2 не уходим', narrow.scale === SCALE_MIN, narrow.scale);
ok('и честно говорим «тесно»', narrow.tight && narrow.vw < BASE_W, narrow);

// ------------------------------------------------- the vertical monitor

const tall = viewport(1080, 1920, 1);
const wide = viewport(1440, 900, 1);
ok('на вертикальном мониторе мира по высоте видно больше, чем на горизонтальном',
  tall.vh > wide.vh, [tall.vh, wide.vh]);
ok('и больше, чем прежние 225 пикселей', tall.vh > BASE_H, tall.vh);
ok('на вертикальном мониторе высоты видно больше, чем ширины', tall.vh > tall.vw, tall);

// ------------------------------------------------------------- a manual step

const manual = viewport(1440, 900, 1, 6);
ok('выбранный шаг уважается', manual.scale === 6, manual.scale);
ok('и auto при этом гаснет', manual.auto === false, manual);
ok('выбранный шаг сужает обзор, а не добавляет поля',
  manual.vw < viewport(1440, 900, 1).vw && manual.vw * manual.scale <= 1440, manual);
ok('шаг за потолком зажимается', viewport(1440, 900, 1, 99).scale === SCALE_MAX);
ok('шаг за полом зажимается', viewport(1440, 900, 1, 1).scale === SCALE_MIN);

// The "+" that shrinks. Exactly the breakage the rule was changed for: auto gave ×10 on
// a large screen while the step was clamped to eight.
const big = viewport(3440, 1440, 1);
ok('на широком экране авто не выпрыгивает за потолок', big.scale <= SCALE_MAX, big.scale);
const up = stepScale(big.scale, 1);
ok('и «плюс» оттуда либо растит масштаб, либо честно отказывает',
  up === null || up > big.scale, up);

ok('шаг вверх от пола растёт', stepScale(SCALE_MIN, 1) === SCALE_MIN + 1);
ok('шаг вниз от пола отказывает', stepScale(SCALE_MIN, -1) === null);
ok('шаг вверх от потолка отказывает', stepScale(SCALE_MAX, 1) === null);
ok('шаг вниз от потолка уменьшает', stepScale(SCALE_MAX, -1) === SCALE_MAX - 1);

// --------------------------------------------------------- the entrance

const title = viewport(1440, 900, 1, 0, true);
ok('сцена входа остаётся 400×225', title.vw === BASE_W && title.vh === BASE_H, title);
ok('и целиком влезает в окно', title.scale * BASE_W <= 1440 && title.scale * BASE_H <= 900, title.scale);
const titleSmall = viewport(500, 300, 1, 0, true);
ok('в крошечном окне сцена входа всё равно показывается', titleSmall.scale >= 1, titleSmall);
ok('офис при этом сцене входа не подчиняется',
  viewport(1440, 900, 1).vw !== BASE_W);

// ------------------------------------------------------------ degenerate

const zero = viewport(0, 0, 1);
ok('нулевое окно не даёт нулевого холста', zero.vw > 0 && zero.vh > 0, zero);

console.log(bad ? `\n${bad} упало` : '\nвсё цело');
process.exit(bad ? 1 : 0);
