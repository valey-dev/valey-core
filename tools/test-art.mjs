// node tools/test-art.mjs — hanging the paintings: geometry and motifs, without a browser
import { buildLayout, WALL, WINDOW_START, WINDOW_STEP, WINDOW_W } from '../web/layout.js';
import { artOf, titleOf, motifOf } from '../web/paintings.js';

const agents = [];
const add = (project, n) => {
  for (let i = 0; i < n; i++) agents.push({ id: `${project}-${i}`, project, startedAt: 1000 + agents.length });
};
add('marmalade-kitchen', 12); add('wallet-app', 7); add('kennel', 3);
add('orbit-dashboard', 1); add('pingwatch', 2); add('gym-planner', 5);
add('AI valey', 2); add('TALOS', 1);

const L = buildLayout(agents);
let failed = 0;
const bad = (msg) => { failed++; console.log('FAIL  |', msg); };
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x;

// ---- one painting per room, and it follows the project
for (const r of L.rooms) {
  const art = r.art || [];
  if (art.length > 1) bad(`${r.title}: paintings ${art.length}, but there should be one`);
  for (const a of art) {
    if (a.y < r.y + 1 || a.y + a.h > r.y + WALL - 4) bad(`${r.title}: frame extends beyond the wall`);
    if (a.x < r.x + 8 || a.x + a.w > r.x + r.w - 8) bad(`${r.title}: side wall frame`);
    if (overlaps(a, { x: r.door.x - 3, w: r.door.w + 6 })) bad(`${r.title}: frame blocked the door`);
    if (overlaps(a, { x: r.board.x - 3, w: r.board.w + 6 })) bad(`${r.title}: frame overlaps board`);
    if (a.egg) bad(`${r.title}: Easter egg got into the room, but should be hanging in the corridor`);
  }
  const kind = art.length ? artOf(art[0]).kind : '—';
  const t = art.length ? titleOf(art[0]).name : '—';
  console.log(`ok    | ${r.title}: ${art.length} item(s) · ${kind} · “${t}”`);
}

// ---- motifs are guessed from the project name
const themes = [
  ['marmalade-kitchen', 'food'], ['wallet-app', 'money'], ['kennel', 'dog'],
  ['orbit-dashboard', 'chart'], ['pingwatch', 'network'], ['gym-planner', 'muscle'],
  ['AI valey', 'valley'], ['figma-плагин', 'design'], ['неизвестный проект', null],
];
for (const [name, want] of themes) {
  const got = motifOf(name);
  if (got !== want) bad(`topic for “${name}” → ${got}, waiting for ${want}`);
  else console.log(`ok    | theme “${name}” → ${got}`);
}

// ---- rare in the corridor, and easter eggs only
const halls = L.wallArt || [];
const windows = [];
for (let wx = WINDOW_START; wx < L.w - 80; wx += WINDOW_STEP) windows.push({ x: wx - 4, w: WINDOW_W });
const piersTotal = windows.length + 1;
if (!halls.length) bad('not a single painting in the corridor');
if (halls.length > Math.ceil(piersTotal / 2)) {
  bad(`in the corridor there are ${halls.length} paintings on ${piersTotal} walls - too often`);
}
for (const a of halls) {
  if (!a.egg) bad('the picture in the hallway is not marked as an easter egg');
  if (a.y < 2 || a.y + a.h > 32) bad(`corridor: frame came out of the outer wall (y=${a.y})`);
  for (const w of windows) if (overlaps(a, w)) bad(`corridor: window frame (x=${a.x})`);
}
console.log(`ok    | corridor: ${halls.length} painting(s) across ${piersTotal} wall section(s)`);
for (const a of halls) console.log(`      | easter egg: ${artOf(a).kind} · “${titleOf(a).name}”`);

// ---- the same seed gives the same painting
const one = L.rooms[0].art[0];
if (one && artOf(one).kind !== artOf(one).kind) bad('the picture is unstable between calls');
else console.log('ok    | the painting is stable across calls');

const total = L.rooms.reduce((n, r) => n + (r.art || []).length, 0) + halls.length;
console.log(`\ntotal paintings on the floor: ${total} (${L.rooms.length} rooms)`);
console.log(failed ? `failed: ${failed}` : 'all good');
process.exit(failed ? 1 : 0);
