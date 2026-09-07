// node tools/test-skate.mjs — the skateboard physics, without a browser.
//
// Momentum breaks quietly and unpleasantly: either the speed never dies (the
// player "floats" down the corridor with the keys released), or it accelerates
// without limit, or a diagonal runs half again as fast as a straight line. All
// of that is only visible over a long series of frames, so it is checked here
// rather than by eye.
import { skateStep, rolling, CRUISE, CRUISE_PUSH, STOP,
  ollieStep, canOllie, OLLIE_POP } from '../web/skate.js';

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('FAIL  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};
const speed = (v) => Math.hypot(v.vx, v.vy);
// n frames with the same input
const run = (v, input, n, dt = 1) => {
  for (let i = 0; i < n; i++) v = skateStep(v, input, dt);
  return v;
};

// ------------------------------------------------------------ acceleration

const still = { vx: 0, vy: 0 };
ok('standing still without input does not go anywhere', speed(skateStep(still, {}, 1)) === 0);

const one = skateStep(still, { x: 1 }, 1);
ok('one frame of the push already gives a move', one.vx > 0, one);
ok('and only along the pressed axis', one.vy === 0, one);

const fast = run(still, { x: 1 }, 60);
ok('reaches cruising speed in a second', Math.abs(fast.vx - CRUISE) < 0.05, fast.vx);
ok('and does not accelerate further than it', run(fast, { x: 1 }, 600).vx <= CRUISE + 1e-9, run(fast, { x: 1 }, 600).vx);
ok('faster than running (2.6 pixels per frame)', CRUISE > 2.6);

const pushed = run(still, { x: 1, push: true }, 200);
ok('SHIFT raises the ceiling', Math.abs(pushed.vx - CRUISE_PUSH) < 0.05, pushed.vx);
ok('and releasing SHIFT returns to normal', run(pushed, { x: 1 }, 120).vx <= CRUISE + 1e-9);

// --------------------------------------------------------------- diagonals

const diag = run(still, { x: 1, y: 1 }, 200);
ok('diagonally is no faster than straight', speed(diag) <= CRUISE + 1e-9, speed(diag));
ok('and both axes are alive', diag.vx > 0 && diag.vy > 0, diag);
ok('diagonal is symmetrical', Math.abs(diag.vx - diag.vy) < 1e-9, diag);

// ------------------------------------------------------------------ coasting

let coast = run(still, { x: 1 }, 60);
const atRelease = coast.vx;
coast = run(coast, {}, 10);
ok('let go - it\'s still rolling', coast.vx > 0 && coast.vx < atRelease, [atRelease, coast.vx]);

const stopped = run(run(still, { x: 1 }, 60), {}, 200);
ok('but in the end it goes to zero', stopped.vx === 0 && stopped.vy === 0, stopped);
ok('rolling() honestly says that he is no longer moving', !rolling(stopped));
ok('and what goes when it goes', rolling(run(still, { x: 1 }, 30)));

// how many frames a stop takes — so the coast cannot be quietly doubled
let v = run(still, { x: 1 }, 60), frames = 0;
while (rolling(v) && frames < 600) { v = skateStep(v, {}, 1); frames++; }
ok('the roll lasts from half a second to two', frames > 30 && frames < 120, frames);

// ------------------------------------------------------------- long frames

// dt = 3 is a frame from a background tab; on it friction by subtraction would
// take the speed below zero and the player would ride backwards
const laggy = run(run(still, { x: 1 }, 60), {}, 40, 3);
ok('does not go back in long shots', laggy.vx >= 0, laggy);
ok('and yet it stops', laggy.vx === 0, laggy);

const laggyPush = run(still, { x: 1 }, 40, 3);
ok('does not jump over the ceiling in long shots', speed(laggyPush) <= CRUISE + 1e-9, laggyPush);

// ------------------------------------------------------------ small things

ok('turning around extinguishes the old speed', run(run(still, { x: 1 }, 60), { x: -1 }, 30).vx < 0);
ok('stopping threshold is not zero', STOP > 0);
ok('calling without arguments does not fail', speed(skateStep()) === 0);


// --- the ollie ---
ok('you can push off from the ground on the board', canOllie({ skate: true, z: 0 }) === true);
ok('on foot - not possible', canOllie({ skate: false, z: 0 }) === false);
ok('in the air a second time - impossible', canOllie({ skate: true, z: 5 }) === false);

let air = { z: 0, vz: OLLIE_POP }, top = 0, aloft = 0, landed = false;
while (aloft < 600) {
  air = ollieStep(air, 1);
  top = Math.max(top, air.z);
  aloft++;
  if (air.landed) { landed = true; break; }
}
ok('lands on its own instead of hanging', landed);
ok('highest point about 14 pixels', top > 12 && top < 20, top);
ok('in the air for less than a second', aloft < 60, aloft);
ok('after landing, altitude and speed are reset to zero', air.z === 0 && air.vz === 0, air);
ok('nothing happens on earth without a push', ollieStep({ z: 0, vz: 0 }).z === 0);
// a long frame — the tab was in the background: the player must land, not go through the floor
ok('the long shot lands rather than drops below the floor', ollieStep({ z: 1, vz: -5 }, 4).landed === true);
ok('calling without arguments does not fail', ollieStep().z === 0);

console.log(bad ? `\nfailed: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
