// node tools/test-garden.mjs — the greenhouse: does a pot dry out, and what
// counts as watering. The clock is a number here, so "a day has passed" is
// checked instantly rather than in a day.
import { potState, water, tally, HOUR, DRY_AFTER, REWATER, BLOOM_AT, CAN_FULL, EMPTY } from '../web/garden.js';

let failed = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { failed++; console.log('FAIL  |', name, '→', got); }
};

const T0 = 1_700_000_000_000;

// ---- an empty pot is dry, and that is the starting state rather than an error
ok('a pot without a story - dry', potState(undefined, T0) === 'dry', potState(undefined, T0));
ok('EMPTY is also dry', potState(EMPTY, T0) === 'dry', potState(EMPTY, T0));

// ---- watering and drying out
const justWatered = water(undefined, T0);
ok('watered - watered', potState(justWatered, T0) === 'wet', potState(justWatered, T0));
ok('17 hours later still watered', potState(justWatered, T0 + 17 * HOUR) === 'wet');
ok('after 19 hours already dry', potState(justWatered, T0 + 19 * HOUR) === 'dry');
ok('still holding exactly on the border', potState(justWatered, T0 + DRY_AFTER) === 'wet');

// ---- counting days: three in a row bring a bloom
let p = water(undefined, T0);
ok('first watering - count 1', p.streak === 1, p.streak);
p = water(p, T0 + 10 * HOUR);
ok('the second in ten hours - score 2', p.streak === 2, p.streak);
ok('but not yet blooming', potState(p, T0 + 10 * HOUR) === 'wet', potState(p, T0 + 10 * HOUR));
p = water(p, T0 + 20 * HOUR);
ok('third - count 3', p.streak === BLOOM_AT, p.streak);
ok('and now it\'s blooming', potState(p, T0 + 20 * HOUR) === 'bloom', potState(p, T0 + 20 * HOUR));

// ---- the bloom holds while it is watered, and ends with the drought
ok('blooms after 17 hours', potState(p, T0 + 37 * HOUR) === 'bloom');
ok('dried out - flowering has ended', potState(p, T0 + 40 * HOUR) === 'dry');
const after = water(p, T0 + 40 * HOUR);
ok('after a drought, the count begins again', after.streak === 1, after.streak);

// ---- "three presses in a minute" do not count as three days
let spam = water(undefined, T0);
for (let i = 1; i <= 5; i++) spam = water(spam, T0 + i * 1000);
ok('five waterings in a row - the score is still 1', spam.streak === 1, spam.streak);
ok('and there is no flowering', potState(spam, T0 + 6000) === 'wet', potState(spam, T0 + 6000));
// but the pot did take the water: the time of the last watering moved
ok('watering time updated', spam.wateredAt === T0 + 5000, spam.wateredAt);

// ---- the "time to water" line
const due = water(water(undefined, T0), T0 + REWATER);
ok('in exactly eight hours the day is over', due.streak === 2, due.streak);
const early = water(water(undefined, T0), T0 + REWATER - 1000);
ok('one second before - not counted', early.streak === 1, early.streak);

// ---- the sign above the door
const pots = [{ i: 0 }, { i: 1 }, { i: 2 }];
const g = { pots: { 0: water(undefined, T0), 1: water(undefined, T0 - 40 * HOUR) } };
const t = tally(g, pots, T0);
ok('watered 1 of 3', t.wet === 1 && t.total === 3, JSON.stringify(t));
ok('empty garden - zero out of three', tally(null, pots, T0).wet === 0);

ok('There are four waterings in the watering can', CAN_FULL === 4, CAN_FULL);

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
