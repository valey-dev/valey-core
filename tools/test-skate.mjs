// node tools/test-skate.mjs — физика скейта, без браузера.
//
// Инерция ломается тихо и неприятно: скорость либо не гаснет (игрок «плывёт»
// по коридору с отпущенными клавишами), либо разгоняется без предела, либо по
// диагонали едет в полтора раза быстрее, чем прямо. Всё это видно только на
// длинной серии кадров, поэтому проверяется здесь, а не глазами.
import { skateStep, rolling, CRUISE, CRUISE_PUSH, STOP } from '../web/skate.js';

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('УПАЛ  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};
const speed = (v) => Math.hypot(v.vx, v.vy);
// n кадров с одним и тем же вводом
const run = (v, input, n, dt = 1) => {
  for (let i = 0; i < n; i++) v = skateStep(v, input, dt);
  return v;
};

// ---------------------------------------------------------------- разгон

const still = { vx: 0, vy: 0 };
ok('стоя на месте без ввода никуда не едет', speed(skateStep(still, {}, 1)) === 0);

const one = skateStep(still, { x: 1 }, 1);
ok('один кадр толчка уже даёт ход', one.vx > 0, one);
ok('и только по нажатой оси', one.vy === 0, one);

const fast = run(still, { x: 1 }, 60);
ok('за секунду выходит на крейсерскую', Math.abs(fast.vx - CRUISE) < 0.05, fast.vx);
ok('и не разгоняется дальше неё', run(fast, { x: 1 }, 600).vx <= CRUISE + 1e-9, run(fast, { x: 1 }, 600).vx);
ok('быстрее бега (2.6 пикселя за кадр)', CRUISE > 2.6);

const pushed = run(still, { x: 1, push: true }, 200);
ok('SHIFT поднимает потолок', Math.abs(pushed.vx - CRUISE_PUSH) < 0.05, pushed.vx);
ok('и отпущенный SHIFT возвращает к обычной', run(pushed, { x: 1 }, 120).vx <= CRUISE + 1e-9);

// ---------------------------------------------------------------- диагональ

const diag = run(still, { x: 1, y: 1 }, 200);
ok('по диагонали не быстрее, чем прямо', speed(diag) <= CRUISE + 1e-9, speed(diag));
ok('и при этом обе оси живые', diag.vx > 0 && diag.vy > 0, diag);
ok('диагональ симметрична', Math.abs(diag.vx - diag.vy) < 1e-9, diag);

// ------------------------------------------------------------------ накат

let coast = run(still, { x: 1 }, 60);
const atRelease = coast.vx;
coast = run(coast, {}, 10);
ok('отпустил — ещё катится', coast.vx > 0 && coast.vx < atRelease, [atRelease, coast.vx]);

const stopped = run(run(still, { x: 1 }, 60), {}, 200);
ok('но в конце концов встаёт ровно в ноль', stopped.vx === 0 && stopped.vy === 0, stopped);
ok('rolling() честно говорит, что уже не едет', !rolling(stopped));
ok('и что едет, когда едет', rolling(run(still, { x: 1 }, 30)));

// сколько кадров занимает остановка — чтобы накат нельзя было втихую удвоить
let v = run(still, { x: 1 }, 60), frames = 0;
while (rolling(v) && frames < 600) { v = skateStep(v, {}, 1); frames++; }
ok('накат длится от полусекунды до двух', frames > 30 && frames < 120, frames);

// --------------------------------------------------------- длинные кадры

// dt = 3 — это кадр из фоновой вкладки; на нём трение вычитанием увело бы
// скорость в минус, и игрок поехал бы назад
const laggy = run(run(still, { x: 1 }, 60), {}, 40, 3);
ok('на длинных кадрах не уезжает назад', laggy.vx >= 0, laggy);
ok('и всё-таки останавливается', laggy.vx === 0, laggy);

const laggyPush = run(still, { x: 1 }, 40, 3);
ok('на длинных кадрах не перескакивает потолок', speed(laggyPush) <= CRUISE + 1e-9, laggyPush);

// ------------------------------------------------------------ мелочи

ok('разворот гасит старую скорость', run(run(still, { x: 1 }, 60), { x: -1 }, 30).vx < 0);
ok('порог остановки не нулевой', STOP > 0);
ok('вызов без аргументов не падает', speed(skateStep()) === 0);

console.log(bad ? `\nпровалено: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
