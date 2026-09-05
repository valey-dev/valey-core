// node tools/test-art.mjs — hanging the paintings: geometry and motifs, without a browser
import { buildLayout, WALL, WINDOW_START, WINDOW_STEP, WINDOW_W } from '../web/layout.js';
import { artOf, titleOf, motifOf } from '../web/paintings.js';

const agents = [];
const add = (project, n) => {
  for (let i = 0; i < n; i++) agents.push({ id: `${project}-${i}`, project, startedAt: 1000 + agents.length });
};
add('carbonara-restaurant', 12); add('budget-app', 7); add('shebis', 3);
add('activity-dashboard', 1); add('pingator', 2); add('iron-grip', 5);
add('AI valey', 2); add('AJIRA', 1);

const L = buildLayout(agents);
let failed = 0;
const bad = (msg) => { failed++; console.log('ПЛОХО |', msg); };
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x;

// ---- one painting per room, and it follows the project
for (const r of L.rooms) {
  const art = r.art || [];
  if (art.length > 1) bad(`${r.title}: картин ${art.length}, а должна быть одна`);
  for (const a of art) {
    if (a.y < r.y + 1 || a.y + a.h > r.y + WALL - 4) bad(`${r.title}: рама вылезает за стену`);
    if (a.x < r.x + 8 || a.x + a.w > r.x + r.w - 8) bad(`${r.title}: рама на боковой стене`);
    if (overlaps(a, { x: r.door.x - 3, w: r.door.w + 6 })) bad(`${r.title}: рама перекрыла дверь`);
    if (overlaps(a, { x: r.board.x - 3, w: r.board.w + 6 })) bad(`${r.title}: рама перекрыла доску`);
    if (a.egg) bad(`${r.title}: пасхалка попала в комнату, а должна висеть в коридоре`);
  }
  const kind = art.length ? artOf(art[0]).kind : '—';
  const t = art.length ? titleOf(art[0]).name : '—';
  console.log(`ok    | ${r.title}: ${art.length} шт · ${kind} · «${t}»`);
}

// ---- motifs are guessed from the project name
const themes = [
  ['carbonara-restaurant', 'food'], ['budget-app', 'money'], ['shebis', 'dog'],
  ['activity-dashboard', 'chart'], ['pingator', 'network'], ['iron-grip', 'muscle'],
  ['AI valey', 'valley'], ['figma-плагин', 'design'], ['неизвестный проект', null],
];
for (const [name, want] of themes) {
  const got = motifOf(name);
  if (got !== want) bad(`тема для «${name}» → ${got}, ждали ${want}`);
  else console.log(`ok    | тема «${name}» → ${got}`);
}

// ---- rare in the corridor, and easter eggs only
const halls = L.wallArt || [];
const windows = [];
for (let wx = WINDOW_START; wx < L.w - 80; wx += WINDOW_STEP) windows.push({ x: wx - 4, w: WINDOW_W });
const piersTotal = windows.length + 1;
if (!halls.length) bad('в коридоре ни одной картины');
if (halls.length > Math.ceil(piersTotal / 2)) {
  bad(`в коридоре ${halls.length} картин на ${piersTotal} простенков — слишком часто`);
}
for (const a of halls) {
  if (!a.egg) bad('картина в коридоре не помечена как пасхалка');
  if (a.y < 2 || a.y + a.h > 32) bad(`коридор: рама вылезла из наружной стены (y=${a.y})`);
  for (const w of windows) if (overlaps(a, w)) bad(`коридор: рама на окне (x=${a.x})`);
}
console.log(`ok    | коридор: ${halls.length} картин на ${piersTotal} простенков`);
for (const a of halls) console.log(`      | пасхалка: ${artOf(a).kind} · «${titleOf(a).name}»`);

// ---- the same seed gives the same painting
const one = L.rooms[0].art[0];
if (one && artOf(one).kind !== artOf(one).kind) bad('картина нестабильна между вызовами');
else console.log('ok    | картина стабильна между вызовами');

const total = L.rooms.reduce((n, r) => n + (r.art || []).length, 0) + halls.length;
console.log(`\nвсего картин на этаже: ${total} (комнат ${L.rooms.length})`);
console.log(failed ? `провалено: ${failed}` : 'всё хорошо');
process.exit(failed ? 1 : 0);
