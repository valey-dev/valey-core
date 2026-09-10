// Drawing the building: corridors, rooms, desks, boards, props, light.
import { hash, drawPerson } from './sprites.js';
import { lang, t as tr } from './i18n.js';
import { WALL, LIFT_DOOR_H } from './layout.js';
import { drawSky, flash } from './weather.js';
import { drawPainting, drawPoster, artOf } from './paintings.js';
import * as PF from './pixfont.js';

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

export function pxText(ctx, str, x, y, color = '#f6e3c0', size = 7) {
  ctx.font = `${size}px "JetBrains Mono", "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.fillText(str, x | 0, y | 0);
}

// ------------------------------------------------------------------ corridors
export function drawCorridor(ctx, L, t, night = 0.5, weather = { kind: 'clear', intensity: 0.5, wind: 0 }) {
  for (let y = 0; y < L.h; y += 16) {
    for (let x = 0; x < L.w; x += 16) {
      const h = hash(`c${x},${y}`);
      px(ctx, x, y, 16, 16, ['#4b433c', '#484039', '#4e4640'][h % 3]);
      px(ctx, x, y + 15, 16, 1, '#3d362f');
      px(ctx, x + 15, y, 1, 16, '#3d362f');
      if (h % 11 === 0) px(ctx, x + 5 + (h % 5), y + 6, 2, 2, '#544b43');
    }
  }
  // runner carpets down every corridor band
  for (const b of L.bands || []) {
    const cy = b.y + b.h / 2 - 12;
    px(ctx, 24, cy, L.w - 48, 26, '#7a3f38');
    px(ctx, 28, cy + 3, L.w - 56, 20, '#8f4a40');
    for (let x = 36; x < L.w - 40; x += 24) px(ctx, x, cy + 9, 12, 8, '#a85a48');
    px(ctx, 24, cy, L.w - 48, 1, '#5f302b');
    px(ctx, 24, cy + 25, L.w - 48, 1, '#5f302b');
  }
  for (const p of L.props || []) drawCorridorProp(ctx, p, t);

  // outer wall with real windows
  px(ctx, 0, 0, L.w, 34, '#3a322c');
  for (let x = 0; x < L.w; x += 8) px(ctx, x, 0, 1, 30, '#332c26');
  px(ctx, 0, 34, L.w, 2, '#5a4f45');
  for (const a of L.wallArt || []) drawPainting(ctx, a.x, a.y, a.w, a.h, artOf(a), t);
  for (let wx = 56; wx < L.w - 80; wx += 208) {
    px(ctx, wx - 4, 2, 70, 30, '#241e1a');
    px(ctx, wx - 2, 4, 66, 26, '#4a3628');
    drawSky(ctx, wx, 6, 62, 22, t, night, weather);
    px(ctx, wx + 30, 6, 2, 22, '#4a3628');      // mullion
    px(ctx, wx, 16, 62, 1, '#4a3628');
    px(ctx, wx - 5, 30, 72, 3, '#6b4d33');      // sill
    px(ctx, wx - 5, 30, 72, 1, '#8a6247');
    // light spilling onto the corridor floor
    const spill = flash(t, weather) * 0.5 + (1 - night) * 0.10;
    if (spill > 0.02) {
      ctx.globalAlpha = Math.min(0.5, spill);
      const g = ctx.createLinearGradient(0, 34, 0, 92);
      g.addColorStop(0, 'rgba(220,232,255,0.7)'); g.addColorStop(1, 'rgba(220,232,255,0)');
      ctx.fillStyle = g; ctx.fillRect(wx - 8, 34, 78, 58);
      ctx.globalAlpha = 1;
    }
  }
}

// ----------------------------------------------------------------------- the lift
// A shaft the full height of the floor, with an opening onto every corridor. There
// is one cabin: it is visible only on the floor it is standing on — on the others
// there is darkness behind the doors.
export function drawLift(ctx, L, t, st) {
  const lf = L.lift;
  if (!lf) return;
  const { x, w } = lf;
  const bottom = L.h - 14;

  px(ctx, x - 4, 24, w + 8, bottom - 24, '#20262c');
  px(ctx, x, 24, w, bottom - 24, '#2b3138');
  for (let y = 28; y < bottom; y += 14) px(ctx, x, y, w, 1, '#333c44');
  px(ctx, x - 4, 24, 2, bottom - 24, '#161a1f');
  px(ctx, x + w + 2, 24, 2, bottom - 24, '#161a1f');

  for (const f of lf.floors) {
    const top = f.y - LIFT_DOOR_H;
    const here = st.floor === f.n;
    px(ctx, x + 3, top, w - 6, LIFT_DOOR_H, '#12161a');

    if (here) {
      px(ctx, x + 4, top + 1, w - 8, LIFT_DOOR_H - 2, '#3b4650');
      px(ctx, x + 4, top + 1, w - 8, 2, '#55626e');
      px(ctx, x + w / 2 - 5, top + 3, 10, 2, '#ffe9a8');       // the lamp in the cabin
      px(ctx, x + 6, top + LIFT_DOOR_H - 4, w - 12, 2, '#2a333c');
    }

    // the doors part from the middle
    const open = here ? st.open : 0;
    const leaf = Math.max(0, Math.round((w - 8) / 2 * (1 - open)));
    if (leaf > 0) {
      px(ctx, x + 4, top + 1, leaf, LIFT_DOOR_H - 2, '#6b7684');
      px(ctx, x + 4, top + 1, leaf, 1, '#8b96a4');
      px(ctx, x + w - 4 - leaf, top + 1, leaf, LIFT_DOOR_H - 2, '#6b7684');
      px(ctx, x + w - 4 - leaf, top + 1, leaf, 1, '#8b96a4');
      px(ctx, x + 4 + leaf - 1, top + 1, 1, LIFT_DOOR_H - 2, '#4e5862');
      px(ctx, x + w - 4 - leaf, top + 1, 1, LIFT_DOOR_H - 2, '#4e5862');
    }

    px(ctx, x + 2, top - 2, w - 4, 2, '#46505a');              // the lintel
    px(ctx, x + 2, top + LIFT_DOOR_H, w - 4, 2, '#46505a');    // the threshold

    // the floor indicator and the call button
    px(ctx, x + w / 2 - 8, top - 12, 16, 9, '#12161a');
    pxText(ctx, String(f.n), x + w / 2 - 3, top - 5, here ? '#9fe0a8' : '#4a6a58', 7);
    px(ctx, x - 7, f.y - 22, 4, 7, '#3a444e');
    px(ctx, x - 6, f.y - 21, 2, 5, here ? '#9fe0a8' : '#8a6247');
  }
}

// ------------------------------------------------------------ the reception desk
// It stands opposite the lift on every inhabited floor. The receptionist is the only
// resident of the office who is not from a live session, so his looks are his own
// and constant.
export function drawReception(ctx, L, t) {
  for (const r of (L.lift && L.lift.reception) || []) {
    const { x, y, w } = r;

    // The plaque over the desk: the floor and how many projects are on it. A 13-pixel
    // plate ended at y-17, while the second line was placed at y-15 — that is, on the
    // wall behind the plaque, dim on dim. The floor number was not readable at all;
    // found on 30 August 2026, when the numbers were turned bottom-up and somebody
    // wanted to make sure the plaque really said "floor 1".
    const sign = tr('sign.floor', { n: r.n, projects: projectCount(r.rooms.length) });
    px(ctx, x + 2, y - 30, w - 4, 20, '#2a1d15');
    px(ctx, x + 2, y - 30, w - 4, 1, '#a9784c');
    // The name from main (the office is called VALEY), the geometry from here: there
    // the plaque stayed 13 pixels tall, and the second line still lay below the plate,
    // on the wall. The colour is local too — it is what all of this was fixed for.
    px(ctx, x + 2, y - 11, w - 4, 1, '#6d5040');
    pxText(ctx, 'VALEY', x + 6, y - 27, '#ffd166', 6);
    pxText(ctx, sign, x + 6, y - 18, '#c2a184', 5);

    // the receptionist behind the desk: visible to the chest, breathing
    const bob = Math.floor(t / 900) % 2;
    const sx = r.who.x, sy = r.who.y + bob;
    px(ctx, sx - 5, sy - 12, 10, 3, '#3a2a20');
    px(ctx, sx - 6, sy - 10, 12, 2, '#3a2a20');
    px(ctx, sx - 4, sy - 10, 8, 8, '#e8b98c');
    px(ctx, sx - 3, sy - 6, 2, 2, '#2a1d15');
    px(ctx, sx + 1, sy - 6, 2, 2, '#2a1d15');
    px(ctx, sx - 7, sy - 2, 14, 9, '#8fc8ff');
    px(ctx, sx - 7, sy - 2, 14, 2, '#a8d6ff');

    // the desk itself on top — the receptionist is behind it, not on it
    px(ctx, x, y, w, 4, '#9a6a44');
    px(ctx, x, y + 4, w, 8, '#7d5334');
    px(ctx, x, y + 10, w, 2, '#5e3f27');
    px(ctx, x, y, 2, 12, '#6b472a');
    px(ctx, x + w - 2, y, 2, 12, '#6b472a');
    px(ctx, x + 5, y - 4, 10, 4, '#d8cdb4');          // the papers
    px(ctx, x + 5, y - 4, 10, 1, '#f0e7d2');
    px(ctx, x + w - 18, y - 7, 12, 7, '#3b4650');     // the monitor
    px(ctx, x + w - 17, y - 6, 10, 5, '#5f8ea8');
  }
}

// The projects on the plaque: the forms come from the dictionary, because English
// has two of them and Russian three — otherwise the floor ends up with "3 project".
const projectCount = (n) => {
  const key = lang() === 'en'
    ? (n === 1 ? 'rec.project.one' : 'rec.project.many')
    : plural(n, 'rec.project.one', 'rec.project.few', 'rec.project.many');
  return `${n} ${tr(key)}`;
};

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

// Who stands at the entrance depends on the language: with an English interface it
// is a fellow in a leather jacket and jeans, with a Russian one a newcomer in a
// baseball cap. On the plaque above his head is the language he will switch to, not
// the one that is on. The key here is the language that is ON, not the nationality of
// the figure: under `en` stands the Russian one. It confuses on every reading, so it
// is said outright.
//
// Each has a thing, and it is one pair rather than two independent people: a
// cigarette against a cup of coffee. A motionless figure in the corridor gets an
// occupation, and a stranger gets two different silhouettes instead of two fellows.
// The American's shirt is light blue rather than white for one reason: the sleeve is
// drawn in the colour of the shirt, the cup stands right against it, and on white it
// disappeared entirely — found on a frame from the mock-up before it got into the code.
const SWITCHER = {
  ru: { skin: '#e8ad7e', hair: '#a8542a', shirt: '#aebccb', pants: '#5a6b8a', boots: '#6b4a2a', style: 2, head: 'ball', glasses: false, face: 'none', tall: 1, hands: 'cup' },
  en: { skin: '#f4c9a0', hair: '#3a2a20', shirt: '#38302a', pants: '#3f4a63', boots: '#2a2118', style: 0, head: 'none', glasses: false, face: 'beard', tall: 0, hands: 'none', cig: true },
};

// What is written on the plaque. It comes from outside, like the liveliness of the
// kicker: the name pack lives in the settings, and the drawing does not know about
// them and must not.
//
// Since 4 September 2026 the plaque names what is ON rather than what it will switch
// to: there is no click any more, there is a panel, and promising a language with it
// would be a lie. "RU·EN" — the names are detached from the language: the interface
// is Russian, the names are English.
export const switcherSign = { code: '' };

export function drawSwitcher(ctx, p, t, facing = 0) {
  const look = SWITCHER[lang()] || SWITCHER.en;
  drawPerson(ctx, p.x, p.y, look, { pose: 'stand', frame: (t / 260) | 0, dir: facing, ms: t });
  // The plaque stands ABOVE the hint line, as on the frame, rather than below it.
  // While it was two glyphs wide the order did not matter; with "RU·EN" it grew to
  // thirty pixels and drove into the plate with the player's name, who is standing
  // right there at that moment — the "R" was eaten for good. This is visible only on
  // a real ×4 frame, the mock-up has nothing to do with it.
  const top = p.y - 22 - look.tall - 34;
  const code = switcherSign.code || lang().toUpperCase();
  // Five glyphs do not fit into a plaque of eighteen pixels: it grows exactly for
  // "RU·EN" and exactly when that is what stands there.
  const w = code.length > 2 ? 30 : 18;
  px(ctx, p.x - w / 2, top, w, 10, 'rgba(20,13,8,0.86)');
  px(ctx, p.x - w / 2, top, w, 1, '#8a6247');
  px(ctx, p.x - 1, top + 10, 2, 9, 'rgba(20,13,8,0.86)');
  ctx.font = '7px "JetBrains Mono", "Courier New", monospace';
  pxText(ctx, code, p.x - ctx.measureText(code).width / 2, top + 7, '#ffd166');
}


// Table football. The table is alive exactly when somebody has stepped up to it: the
// bars swing and the ball rolls, an empty table stands still. The liveliness comes
// from outside — the drawing knows neither about the agents nor about the player, it
// is told.
export const kickerBusy = { since: 0 };

// The bear skin in front of the sofa. Seen from above like everything else on the
// floor: the hide spread wide, four paws splayed to the corners, the head toward
// the room so that whoever sits on the sofa looks at the back of it and whoever
// walks past meets the teeth.
//
// The head is the whole point of the thing, so it gets more pixels than the body:
// at this scale a bear and a brown puddle differ by the muzzle, two eyes and the
// white of the teeth, and nothing else.
function drawBearRug(ctx, x, y) {
  const FUR = '#6b4a30', DARK = '#4a3220', BELLY = '#8a6242';
  // the hide: bars widening to the middle and narrowing to the hips
  const rows = [[-12, 14], [-10, 20], [-8, 24], [-6, 28], [-4, 30], [-2, 30], [0, 28], [2, 24], [4, 18]];
  for (const [dy, w] of rows) px(ctx, x - w / 2, y + dy, w, 2, FUR);
  // the lighter belly down the middle, so the hide is not one flat spot
  px(ctx, x - 7, y - 8, 14, 10, BELLY);
  px(ctx, x - 5, y - 10, 10, 2, BELLY);
  // four paws, splayed as a skin on the floor is: a limb out to the corner and a
  // pad at the end of it, or at this size the legs read as dirt on the floor
  for (const [lx, ly, px0, py0] of [[-20, -9, -26, -11], [12, -9, 20, -11], [-18, 0, -24, 0], [12, 0, 20, 0]]) {
    px(ctx, x + lx, y + ly, 9, 5, FUR);        // the limb
    px(ctx, x + px0, y + py0, 7, 6, FUR);      // the pad
    px(ctx, x + px0, y + py0 + 6, 7, 1, DARK);
    for (let i = 0; i < 3; i++) px(ctx, x + px0 + 1 + i * 2, y + py0, 1, 2, '#d8cbb8');
  }
  // the head, toward the room
  const hy = y + 6;
  px(ctx, x - 9, hy, 18, 12, FUR);          // the skull
  px(ctx, x - 10, hy + 2, 1, 8, FUR);
  px(ctx, x + 9, hy + 2, 1, 8, FUR);
  px(ctx, x - 8, hy - 2, 4, 3, FUR);        // the ears
  px(ctx, x + 4, hy - 2, 4, 3, FUR);
  px(ctx, x - 7, hy - 1, 2, 1, '#3a2a1e');
  px(ctx, x + 5, hy - 1, 2, 1, '#3a2a1e');
  px(ctx, x - 6, hy + 2, 2, 2, '#120c08');  // the eyes
  px(ctx, x + 4, hy + 2, 2, 2, '#120c08');
  px(ctx, x - 5, hy + 6, 10, 6, '#3a2a1e'); // the muzzle
  px(ctx, x - 2, hy + 5, 4, 2, '#231810');  // the nose
  // the open mouth: the teeth are what makes it a bear and not a rug
  px(ctx, x - 4, hy + 9, 8, 3, '#1a1008');
  for (let i = 0; i < 4; i++) px(ctx, x - 4 + i * 2, hy + 9, 1, 2, '#efe6d8');
  px(ctx, x - 3, hy + 11, 1, 1, '#efe6d8');
  px(ctx, x + 2, hy + 11, 1, 1, '#efe6d8');
}

function drawKicker(ctx, x, y, t) {
  const live = kickerBusy.since && t - kickerBusy.since < 400;
  px(ctx, x - 20, y, 3, 6, '#3a2a1e');                 // the legs
  px(ctx, x + 17, y, 3, 6, '#3a2a1e');
  px(ctx, x - 22, y - 18, 44, 20, '#6b4a2e');          // the body
  px(ctx, x - 22, y - 18, 44, 2, '#8a6247');
  px(ctx, x - 22, y, 44, 2, '#4a3423');
  px(ctx, x - 19, y - 16, 38, 15, '#2f6b3a');          // the field
  px(ctx, x - 19, y - 16, 38, 1, '#3f8a4c');
  px(ctx, x, y - 16, 1, 15, '#7fae87');                // the centre line
  px(ctx, x - 3, y - 11, 7, 5, '#7fae87');             // the centre circle
  px(ctx, x - 2, y - 10, 5, 3, '#2f6b3a');
  px(ctx, x - 22, y - 12, 3, 7, '#241a12');            // the goals
  px(ctx, x + 19, y - 12, 3, 7, '#241a12');

  // The bars: the outer ones with one figure, the middle ones with two. Red against
  // blue every other one — the way they stand on any table in any corridor.
  [-13, -5, 5, 13].forEach((dx, i) => {
    px(ctx, x + dx, y - 20, 1, 19, '#b9b2a4');
    px(ctx, x + dx - 2, y - 20, 5, 1, '#d6cfc0');
    const sway = live ? Math.round(Math.sin(t / 170 + i * 1.7) * 3) : 0;
    for (const oy of (i === 0 || i === 3 ? [-11] : [-14, -7])) {
      px(ctx, x + dx - 1, y + oy + sway, 3, 4, i % 2 ? '#4a6ea8' : '#c25a4b');
      px(ctx, x + dx - 1, y + oy + sway, 3, 1, i % 2 ? '#6a8ec8' : '#e07a68');
    }
  });

  // The ball. While the game is on it darts about the field, afterwards it lies by the centre circle.
  const bx = live ? x - 16 + ((t / 60) % 32) : x + 7;
  const by = live ? y - 13 + Math.sin(t / 130) * 4 : y - 6;
  px(ctx, bx, by, 2, 2, '#f0ead8');
}

function drawCorridorProp(ctx, p, t) {
  const { x, y, kind } = p;
  if (kind === 'lang') { drawSwitcher(ctx, p, t); return; }
  if (kind === 'plant') {
    px(ctx, x - 6, y - 10, 12, 10, '#8a4a34');
    px(ctx, x - 6, y - 10, 12, 2, '#a85c40');
    for (let i = 0; i < 7; i++) {
      const h = hash(`cp${x}${i}`);
      px(ctx, x - 7 + (h % 14) + Math.sin(t / 1000 + i), y - 26 + ((h >>> 3) % 16), 3, 6, i % 2 ? '#4d7a3e' : '#3f6633');
    }
  }
  if (kind === 'cooler') {
    px(ctx, x - 8, y - 26, 16, 26, '#cdd9dd');
    px(ctx, x - 7, y - 38, 14, 12, '#8fc4d8');
    px(ctx, x - 5, y - 36, 4, 8, '#b8e0ee');
    px(ctx, x - 5, y - 16, 10, 6, '#aab8bc');
    px(ctx, x - 8, y - 2, 16, 2, '#8f9a9e');
  }
  if (kind === 'lounge') {
    // the sagging sofa of the smoking room
    px(ctx, x - 26, y - 18, 52, 12, '#4a5a6e');          // the back
    px(ctx, x - 26, y - 18, 52, 2, '#5e7089');
    px(ctx, x - 26, y - 7, 52, 8, '#3f4f61');            // the seat
    px(ctx, x - 26, y - 8, 52, 1, '#5e7089');
    px(ctx, x - 29, y - 16, 4, 16, '#3a4a5c');           // the armrests
    px(ctx, x + 25, y - 16, 4, 16, '#3a4a5c');
    px(ctx, x - 24, y + 1, 3, 3, '#2a3542');             // the legs
    px(ctx, x + 21, y + 1, 3, 3, '#2a3542');
    px(ctx, x - 20, y - 15, 9, 7, '#6b5a7a');            // the cushion
    px(ctx, x - 19, y - 14, 7, 2, '#8a749c');
    return;
  }
  if (kind === 'bearrug') { drawBearRug(ctx, x, y); return; }
  if (kind === 'kicker') { drawKicker(ctx, x, y, t); return; }
  if (kind === 'ashtray') {
    // the sand bin: a wisp of smoke always curls above it
    px(ctx, x - 5, y - 14, 10, 14, '#5a5a5f');
    px(ctx, x - 5, y - 14, 10, 2, '#7a7a80');
    px(ctx, x - 4, y - 16, 8, 2, '#8a8068');            // the sand
    for (let i = 0; i < 3; i++) {
      const life = ((t / 2600 + i / 3) % 1);
      ctx.globalAlpha = 0.28 * (1 - life);
      px(ctx, x - 1 + Math.sin(life * 5 + i) * 3, y - 18 - life * 14, 2, 2, '#cfc6b4');
      ctx.globalAlpha = 1;
    }
    return;
  }
  if (kind === 'hookah') {
    // The hookah on a low tray. Drawn 10 September 2026 for a live demo with the
    // design phase skipped on the owner's word; the frame is owed afterwards.
    // The smoke is the ashtray's wisp grown up: four puffs, slower, wider, and
    // drifting — a room where people are at ease, not a bin somebody stubbed a
    // cigarette in.
    px(ctx, x - 8, y - 3, 16, 3, '#3a2f2a');                  // the tray
    px(ctx, x - 8, y - 3, 16, 1, '#5a4a40');
    px(ctx, x - 4, y - 10, 8, 7, '#3b6f8a');                  // the glass base
    px(ctx, x - 4, y - 10, 8, 1, '#6fb3d0');
    px(ctx, x - 3, y - 9, 2, 3, '#8fd0e8');                   // its highlight
    px(ctx, x - 4, y - 5, 8, 2, '#2d5a72');                   // the water line
    px(ctx, x - 1, y - 22, 2, 12, '#c9a24a');                 // the brass stem
    px(ctx, x, y - 22, 1, 12, '#8a6a2a');
    px(ctx, x - 3, y - 23, 6, 1, '#c9a24a');                  // the plate
    px(ctx, x - 2, y - 26, 4, 3, '#8a4a3a');                  // the clay bowl
    px(ctx, x - 2, y - 26, 4, 1, '#a85e48');
    // the hose: down the stem, out to the right, mouthpiece resting on the tray
    px(ctx, x + 1, y - 16, 2, 1, '#5a2f4a');
    px(ctx, x + 3, y - 15, 1, 6, '#5a2f4a');
    px(ctx, x + 4, y - 9, 3, 1, '#5a2f4a');
    px(ctx, x + 7, y - 8, 1, 4, '#5a2f4a');
    px(ctx, x + 6, y - 4, 3, 1, '#c9a24a');                   // the mouthpiece
    // the coal: it breathes
    const glow = 0.6 + 0.4 * Math.sin(t / 700);
    ctx.globalAlpha = glow;
    px(ctx, x - 1, y - 27, 2, 1, '#ff8a3c');
    ctx.globalAlpha = 1;
    // the smoke
    for (let i = 0; i < 4; i++) {
      const life = ((t / 3400 + i / 4) % 1);
      const size = life < 0.5 ? 3 : 2;
      ctx.globalAlpha = 0.36 * (1 - life);
      px(ctx, x - 1 + Math.round(Math.sin(life * 4 + i * 1.7) * 4), y - 29 - Math.round(life * 20), size, size, '#dcd6e6');
      ctx.globalAlpha = 1;
    }
    return;
  }
  if (kind === 'bench') {
    px(ctx, x - 17, y - 12, 34, 6, '#7a5a3e');
    px(ctx, x - 17, y - 6, 34, 3, '#5f4530');
    px(ctx, x - 15, y - 3, 3, 5, '#4a3626');
    px(ctx, x + 12, y - 3, 3, 5, '#4a3626');
    px(ctx, x - 17, y - 20, 34, 5, '#7a5a3e');
  }
}

// The radio on the cabinet: the body, the cover of the wave, the speaker grille, the
// tuning scale and the equaliser, which breathes only when the music is really playing.

// ---------------------------------------------------------------------- room
export function drawRoom(ctx, r, t) {
  const T = r.tone;
  for (let y = r.y + WALL; y < r.y + r.h; y += 16) {
    for (let x = r.x; x < r.x + r.w; x += 16) {
      const h = hash(`${r.key}${x},${y}`);
      px(ctx, x, y, 16, 16, T.floor[h % 3]);
      px(ctx, x, y + 15, 16, 1, T.seam);
      if ((h >>> 4) % 6 === 0) px(ctx, x + (h % 11), y + 3, 1, 9, T.seam);
    }
  }
  // rug in the middle of the room
  const rx = r.x + r.w / 2 - 54, ry = r.y + r.h - 46;
  px(ctx, rx, ry, 108, 26, '#8c4038');
  px(ctx, rx + 5, ry + 4, 98, 18, '#a54c40');
  px(ctx, rx + 18, ry + 9, 72, 8, '#c06a4a');

  // walls
  px(ctx, r.x, r.y, r.w, WALL, T.wall);
  for (let x = r.x; x < r.x + r.w; x += 8) px(ctx, x, r.y, 1, WALL - 6, '#00000018');
  px(ctx, r.x, r.y + WALL - 6, r.w, 3, T.trim);
  px(ctx, r.x, r.y + WALL - 3, r.w, 3, '#3f2e25');
  px(ctx, r.x, r.y + WALL, r.w, 2, '#2e211a');
  px(ctx, r.x, r.y, 8, r.h, '#4a3b31');
  px(ctx, r.x + r.w - 8, r.y, 8, r.h, '#4a3b31');
  px(ctx, r.x, r.y + r.h - 10, r.w, 10, '#4a3b31');
  px(ctx, r.x, r.y + r.h - 10, r.w, 2, T.trim);

  // pictures hang before the doorway is cut, so a frame can never cover it
  for (const a of r.art || []) drawPainting(ctx, a.x, a.y, a.w, a.h, artOf(a), t);

  // doorway
  const d = r.door;
  px(ctx, d.x, r.y, d.w, WALL, '#2a1f18');
  px(ctx, d.x, r.y + WALL - 4, d.w, 4, '#5f4632');
  px(ctx, d.x - 3, r.y, 3, WALL, '#7a5a3e');
  px(ctx, d.x + d.w, r.y, 3, WALL, '#7a5a3e');
  px(ctx, d.x + 4, r.y + WALL, d.w - 8, 3, '#6d4c33'); // mat

  // the second way out: a plain opening, no sign over it
  const b = r.back;
  if (b) {
    if (b.side === 'bottom') {
      px(ctx, b.x, b.y, b.w, 10, '#241a14');
      px(ctx, b.x, b.y, b.w, 2, '#1a120d');
      px(ctx, b.x - 3, b.y, 3, 10, '#7a5a3e');
      px(ctx, b.x + b.w, b.y, 3, 10, '#7a5a3e');
      px(ctx, b.x + 4, b.y - 3, b.w - 8, 3, '#6d4c33');
    } else {
      px(ctx, b.x, b.y, 8, b.h, '#241a14');
      px(ctx, b.x, b.y - 3, 8, 3, '#7a5a3e');
      px(ctx, b.x, b.y + b.h, 8, 3, '#7a5a3e');
      const matX = b.side === 'left' ? b.x + 8 : b.x - 3;
      px(ctx, matX, b.y + 4, 3, b.h - 8, '#6d4c33');
    }
  }

  // nameplate over the door
  drawNameplate(ctx, r, d);
}

// The plaque over the door: the name of the project, and under it the version and the
// stack, when the server found them in a manifest. It grows upwards, into the corridor:
// the bottom edge has to stay where it is, or the second line creeps over the opening
// (Figma 249:2).
//
// It is written in the 3×5 pixel font rather than by fillText: on a shot from a live
// office "v0.1.0 · Node" read as "v8.1.8 · Mode" — see web/pixfont.js. A string
// without its own glyphs (a Cyrillic folder name) falls back to fillText: a soapy name
// is better than a missing one.
export function drawNameplate(ctx, r, d) {
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const label = cut(r.title, 18);
  const sub = r.sub ? cut(r.sub, 18) : '';
  const measure = (s) => (PF.canDraw(s) ? PF.textWidth(s) : ctx.measureText(s).width);

  ctx.font = '7px "JetBrains Mono", "Courier New", monospace';   // for the fallback
  // the width is even: a nail two pixels wide would otherwise stand half a pixel off
  // the middle of the door, and the plaque would look hung crooked
  let w = Math.max(40, Math.round(Math.max(measure(label), sub ? measure(sub) : 0)) + 10);
  if (w % 2) w++;
  // 9 = the frame, a padding, five rows of a letter, a padding, the frame. With a
  // second line a rule and another such row are added to that: 17.
  const h = sub ? 17 : 9;
  const nx = Math.round(d.x + d.w / 2 - w / 2), ny = r.y - 1 - h;
  px(ctx, nx, ny, w, h, '#6b4a2e');
  px(ctx, nx + 1, ny + 1, w - 2, h - 2, '#8a6242');
  px(ctx, nx + w / 2 - 1, ny - 3, 2, 3, '#5a4030');
  // the line centred on the plaque: the pixel font's width is known exactly, and
  // centring by it is more honest than by a left padding
  const line = (s, top, color) => {
    const x = nx + Math.round((w - measure(s)) / 2);
    if (PF.canDraw(s)) PF.drawText(ctx, s, x, top, color);
    else pxText(ctx, s, x, top + 6, color);
  };
  line(label, ny + 2, '#f6e3c0');
  if (sub) {
    // a hairline rule: without it two lines at this height read as one blot
    px(ctx, nx + 1, ny + 8, w - 2, 1, '#74502f');
    line(sub, ny + 10, '#e6cda4');
  }
  return { x: nx, y: ny, w, h };
}

export function drawBoard(ctx, r, items, t, glow) {
  const b = r.board;
  px(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, '#6b4a2e');
  px(ctx, b.x, b.y, b.w, b.h, '#c9a06a');
  for (let i = 0; i < 40; i++) {
    const h = hash(`ck${r.key}${i}`);
    px(ctx, b.x + (h % b.w), b.y + ((h >>> 5) % b.h), 1, 1, '#b8905c');
  }
  items.slice(0, 8).forEach((it, i) => {
    const cx = b.x + 6 + (i % 4) * 24, cy = b.y + 5 + Math.floor(i / 4) * 20;
    px(ctx, cx, cy, 18, 15, '#f3e7d0');
    px(ctx, cx, cy, 18, 3, it.image ? '#7aa85a' : '#8fb4d8');
    px(ctx, cx + 2, cy + 6, 14, 1, '#c0b3a0');
    px(ctx, cx + 2, cy + 9, 10, 1, '#c0b3a0');
    px(ctx, cx + 8, cy - 2, 2, 3, '#c24b3f');
  });
  if (!items.length) pxText(ctx, tr('board.empty'), b.x + b.w / 2 - 12, b.y + b.h / 2 + 3, '#a5804f');
  if (glow) {
    const a = 0.35 + 0.35 * Math.sin(t / 260);
    ctx.globalAlpha = a;
    px(ctx, b.x - 4, b.y - 4, b.w + 8, 1, '#ffd166');
    px(ctx, b.x - 4, b.y + b.h + 3, b.w + 8, 1, '#ffd166');
    px(ctx, b.x - 4, b.y - 4, 1, b.h + 8, '#ffd166');
    px(ctx, b.x + b.w + 3, b.y - 4, 1, b.h + 8, '#ffd166');
    ctx.globalAlpha = 1;
  }
}

export function drawDesk(ctx, d, agent, t) {
  const { x, y } = d;
  px(ctx, x - 24, y + 2, 48, 4, '#9a6440');
  px(ctx, x - 24, y + 6, 48, 10, '#7a4d31');
  px(ctx, x - 24, y + 16, 3, 6, '#5f3b26');
  px(ctx, x + 21, y + 16, 3, 6, '#5f3b26');
  px(ctx, x - 24, y + 2, 48, 1, '#b5794d');

  const on = !!agent;
  px(ctx, x + 2, y - 9, 17, 12, '#3c3b46');
  px(ctx, x + 3, y - 8, 15, 10, on ? '#2f3a4a' : '#2a2a33');
  px(ctx, x + 4, y - 7, 13, 1, on ? '#40506a' : '#31313c');
  px(ctx, x + 9, y + 3, 3, 2, '#33323c');
  px(ctx, x + 6, y + 5, 9, 1, '#2b2a33');
  px(ctx, x - 14, y + 2, 15, 3, '#2b2a33');
  px(ctx, x - 14, y + 2, 15, 1, '#403e4a');
  if (on) {
    const flick = 0.55 + 0.45 * Math.sin(t / 130 + x);
    ctx.globalAlpha = 0.4 * flick;
    const glow = ctx.createRadialGradient(x + 10, y - 4, 2, x + 10, y - 4, 22);
    const col = agent.mood === 'design' ? '160,120,220' : agent.mood === 'research' ? '120,180,230' : '150,220,170';
    glow.addColorStop(0, `rgba(${col},0.5)`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 16, y - 28, 56, 42);
    ctx.globalAlpha = 1;
  }
  const h = hash('d' + x + y);
  if (h % 2) { px(ctx, x + 20, y - 1, 4, 4, '#d8d2c4'); px(ctx, x + 19, y, 1, 2, '#d8d2c4'); }
  if ((h >>> 3) % 2) px(ctx, x - 22, y - 1, 7, 4, '#efe6d2');
}

// The microwave in the kitchen corner. Everything interesting about it is behind the
// glass: while it heats, the window glows and a fish rides around with the plate; after
// the ping a smell comes out of the seams, and that is the only thing visible from the
// other end of the floor.
export function drawMicro(ctx, m, t, run) {
  const x = m.x, y = m.y;
  const on = !!run && run.phase === 'run';
  px(ctx, x - 15, y, 30, 3, '#7a5f45');
  px(ctx, x - 15, y + 3, 30, 1, '#5a4636');
  px(ctx, x - 13, y - 18, 26, 18, '#3a3a42');
  px(ctx, x - 13, y - 18, 26, 2, '#4e4e58');
  px(ctx, x - 13, y - 2, 26, 2, '#2a2a30');
  px(ctx, x - 11, y - 16, 17, 13, '#2a2a30');
  px(ctx, x - 10, y - 15, 15, 11, on ? '#6b4a1e' : '#1b1b22');
  // the panel: the lamp is lit while the heating goes on
  px(ctx, x + 7, y - 16, 5, 13, '#2f2f38');
  px(ctx, x + 8, y - 15, 3, 3, on ? '#ffd166' : '#5a5a66');
  for (let i = 0; i < 3; i++) px(ctx, x + 8, y - 10 + i * 3, 3, 1, '#5a5a66');
  if (run) {
    const sw = Math.sin(t / 260) * 3;
    px(ctx, x - 9, y - 6, 12, 1, '#6a6a76');
    px(ctx, x - 5 + sw, y - 10, 7, 4, on ? '#d9a06a' : '#b8865a');
    px(ctx, x - 7 + sw, y - 10, 2, 4, on ? '#c08a52' : '#a07348');
    px(ctx, x + 2 + sw, y - 9, 1, 1, '#2b2118');
    if (on) {
      ctx.globalAlpha = 0.22 + 0.22 * Math.sin(t / 90);
      px(ctx, x - 10, y - 15, 15, 11, '#ffc46a');
      ctx.globalAlpha = 1;
    }
  }
  // The smell is the whole joke, so it is conspicuous: seven wisps, wide and nearly
  // opaque right at the door. On the first frame they were at sixteen per cent and got
  // lost in the warm light of the room.
  if (run && run.phase === 'smell') {
    for (let i = 0; i < 7; i++) {
      const s = Math.sin(t / 380 + i * 1.1);
      const up = (t / 34 + i * 13) % 30;
      ctx.globalAlpha = Math.max(0, (0.5 - up / 70) * (0.7 + 0.3 * s));
      px(ctx, x - 11 + i * 4 + s * 2, y - 20 - up, 3, 6, '#9fd46a');
    }
    ctx.globalAlpha = 1;
  }
}

export function drawRoomProps(ctx, r, t) {
  // coffee corner
  const c = r.coffee;
  px(ctx, c.x - 14, c.y - 30, 28, 30, '#5a4636');
  px(ctx, c.x - 12, c.y - 28, 24, 4, '#7a5f45');
  px(ctx, c.x - 10, c.y - 22, 20, 14, '#4d4a56');
  px(ctx, c.x - 8, c.y - 20, 12, 8, '#2f2d38');
  px(ctx, c.x - 6, c.y - 18, 4, 3, '#d98a3c');
  px(ctx, c.x + 4, c.y - 20, 6, 8, '#6b6675');
  const s = Math.sin(t / 520);
  ctx.globalAlpha = 0.3 + 0.2 * s;
  px(ctx, c.x - 4, c.y - 34 - s * 2, 2, 5, '#e8dcc8');
  ctx.globalAlpha = 1;

  // in the corner either an ordinary flower or a ficus — if the room has earned one
  if (r.ficus) { drawFicus(ctx, r.ficus.x, r.ficus.y, r.key, t); return; }

  // plant in the left corner
  const p = { x: r.x + 22, y: r.y + r.h - 16 };
  px(ctx, p.x - 5, p.y - 8, 10, 8, '#a35c3c');
  px(ctx, p.x - 5, p.y - 8, 10, 2, '#c07048');
  for (let i = 0; i < 6; i++) {
    const h = hash(`lf${r.key}${i}`);
    px(ctx, p.x - 6 + (h % 12) + Math.sin(t / 900 + i), p.y - 20 + ((h >>> 3) % 12), 3, 5, i % 2 ? '#5d8f4a' : '#4a7a3c');
  }
}

// The easel with the mock-ups: it stands on the floor, a little taller than a person
// (30 against 24). The cards on the board are the features from the WIP page in Figma,
// and the circle by each is its state. An empty board with a note means "Figma did not
// answer" rather than "there are no features": without an answer the office does not
// even know their list.


// A big ficus: one and a half people tall, so the tub, the trunk and the crown are
// drawn separately — otherwise at that height it reads as a bush rather than a tree.
function drawFicus(ctx, x, y, seed, t) {
  px(ctx, x - 11, y - 14, 22, 14, '#8a4a34');           // the tub
  px(ctx, x - 11, y - 14, 22, 3, '#a85c40');
  px(ctx, x - 11, y - 3, 22, 3, '#6e3a28');
  px(ctx, x - 9, y - 12, 18, 2, '#4a2f22');             // the earth
  px(ctx, x - 2, y - 40, 4, 26, '#6b4a32');             // the trunk
  px(ctx, x - 2, y - 40, 1, 26, '#8a6247');
  for (const [dx, dy] of [[-1, -30], [2, -34]]) px(ctx, x + dx, y + dy, 3, 1, '#6b4a32');

  // the crown: two layers of leaves, the upper one lighter, both breathing a little
  for (let i = 0; i < 22; i++) {
    const h = hash(`fic${seed}${i}`);
    const ring = i < 8 ? 0 : 1;
    const rx = (h % 34) - 17;
    const ry = -62 + ((h >>> 4) % (ring ? 20 : 14)) + (ring ? 8 : 0);
    const sway = Math.sin(t / 1100 + i * 0.7) * (ring ? 0.8 : 1.4);
    px(ctx, x + rx + sway, y + ry, 5, 4, ring ? '#3f6633' : '#4d7a3e');
    if (i % 3 === 0) px(ctx, x + rx + sway, y + ry, 5, 1, '#6a9c54');
  }
}

// --------------------------------------------------------------------- light
export function drawLight(ctx, L, t, night) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const r of L.rooms) {
    if (r.lit === false) continue;
    const cols = Math.max(1, Math.round(r.w / 150));
    const rows = Math.max(1, Math.round((r.h - WALL) / 130));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const lx = r.x + (r.w / (cols + 1)) * (i + 1);
      const ly = r.y + WALL + ((r.h - WALL) / (rows + 1)) * (j + 1);
      const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, 120);
      g.addColorStop(0, `rgba(255,196,120,${0.03 + night * 0.20})`);
      g.addColorStop(1, 'rgba(255,160,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 120, ly - 120, 240, 240);
    }
  }
  for (const b of L.bands || []) {
    for (let lx = 120; lx < L.w; lx += 260) {
      const ly = b.y + b.h / 2;
      const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, 110);
      g.addColorStop(0, `rgba(255,206,140,${0.02 + night * 0.17})`);
      g.addColorStop(1, 'rgba(255,160,80,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - 110, ly - 110, 220, 220);
    }
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,228,180,0.32)';
  for (let i = 0; i < 30; i++) {
    const h = hash('du' + i);
    ctx.fillRect((h % L.w + Math.sin(t / 2200 + i) * 12) | 0, (((h >>> 6) % L.h) + Math.cos(t / 1800 + i) * 8) | 0, 1, 1);
  }
}

// ------------------------------------------------------------------ security
// The control room is drawn separately from the project rooms: cold tiles, a desk with
// monitors and a reader by the door that goes green when it is you walking up.
export function drawSecurity(ctx, s, t, opts = {}) {
  const { unlocked = false, camsOn = false, near = false } = opts;

  for (let y = s.y + WALL; y < s.y + s.h; y += 16) {
    for (let x = s.x; x < s.x + s.w; x += 16) {
      const h = hash(`sec${x},${y}`);
      px(ctx, x, y, 16, 16, ['#3f464e', '#3b424a', '#434a53'][h % 3]);
      px(ctx, x, y + 15, 16, 1, '#333940');
      px(ctx, x + 15, y, 1, 16, '#333940');
    }
  }
  // the markings on the floor in front of the desk
  for (let x = s.x + 18; x < s.x + s.w - 18; x += 14) px(ctx, x, s.y + s.h - 26, 8, 2, '#7a6a2e');

  // the walls
  px(ctx, s.x, s.y, s.w, WALL, '#3c4550');
  for (let x = s.x; x < s.x + s.w; x += 8) px(ctx, x, s.y, 1, WALL - 6, '#00000020');
  px(ctx, s.x, s.y + WALL - 6, s.w, 3, '#59677a');
  px(ctx, s.x, s.y + WALL - 3, s.w, 3, '#232a31');
  px(ctx, s.x, s.y + WALL, s.w, 2, '#1c2229');
  px(ctx, s.x, s.y, 8, s.h, '#333c46');
  px(ctx, s.x + s.w - 8, s.y, 8, s.h, '#333c46');
  px(ctx, s.x, s.y + s.h - 10, s.w, 10, '#333c46');
  px(ctx, s.x, s.y + s.h - 10, s.w, 2, '#59677a');

  // the door: the leaves part when the card is accepted
  const d = s.door, gap = unlocked ? 12 : 2;
  px(ctx, d.x, s.y, d.w, WALL, '#161b20');
  px(ctx, d.x, s.y, d.w / 2 - gap, WALL, '#4d5763');
  px(ctx, d.x + d.w / 2 + gap, s.y, d.w / 2 - gap, WALL, '#4d5763');
  px(ctx, d.x, s.y, d.w / 2 - gap, 1, '#6d7c8c');
  px(ctx, d.x + d.w / 2 + gap, s.y, d.w / 2 - gap, 1, '#6d7c8c');
  px(ctx, d.x - 3, s.y, 3, WALL, '#6d7c8c');
  px(ctx, d.x + d.w, s.y, 3, WALL, '#6d7c8c');
  px(ctx, d.x + 4, s.y + WALL, d.w - 8, 2, unlocked ? '#3f8f5a' : '#4a5560');

  // the reader
  const r = s.reader;
  px(ctx, r.x, r.y, 9, 13, '#232a31');
  px(ctx, r.x + 1, r.y + 1, 7, 11, '#39424c');
  const blink = Math.sin(t / 200) > -0.4;
  const lamp = unlocked ? (blink ? '#7ce6a0' : '#4fae74') : '#c2503f';
  px(ctx, r.x + 3, r.y + 3, 3, 3, lamp);
  px(ctx, r.x + 2, r.y + 8, 5, 1, unlocked ? '#5fbe86' : '#6d5040');
  if (unlocked) {
    ctx.globalAlpha = blink ? 0.28 : 0.16;
    const g = ctx.createRadialGradient(r.x + 4, r.y + 5, 1, r.x + 4, r.y + 5, 16);
    g.addColorStop(0, 'rgba(120,240,160,0.9)'); g.addColorStop(1, 'rgba(120,240,160,0)');
    ctx.fillStyle = g; ctx.fillRect(r.x - 12, r.y - 11, 32, 32);
    ctx.globalAlpha = 1;
  }

  // the sign
  ctx.font = '7px "JetBrains Mono", "Courier New", monospace';
  const label = 'SECURITY';
  const w = ctx.measureText(label).width + 12;
  const nx = Math.round(d.x + d.w / 2 - w / 2), ny = s.y - 13;
  px(ctx, nx, ny, w, 12, '#2b333c');
  px(ctx, nx + 1, ny + 1, w - 2, 10, '#414c58');
  pxText(ctx, label, nx + 6, ny + 9, '#0f1418');
  pxText(ctx, label, nx + 6, ny + 8, unlocked ? '#9fe0a8' : '#c9d3dd');

  if (s.poster) drawPoster(ctx, s.poster.x, s.poster.y, s.poster.w, s.poster.h);

  drawConsole(ctx, s, t, camsOn);

  if (near) pxText(ctx, '', 0, 0);
}

// The card index of personal files (frame 333:2). Three drawers, each with a paper
// label and a handle; the middle one slides out when a file is open. A drawer that is
// out is drawn over the body and below it — that is how you see it sticks into the room
// rather than inwards.
function drawConsole(ctx, s, t, on) {
  const c = s.console, x0 = c.x - c.w / 2;
  // the desk
  px(ctx, x0, c.y, c.w, c.h, '#2f3841');
  px(ctx, x0, c.y, c.w, 3, '#4c5866');
  px(ctx, x0 + 3, c.y + c.h, 4, 6, '#232a31');
  px(ctx, x0 + c.w - 7, c.y + c.h, 4, 6, '#232a31');
  // the keyboard and the joystick
  px(ctx, c.x - 18, c.y + 8, 30, 6, '#1e242b');
  for (let i = 0; i < 9; i++) px(ctx, c.x - 16 + i * 3, c.y + 10, 2, 2, '#48535f');
  px(ctx, c.x + 18, c.y + 9, 6, 5, '#1e242b');
  px(ctx, c.x + 20, c.y + 5, 2, 5, on ? '#ffd166' : '#5b6672');

  // the row of monitors above the desk
  for (let i = 0; i < 4; i++) {
    const mx = x0 + 6 + i * 31, my = c.y - 30;
    px(ctx, mx, my, 26, 22, '#20262d');
    px(ctx, mx + 1, my + 1, 24, 18, on ? '#1c3a34' : '#141a20');
    if (on) {
      const h = hash(`cam${i}`);
      for (let j = 0; j < 5; j++) {
        px(ctx, mx + 3 + ((h >>> j) % 18), my + 4 + ((h >>> (j + 3)) % 12), 3, 2, '#2f6f5e');
      }
      const line = my + 2 + Math.floor(((t / 22 + i * 40) % 18));
      ctx.globalAlpha = 0.35; px(ctx, mx + 1, line, 24, 1, '#9fe0a8'); ctx.globalAlpha = 1;
      px(ctx, mx + 21, my + 2, 2, 2, Math.sin(t / 300 + i) > 0 ? '#ff6b5a' : '#7a3630');
    }
    px(ctx, mx + 9, my + 22, 8, 3, '#20262d');
  }
}

// --------------------------------------------------------------- the meeting room
// Drawn to the approved plan 400:2 (it is drawn ×3). Wood and baize instead of tiles:
// this is not the control room, people come here to talk. There is deliberately no
// reader by the door — its absence is half the meaning of the room.
// --------------------------------------------------------------- the conservatory
// A room on the roof. Everything in it is subordinate to one thing: behind the glass is
// a real sky — the same drawSky as in the corridor windows, with the weather and the
// time of day. The frames the geometry was taken off: 734:2 (day) and 734:1654 (night
// in the rain).
//
// A plant lives in three states: dry, watered, in flower. At twenty pixels the
// difference is made by colour rather than by a pose — a leaf tilted by one pixel does
// not read there, checked on a 1:1 frame. So wet earth in the pot is TWO rows of
// pixels: that is the answer to "I have watered it", and one row is not enough for it.
const GLASS_FRAME = '#4a3628';

export function drawPot(ctx, x, y, kind, state) {
  const dry = state === 'dry', bloom = state === 'bloom';
  const leaf = dry ? '#7a7a44' : '#3f6633';
  const leaf2 = dry ? '#8f8f52' : '#4d7a3e';
  const soil = dry ? '#7a5a40' : '#2f2118';
  const d = dry ? 1 : 0;
  px(ctx, x - 5, y - 8, 10, 8, '#8a4a34');
  px(ctx, x - 5, y - 8, 10, 2, '#a85c40');
  px(ctx, x - 5, y - 2, 10, 2, '#6e3a28');
  px(ctx, x - 4, y - 7, 8, 2, soil);
  if (kind === 'flower') {
    px(ctx, x - 1, y - 15, 2, 8, leaf);
    px(ctx, x - 5, y - 13 + d, 4, 2, leaf2); px(ctx, x + 1, y - 13 + d, 4, 2, leaf2);
    px(ctx, x - 4, y - 16 + d, 3, 2, leaf); px(ctx, x + 1, y - 16 + d, 3, 2, leaf);
    if (bloom) {
      px(ctx, x - 3, y - 19, 2, 2, '#d4707f');
      px(ctx, x + 1, y - 20, 2, 2, '#e08a96');
      px(ctx, x - 1, y - 22, 2, 2, '#d4707f');
    }
  }
  if (kind === 'ficus') {
    px(ctx, x - 1, y - 18, 2, 11, '#6b4a32');
    px(ctx, x - 6, y - 22 + d, 5, 3, leaf); px(ctx, x + 1, y - 22 + d, 5, 3, leaf);
    px(ctx, x - 4, y - 25 + d, 8, 3, leaf2); px(ctx, x - 2, y - 28 + d, 4, 3, leaf);
    if (bloom) { px(ctx, x - 5, y - 26, 2, 2, '#e8d38a'); px(ctx, x + 3, y - 23, 2, 2, '#e8d38a'); }
  }
  if (kind === 'cactus') {
    const skin = dry ? '#6b7a4a' : '#4a7a52';
    px(ctx, x - 2, y - 21, 4, 14, skin);
    px(ctx, x - 5, y - 17, 3, 6, skin); px(ctx, x + 2, y - 15, 3, 6, skin);
    px(ctx, x - 1, y - 18, 1, 1, '#d9d3c8'); px(ctx, x, y - 13, 1, 1, '#d9d3c8');
    if (bloom) { px(ctx, x - 2, y - 24, 4, 3, '#e08a96'); px(ctx, x - 1, y - 25, 2, 1, '#f0a8b2'); }
  }
  if (kind === 'palm') {
    px(ctx, x - 1, y - 17, 2, 10, '#7a5a3a');
    px(ctx, x - 9, y - 19 + d, 7, 2, leaf); px(ctx, x + 2, y - 19 + d, 7, 2, leaf);
    px(ctx, x - 7, y - 22 + d, 5, 2, leaf2); px(ctx, x + 2, y - 22 + d, 5, 2, leaf2);
    px(ctx, x - 1, y - 24, 2, 3, leaf2);
    if (bloom) { px(ctx, x - 4, y - 17, 2, 2, '#e8d38a'); px(ctx, x + 2, y - 17, 2, 2, '#e8d38a'); }
  }
  if (kind === 'ivy') {
    px(ctx, x - 5, y - 13, 10, 5, leaf2); px(ctx, x - 4, y - 16, 7, 3, leaf);
    px(ctx, x - 7, y - 8 + d, 2, 6, leaf); px(ctx, x + 5, y - 8 + d, 2, 5, leaf2);
    px(ctx, x - 8, y - 4 + d, 2, 3, leaf2); px(ctx, x + 6, y - 5 + d, 2, 3, leaf);
    if (bloom) { px(ctx, x - 7, y - 1, 2, 2, '#cfd8f0'); px(ctx, x + 6, y - 2, 2, 2, '#cfd8f0'); }
  }
}

// The watering can: a body of 7×5, the water a strip at the bottom. The level cannot
// be read here, and it is not meant to be: how many waterings are left is told by the
// hint line.
export function drawCan(ctx, x, y, left = 0) {
  px(ctx, x, y, 7, 5, '#7f9aa8');
  px(ctx, x, y, 7, 1, '#9ab4c2');
  px(ctx, x + 7, y + 1, 4, 1, '#7f9aa8');
  px(ctx, x + 10, y + 2, 1, 2, '#6b8592');
  px(ctx, x - 1, y - 2, 2, 3, '#7f9aa8');
  const lvl = Math.max(0, Math.min(3, left));
  if (lvl > 0) px(ctx, x + 1, y + 5 - lvl, 5, lvl, '#3f6b8a');
}

export function drawGreenhouse(ctx, r, t, opts = {}) {
  // The weather has to be an object: drawSky reads weather.kind without a check, and on
  // the first frames — until /api/settings has answered — there is none yet. A room with
  // a glass wall would fall over on every such frame.
  const { night = 0, garden = null } = opts;
  const weather = opts.weather || { kind: 'clear' };
  const x0 = r.x, y0 = r.y, W = r.w, H = r.h;

  // --- the glass wall: the sky, the glazing bars, the glints, the condensation
  drawSky(ctx, x0 + 2, y0 + 2, W - 4, 22, t, night, weather);
  for (let x = 0; x < W; x += 30) px(ctx, x0 + x, y0, 2, WALL, GLASS_FRAME);
  px(ctx, x0, y0 + 12, W, 1, GLASS_FRAME);
  px(ctx, x0, y0, W, 2, '#6b4d33');
  px(ctx, x0, y0 + WALL - 2, W, 2, '#5a4f45');
  ctx.globalAlpha = 0.16;
  for (let x = 8; x < W; x += 30) px(ctx, x0 + x, y0 + 2, 1, 22, '#e8f2f8');
  ctx.globalAlpha = 1;
  // The condensation is on the glass over the bars, while the rain goes BEHIND it: that
  // is the difference between "drops outside" and "misted up from within".
  const wet = weather && (weather.kind === 'rain' || weather.kind === 'storm');
  ctx.globalAlpha = wet ? 0.55 : 0.3;
  for (let i = 0; i < 14; i++) {
    const h = hash('cond' + i);
    px(ctx, x0 + 8 + (h % (W - 16)), y0 + 4 + ((h >>> 5) % 16), 1, 2, '#e8f2f8');
  }
  ctx.globalAlpha = 1;

  // --- the floor: brick with the rows offset. Square tiles together with the light from
  // under the bars read as floorboards, and on two frames in a row the wrong thing was fixed.
  for (let y = y0 + WALL; y < y0 + H; y += 8) {
    const off = (((y - y0 - WALL) / 8) % 2) ? 8 : 0;
    for (let x = -8; x < W; x += 16) {
      const h = hash(`gh${x + off},${y}`);
      px(ctx, x0 + x + off, y, 15, 7, ['#6b4a3a', '#654436', '#71503e'][h % 3]);
      px(ctx, x0 + x + off, y + 7, 16, 1, '#513628');
      px(ctx, x0 + x + off + 15, y, 1, 8, '#513628');
    }
  }
  px(ctx, x0, y0 + H - 10, W, 10, '#4a3b31');
  px(ctx, x0, y0 + H - 10, W, 2, '#8a6247');
  px(ctx, x0, y0, 8, H, '#4a3b31');
  px(ctx, x0 + W - 8, y0, 8, H, '#4a3b31');

  // --- the shaft from under the bars. Slanted and fading: a vertical strip the whole
  // depth is a floorboard, not light. At night there are two shafts and they are moonlit.
  const beams = night > 0.5 ? [140, 320] : [30, 90, 150, 210, 270, 330, 390];
  for (const bx of beams) {
    for (let i = 0; i < 16; i++) {
      const y = y0 + WALL + i * 8;
      if (y > y0 + H - 10) break;
      ctx.globalAlpha = (night > 0.5 ? 0.09 : 0.15) * (1 - i / 18) * (1 - night * 0.5);
      px(ctx, x0 + bx + i * 2, y, 7, 8, night > 0.5 ? '#7aa0d8' : '#ffe9a8');
    }
  }
  ctx.globalAlpha = 1;

  // --- the door
  px(ctx, r.door.x - 2, y0 + 2, r.door.w + 4, WALL - 2, '#241e1a');
  px(ctx, r.door.x, y0 + 4, r.door.w, WALL - 6, night > 0.5 ? '#2b3138' : '#5b7f92');
  px(ctx, r.door.x, y0 + 4, r.door.w, 2, '#55626e');
  px(ctx, r.door.x + r.door.w / 2 - 1, y0 + 4, 2, WALL - 6, '#241e1a');
  px(ctx, r.door.x + r.door.w / 2 - 5, y0 + 13, 3, 1, '#c9a06a');
  px(ctx, r.door.x + r.door.w / 2 + 2, y0 + 13, 3, 1, '#c9a06a');

  // --- the shelving, the hanging planters, the potting table
  px(ctx, x0 + 28, y0 + 60, 172, 4, '#8a6247');
  px(ctx, x0 + 28, y0 + 64, 172, 2, '#6b4a32');
  px(ctx, x0 + 32, y0 + 66, 3, 16, '#6b4a32');
  px(ctx, x0 + 193, y0 + 66, 3, 16, '#6b4a32');
  for (const hx of [252, 300, 348]) {
    const sway = Math.sin(t / 1400 + hx) * 0.6;
    px(ctx, x0 + hx, y0 + WALL, 1, 12, '#8a6247');
    px(ctx, x0 + hx - 5 + sway, y0 + 38, 11, 6, '#8a4a34');
    px(ctx, x0 + hx - 5 + sway, y0 + 38, 11, 2, '#a85c40');
    px(ctx, x0 + hx - 7 + sway, y0 + 44, 3, 5, '#3f6633');
    px(ctx, x0 + hx + 4 + sway, y0 + 44, 3, 4, '#4d7a3e');
    px(ctx, x0 + hx - 3 + sway, y0 + 35, 7, 3, '#4d7a3e');
  }
  px(ctx, x0 + 36, y0 + 104, 62, 4, '#8a6247');
  px(ctx, x0 + 36, y0 + 108, 62, 2, '#6b4a32');
  px(ctx, x0 + 40, y0 + 110, 3, 12, '#6b4a32');
  px(ctx, x0 + 91, y0 + 110, 3, 12, '#6b4a32');
  px(ctx, x0 + 44, y0 + 99, 12, 5, '#8a4a34');
  px(ctx, x0 + 44, y0 + 99, 12, 2, '#a85c40');
  px(ctx, x0 + 60, y0 + 101, 9, 3, '#3a2a1e');
  px(ctx, x0 + 72, y0 + 100, 14, 4, '#7a6a4a');

  // --- the tap, the sink, the bucket, the puddle, the hose
  px(ctx, x0 + 348, y0 + 66, 58, 4, '#8a6247');
  px(ctx, x0 + 354, y0 + 70, 46, 13, '#aab8bc');
  px(ctx, x0 + 357, y0 + 72, 40, 9, '#7f8c90');
  px(ctx, x0 + 376, y0 + 50, 3, 16, '#8f9a9e');
  px(ctx, x0 + 376, y0 + 50, 13, 3, '#8f9a9e');
  px(ctx, x0 + 386, y0 + 53, 2, 5, '#8f9a9e');
  px(ctx, x0 + 360, y0 + 86, 13, 11, '#7f8c90');
  px(ctx, x0 + 360, y0 + 86, 13, 2, '#9aa8ac');
  ctx.globalAlpha = 0.55; px(ctx, x0 + 352, y0 + 100, 22, 3, '#4a3b32'); ctx.globalAlpha = 1;
  px(ctx, x0 + 392, y0 + 92, 14, 2, '#3f5a44');
  px(ctx, x0 + 390, y0 + 94, 18, 2, '#4a6b50');
  px(ctx, x0 + 392, y0 + 96, 14, 2, '#3f5a44');
  // a bag of earth and a stack of empty pots
  px(ctx, x0 + 298, y0 + 96, 17, 15, '#7a6a4a');
  px(ctx, x0 + 298, y0 + 96, 17, 3, '#8f7f5a');
  px(ctx, x0 + 302, y0 + 93, 9, 4, '#3a2a1e');
  px(ctx, x0 + 322, y0 + 102, 11, 9, '#8a4a34');
  px(ctx, x0 + 322, y0 + 102, 11, 2, '#a85c40');
  px(ctx, x0 + 324, y0 + 96, 11, 8, '#8a4a34');
  px(ctx, x0 + 324, y0 + 96, 11, 2, '#a85c40');

  // --- the hook with the watering can: empty if the can has been taken
  px(ctx, x0 + 336, y0 + 52, 2, 4, '#6b4a32');
  if (!garden || !garden.canTaken) drawCan(ctx, x0 + 328, y0 + 56, garden ? garden.canLeft : 4);

  // --- the bench
  px(ctx, x0 + 268, y0 + 124, 46, 4, '#8a6247');
  px(ctx, x0 + 268, y0 + 128, 46, 2, '#6b4a32');
  px(ctx, x0 + 270, y0 + 130, 3, 8, '#6b4a32');
  px(ctx, x0 + 309, y0 + 130, 3, 8, '#6b4a32');
  px(ctx, x0 + 268, y0 + 110, 46, 3, '#8a6247');
  px(ctx, x0 + 270, y0 + 113, 3, 11, '#6b4a32');
  px(ctx, x0 + 309, y0 + 113, 3, 11, '#6b4a32');

  // --- the plants themselves
  for (const p of r.pots) drawPot(ctx, p.x, p.y, p.kind, (garden && garden.state && garden.state[p.i]) || 'wet');

  // --- the plaque over the door. The same as on the project rooms, and its second line
  // is assembled exactly the same way out of what goes on in the room: «полито 5 из 7».
  drawNameplate(ctx, { ...r, sub: (garden && garden.sign) || '' }, r.door);

  // --- the lamp over the shelving: at night it is the only warm spot in the room
  if (night > 0.35) {
    px(ctx, x0 + 112, y0 + WALL, 1, 6, '#6b4a32');
    px(ctx, x0 + 107, y0 + 32, 11, 4, '#3a2a1e');
    px(ctx, x0 + 108, y0 + 36, 9, 1, '#ffe9a8');
    for (let i = 0; i < 13; i++) {
      const y = y0 + 38 + i * 9;
      if (y > y0 + H - 10) break;
      const half = 7 + i * 2.6;
      ctx.globalAlpha = 0.17 * (1 - i / 14) * night;
      px(ctx, x0 + 112 - half, y, half * 2, 9, '#ffd9a0');
    }
    ctx.globalAlpha = 1;
  }
}

export function drawMeeting(ctx, m, t) {
  const x0 = m.x, y0 = m.y, W = m.w, H = m.h;

  // the floor: boards with seams every 16 and joints along the length
  px(ctx, x0, y0 + WALL, W, H - WALL, '#7a5a41');
  for (let y = y0 + WALL; y < y0 + H; y += 16) px(ctx, x0, y, W, 1, '#6a4c36');
  for (const dx of [40, 120, 200, 280]) px(ctx, x0 + dx, y0 + WALL, 1, H - WALL, '#6a4c36');

  // the wall to the corridor: the frame, the glass, the edging
  px(ctx, x0, y0, W, WALL, '#3a2c22');
  px(ctx, x0, y0, W, 3, '#8a6247');
  for (const g of m.glass) {
    px(ctx, g.x, y0 + 5, g.w, 16, '#8fb0bd');
    // a glint along the top edge: without it the glass reads as a painted panel
    ctx.globalAlpha = 0.35;
    px(ctx, g.x, y0 + 5, g.w, 2, '#e8f4f8');
    ctx.globalAlpha = 1;
  }
  const d = m.door;
  px(ctx, d.x, y0, d.w, WALL, '#7a5a41');
  px(ctx, d.x - 1, y0, 1, WALL, '#2a1d15');
  px(ctx, d.x + d.w, y0, 1, WALL, '#2a1d15');
  px(ctx, x0, y0 + WALL - 4, d.x - x0, 3, '#5a4232');
  px(ctx, d.x + d.w + 1, y0 + WALL - 4, x0 + W - d.x - d.w - 1, 3, '#5a4232');

  // the side and bottom walls — exactly where blocked() sees them
  px(ctx, x0, y0 + WALL, 8, H - WALL, '#4a382c');
  px(ctx, x0 + W - 8, y0 + WALL, 8, H - WALL, '#4a382c');
  px(ctx, x0, y0 + H - 10, W, 10, '#4a382c');
  px(ctx, x0, y0 + WALL, 8, 2, '#8a6247');
  px(ctx, x0 + W - 8, y0 + WALL, 8, 2, '#8a6247');
  px(ctx, x0, y0 + H - 10, W, 2, '#8a6247');

  // the chairs: a drawing, not furniture — people walk through them
  for (const s of m.seats) {
    px(ctx, s.x, s.y, 20, 14, '#4a3628');
    px(ctx, s.x, s.back === 'top' ? s.y : s.y + 11, 20, 3, '#5e4633');
  }

  // the table under green baize
  const tb = m.table;
  px(ctx, tb.x, tb.y, tb.w, tb.h, '#5c4230');
  px(ctx, tb.x + 4, tb.y + 4, tb.w - 8, tb.h - 8, '#3f6b4a');

  // the sign over the door
  ctx.font = '7px "JetBrains Mono", "Courier New", monospace';
  const label = m.title;
  const w = ctx.measureText(label).width + 12;
  const nx = Math.round(d.x + d.w / 2 - w / 2), ny = y0 - 22;
  px(ctx, nx, ny, w, 16, '#2a1d15');
  px(ctx, nx, ny, w, 2, '#a9784c');
  pxText(ctx, label, nx + 6, ny + 11, '#f6e3c0');
}
