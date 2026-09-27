// The pole in the lounge and Bolty, the robot who dances on it — badly.
// Added 13 September 2026 on a live demo, the design phase skipped on the
// owner's word; the frame is owed afterwards, as with the hookah and the tank.
//
// He is a robot in the spirit of the clumsy tin comedians of cartoons, not a
// copy of any one of them: a dome head with a visor, a grille for a mouth, a
// barrel for a body and an antenna that never stops wobbling. The joke is that
// he is sure he is good at this.
//
// Nothing is stored between frames except the last show: the idle routine is
// read off the clock, a show off the time it was paid for. The idle loop spins
// him round the pole and, once a loop, lets him slip down it onto the stage.
// A tip (SPACE) buys a show: a coin flies from whoever threw it, he spins
// three times as fast, climbs — and then either slides down on his seat or
// spins his own head off and has to find it. Either way he bows and says
// something he believes is dignified.
import { hash } from './sprites.js';

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

const C = {
  metal: '#9aa7b2', hi: '#c3ccd4', dark: '#6b7680', deep: '#4c555e',
  visor: '#1d252c', eye: '#ffd166', grille: '#3b444c', led: '#9fe0a8', ball: '#e35d5d',
  pole: '#dfe5ea', poleShade: '#8d97a1', cap: '#b8c1c9',
  stage: '#3b2d4a', stageLo: '#2a1f35', neon: '#ff7eb6', neonLo: '#7a3a5a', coin: '#ffd166', coinLo: '#c98a2e',
};

export const POLE_H = 56;
const IDLE = 9000;            // one idle loop: six seconds of spinning, a slip, getting up
const COIN = 450;             // the coin's flight
const FAST = 1700;            // the paid-for spin
export const SHOW = { slide: 5600, head: 6400 };
export const LINES = 8;       // pole.line.1 … pole.line.8 in web/i18n.js

// A show, bought with a tip. `kind` is picked here so the caller can say the
// line and play the sounds in step; `line` is the dictionary index.
export function newShow(now, from, tips = 0) {
  const kind = hash(`show${tips}:${Math.floor(now)}`) % 2 ? 'head' : 'slide';
  return { at: now, kind, from, line: 1 + (hash(`line${tips}:${Math.floor(now / 7)}`) % LINES) };
}
export const showOver = (s, now) => !s || now - s.at > SHOW[s.kind];

// When, inside a show, the loud things happen: the caller plays a clank at `bump`
// and a sproing at `pop`, and shows the line from `say`.
export function showBeats(s) {
  const f = COIN + FAST;
  return s.kind === 'slide'
    ? { spin: COIN, fall: f, bump: f + 520, say: f + 1400 }
    : { spin: COIN, fall: f, pop: f, bump: f + 520, say: f + 3000 };
}

// ----------------------------------------------------------------- the pose
// Where he is and how he stands at time t, as numbers the drawing reads.
//   dx     offset from the pole, signed; z < 0 means behind it
//   lift   how far up the pole his feet are
//   dir    which way he faces
//   pose   'spin' | 'slide' | 'sit' | 'stand' | 'grope' | 'bow'
//   head   null, or where his head is when it is not on his shoulders
function pose(t, show) {
  if (show && !showOver(show, t)) return showPose(t - show.at, show);
  const u = t % IDLE;
  if (u < 6000) return spinPose(t, 1, 6 + 4 * Math.abs(Math.sin(t / 900)));
  if (u < 6900) {
    // the slip: the hands squeal down the chrome, sparks under them
    const k = (u - 6000) / 900;
    return { dx: -5, z: 1, lift: 14 * (1 - k * k), dir: 1, pose: 'slide', sparks: true };
  }
  if (u < 7900) return { dx: -6, z: 1, lift: 0, dir: 1, pose: 'sit', dizzy: true };
  return { dx: -5, z: 1, lift: 0, dir: 1, pose: 'stand', shake: u < 8300 };
}

function spinPose(t, speed, lift) {
  // not a clean orbit: the speed stutters, the way an amateur's does
  const a = (t * speed) / 260 + 0.7 * Math.sin(t / 700);
  const s = Math.sin(a), c = Math.cos(a);
  return { dx: Math.round(s * 7), z: c, lift, dir: c >= 0 ? 1 : -1, pose: 'spin', kick: Math.abs(s) > 0.8 };
}

