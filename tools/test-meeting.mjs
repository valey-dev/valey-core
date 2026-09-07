// node tools/test-meeting.mjs — the meeting room on the service tier.
// It checks the code against the approved plan 400:2 in numbers: the plan is
// drawn at ×3, so everything visible on the frame divides by three and must
// match here. Walkability is checked separately: a wall drawn somewhere other
// than where blocked() sees it looks right and does not let you through — which
// is exactly the failure the eye does not catch.
import { buildLayout, blocked, roomAt, WALL } from '../web/layout.js';

const mk = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, project: 'p' + i, name: 'a' + i, status: 'idle',
}));

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const L = buildLayout(mk(6));
const m = L.meeting, s = L.security;

// ------------------------------------------------------------- the geometry
ok('room 360×138, as on the plan', m.w === 360 && m.h === 138, { w: m.w, h: m.h });
ok('26 pixel wall - the same as everyone else\'s', WALL === 26, WALL);
ok('door on x+34, width 36, like design rooms',
  m.door.x - m.x === 34 && m.door.w === 36, { dx: m.door.x - m.x, w: m.door.w });
ok('table 180×44 in the middle', m.table.w === 180 && m.table.h === 44, m.table);
ok('the table is located WALL+34 from the top of the room',
  m.table.y - m.y === WALL + 34, m.table.y - m.y);
ok('six chairs', m.seats.length === 6, m.seats.length);
ok('seven glass sections', m.glass.length === 7, m.glass.length);
ok('glass doesn\'t fit on the door',
  m.glass.every((g) => g.x + g.w <= m.door.x || g.x >= m.door.x + m.door.w),
  m.glass.map((g) => [g.x - m.x, g.w]));

// ------------------------------------------------------------- where it stands
ok('on the same level as the control room', m.y === s.y && m.h === s.h, { m: m.y, s: s.y });
ok('to the right of the control room and does not run into it', m.x >= s.x + s.w, { m: m.x, s: s.x + s.w });
ok('doesn\'t go off the floor', m.x + m.w <= L.w, { r: m.x + m.w, w: L.w });
ok('does not fit under the elevator shaft', m.x + m.w < L.lift.x, { r: m.x + m.w, lift: L.lift.x });
// The far right passage is the only way from the tier to the lift around the
// room. L.w will not do here: that is the width of the world including the
// shaft, and a point inside it runs into the lift rather than the meeting room.
const lane = L.lanes[L.lanes.length - 1];
ok('the outermost passage remained to the right of the room', lane > m.x + m.w, { lane, r: m.x + m.w });
ok('and you can walk along it', !blocked(L, lane, m.y + m.h / 2), { lane });

// ------------------------------------------------------------- the service room
ok('lies in the rooms', L.rooms.includes(m), L.rooms.length);
ok('but not in projectRooms', !L.projectRooms.includes(m), L.projectRooms.length);
ok('and does not take up a project slot', L.projectRooms.length === 6, L.projectRooms.length);
ok('in the elevator car the tier shows both rooms',
  L.lift.floors.some((f) => f.tier && f.rooms.length === 2 && f.rooms.includes(m.title)),
  L.lift.floors.filter((f) => f.tier).map((f) => f.rooms));
ok('and this is the first floor, not the basement',
  L.lift.floors.some((f) => f.tier && f.n === 1), L.lift.floors.map((f) => f.n));

// ------------------------------------------------------------- walkability
const inside = { x: m.x + m.w / 2, y: m.y + m.h - 20 };
ok('inside the room - this is it', roomAt(L, inside.x, inside.y) === m,
  roomAt(L, inside.x, inside.y) && roomAt(L, inside.x, inside.y).title);
ok('pass through the doorway',
  !blocked(L, m.door.x + m.door.w / 2, m.y + WALL - 2), null);
ok('through the wall next to the door - no',
  blocked(L, m.door.x - 8, m.y + WALL - 2), null);
ok('the left wall doesn\'t let me in', blocked(L, m.x + 3, m.y + m.h / 2), null);
ok('the right wall doesn\'t let me in', blocked(L, m.x + m.w - 3, m.y + m.h / 2), null);
ok('the bottom wall doesn\'t let me in', blocked(L, m.x + m.w / 2, m.y + m.h - 4), null);
ok('the table is furniture, you can’t go through it',
  blocked(L, m.table.x + m.table.w / 2, m.table.y + m.table.h / 2), null);
ok('and the chairs are pass-through, otherwise you won’t be able to approach the table',
  m.seats.every((q) => !blocked(L, q.x + 10, q.y + 7)),
  m.seats.filter((q) => blocked(L, q.x + 10, q.y + 7)).length);
ok('there is room to stand in front of the table', !blocked(L, m.spot.x, m.spot.y), m.spot);
ok('There is no reader at the door - everyone is welcome here', m.reader === undefined, m.reader);

// ------------------------------------------------------------- the smoking spot
// The dotted outline on frame 401:2 gives it 360×138 at x = MARGIN, to the left
// of the control room. There are no walls there: the place is checked, not a
// room.
const lo = L.lounge;
const spot = { x: 44, y: m.y, w: 360, h: 138 };
const inSpot = (q) => q.x >= spot.x && q.x <= spot.x + spot.w && q.y >= spot.y && q.y <= spot.y + spot.h;
ok('the smoking room is on the service level', lo.y >= m.y && lo.y <= m.y + m.h, { lo: lo.y, tier: m.y });
ok('and inside the dotted space', inSpot(lo), lo);
ok('all the seats on the sofa are also inside', lo.seats.every(inSpot), lo.seats.filter((q) => !inSpot(q)));
ok('the smoking room does not run into the control room', lo.x + 80 < s.x, { lo: lo.x, s: s.x });
ok('the leftmost passage to it is clear',
  !blocked(L, L.lanes[0], lo.y), { lane: L.lanes[0] });
ok('and from the aisle to the sofa you can walk in a straight line',
  !blocked(L, (L.lanes[0] + lo.x) / 2 - 60, lo.y), null);

// ---------------------------------------------------- the tier grows with the office
const sizes = [1, 3, 7, 9].map((n) => {
  const X = buildLayout(mk(n));
  return { n, dy: X.meeting.y - X.security.y, dx: X.meeting.x - X.security.x };
});
ok('the meeting room is held by the control panel for any office size',
  sizes.every((z) => z.dy === sizes[0].dy && z.dx === sizes[0].dx), sizes);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
