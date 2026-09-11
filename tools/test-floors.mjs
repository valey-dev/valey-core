// node tools/test-floors.mjs — floors and relative places, without a browser.
//
// What is checked is what breaks silently and is discovered by somebody else's
// commit: the office grows by rows, and the direction of growth decides whether
// the floors are renamed under people's feet and whether the service tier slides
// out from under those standing on it. Rows are laid on top, row 0 stays at the
// bottom, and a floor number is taken from its row.
import { buildLayout, anchorOf, applyAnchor } from '../web/layout.js';

const mk = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, project: 'p' + i, name: 'a' + i, status: 'idle',
}));

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// ------------------------------------------------------------------ the floors
// A floor number belongs to a row, and a row to a project's slot. While the
// project lives, its floor keeps the same name however many neighbours move in
// above it.
const floorOfRoom = (L, key) => {
  const r = L.projectRooms.find((x) => x.key === key);
  const band = L.lift.floors.find((f) => !f.basement && f.rooms.includes(r.title));
  return band ? band.n : null;
};

const seen = new Map();
let stable = true;
const drift = [];
for (const n of [3, 6, 7, 9, 10, 12]) {
  const L = buildLayout(mk(n));
  for (const r of L.projectRooms) {
    const f = floorOfRoom(L, r.key);
    if (seen.has(r.key) && seen.get(r.key) !== f) {
      stable = false;
      drift.push(`${r.key}: ${seen.get(r.key)} → ${f} при ${n} проектах`);
    }
    seen.set(r.key, f);
  }
}
ok('the project floor does not change when the office grows', stable, drift);

const L = buildLayout(mk(10));
const lowest = Math.max(...L.projectRooms.map((r) => r.y));
ok('the first three projects are in the bottom row',
  ['p0', 'p1', 'p2'].every((k) => L.projectRooms.find((r) => r.key === k).y === lowest),
  L.projectRooms.map((r) => [r.key, r.y]));
ok('service level below all rooms', L.security.y > lowest, [L.security.y, lowest]);
// The first floor is the service tier rather than the bottom row of projects.
// It became so on 30 August 2026, when the meeting room appeared on the tier: it
// read as a basement while all that was down there was a control room reachable
// by a card, which nobody needed to ride to.
ok('first floor - service level',
  L.lift.floors.some((f) => f.n === 1 && f.tier && f.rooms.includes('MEETING ROOM')),
  L.lift.floors.map((f) => [f.n, f.rooms]));
ok('bottom row of projects - floor 2',
  L.lift.floors.some((f) => f.n === 2 && f.rooms.includes('p0')),
  L.lift.floors.map((f) => [f.n, f.rooms]));
// The roof with the greenhouse is the top floor, and the largest number too.
// There used to be a literal five here: with the roof tier there is one floor
// more, and a hard number checked the old world rather than the rule.
ok('the top floor is a roof with a greenhouse',
  L.lift.floors[0].n === Math.max(...L.lift.floors.map((f) => f.n))
  && L.lift.floors[0].rooms.includes('GREENHOUSE'),
  L.lift.floors.map((f) => [f.n, f.rooms]));
ok('there is no more basement', !L.lift.floors.some((f) => f.basement), null);
ok('numbers are in a row without holes',
  L.lift.floors.map((f) => f.n).sort((a, b) => a - b).every((n, i) => n === i + 1),
  L.lift.floors.map((f) => f.n));
// There are no projects on the tier, and the place the formula puts the desk in
// is taken by the meeting room — and on the approved frame 401:2 there is no desk
// there.
ok('There is no secretary desk on the service level',
  !L.lift.reception.some((r) => r.n === 1), L.lift.reception.map((r) => r.n));

// Whoever comes in starts at the bottom, by the lift, not under the roof: the
// rooms are handed out in slot order rather than in drawing order.
ok('default entrance is to the room of the first slot',
  L.projectRooms[0].key === 'p0' && L.projectRooms[0].y === lowest,
  [L.projectRooms[0].key, L.projectRooms[0].y]);
ok('the cabin is located on floor 1, that is, at the entrance',
  L.lift.floors.find((f) => f.n === 1) !== undefined, null);