function showPose(u, s) {
  const b = showBeats(s);
  if (u < b.spin) return spinPose(u + 40_000, 1, 6);
  if (u < b.fall) return { ...spinPose(u * 3 + 40_000, 1, 6 + 16 * Math.min(1, (u - b.spin) / 600)), flash: true };
  const v = u - b.fall;
  if (s.kind === 'slide') {
    if (v < 520) { const k = v / 520; return { dx: -5, z: 1, lift: 22 * (1 - k * k), dir: 1, pose: 'slide', sparks: true }; }
    if (v < 1400) return { dx: -6, z: 1, lift: 0, dir: 1, pose: 'sit', dizzy: true };
    return { dx: -5, z: 1, lift: 0, dir: 1, pose: 'bow' };
  }
  // the head: off at the top of the spin, a bounce on the stage, a roll to its
  // edge; the body lands, gropes about for it, puts it back and bows
  const head = headFlight(v);
  if (v < 520) { const k = v / 520; return { dx: -5, z: 1, lift: 22 * (1 - k), dir: 1, pose: 'slide', head }; }
  if (v < 2400) return { dx: -5 + Math.round(Math.sin(v / 180) * 4), z: 1, lift: 0, dir: Math.sin(v / 360) > 0 ? 1 : -1, pose: 'grope', head };
  if (v < 3000) { const k = (v - 2400) / 600; return { dx: 8 - Math.round(13 * k), z: 1, lift: 0, dir: -1, pose: 'stand', head: k < 0.5 ? { x: 14, y: 0, rolled: true, carried: true } : null }; }
  return { dx: -5, z: 1, lift: 0, dir: 1, pose: 'bow' };
}

// The head's own trip, relative to the pole's foot: up and out, a bounce, rest.
function headFlight(v) {
  if (v < 420) { const k = v / 420; return { x: Math.round(4 + 12 * k), y: Math.round(-46 + 60 * k * k - 14 * k), spin: true }; }
  if (v < 700) { const k = (v - 420) / 280; return { x: Math.round(16 + 3 * k), y: Math.round(-8 * Math.sin(Math.PI * k)), spin: true }; }
  return { x: 19, y: 0, rolled: true };
}

// ---------------------------------------------------------------- drawing
function drawHead(ctx, hx, hy, dir, t, o = {}) {
  // hx is the head's centre, hy its top
  const blink = Math.floor(t / 2600) % 7 === 0 && (t % 2600) < 160;
  px(ctx, hx - 3, hy, 6, 1, C.hi);                   // the dome
  px(ctx, hx - 4, hy + 1, 8, 7, C.metal);
  px(ctx, hx - 4, hy + 1, 1, 7, C.hi);
  px(ctx, hx + 3, hy + 1, 1, 7, C.dark);
  px(ctx, hx - 3, hy + 3, 6, 2, C.visor);            // the visor
  if (o.dizzy) {
    px(ctx, hx - 2, hy + 3, 1, 1, C.eye); px(ctx, hx - 1, hy + 4, 1, 1, C.eye);
    px(ctx, hx + 1, hy + 4, 1, 1, C.eye); px(ctx, hx + 2, hy + 3, 1, 1, C.eye);
  } else if (!blink) {
    const e = dir > 0 ? 1 : 0;                        // he looks where he is going
    px(ctx, hx - 3 + e, hy + 3, 2, 2, C.eye);
    px(ctx, hx + e, hy + 3, 2, 2, C.eye);
  }
  for (let i = 0; i < 4; i++) px(ctx, hx - 2 + i, hy + 6, 1, 1, i % 2 ? C.grille : C.hi);   // the grille
  const wob = Math.round(Math.sin(t / 110) * (o.shake ? 2 : 1));
  px(ctx, hx, hy - 3, 1, 3, C.dark);                 // the antenna, never still
  px(ctx, hx - 1 + wob, hy - 5, 2, 2, Math.floor(t / 500) % 2 ? C.ball : '#ff8f7a');
}

