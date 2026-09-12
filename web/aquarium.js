// The piranha tank in the entrance corridor. Drawn 11 September 2026 on a live
// demo, the design phase skipped on the owner's word; the frame is owed
// afterwards, as with the hookah.
//
// The fish are alive in the only way a canvas can afford: nothing is stored
// between frames. Each one swims a path of its own — two sines with periods
// taken from a hash, so no two fish keep step — and the whole school is read
// off the clock. Two things break the idle drift:
//   - every 15 seconds the school darts for two seconds together, which is what
//     makes a tank of piranhas read as piranhas rather than goldfish;
//   - a person standing at the glass draws them to that side, mouths open.
//     `lure` is the person's x and `k` how far the school has turned to it
//     (0…1, eased by the caller), so walking up and away is a swim, not a jump.
import { hash } from './sprites.js';

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

export const FISH = 5;

// The dart. Time is bent rather than a speed switched: the school runs on a
// clock that goes 1 + BURST times faster inside the window, and a clock that
// only ever moves forward cannot make a fish jump across the tank.
const PERIOD = 15000, DART = 2000, BURST = 3;
export function schoolClock(t) {
  const n = Math.floor(t / PERIOD), r = t - n * PERIOD;
  return t + BURST * (n * DART + Math.min(Math.max(r - (PERIOD - DART), 0), DART));
}
export const darting = (t) => t % PERIOD > PERIOD - DART;

// Where fish i is, as u (left→right) and v (top→bottom), both inside 0…1, and
// which way it faces. `seed` keeps two tanks from swimming in unison.
export function fishAt(i, t, seed = '', lure = null, k = 0) {
  const h = hash(`piranha${seed}:${i}`);
  const a = 2600 + (h % 1700), b = 3900 + ((h >>> 8) % 2300), c = 3100 + ((h >>> 16) % 1900);
  const ph = (h % 628) / 100;
  const pos = (tt) => {
    const tw = schoolClock(tt);
    return {
      u: 0.5 + 0.34 * Math.sin(tw / a + ph) + 0.14 * Math.sin(tw / b + ph * 2),
      v: 0.5 + 0.38 * Math.sin(tw / c + ph * 3),
    };
  };
  const now = pos(t), was = pos(t - 40);
  let { u, v } = now;
  let dir = now.u >= was.u ? 1 : -1;
  if (lure && lure.u != null && k > 0) {
    // A piece of meat in the water: the school rings it and tears at it, each
    // fish darting in and out on its own beat, nose always to the meat.
    const a = (i / FISH) * Math.PI * 2 + t / 300;
    const reach = 0.7 + 0.3 * Math.sin(t / 70 + i * 2.3);
    const lu = lure.u + Math.cos(a) * 0.16 * reach;
    const lv = lure.v + Math.sin(a) * 0.44 * reach;
    u += (lu - u) * k;
    v += (lv - v) * k;
    if (k > 0.3) dir = u <= lure.u ? 1 : -1;
  } else if (lure && k > 0) {
    // To the glass on the person's side, fanned out so they do not stack into
    // one fish, each still nosing back and forth a little.
    const side = lure.side > 0 ? 0.94 : 0.06;
    const lu = side - lure.side * (0.05 * (i % 3)) + 0.02 * Math.sin(t / 260 + i);
    const lv = 0.12 + 0.19 * i + 0.03 * Math.sin(t / 310 + i * 2);
    u += (lu - u) * k;
    v += (lv - v) * k;
    if (k > 0.5) dir = lure.side;
  }
  const clamp = (n) => Math.min(1, Math.max(0, n));
  return { u: clamp(u), v: clamp(v), dir };
}

// ---------------------------------------------------------------- feeding
// SPACE at the glass throws in a piece of meat — the cartoon one, a pink chunk
// on a white bone. It falls in, the school tears it apart while it sinks, and
// the bone goes down to the gravel and stays there with the others. The whole
// meal is read off the clock from the moment of the throw, like the fish.
export const DROP = 350, EAT = 2900, SINK = 700;
export const MEAL = DROP + EAT + SINK;
export const MAX_BONES = 6;

// Where the meal is at time t: null before the throw and after the bone has
// landed. `u`/`v` are in the fish's own 0…1 water coordinates; v below 0 is
// above the surface, on the way in. `left` is how much meat is still on the
// bone, 1…0.
export function mealAt(meal, t) {
  if (!meal) return null;
  const m = t - meal.at;
  if (m < 0 || m >= MEAL) return null;
  const u = 0.3 + (hash(`meal${meal.at}`) % 40) / 100;
  if (m < DROP) {
    const p = m / DROP;
    return { phase: 'drop', p, u, v: -2.2 + p * p * 2.1, left: 1 };
  }
  if (m < DROP + EAT) {
    const p = (m - DROP) / EAT;
    return { phase: 'eat', p, u: u + 0.03 * Math.sin(m / 180), v: 0.05 + p * 0.4, left: 1 - p };
  }
  const p = (m - DROP - EAT) / SINK;
  return { phase: 'bone', p, u, v: 0.45 + p * 0.55, left: 0 };
}

