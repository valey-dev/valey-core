// node tools/test-touch.mjs — the tablet's stick and buttons, without a tablet.
//
// What is checked is what a thumb on glass would find out the slow way: that a
// resting thumb does not walk anyone, that the knob stays on its ring, that the
// rim means running, that the snapshot is the gamepad's shape — so the loop in
// main.js can take it as one — and that the buttons sit where the frame puts
// them, clear of each other and of the ring.
import {
  RING, EDGE, RUN, restCentre, grab, tilt, snapshot, buttonsAt, buttonAt, touchHint,
} from '../web/touch.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const W = 1280, H = 800;              // the MatePad 11 in CSS pixels, as drawn
const R = RING / 2;

// ------------------------------------------------------------------ the ring
const rest = restCentre(W, H);
ok('the ring rests bottom left, 40 off both edges', rest.x === EDGE + R && rest.y === H - EDGE - R, rest);
ok('a finger in the left third takes the ring', !!grab(200, 400, W, H));
ok('a finger in the middle does not', grab(W / 2, 400, W, H) === null);
const corner = grab(2, H - 2, W, H);
ok('a ring grabbed in the corner stays on the screen', corner.x - R >= 0 && corner.y + R <= H, corner);

// ------------------------------------------------------------------ the tilt
const c = { x: 300, y: 400 };
const still = tilt(c, 305, 403);
ok('a resting thumb walks nobody', still.x === 0 && still.y === 0, still);
const half = tilt(c, 300 + R / 2, 400);
ok('half-way is walking at part speed', half.x > 0.2 && half.x < 0.6 && half.y === 0, half);
ok('and not running', half.run === false);
const far = tilt(c, 300 + R * 3, 400);
ok('past the ring the knob stays on it', Math.abs(far.knob.x - (300 + R)) < 1e-9, far.knob);
ok('full tilt is speed 1', Math.abs(far.x - 1) < 1e-9, far.x);
ok('and the rim is running', far.run === true);
const diag = tilt(c, 300 + R * 2, 400 + R * 2);
ok('a diagonal is not faster than straight', Math.hypot(diag.x, diag.y) <= 1 + 1e-9, Math.hypot(diag.x, diag.y));
ok('up is negative y, as on the pad', tilt(c, 300, 400 - R).y < 0);
ok('the rim threshold is past most of the ring', RUN > 0.8 && RUN < 1);

// -------------------------------------------------------------- the snapshot
const s0 = snapshot(null);
ok('nobody touching is rest', s0.x === 0 && s0.y === 0 && s0.down.size === 0, [...s0.down]);
const s1 = snapshot(far);
ok('full right is an arrow for the menus', s1.down.has('ArrowRight'), [...s1.down]);
ok('and Shift at the rim', s1.down.has('Shift'));
ok('part tilt is no arrow', !snapshot(tilt(c, 300 + R * 0.4, 400)).down.has('ArrowRight'));
ok('● is SPACE', snapshot(null, ['action']).down.has(' '));
ok('✕ is ESC', snapshot(null, ['back']).down.has('Escape'));
ok('the shape is the gamepad’s', ['x', 'y', 'down'].every((k) => k in s1) && s1.down instanceof Set);

// ------------------------------------------------------------------ buttons
const b = buttonsAt(W, H);
ok('● sits in the corner, 40 off both edges', b.action.x + b.action.r === W - EDGE && b.action.y + b.action.r === H - EDGE, b.action);
const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r;
ok('the three buttons do not touch', gap(b.action, b.back) >= 16 && gap(b.action, b.menu) >= 16 && gap(b.back, b.menu) >= 16,
  [gap(b.action, b.back), gap(b.action, b.menu), gap(b.back, b.menu)]);
ok('none of them is in the stick’s third', Object.values(b).every((q) => q.x - q.r > W / 3));
ok('a tap on ● is ●', buttonAt(b.action.x + 10, b.action.y - 10, W, H) === 'action');
ok('a thumb four pixels off ≡ still means ≡', buttonAt(b.menu.x + b.menu.r + 4, b.menu.y, W, H) === 'menu');
ok('the floor is no button', buttonAt(W / 2, H / 2, W, H) === null);
// A small window must still fit them: a phone in landscape is 740×360.
const small = buttonsAt(740, 360);
ok('on a phone in landscape they stay on the screen', Object.values(small).every((q) => q.y - q.r >= 0 && q.x - q.r > 740 / 3), small);

// -------------------------------------------------------------------- hints
ok('a Russian hint names the button', touchHint('[ ПРОБЕЛ ] попить воды') === '[ ● ] попить воды');
ok('an English one too', touchHint('[ SPACE ] throw in some meat') === '[ ● ] throw in some meat');
ok('a hint without the key is left alone', touchHint('[ G ] к столу') === '[ G ] к столу');

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
