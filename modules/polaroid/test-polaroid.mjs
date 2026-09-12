// node modules/polaroid/test-polaroid.mjs — where the polaroid's table stands,
// and when it calls you back.
//
// The floor is a real one, from buildLayout, and the obstacle check is the
// core's own blocked(): the table's spot was chosen in a gap 31 office pixels
// wide between the kicker and the sofa, with a kicker player's place on one side
// and an armrest on the other, and v1 of the frame had already put it where the
// hookah and two smokers stand. Arithmetic against a stand-in floor would not
// catch the next such move; the real floor does.
import { buildLayout, blocked } from '../../web/layout.js';
import { placeFor, tableProp, freed, TABLE } from './polaroid.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 'a' + i, project: 'p' + i, name: 'a' + i, status: 'idle' }));

for (const n of [1, 3, 7]) {
  const L = buildLayout(mk(n));
  const place = placeFor(L);
  ok(`${n} projects: there is a place for the polaroid`, !!place, place);
  if (!place) continue;
  const lo = L.lounge, k = L.kicker;
  const t = place.table;
  const half = TABLE.w / 2;

  // Between the kicker and the sofa, touching neither.
  ok(`${n}: the table is right of the kicker`, t.x - half > k.x + 22, { table: t.x, kickerRight: k.x + 22 });
  ok(`${n}: and left of the sofa's armrest`, t.x + half < lo.x - 29, { table: t.x, armrest: lo.x - 29 });
  // The kicker's right-hand player stands clear of it — measured with the
  // table in the props, the way the office will walk.
  const withTable = { ...L, props: [...L.props, tableProp(place)] };
  const right = k.sides.reduce((a, s) => (s.x > a.x ? s : a));
  ok(`${n}: a kicker player still has his place`, !blocked(withTable, right.x, right.y), right);
  // You can stand in front of it, and the table itself is an obstacle.
  ok(`${n}: the point in front of the table is walkable`, !blocked(withTable, place.out.x, place.out.y), place.out);
  ok(`${n}: the table is an obstacle`, blocked(withTable, t.x, t.y - 4) && !blocked(L, t.x, t.y - 4), t);
  // The seat is the sofa's left place, nearest the table.
  ok(`${n}: you sit on the sofa's left place`, place.seat.x === Math.min(...lo.seats.slice(0, 3).map((s) => s.x)), place.seat);
  // Within the core's reach: nearest() takes targets closer than 40.
  ok(`${n}: the seat is close enough to the table to get up in front of it`, Math.hypot(place.seat.x - place.out.x, place.seat.y - place.out.y) < 40, place);
  // Nothing of the lounge is under it.
  const clash = L.props.filter((p) => p.kind !== 'bearrug' && Math.abs(p.x - t.x) < half + (p.w || 16) / 2 && Math.abs(p.y - t.y) < 12);
  ok(`${n}: no other prop under the table`, clash.length === 0, clash.map((p) => p.kind));
}

ok('no lounge — no polaroid, rather than a guess', placeFor({}) === null && placeFor(null) === null);

// Calling back: the same transition the core toasts on.
const seen = new Map();
ok('the first snapshot calls nobody', freed(seen, [{ id: 'g', status: 'awaiting' }, { id: 'k', status: 'working' }]).length === 0);
ok('working → awaiting calls', freed(seen, [{ id: 'g', status: 'awaiting' }, { id: 'k', status: 'awaiting' }]).map((a) => a.id).join() === 'k');
ok('and only once', freed(seen, [{ id: 'k', status: 'awaiting' }]).length === 0);
ok('idle → awaiting does not', freed(seen, [{ id: 'z', status: 'idle' }]).length === 0 && freed(seen, [{ id: 'z', status: 'awaiting' }]).length === 0);

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