function drawBone(ctx, x, y) {
  px(ctx, x, y, 6, 1, '#e6dcc6');
  px(ctx, x - 1, y - 1, 1, 1, '#e6dcc6');
  px(ctx, x - 1, y + 1, 1, 1, '#e6dcc6');
  px(ctx, x + 6, y - 1, 1, 1, '#e6dcc6');
  px(ctx, x + 6, y + 1, 1, 1, '#e6dcc6');
}

// The piece itself: the chunk shrinks as it is eaten, the bone does not.
function drawMeat(ctx, x, y, left) {
  px(ctx, x + 2, y, 5, 1, '#efe6d2');                         // the bone
  px(ctx, x + 7, y - 1, 1, 3, '#efe6d2');                     // its knuckle
  const w = Math.max(0, Math.round(6 * left)), h = left > 0.4 ? 5 : left > 0 ? 3 : 0;
  if (!w || !h) return;
  // Ham pink rather than blood red: in red it vanished into the bellies of the
  // fish eating it.
  px(ctx, x + 3 - w, y - (h >> 1), w, h, '#e98a8a');
  px(ctx, x + 3 - w, y - (h >> 1), w, 1, '#f6b8b0');
  px(ctx, x + 3 - w, y + (h >> 1) - (h > 2 ? 0 : 1), w, 1, '#b85b63');
  if (h > 2) px(ctx, x + 4 - w, y + 1, Math.max(1, w - 2), 1, '#f2c6b4');   // the fat
}

// One piranha, 10×5, nose at +4 when facing right. The belly is the red one
// knows from every picture of them; the teeth show when the mouth is open.
function drawFish(ctx, x, y, dir, open) {
  const X = (dx, w = 1) => (dir > 0 ? x + dx : x - dx - w + 1);
  px(ctx, X(-5), y - 2, 1, 1, '#3b474e');                    // the tail
  px(ctx, X(-5), y + 1, 1, 1, '#3b474e');
  px(ctx, X(-4), y - 1, 1, 2, '#3b474e');
  px(ctx, X(-1, 4), y - 2, 4, 1, '#3b474e');                 // the dorsal line
  px(ctx, X(-3, 7), y - 1, 7, 1, '#6b7a82');                 // the flank
  px(ctx, X(-3, 5), y, 5, 1, '#c0392b');                     // the red belly
  px(ctx, X(-2, 5), y + 1, 5, 1, '#8e2a21');
  px(ctx, X(2), y - 1, 1, 1, '#ffd84a');                     // the eye
  if (open) {
    px(ctx, X(2, 2), y, 2, 1, '#1a1010');                    // the gape
    px(ctx, X(4), y - 1, 1, 1, '#f4f0e6');                   // the teeth
    px(ctx, X(4), y + 1, 1, 1, '#f4f0e6');
  } else {
    px(ctx, X(2, 3), y, 3, 1, '#d9483b');                    // the jaw
  }
}