function drawRobot(ctx, x, y, r, t) {
  const ly = y - r.lift;
  const bodyX = x + r.dx;
  const sit = r.pose === 'sit';
  const bow = r.pose === 'bow';
  const top = sit ? ly - 11 : ly - 16;               // the barrel's top
  // legs
  if (sit) {
    px(ctx, bodyX - 4, ly - 3, 7, 2, C.dark);          // stretched out on the stage
    px(ctx, bodyX + 3, ly - 3, 2, 3, C.deep);
  } else if (r.kick) {
    px(ctx, bodyX - 3 * r.dir, ly - 7, 2, 7, C.dark);  // one on the pole, one flung out
    px(ctx, bodyX + 2 * r.dir - (r.dir < 0 ? 5 : 0), ly - 9, 7, 2, C.dark);
  } else {
    const step = r.pose === 'grope' ? Math.round(Math.sin(t / 90)) : 0;
    px(ctx, bodyX - 3, ly - 7 + step, 2, 7 - step, C.dark);
    px(ctx, bodyX + 1, ly - 7 - step, 2, 7 + step, C.dark);
    px(ctx, bodyX - 4, ly - 1, 3, 1, C.deep); px(ctx, bodyX + 1, ly - 1, 3, 1, C.deep);
  }
  // the barrel
  const tilt = bow ? 2 : 0;
  px(ctx, bodyX - 5, top + tilt, 10, 9, C.metal);
  px(ctx, bodyX - 5, top + tilt, 1, 9, C.hi);
  px(ctx, bodyX + 4, top + tilt, 1, 9, C.dark);
  px(ctx, bodyX - 5, top + 8 + tilt, 10, 1, C.deep);
  px(ctx, bodyX - 2, top + 3 + tilt, 4, 4, C.dark);      // the hatch
  px(ctx, bodyX - 1, top + 4 + tilt, 2, 2, C.metal);
  px(ctx, bodyX + 2, top + 1 + tilt, 1, 1, Math.floor(t / 350) % 2 ? C.led : C.deep);
  // arms: the one nearest the pole holds it, the other waves about
  const grip = r.pose === 'spin' || r.pose === 'slide';
  const sx = bodyX - 6, ox = bodyX + 5, sy = top + 1 + tilt;
  if (grip) {
    const gx = x, gy = ly - 24;
    line(ctx, r.dx > 0 ? sx : ox, sy, gx, gy, C.dark);
    px(ctx, gx - 1, gy - 1, 2, 2, C.hi);
    const wave = Math.round(Math.sin(t / 150) * 3);
    const fx = r.dx > 0 ? ox : sx, away = r.dx > 0 ? 1 : -1;
    line(ctx, fx, sy, fx + 5 * away, sy - 4 + wave, C.dark);
  } else if (r.pose === 'grope') {
    const reach = Math.round(Math.sin(t / 200) * 2);
    line(ctx, sx, sy, sx - 5, sy + 2 + reach, C.dark);
    line(ctx, ox, sy, ox + 5, sy + 2 - reach, C.dark);
  } else if (bow) {
    line(ctx, sx, sy, sx - 1, sy + 7, C.dark);
    line(ctx, ox, sy, ox + 4, sy - 5, C.dark);        // the flourish
  } else {
    line(ctx, sx, sy, sx - 2, sy + 6 + (r.shake ? Math.round(Math.sin(t / 40)) : 0), C.dark);
    line(ctx, ox, sy, ox + 2, sy + 6, C.dark);
  }
  // the neck and the head — unless the head is elsewhere
  if (!r.head) {
    px(ctx, bodyX - 1, top - 1 + tilt, 2, 1, C.deep);
    drawHead(ctx, bodyX + (bow ? r.dir * 2 : 0), top - 9 + tilt * 2, r.dir, t, { dizzy: r.dizzy, shake: r.shake });
  } else {
    // a stump with a spring, where a head should be
    px(ctx, bodyX - 1, top - 3, 1, 3, C.poleShade);
    px(ctx, bodyX, top - 4, 1, 2, C.poleShade);
  }
  if (r.head && r.head.carried) drawHead(ctx, ox + 3, sy - 6, -1, t, { dizzy: true });
  if (r.sparks) {
    for (let i = 0; i < 3; i++) {
      const k = hash(`spark${Math.floor(t / 60)}:${i}`);
      px(ctx, x - 2 + (k % 5), ly - 24 + ((k >>> 4) % 5), 1, 1, i % 2 ? C.eye : '#fff3c4');
    }
  }
}

