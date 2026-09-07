// node tools/test-kicker.mjs — the foosball table in the smoking spot, without a
// browser.
//
// The table is checked here rather than by eye, because the eye cannot catch it:
// an agent goes to play on a roll once every 25–70 seconds, and a frame finds
// either an empty table or a game already over. What is checked is exactly what
// decides the behaviour: a place at the table goes to two, a third sits down to
// smoke, and everyone returns to their desk by themselves once the game ends.
import { buildLayout, blocked } from '../web/layout.js';
import { syncActors, tickActors } from '../web/actors.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const mk = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, project: 'p' + (i % 2), name: 'a' + i, status: 'idle', artifacts: [], ...extra,
}));

const agents = mk(6);
const L = buildLayout(agents);
ok('there is a table in the layout', !!L.kicker && L.kicker.sides.length === 2, L.kicker);
ok('and he is standing in the smoking room, to the left of the sofa', L.kicker.x < L.lounge.x && Math.abs(L.kicker.y - L.lounge.y) < 20,
  [L.kicker.x, L.kicker.y, L.lounge.x, L.lounge.y]);
ok('you can\'t get through the table', blocked(L, L.kicker.x, L.kicker.y - 4), null);
ok('and on the side of it you can stand', !blocked(L, L.kicker.sides[0].x, L.kicker.sides[0].y),
  L.kicker.sides[0]);

const actors = new Map();
syncActors(actors, agents, L);
ok('all agents on site', actors.size === 6, actors.size);

// The "go and play" roll is a Math.random() < 0.45 inside a rare branch. We
// replace the generator with zero: then every "lucky?" check answers yes.
//
// This world cannot be looked at in one frame: a game ends, an agent goes back to
// his desk, the next one takes his place — and a snapshot finds now two, now one,
// now nobody. So the world runs on, and the stand looks not at the end but at
// everything that happened along the way: was there ever two at the table, and
// did three ever pile up. The first attempt checked the state on the last tick
// and passed every other time — precisely because it caught a random phase.
const realRandom = Math.random;
Math.random = () => 0;
let now = 0;
let sawPair = false, maxKicking = 0, sawWrongSeat = false, sawSitting = false, sawFacing = true;
const run = (ms) => {
  for (let i = 0; i < ms / 16; i++) {
    now += 16;
    tickActors(actors, agents, L, 1, now, () => {});
    const kicking = [...actors.values()].filter((a) => a.kicking);
    maxKicking = Math.max(maxKicking, kicking.length);
    if (new Set(kicking.map((a) => a.seatIdx)).size !== kicking.length) sawWrongSeat = true;
    const at = kicking.filter((a) => a.lounge && !a.path.length);
    if (at.length === 2) sawPair = true;
    for (const a of at) {
      if (a.state === 'sit') sawSitting = true;
      if (a.dir !== (L.kicker.x > a.x ? 1 : -1)) sawFacing = false;
    }
  }
};
run(600000);
Math.random = realRandom;

ok('in ten minutes the two met at the table', sawPair, sawPair);
ok('There are no three people at a table for two', maxKicking <= 2, maxKicking);
ok('and the two of them don’t stand on the same side', !sawWrongSeat, sawWrongSeat);
ok('standing at the table rather than sitting', !sawSitting, sawSitting);
ok('and look at the table', sawFacing, sawFacing);

// Coming back from a game is checked by a separate, non-random run. Taking an
// agent for that from the shared world above is not on: there are six of them
// there, the games overlap, and "who is at the table now" is a phase rather than
// a fact. The first version of the stand did exactly that and went red in seven
// runs out of twelve, without once catching a real fault in the office: it was
// catching a moment.
const solo = mk(1);
const Ls = buildLayout(solo);
const soloActors = new Map();
syncActors(soloActors, solo, Ls);
const act = [...soloActors.values()][0];
const home = { x: act.seat.x, y: act.seat.y };
act.nextIdea = 0;                       // do not wait for its minute, the kick is needed at once
Math.random = () => 0;
let ts = 0;
const until = (cond, ticks) => {
  for (let i = 0; i < ticks && !cond(); i++) { ts += 16; tickActors(soloActors, solo, Ls, 1, ts, () => {}); }
  return cond();
};
ok('the loner reached the table',
  until(() => act.kicking && act.lounge && !act.path.length, 60000),
  [act.kicking, act.lounge, act.path.length, Math.round(act.x), Math.round(act.y)]);
ok('and stood exactly on the side of the table',
  Math.abs(act.x - Ls.kicker.sides[act.seatIdx].x) < 2, [act.x, act.seatIdx]);
ok('the party\'s clock started with the arrival, not with the decision', act.playUntil > ts, [act.playUntil, ts]);

act.playUntil = ts - 1;                 // the game is over
ok('after the game the agent returned to his desk',
  until(() => !act.lounge && !act.path.length, 80000)
    && Math.hypot(act.x - home.x, act.y - home.y) < 3,
  [Math.round(act.x), Math.round(act.y), home]);
ok('and freed up space at the table', !act.kicking && act.seatIdx == null, [act.kicking, act.seatIdx]);
Math.random = realRandom;

// Whoever has run out of limit still gets the smoking spot, and the table does not get in his way.
const limited = mk(3, { limited: true });
const L2 = buildLayout(limited);
const actors2 = new Map();
syncActors(actors2, limited, L2);
let t2 = 0;
for (let i = 0; i < 8000; i++) { t2 += 16; tickActors(actors2, limited, L2, 1, t2, () => {}); }
const parked = [...actors2.values()].filter((a) => a.lounge && !a.path.length);
ok('all three with the limit ended reached the smoking room', parked.length === 3, parked.length);
ok('two stood at the table, the third sat on the sofa',
  parked.filter((a) => a.kicking).length === 2 && parked.filter((a) => !a.kicking && a.state === 'sit').length === 1,
  parked.map((a) => [a.id, a.kicking, a.state]));

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