// The whole tank, standing on its cabinet with the base at y.
export function drawAquarium(ctx, p, t) {
  const { x, y } = p;
  const seed = `${x}`;
  // the cabinet
  px(ctx, x - 30, y - 10, 60, 10, '#4a3626');
  px(ctx, x - 31, y - 11, 62, 2, '#6b4e36');
  px(ctx, x, y - 8, 1, 7, '#3a2a1e');
  px(ctx, x - 4, y - 5, 2, 1, '#8a6a4a');
  px(ctx, x + 3, y - 5, 2, 1, '#8a6a4a');
  // the frame, the lid and the lamp under it
  px(ctx, x - 30, y - 42, 60, 31, '#23292d');
  px(ctx, x - 31, y - 44, 62, 3, '#2a2f33');
  px(ctx, x - 20, y - 41, 40, 1, '#e9f2c9');
  // the water: deeper towards the gravel, the surface line catching the lamp
  px(ctx, x - 28, y - 39, 56, 26, '#1b4f5f');
  px(ctx, x - 28, y - 39, 56, 8, '#22657a');
  ctx.globalAlpha = 0.7;
  px(ctx, x - 28, y - 39, 56, 1, '#8fd3e0');
  ctx.globalAlpha = 1;
  // light from the lamp, two slow shafts
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 2; i++) {
    const sx = x - 20 + ((t / 90 + i * 23) % 40);
    px(ctx, sx, y - 38, 3, 22, '#e9f2c9');
  }
  ctx.globalAlpha = 1;
  // the gravel, and the one bone somebody did not get back
  for (let gx = x - 28; gx < x + 28; gx++) {
    const g = hash(`gravel${seed}${gx}`);
    px(ctx, gx, y - 16 + (g % 2), 1, 3, ['#8a7552', '#6f5d41', '#a08a62'][g % 3]);
  }
  drawBone(ctx, x + 8, y - 17);
  // and the ones people fed them since, in a heap that grows from the left
  for (let b = 0; b < Math.min(p.bones || 0, MAX_BONES); b++) {
    drawBone(ctx, x - 18 + b * 5 + (hash(`bone${b}`) % 3), y - 16 - (b % 2));
  }
  // the weed: it leans with the water, more at the tips
  for (const [wx, ph] of [[x - 22, 0], [x + 21, 2.1], [x - 5, 4.2]]) {
    const tall = wx === x - 5 ? 6 : 10;
    for (let s = 0; s < tall; s++) {
      const sway = Math.round(Math.sin(t / 650 + s * 0.45 + ph) * 1.6 * (s / tall));
      px(ctx, wx + sway, y - 17 - s * 2, 2, 2, s % 2 ? '#3f7a3e' : '#2f6331');
    }
  }
  // A meal outranks a person at the glass: meat in the water is the only thing
  // a piranha looks at. The school turns to it as the piece lands and lets go
  // while the bone sinks.
  const meal = mealAt(p.meal, t);
  let lure = p.lure == null ? null : { side: p.lure >= x ? 1 : -1 };
  let k = p.lureK || 0;
  if (meal && meal.phase !== 'drop') {
    lure = { u: meal.u, v: Math.min(meal.v, 0.8) };
    k = meal.phase === 'eat' ? Math.min(1, meal.p * 8) : 1 - meal.p;
  }
  const feeding = meal && meal.phase === 'eat';
  const dash = darting(t) || feeding;
  const WX = (u) => x - 22 + Math.round(u * 44), WY = (v) => y - 35 + Math.round(v * 16);
  // the water clouds while they eat, and clears as the bone goes down
  if (meal && meal.phase !== 'drop') {
    ctx.globalAlpha = 0.16 * (feeding ? Math.min(1, meal.p * 4) : 1 - meal.p);
    px(ctx, x - 28, y - 38, 56, 22, '#8e2a21');
    ctx.globalAlpha = 1;
  }
  const school = Array.from({ length: FISH }, (_, i) => ({ i, ...fishAt(i, t, seed, lure, k) }))
    .sort((a, b) => a.v - b.v);
  for (const f of school) {
    const open = (dash || k > 0.5) && Math.sin(t / (feeding ? 45 : 90) + f.i * 1.3) > -0.2;
    drawFish(ctx, WX(f.u), WY(f.v), f.dir, open);
  }
  // The meat goes over the school, not among it: tucked between the fish it was
  // lost in the first frame, and the piece is the whole point of the scene.
  if (meal && meal.phase === 'bone') drawBone(ctx, WX(meal.u) - 2, WY(meal.v));
  else if (meal && meal.phase === 'eat') drawMeat(ctx, WX(meal.u) - 4, WY(meal.v), meal.left);
  // the bits they tear off, and the splash as the piece goes in
  if (feeding) {
    for (let i = 0; i < 6; i++) {
      const a = t / 140 + i * 1.9;
      ctx.globalAlpha = 0.7;
      px(ctx, WX(meal.u) + Math.round(Math.cos(a) * (4 + i)), WY(meal.v) + Math.round(Math.sin(a * 1.3) * 3), 1, 1, '#b03030');
    }
    ctx.globalAlpha = 1;
    if (meal.p < 0.12) {
      const s = meal.p / 0.12;
      for (const dx of [-6, -3, 3, 6]) {
        ctx.globalAlpha = 0.8 * (1 - s);
        px(ctx, WX(meal.u) + dx * (1 + s), y - 40 - Math.round(Math.sin(s * Math.PI) * 5 * (Math.abs(dx) > 4 ? 0.6 : 1)), 1, 1, '#c8eef6');
      }
      ctx.globalAlpha = 1;
    }
  }
  // the filter's bubbles
  for (let i = 0; i < 4; i++) {
    const life = (t / (dash ? 900 : 2200) + i / 4) % 1;
    ctx.globalAlpha = 0.8 * (1 - life * 0.6);
    px(ctx, x - 25 + Math.round(Math.sin(life * 9 + i) * 1), y - 16 - Math.round(life * 22), 1, 1, '#c8eef6');
  }
  ctx.globalAlpha = 1;
  // the glass: one highlight, and the frame's bottom rail over the gravel line
  ctx.globalAlpha = 0.14;
  px(ctx, x - 26, y - 37, 1, 12, '#ffffff');
  ctx.globalAlpha = 1;
  px(ctx, x - 30, y - 13, 60, 2, '#23292d');
  // the piece on its way in is drawn over the lid: it is thrown from outside
  if (meal && meal.phase === 'drop') drawMeat(ctx, WX(meal.u) - 4, WY(meal.v), 1);
}