// -------------------------------------------------- relative places
// The plan is rebuilt whole and the rooms take new places. The person did not go
// anywhere meanwhile, and has to stay where they stood — in their own room.
const before = buildLayout(mk(6));
const room = before.projectRooms.find((r) => r.key === 'p0');
const p = { x: room.x + 40, y: room.y + 90 };
const a = anchorOf(before, p);
const after = buildLayout(mk(7));
const moved = { ...p };
applyAnchor(after, moved, a);
const room2 = after.projectRooms.find((r) => r.key === 'p0');
ok('an anchor kept a man in his room',
  moved.x === room2.x + 40 && moved.y === room2.y + 90,
  [moved, { x: room2.x, y: room2.y }]);
ok('and without an anchor he would have left', p.y !== moved.y, [p.y, moved.y]);

// In the corridor a person stands in no room, but the corridor moves along with
// its row — holding on to the nearest room there is exactly right.
const hall = { x: room.x + 20, y: room.y - 40 };
const ha = anchorOf(before, hall);
ok('in the corridor the anchor clings to the next room', ha && ha.key === 'p0', ha);

// The very case the anchor counts the corridor as part of its own floor for. A
// fourth agent appears in a project on the top row, the row grows taller, and the
// rows below shift by a different amount than it does. The person stands in the
// corridor of the BOTTOM row: if they held on to the nearest room in a straight
// line above, they would be carried out of their own corridor.
{
  const many = (extra) => [
    ...mk(6),
    ...Array.from({ length: extra }, (_, i) => ({
      id: 'x' + i, project: 'p3', name: 'x' + i, status: 'idle',
    })),
  ];
  const was = buildLayout(many(0));
  const r0 = was.projectRooms.find((r) => r.key === 'p0');
  const stood = { x: r0.x + 20, y: r0.y - 40 };          // the corridor of its own floor
  const an = anchorOf(was, stood);
  const now = buildLayout(many(3));                       // the top row has grown
  const w0 = now.projectRooms.find((r) => r.key === 'p0');
  const w3 = now.projectRooms.find((r) => r.key === 'p3');
  ok('the growing row on top moves the bottom row differently than itself',
    (w3.y - was.projectRooms.find((r) => r.key === 'p3').y) !== (w0.y - r0.y),
    [w3.y, w0.y]);
  const p2 = { ...stood };
  applyAnchor(now, p2, an);
  ok('the man remained in the corridor of his floor',
    an.key === 'p0' && p2.y === w0.y - 40, [an.key, p2.y, w0.y]);
}

// The control room is a room too, and the anchor holds in it the same way.
const sec = { x: before.security.x + 30, y: before.security.y + 60 };
const sa = anchorOf(before, sec);
const secMoved = { ...sec };
applyAnchor(after, secMoved, sa);
ok('on the service tier the anchor also holds',
  sa.key === '__security' && secMoved.y === after.security.y + 60,
  [sa, secMoved.y, after.security.y]);

// The project ended while the plan was being rebuilt: leaving them where they are
// beats flinging them into the corner of the floor by a key that no longer exists.
const gone = { x: 1, y: 2 };
ok('a missing project leaves a person in place',
  applyAnchor(after, gone, { key: 'нет такого', dx: 0, dy: 0 }) === false
  && gone.x === 1 && gone.y === 2, gone);
ok('an empty anchor moves no one',
  applyAnchor(after, gone, null) === false && gone.x === 1, gone);

// ------------------------------------------------------- the language switcher
// The figure stands where a person walks in: the corridor above the first
// slot's room, which is where the spawn puts them. With seven projects there are
// three rows, and until 11 September 2026 it stood in the top one.
for (const n of [3, 7]) {
  const L = buildLayout(mk(n));
  const lang = L.props.find((p) => p.kind === 'lang');
  const door = L.projectRooms[0];
  const band = L.bands.find((b) => !b.roof && lang && lang.y >= b.y && lang.y <= b.y + b.h + 8);
  ok(`with ${n} projects the switcher is in the entrance corridor`,
    band && door.y - band.y - band.h >= 0 && door.y - band.y - band.h < 20,
    lang && [lang.y, band && band.y, door.y]);
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
