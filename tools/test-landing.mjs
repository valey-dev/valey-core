// node tools/test-landing.mjs — the landing page's demo floor stands on the real office.
//
// Until 30 August 2026 the landing had an engine of its own, drawn "after the
// motifs", and in it the player got stuck in the doorways: an opening of 18, a
// box of 8, a passage window of 10, and collisions resolved per axis separately
// jammed dead on a diagonal. The engine was torn out and the demo seated on
// buildLayout/blocked from web/ — the same ones the application walks with.
//
// What is checked here is not the drawing but the two conditions on which the
// demo makes any sense at all: every invented agent got a desk, and the point
// where the player is placed is passable. The second is the direct heir of that
// very bug: seating a person in a wall means greeting a visitor with "I am stuck".
import { AGENTS, BOARD } from '../web/landing.js';
import { buildLayout, blocked, WALL } from '../web/layout.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const L = buildLayout(AGENTS);

ok('этаж построился', !!L && Array.isArray(L.rooms) && L.rooms.length > 0, L && L.rooms && L.rooms.length);
// Only the project rooms are counted: the control room and the meeting room lie
// in L.rooms too and are marked service. The first version of this check compared
// against the whole length of the list and fell over on a merge with main, when
// the meeting room appeared in the office — that is, it saw exactly what it was
// written for.
const projectRooms = L.rooms.filter((r) => !r.service);
ok('комнат столько же, сколько проектов',
  projectRooms.length === new Set(AGENTS.map((a) => a.project)).size,
  { комнат: projectRooms.length, проектов: new Set(AGENTS.map((a) => a.project)).size });
ok('служебные комнаты на месте', L.rooms.some((r) => r.draw === 'security') && L.rooms.some((r) => r.draw === 'meeting'),
  L.rooms.filter((r) => r.service).map((r) => r.key));

// a desk each, or somebody is sitting in mid-air
const seated = new Map();
for (const r of L.rooms) {
  r.agents.forEach((id, i) => { if (r.desks[i]) seated.set(id, { room: r.key, desk: i }); });
}
ok('у каждого агента есть стол', AGENTS.every((a) => seated.has(a.id)),
  AGENTS.filter((a) => !seated.has(a.id)).map((a) => a.id));

// the control room — the one the page has its own section about
// the player's spawn point: landing.js counts it as the first desk + 44 down
const first = L.rooms[0];
const seat0 = first.desks[0];
const start = { x: seat0.x, y: seat0.y + 44 };
ok('игрок появляется не в стене', !blocked(L, start.x, start.y), start);

// and can take a step in any direction — otherwise he is "stuck" at the start already
const step = 4;
const dirs = [[step, 0], [-step, 0], [0, step], [0, -step]];
const free = dirs.filter(([dx, dy]) => !blocked(L, start.x + dx, start.y + dy));
ok('со старта есть куда шагнуть', free.length >= 2, { свободно: free.length });

// The room has a passable door. The two previous versions of this check fell not
// on the floor but on my idea of it: first I went straight down from the desk
// (the door stands elsewhere in the wall), then I felt along the bottom wall —
// while the main door in the office is cut into the TOP one, `r.door`, and leads
// into the corridor above the room. The back door, meanwhile, can turn out to be
// on the left or on the right.
for (const r of projectRooms) {
  const cx = r.door.x + r.door.w / 2;
  const снаружи = !blocked(L, cx, r.y - 6);
  const вПроёме = !blocked(L, cx, r.y + 4);
  const внутри = !blocked(L, cx, r.y + WALL + 6);
  ok('в комнату ' + r.key + ' можно войти с коридора', снаружи && вПроёме && внутри,
    { снаружи, вПроёме, внутри });

  // the jamb next to the opening has to be a wall, or the "door" is a hole across the whole wall
  const косяк = blocked(L, r.door.x - 8, r.y + 4);
  ok('у двери ' + r.key + ' есть косяк', косяк, { косяк });
}

