// The polaroid in the lounge — a free module (tier "core" in module.json).
//
// A polaroid lies on a side table between the kicker and the sofa. SPACE by it
// seats you on the sofa's left place with the camera in your hands and opens
// Instagram in a browser window the size of a phone. The office reads nothing
// from Instagram and holds no password: the window is the owner's own browser,
// logged in as the owner, and instagram.com refuses to be framed inside the
// office anyway. What the office does is watch: while that window is open and
// an agent comes free and waits for you, the polaroid flashes and the browser
// posts a notification with the same line the office toasts.
//
// Frame: WIP — Polaroid in the lounge, v2 (section #polaroid).
import { t as tr } from '../../web/i18n.js';
import { toast } from '../../web/ui.js';
import { placeFor, tableProp, freed } from './polaroid.js';

const URL = 'https://www.instagram.com/';
// One name for the window: SPACE again brings the same window forward instead
// of opening a second one or reloading the feed someone is halfway down.
const NAME = 'valey-polaroid';
const FEATURES = 'popup,width=390,height=844';
const FLASH_MS = 900;

const DICT = {
  ru: {
    'polaroid.hint': '[ ПРОБЕЛ ] полистать инсту',
    'polaroid.blocked': 'браузер не открыл окно — разреши всплывающие окна для офиса',
  },
  en: {
    'polaroid.hint': '[ SPACE ] scroll Instagram',
    'polaroid.blocked': 'the browser blocked the window — allow pop-ups for the office',
  },
};

// The colours are the office tokens the frame is painted with (office/wood/*,
// palette/ink, the rainbow of palette/bad, warn, accent, info), written out as
// the canvas needs them, like every prop the core draws.
const C = {
  lit: '#6b4a2e', wood: '#4a3325', dark: '#2a1d15', knob: '#c9a06a',
  cream: '#f6e3c0', shade: '#c9b391', deep: '#140d08', ring: '#4b433c',
  red: '#ff9f8f', yellow: '#ffd166', green: '#9fe0a8', blue: '#8fc8ff', white: '#ffffff',
};
const TABLE_ROWS = [
  'LLLLLLLLLL', 'LLLLLLLLLL', 'BBBBBBBBBB', 'BBBBBBBBBB', 'BDDDDDDDDB', 'BBBBkBBBBB',
  'BBBBBBBBBB', 'BDDDDDDDDB', 'BBBBkBBBBB', 'BBBBBBBBBB', 'D........D', 'D........D',
];
const TABLE_MAP = { L: C.lit, B: C.wood, D: C.dark, k: C.knob };
// Cream body, the flash window top right, the lens, and the rainbow stripe.
const POLAROID_ROWS = ['CCCCCfC', 'CrRRRCC', 'CyRlRCC', 'CgRRRCC', 'SbSSSSS'];
const POLAROID_MAP = { C: C.cream, S: C.shade, f: C.deep, R: C.ring, l: C.deep, r: C.red, y: C.yellow, g: C.green, b: C.blue };

function pixels(ctx, x0, y0, rows, map) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c === '.') continue;
      ctx.fillStyle = map[c];
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

// The flash: a white core, rays with a gap, the far ends warm. Three blinks,
// then it stops — a strobe would read as a fault, not as a call.
function drawFlash(ctx, cx, cy, since, now) {
  const e = now - since;
  if (e < 0 || e > FLASH_MS || Math.floor(e / 150) % 2) return;
  const dot = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(cx + x, cy + y, 1, 1); };
  ctx.globalAlpha = 0.22; ctx.fillStyle = C.yellow;
  ctx.beginPath(); ctx.arc(cx + 0.5, cy + 0.5, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  for (const [x, y] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x, y, C.white);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let k = 3; k <= 5; k++) dot(dx * k, dy * k, C.white);
    for (let k = 6; k <= 7; k++) dot(dx * k, dy * k, C.yellow);
  }
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    dot(dx * 2, dy * 2, C.white); dot(dx * 3, dy * 3, C.yellow); dot(dx * 4, dy * 4, C.yellow);
  }
}

let win = null;          // the Instagram window, while it is open
let mySeat = null;       // the seat object this module put into state.seat
let flashAt = -1e9;
let last = null;         // the state from the latest tick: draw and near are not handed it
const seen = new Map();  // agent id → status, for the freed transition

const watching = () => !!(win && !win.closed);

function openWindow() {
  if (watching()) { try { win.focus(); } catch { /* another origin; focus is a courtesy */ } return true; }
  win = window.open(URL, NAME, FEATURES);
  return !!win;
}

