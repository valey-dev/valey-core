// node tools/test-kitchen.mjs — the kitchen corner leaves the last desk alone.
//
// Until 13 September 2026 the microwave stood on a shelf right under the last
// desk of the right column, with the coffee machine beside it. Measured with
// the office's own blocked(): 64 points out of 200 were free in the band under
// that desk, and the spot just under it could not be reached from the door at
// all — the owner had to wriggle through a gap to get to the desk. The corner
// moved to the bottom wall (frame: Prod «Офис · кухонный угол у нижней стены»,
// node 2122:6225).
//
// Walking is checked the way a person walks: a flood from the room's door over
// the points blocked() lets through, so "free" also means "you can get there".
import { buildLayout, blocked } from '../web/layout.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const roomOf = (key, n) => {
  const agents = Array.from({ length: n }, (_, i) => ({ id: key + i, project: key, seat: i, name: 'a' + i }));
  const L = buildLayout(agents);
  return { L, r: L.rooms.find((x) => x.key === key) };
};

// every point of the room reachable from its door, four-connected
function reach(L, r) {
  const seen = new Set();
  const stack = [[Math.round(r.doorPoint.x), Math.round(r.doorPoint.y)]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const k = x + ',' + y;
    if (seen.has(k) || x < r.x - 2 || x > r.x + r.w + 2 || y < r.y || y > r.y + r.h + 2 || blocked(L, x, y)) continue;
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return (x, y) => seen.has(Math.round(x) + ',' + Math.round(y));
}

// Rooms with every back-door side the hash can give, and one and two rows of
// desks, full and not: the corner has to behave in all of them.
const cases = [];
const sides = new Set();
for (let i = 0; i < 200 && cases.length < 12; i++) {
  for (const n of [3, 5, 6]) {
    const { L, r } = roomOf('kitchen' + i, n);
    const tag = r.back.side + ' ' + n;
    if (cases.some((c) => c.tag === tag)) continue;
    cases.push({ tag, L, r });
    sides.add(r.back.side);
  }
}
ok('the rooms cover every back-door side', sides.size === 3, [...sides]);

for (const { tag, L, r } of cases) {
  const can = reach(L, r);
  // the right column of the last row that has one — the desk the corner stood under
  const right = r.desks.filter((d) => d.x === Math.max(...r.desks.map((e) => e.x)));
  const d = right[right.length - 1];
  let free = 0, all = 0;
  for (let x = d.x - 24; x <= d.x + 24; x += 2) {
    for (let y = d.y + 22; y <= d.y + 36; y += 2) { all++; if (!blocked(L, x, y)) free++; }
  }
  ok(`${tag}: the floor under the right desk of the last row is free`, free === all, `${free}/${all}`);
  ok(`${tag}: and the spot under it is reached from the door`, can(d.x, d.y + 30), [d.x, d.y + 30]);

  // Nobody stands in front of the window: the shelf existed because a person on
  // the floor in front of the microwave covered it.
  const m = r.micro;
  const front = [];
  for (let x = m.x - 14; x <= m.x + 14; x += 2) for (let y = m.y - 20; y <= r.y + r.h; y++) if (!blocked(L, x, y)) front.push([x, y]);
  ok(`${tag}: there is no floor in front of the microwave`, front.length === 0, front.slice(0, 3));

  ok(`${tag}: the microwave is reached from above`, can(m.x, m.y - 28), [m.x, m.y - 28]);
  ok(`${tag}: the coffee machine from its left`, can(r.coffee.x - 18, r.coffee.y - 10));
  // actors.js sends agents there for coffee
  ok(`${tag}: and the agents' coffee spot is on the floor`, can(r.coffee.x - 22, r.coffee.y - 6));

  const b = r.back;
  const through = b.side === 'bottom' ? [b.x + b.w / 2, b.y + 4] : b.side === 'left' ? [b.x + 4, b.y + b.h / 2] : [b.x + 4, b.y + b.h / 2];
  ok(`${tag}: the back door is still reached`, can(...through), b);
}

if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');
