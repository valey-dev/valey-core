// node tools/test-trinkets.mjs — desk trinkets for the office's veterans.
//
// The rule lives in web/trinkets.js and is shared by the server, which counts
// the tier, and the canvas, which turns it into things. What is checked: both
// axes are required at every rung, the rungs are cumulative and capped, a
// missing conversation age gives nothing, and the things are the agent's own —
// the same id draws the same set, and the cup only ever stands on the right.
import { trinketTier, trinketsOf, drawTrinkets, TIERS, POOL, SPRITES } from '../web/trinkets.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 11, 12);
const ago = (d) => now - d * DAY;

// ------------------------------------------------------------------ the rungs
ok('three rungs', TIERS.length === 3, TIERS);
ok('no age, no trinkets', trinketTier(0, 5000, now) === 0, trinketTier(0, 5000, now));
ok('an unknown reply count gives nothing', trinketTier(ago(30), undefined, now) === 0, trinketTier(ago(30), undefined, now));
ok('a fresh chatterbox keeps the mug', trinketTier(ago(0.5), 5000, now) === 0, trinketTier(ago(0.5), 5000, now));
ok('an old silent chat keeps the mug', trinketTier(ago(30), 20, now) === 0, trinketTier(ago(30), 20, now));
ok('a day and 100 replies — the first rung, exactly on the edge', trinketTier(ago(1), 100, now) === 1, trinketTier(ago(1), 100, now));
ok('one reply short of the edge is still nothing', trinketTier(ago(1), 99, now) === 0, trinketTier(ago(1), 99, now));
ok('three days and 300 — the second', trinketTier(ago(3), 300, now) === 2, trinketTier(ago(3), 300, now));
ok('a week and 800 — the third', trinketTier(ago(7), 800, now) === 3, trinketTier(ago(7), 800, now));
ok('the rung is the lower of the two axes', trinketTier(ago(10), 350, now) === 2 && trinketTier(ago(2), 5000, now) === 1,
  [trinketTier(ago(10), 350, now), trinketTier(ago(2), 5000, now)]);
ok('a clock running behind the birth gives nothing, not a negative rung', trinketTier(now + DAY, 900, now) === 0, trinketTier(now + DAY, 900, now));

// ----------------------------------------------------------------- the things
ok('rung 0 — an empty desk', trinketsOf('a1', 0).length === 0, trinketsOf('a1', 0));
ok('rung 1 — one thing, on the monitor', JSON.stringify(trinketsOf('a1', 1).map((t) => t.slot)) === '["monitor"]', trinketsOf('a1', 1));
ok('rung 3 — monitor, left, right, in that order',
  JSON.stringify(trinketsOf('a1', 3).map((t) => t.slot)) === '["monitor","left","right"]', trinketsOf('a1', 3));
ok('more than three is capped at three', trinketsOf('a1', 9).length === 3, trinketsOf('a1', 9));
ok('the same id always draws the same set', JSON.stringify(trinketsOf('xyz', 3)) === JSON.stringify(trinketsOf('xyz', 3)));
ok('a lower rung is a prefix of a higher one — nothing is swapped on promotion',
  JSON.stringify(trinketsOf('xyz', 2)) === JSON.stringify(trinketsOf('xyz', 3).slice(0, 2)));

const ids = Array.from({ length: 60 }, (_, i) => `agent-${i}`);
const sets = ids.map((id) => trinketsOf(id, 3));
ok('every thing comes from its own slot pool',
  sets.every((s) => s.every((t) => POOL[t.slot].includes(t.name))), sets.slice(0, 2));
ok('the cup only ever stands on the right',
  sets.every((s) => s.every((t) => t.name !== 'trophy' || t.slot === 'right')));
const seen = new Set(sets.flat().map((t) => t.name));
ok('sixty veterans between them use the whole pool', seen.size === Object.values(POOL).flat().length, [...seen]);
ok('every pooled thing has a sprite', Object.values(POOL).flat().every((n) => Array.isArray(SPRITES[n])));
ok('no sprite is wider than its slot allows (5 px, the mug is 4 + a handle)',
  Object.values(SPRITES).every((rows) => rows.every((r) => r.length <= 5)), SPRITES);

// ----------------------------------------------------------------- the canvas
// A stand-in context that records rectangles: what is checked is where they
// land relative to the desk, not how they look.
const rects = [];
const ctx = { fillStyle: '', fillRect(x, y, w, h) { rects.push({ x, y, w, h }); } };
drawTrinkets(ctx, 100, 50, [{ slot: 'monitor', name: 'duck' }]);
const low = Math.max(...rects.map((r) => r.y));
ok('a monitor thing stands on the monitor — its lowest pixel just above y-9', low === 50 - 10, low);
ok('and inside the monitor’s width', rects.every((r) => r.x >= 100 + 2 && r.x <= 100 + 18), rects.map((r) => r.x));
rects.length = 0;
drawTrinkets(ctx, 100, 50, [{ slot: 'left', name: 'cactus' }]);
ok('a left thing stands on the desk top — lowest pixel at y+1', Math.max(...rects.map((r) => r.y)) === 50 + 1);
ok('and at the left end, where the paper was', rects.every((r) => r.x >= 100 - 24 && r.x <= 100 - 14), rects.map((r) => r.x));
rects.length = 0;
drawTrinkets(ctx, 100, 50, [{ slot: 'right', name: 'trophy' }]);
ok('a right thing stays off the monitor, where the mug was', rects.every((r) => r.x >= 100 + 19 && r.x <= 100 + 23), rects.map((r) => r.x));
ok('nothing is drawn for a name without a sprite', (rects.length = 0, drawTrinkets(ctx, 0, 0, [{ slot: 'left', name: 'nope' }]), rects.length === 0));

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
