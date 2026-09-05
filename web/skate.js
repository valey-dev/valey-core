// The skateboard. The corridors are long, and running along them palls quickly:
// on your own two feet it is some twenty seconds from the lift to the far room.
//
// What makes a skateboard different from "run faster" is the glide. The speed
// does not appear and disappear along with the key: it is gathered by pushes and
// lost to friction, so a skateboard has inertia and running does not. That is
// also its only danger: gliding along a wall looks like being stuck, so the speed
// along an axis is killed the moment movement along it runs into something (see
// glide in main.js).
//
// Everything is in pixels per frame at 60 fps — the same units running is written
// in (1.35 walking, 2.6 running), so that the numbers can be compared by eye.

export const ACCEL = 0.14;        // from a standstill to cruising in ~0.6 s
export const CRUISE = 3.4;        // faster than running, but not so fast that you miss the doors
export const CRUISE_PUSH = 4.6;   // SHIFT — push off harder
export const DRAG = 0.020;        // friction under load
export const COAST = 0.045;       // gliding with no keys: ~1.5 s to a full stop
export const STOP = 0.06;         // below this it is zero, or the player drifts forever

// A pure function: a velocity vector, the input and the frame duration in, a new
// velocity out. The module is separated from main.js for its sake: the physics is
// visible to a stand, while the picture has to be looked at by eye anyway.
export function skateStep({ vx = 0, vy = 0 } = {}, { x = 0, y = 0, push = false } = {}, dt = 1) {
  const cap = push ? CRUISE_PUSH : CRUISE;
  const pushing = x !== 0 || y !== 0;

  vx += x * ACCEL * dt;
  vy += y * ACCEL * dt;

  // Friction as a multiplier, not a subtraction: a subtraction on a large dt (the
  // tab was in the background, a frame three ordinary ones long) takes the speed
  // into the negative, and the player rides backwards.
  const k = Math.max(0, 1 - (pushing ? DRAG : COAST) * dt);
  vx *= k; vy *= k;

  // A limit on the length of the vector rather than on each axis separately:
  // otherwise the skateboard goes 1.41 times faster on a diagonal than straight.
  const mag = Math.hypot(vx, vy);
  if (mag > cap) { vx = (vx / mag) * cap; vy = (vy / mag) * cap; }

  if (!x && Math.abs(vx) < STOP) vx = 0;
  if (!y && Math.abs(vy) < STOP) vy = 0;
  return { vx, vy };
}

export const rolling = ({ vx = 0, vy = 0 }) => Math.hypot(vx, vy) > STOP;

// ------------------------------------------------------------------- the ollie
// A jump on the board. The same units as the horizontal speed: pixels per frame
// at 60 fps, so that the height can be compared with the length of a step by eye.
// The highest point is 18.2 pixels, three quarters of a person's height. Accepted
// so on 4 September 2026; the "bring it down to 14" option (a push of 2.15) was
// rejected on the frame:
// https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=850-2
export const OLLIE_POP = 2.4;   // 18.2 pixels at the highest point
export const GRAVITY = 0.17;    // ~0.5 s in the air: longer reads as flying

// A pure function, like skateStep: the height, the vertical speed and the frame
// length in, the new ones out. landed goes up in exactly the frame the ground was
// touched, so that the sound and the dust play once rather than every frame.
export function ollieStep({ z = 0, vz = 0 } = {}, dt = 1) {
  if (z <= 0 && vz <= 0) return { z: 0, vz: 0, landed: false };
  const nz = z + vz * dt;
  if (nz <= 0) return { z: 0, vz: 0, landed: true };
  return { z: nz, vz: vz - GRAVITY * dt, landed: false };
}

// You can push off only from the ground and only standing on the board:
// otherwise an ollie in the air turns into an endless climb.
export const canOllie = ({ skate = false, z = 0 } = {}) => !!skate && z <= 0;

// The board underfoot. It is drawn before the person, because he stands on it;
// the nose is turned up in the direction of the gaze, so that a turn reads without
// an animation.
export function drawSkateboard(ctx, x, y, dir = 1, moving = false, t = 0, lift = 0) {
  const p = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(px), Math.round(py), w, h); };
  const d = dir || 1;
  // the wheels bounce a little as it goes — one pixel, but without it the board is dead
  const jig = moving && Math.floor(t / 90) % 2 ? 1 : 0;

  // The shadow stays on the floor and shrinks with the height — without it the
  // jump reads as "the board has been drawn higher" rather than as a lift-off.
  const k = Math.max(0.35, 1 - lift / 26);
  ctx.fillStyle = `rgba(0,0,0,${0.22 * k})`;
  ctx.beginPath(); ctx.ellipse(x, y + 4, 9 * k, 2 * k, 0, 0, Math.PI * 2); ctx.fill();
  y -= lift;

  p(x - 6, y + 2 + jig, 2, 2, '#e2cfa8');            // the wheels
  p(x + 4, y + 2 + jig, 2, 2, '#e2cfa8');
  p(x - 8, y, 16, 2, '#4a3324');                     // the deck
  p(x - 8, y, 16, 1, '#6b4a2e');
  p(x + d * 7, y - 1, 2, 2, '#6b4a2e');              // the nose
  p(x - d * 8, y - 1, 1, 2, '#4a3324');              // and the kicktail behind
}