// Asked on the first SPACE at the polaroid, which is a user gesture — not on
// entering the office, where a permission prompt out of nowhere reads as spam.
// A refusal costs nothing: the flash, the toast and its sound stay.
function askToNotify() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  try { Notification.requestPermission().catch(() => {}); } catch { /* old Safari: callback form only */ }
}

function notify(agent) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const n = new Notification('Valey', {
    body: tr('toast.freed', { name: agent.name, a: agent.gender === 'f' ? 'ась' : 'ся' }),
    tag: `valey-polaroid-${agent.id}`,
    icon: '/favicon-128.png',
  });
  n.onclick = () => { window.focus(); n.close(); };
}

// Sitting down the way the core's benches do it (sitDown in web/main.js): the
// person is put on the seat, stops, and any step or SPACE lifts them onto the
// point in front of the table — the core handles that part itself.
function sit(state, place) {
  const p = state.player;
  mySeat = { x: place.seat.x, y: place.seat.y, out: place.out, dir: 1 };
  state.seat = mySeat;
  p.x = place.seat.x; p.y = place.seat.y;
  p.moving = false; p.running = false; p.vx = 0; p.vy = 0;
  if (p.skate) p.skate = false;
}

function standUp(state) {
  if (!state || state.seat !== mySeat || !mySeat) return;
  const p = state.player;
  p.x = mySeat.out.x; p.y = mySeat.out.y; p.moving = false;
  state.seat = null;
}

export function register(api) {
  api.i18n(DICT);

  api.on('layout', (L) => {
    const place = placeFor(L);
    if (!place) return;
    L.polaroid = place;
    if (!(L.props || []).some((p) => p.kind === 'polaroid-table')) (L.props = L.props || []).push(tableProp(place));
  });

  api.on('near', (p, L) => {
    const place = L && L.polaroid;
    if (!place || (last && last.seat)) return null;
    return { kind: 'polaroid', place, d: Math.hypot(place.out.x - p.x, place.out.y - p.y) };
  });

  api.on('act', (n, state) => {
    if (n.kind !== 'polaroid') return false;
    askToNotify();
    if (!openWindow()) { toast(tr('polaroid.blocked'), 'wait'); return true; }
    sit(state, n.place);
    return true;
  });

  api.on('hint', (near, state) => {
    if (!near || near.kind !== 'polaroid' || (state && state.seat)) return null;
    // Below the table, at the feet, like the benches' own hints (seat.y + 26 in
    // web/main.js). The frame drew it above; on the floor the one standing in
    // front of the table wears the «ТЫ» label at exactly that height, and the two
    // were printed over each other.
    const t = near.place.table;
    return { x: t.x, y: t.y + 26, text: tr('polaroid.hint'), color: C.yellow };
  });

  api.on('tick', (state) => {
    last = state;
    if (!state) return;
    // The window was closed: you get up in front of the table, and the polaroid
    // goes back on it.
    if (win && win.closed) { win = null; standUp(state); }
    const free = freed(seen, state.agents);
    if (free.length && watching()) {
      flashAt = performance.now();
      for (const a of free) notify(a);
    }
  });

  api.on('draw', (L, t) => {
    const place = L && L.polaroid;
    if (!place) return null;
    const tb = place.table;
    const holding = !!(last && mySeat && last.seat === mySeat);
    const out = [{
      // Sorted by the table's bottom edge, like every piece of furniture: whoever
      // stands in front of it is drawn over it.
      y: tb.y,
      fn: (ctx) => {
        pixels(ctx, tb.x - 5, tb.y - 12, TABLE_ROWS, TABLE_MAP);
        if (!holding) pixels(ctx, tb.x - 3, tb.y - 17, POLAROID_ROWS, POLAROID_MAP);
      },
    }];
    if (holding) {
      const p = last.player;
      const px = Math.round(p.x) - 3, py = Math.round(p.y) - 11;
      out.push({ y: p.y + 0.5, fn: (ctx) => pixels(ctx, px, py, POLAROID_ROWS, POLAROID_MAP) });
      out.push({ y: 1e9 - 1, fn: (ctx) => drawFlash(ctx, px + 5, py, flashAt, performance.now()) });
    } else {
      out.push({ y: 1e9 - 1, fn: (ctx) => drawFlash(ctx, tb.x + 2, tb.y - 17, flashAt, performance.now()) });
    }
    return out;
  });
}
