// The conservatory: what has become of a pot and what watering does. A module of
// its own precisely because all of this is time, and time cannot be waited out in
// a test: the clock arrives here as a number, and "a day has passed" is written
// in one line.
//
// There is one rule and it is honest: the state of a pot is the time since the
// last watering, and nothing else. No points and no progress.
//
// The approved frames — Prod, section «16 · Оранжерея на крыше»:
// https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=940-2

export const HOUR = 3600e3;
// It dries out in eighteen hours: come in the morning and yesterday's watering
// is still there; stay away a day and come back to drooping leaves.
export const DRY_AFTER = 18 * HOUR;
// Watering what has just been watered is allowed, but it does not count as a
// second day. Otherwise "three days in a row" is filled in by three presses
// within a minute, and blooming stops meaning anything.
export const REWATER = 8 * HOUR;
export const BLOOM_AT = 3;
export const CAN_FULL = 4;

export const EMPTY = { wateredAt: 0, streak: 0 };

// dry — leaves down, wet — watered, bloom — in flower. The blooming holds as
// long as the pot is not forgotten: dried out, and it ends together with the count.
export function potState(pot, now) {
  const p = pot || EMPTY;
  if (!p.wateredAt || now - p.wateredAt > DRY_AFTER) return 'dry';
  return (p.streak || 0) >= BLOOM_AT ? 'bloom' : 'wet';
}

// Watering. Three cases, and they differ:
//   dried out    — the count starts over;
//   just watered — the water was taken, but the day is not counted;
//   due          — counted.
export function water(pot, now) {
  const p = pot || EMPTY;
  const age = p.wateredAt ? now - p.wateredAt : Infinity;
  if (age > DRY_AFTER) return { wateredAt: now, streak: 1 };
  if (age < REWATER) return { wateredAt: now, streak: p.streak || 0 };
  return { wateredAt: now, streak: (p.streak || 0) + 1 };
}

// The garden as a whole: how many watered out of how many — that is the second line of the plaque.
export function tally(garden, pots, now) {
  const g = (garden && garden.pots) || {};
  let wet = 0;
  for (const p of pots) if (potState(g[p.i], now) !== 'dry') wet++;
  return { wet, total: pots.length };
}