// The numbers in the HUD are not a caption to a picture but a promise: the same
// numbers are trusted by the heading of the "why" section ("Eight sessions. Three
// are waiting for an answer"). Until 30 August 2026 the demo showed five, and the
// page argued with itself two screens of scrolling apart. We keep the lines and
// the cast of agents together.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'web', 'landing.html'), 'utf8');
const count = (status) => AGENTS.filter((a) => a.status === status).length;
const hud = (re) => { const m = html.match(re); return m ? Number(m[1]) : null; };

ok('HUD: всего агентов', hud(/hudAgents: '(\d+) agents'/) === AGENTS.length,
  { вHUD: hud(/hudAgents: '(\d+) agents'/), вСписке: AGENTS.length });
ok('HUD: работают', hud(/hudWork: '(\d+) working'/) === count('working'),
  { вHUD: hud(/hudWork: '(\d+) working'/), вСписке: count('working') });
ok('HUD: ждут ответа', hud(/hudWait: '(\d+) waiting on you'/) === count('awaiting'),
  { вHUD: hud(/hudWait: '(\d+) waiting on you'/), вСписке: count('awaiting') });
ok('HUD: в лимите', hud(/hudLimit: '(\d+) out of quota'/) === count('idle'),
  { вHUD: hud(/hudLimit: '(\d+) out of quota'/), вСписке: count('idle') });

// the Russian HUD has to say the same thing as the English one
ok('русский HUD совпадает с английским', [
  [/hudAgents: '(\d+) агентов'/, AGENTS.length],
  [/hudWork: '(\d+) работают'/, count('working')],
  [/hudWait: '(\d+) ждут тебя'/, count('awaiting')],
  [/hudLimit: '(\d+) в лимите'/, count('idle')],
].every(([re, n]) => hud(re) === n));

// The badge above the head is drawn by the shared drawBubble from badges.js, and
// it reads agent.status and agent.limited. A `state` of its own was already here
// and quietly matched nothing — because of it all eight sitting agents were drawn
// as working.
ok('поля агентов названы как в офисе',
  AGENTS.every((a) => ['working', 'awaiting', 'idle'].includes(a.status)),
  AGENTS.filter((a) => !['working','awaiting','idle'].includes(a.status)).map((a) => a.id));
ok('ровно один в лимите', AGENTS.filter((a) => a.limited).length === 1,
  AGENTS.filter((a) => a.limited).map((a) => a.id));

// and the heading of the "why" section names the same eight and three
ok('заголовок «зачем» согласован с этажом',
  html.includes('Eight sessions. Three are waiting') && AGENTS.length === 8 && count('awaiting') === 3,
  { всего: AGENTS.length, ждут: count('awaiting') });

// The board: the page promises "what is done hangs on the wall, click to view".
// While the cards were drawn and there was nothing to open, that promise was
// broken. Here we keep the data in the shape the viewer can show.
const files = Object.values(BOARD).flat();
ok('на доске есть работы', files.length >= 5, files.length);
ok('у каждой работы есть автор', files.every((f) => f.who), files.filter((f) => !f.who).map((f) => f.path));
ok('у каждого текстового файла есть содержимое',
  files.filter((f) => !f.image).every((f) => f.body && f.body.length > 40),
  files.filter((f) => !f.image && !(f.body && f.body.length > 40)).map((f) => f.path));
ok('доска есть у каждой комнаты проекта',
  projectRooms.every((r) => (BOARD[r.key] || []).length > 0),
  projectRooms.filter((r) => !(BOARD[r.key] || []).length).map((r) => r.key));

// The word "demo" lived only in an aria-label until 31 August 2026: screen
// readers heard it and nobody saw it. Now it is on the screen, and in both languages.
ok('подпись «демо» есть в разметке', /data-t="demoNote"/.test(html));
ok('подпись «демо» переведена на оба языка',
  /demoNote: 'A demo floor/.test(html) && /demoNote: 'Демо-этаж/.test(html));

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