// a one-pixel line, stepped the way everything else here is
function line(ctx, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) px(ctx, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1, c);
}

function drawStage(ctx, x, y, t, tips) {
  const rows = [20, 28, 32, 34, 32, 28, 20];
  const neonOn = Math.floor(t / 700) % 5 !== 0;       // a neon tube with a loose contact
  rows.forEach((w, i) => {
    const yy = y - 3 + i;
    px(ctx, x - w / 2, yy, w, 1, i < 3 ? C.stage : C.stageLo);
    px(ctx, x - w / 2, yy, 1, 1, neonOn ? C.neon : C.neonLo);
    px(ctx, x + w / 2 - 1, yy, 1, 1, neonOn ? C.neon : C.neonLo);
  });
  px(ctx, x - 10, y - 4, 20, 1, neonOn ? C.neon : C.neonLo);
  px(ctx, x - 10, y + 4, 20, 1, C.neonLo);
  // the tips, in a heap on the edge of the stage
  for (let i = 0; i < Math.min(tips, 7); i++) {
    px(ctx, x + 8 + (i % 3) * 2, y - (i >> 1) - 1, 2, 1, i % 2 ? C.coin : C.coinLo);
  }
}

function drawPoleBar(ctx, x, y, t) {
  px(ctx, x - 1, y - POLE_H, 2, POLE_H, C.pole);
  px(ctx, x, y - POLE_H, 1, POLE_H, C.poleShade);
  px(ctx, x - 2, y - POLE_H - 2, 4, 2, C.cap);
  px(ctx, x - 2, y - 2, 4, 2, C.cap);
  const glint = (t / 30) % (POLE_H + 30);             // a glint running up the chrome
  if (glint < POLE_H) px(ctx, x - 1, y - glint, 1, 2, '#ffffff');
}

// The whole thing, at the stage's centre on the floor. `show` is the last tip's
// show or null, `tips` how many coins lie on the stage.
export function drawPole(ctx, p, t, show = null, tips = 0) {
  const { x, y } = p;
  drawStage(ctx, x, y, t, tips);
  const r = pose(t, show);
  const floorY = y - 1;
  // behind the pole when his orbit takes him round the back
  if (r.z < 0) { drawRobot(ctx, x, floorY, r, t); drawPoleBar(ctx, x, y, t); }
  else { drawPoleBar(ctx, x, y, t); drawRobot(ctx, x, floorY, r, t); }
  if (r.head && !r.head.carried) {
    const h = r.head;
    drawHead(ctx, x + h.x, floorY + h.y - 8, h.spin ? (Math.floor(t / 80) % 2 ? 1 : -1) : 1, t, { dizzy: h.rolled });
  }
  if (r.flash) for (let i = 0; i < 4; i++) {
    const a = t / 90 + i * 1.6;
    px(ctx, x + Math.cos(a) * 14, floorY - 30 + Math.sin(a) * 10, 1, 1, i % 2 ? C.neon : C.eye);
  }
}

// The coin in the air: from the thrower's hand to the stage, in an arc.
export function drawCoin(ctx, p, show, t) {
  if (!show || !show.from) return;
  const u = t - show.at;
  if (u < 0 || u > COIN) return;
  const k = u / COIN;
  const cx = show.from.x + (p.x + 10 - show.from.x) * k;
  const cy = show.from.y - 16 + (p.y - 2 - (show.from.y - 16)) * k - Math.sin(Math.PI * k) * 18;
  px(ctx, cx, cy, 2, 2, Math.floor(t / 60) % 2 ? C.coin : C.coinLo);
}

// Where the robot's head is now, for the line he says to hang over it.
export function headTop(p, t, show) {
  const r = pose(t, show);
  return { x: p.x + r.dx, y: p.y - r.lift - 30 };
}
