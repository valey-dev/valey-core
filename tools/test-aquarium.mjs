// node tools/test-aquarium.mjs — the piranha tank, without a browser.
//
// What the eye cannot check on one frame: that a fish never leaves the glass
// over minutes of swimming, that the dart speeds the school up without making a
// fish jump, that a person at the glass pulls the school to their side, and that
// the tank stands clear of every door and of the other corridor furniture.
import { fishAt, schoolClock, darting, FISH, mealAt, DROP, EAT, MEAL } from '../web/aquarium.js';
import { buildLayout } from '../web/layout.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// ---------------------------------------------------------------- the swimming
let inside = true, maxStep = 0, maxDartStep = 0, sawDart = false, turns = 0;
for (let i = 0; i < FISH; i++) {
  let was = fishAt(i, 0, 'x');
  for (let t = 16; t < 120000; t += 16) {
    const f = fishAt(i, t, 'x');
    if (f.u < 0 || f.u > 1 || f.v < 0 || f.v > 1) inside = false;
    // in tank pixels: u spans 44, v spans 16
    const step = Math.hypot((f.u - was.u) * 44, (f.v - was.v) * 16);
    if (darting(t)) { sawDart = true; maxDartStep = Math.max(maxDartStep, step); }
    else maxStep = Math.max(maxStep, step);
    if (f.dir !== was.dir) turns += 1;
    was = f;
  }
}
ok('no fish leaves the glass in two minutes', inside);
ok('the school darts at least once in two minutes', sawDart);
ok('idle swimming is slow — under a pixel a frame', maxStep < 1, maxStep.toFixed(2));
ok('the dart is faster, and still no jump across the tank', maxDartStep > maxStep && maxDartStep < 4,
  [maxStep.toFixed(2), maxDartStep.toFixed(2)]);
ok('fish turn around as they swim', turns > FISH * 4, turns);

let mono = true;
for (let t = 0, was = -1; t < 60000; t += 16) { const c = schoolClock(t); if (c <= was) mono = false; was = c; }
ok('the school clock only moves forward', mono);

const apart = new Set(Array.from({ length: FISH }, (_, i) => fishAt(i, 5000, 'x').u.toFixed(2)));
ok('five fish are in five places', apart.size === FISH, [...apart]);

// ------------------------------------------------------------------ the lure
const right = Array.from({ length: FISH }, (_, i) => fishAt(i, 7000, 'x', { side: 1 }, 1));
const left = Array.from({ length: FISH }, (_, i) => fishAt(i, 7000, 'x', { side: -1 }, 1));
ok('a person on the right pulls the school to the right glass',
  right.every((f) => f.u > 0.75 && f.dir === 1), right.map((f) => f.u.toFixed(2)));
ok('and on the left, to the left glass, facing them',
  left.every((f) => f.u < 0.25 && f.dir === -1), left.map((f) => f.u.toFixed(2)));
const half = fishAt(0, 7000, 'x', { side: 1 }, 0.5), free = fishAt(0, 7000, 'x');
ok('half turned is half way there', half.u > free.u && half.u < right[0].u, [free.u, half.u, right[0].u]);

// ------------------------------------------------------------------ the place
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 'a' + i, project: 'p' + i, name: 'a' + i, status: 'idle' }));
for (const n of [1, 3, 7]) {
  const L = buildLayout(mk(n));
  const tanks = L.props.filter((p) => p.kind === 'aquarium');
  const tank = tanks[0];
  ok(`with ${n} projects there is one tank`, tanks.length === 1, tanks.length);
  if (!tank) continue;
  const lang = L.props.find((p) => p.kind === 'lang');
  ok(`with ${n} projects it stands in the entrance corridor`, lang && Math.abs(lang.y - tank.y) < 10, [lang?.y, tank.y]);
  const x0 = tank.x - tank.w / 2, x1 = tank.x + tank.w / 2;
  const doors = L.projectRooms.filter((r) => Math.abs(r.y - tank.y) < 60)
    .filter((r) => r.door.x < x1 + 8 && r.door.x + r.door.w > x0 - 8).map((r) => r.key);
  ok(`with ${n} projects it blocks no door`, doors.length === 0, doors);
  const crowd = L.props.filter((p) => p !== tank && Math.abs(p.y - tank.y) < 20
    && Math.abs(p.x - tank.x) < tank.w / 2 + 20).map((p) => p.kind);
  ok(`with ${n} projects it stands clear of the other furniture`, crowd.length === 0, crowd);
  ok(`with ${n} projects it is inside the floor`, x0 > 20 && x1 < L.lift.x - 10, [x0, x1, L.lift.x]);
}

// ------------------------------------------------------------------ feeding
// The meal is read off the clock from the throw: in, eaten while it sinks, the
// bone to the gravel, and then nothing — so the next throw is allowed.
const meal = { at: 10000 };
ok('nothing before the throw', mealAt(meal, 9999) === null);
ok('the piece falls in from above the water', mealAt(meal, 10000).phase === 'drop' && mealAt(meal, 10000).v < 0);
ok('and lands at the surface', Math.abs(mealAt(meal, 10000 + DROP - 1).v) < 0.15, mealAt(meal, 10000 + DROP - 1).v);
const e0 = mealAt(meal, 10000 + DROP + 10), e1 = mealAt(meal, 10000 + DROP + EAT - 10);
ok('it is eaten while it sinks', e0.phase === 'eat' && e1.v > e0.v && e1.left < 0.05 && e0.left > 0.95, [e0, e1]);
ok('then the bone goes down to the gravel', mealAt(meal, 10000 + MEAL - 1).phase === 'bone' && mealAt(meal, 10000 + MEAL - 1).v > 0.95);
ok('and the meal is over', mealAt(meal, 10000 + MEAL) === null);
let moved = 0;
for (let tt = 0; tt < MEAL; tt += 16) {
  const a = mealAt(meal, 10000 + tt), b = mealAt(meal, 10000 + tt + 16);
  if (a && b) moved = Math.max(moved, Math.abs(b.u - a.u) * 44, a.phase === b.phase ? Math.abs(b.v - a.v) * 16 : 0);
}
ok('the piece never jumps within a phase', moved < 3, moved.toFixed(2));
const eat = mealAt(meal, 10000 + DROP + 800);
const ring = Array.from({ length: FISH }, (_, i) => fishAt(i, 10000 + DROP + 800, 's', { u: eat.u, v: eat.v }, 1));
ok('while it lasts every fish is at the meat', ring.every((f) => Math.abs(f.u - eat.u) < 0.2),
  ring.map((f) => f.u.toFixed(2)).join());
ok('nose to it', ring.every((f) => (f.u <= eat.u ? f.dir === 1 : f.dir === -1)));

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
