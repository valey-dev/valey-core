// The office plan is a module. The K key opens a scheme of the whole building: the floors
// as in the lift, the rooms as on a plan, people as dots at their real coordinates and a
// blue cross for "you are here". An answer to one question: where is who, without leaving
// your own room and without riding the lift.
//
// It is drawn as a fire-escape plan on a wall: paper, black outlines, coloured dots. The
// geometry is not invented — it is the same layout squeezed by four, so a person in the
// corridor stands on the plan exactly where he stands in the office. The frame was approved
// on 4 September 2026 (the whole building, the K key, as a module).
//
// A module rather than a line in the core: the panel, the key and the dictionary are its
// own; from the core it needs only the points `key`, `esc`, `busy`, `tick`, `lang`,
// `help` — all of them shared.
import { t as tr } from '../../web/i18n.js';
import { esc } from '../../web/esc.js';
import { toast, clean, actText, roleText, ago } from '../../web/ui.js';
import { WALL, LIFT_DOOR_H, MARGIN } from '../../web/layout.js';

const DICT = {
  ru: {
    'plan.hint': 'план офиса',
    'plan.place': 'план офиса', 'plan.place.close': 'закрыть',
    'plan.place.go': 'вести туда', 'plan.place.room': 'комната',
    'plan.title': 'ПЛАН ОФИСА',
    'plan.floors': 'one:{n} этаж|few:{n} этажа|many:{n} этажей',
    'plan.projects': 'one:{n} проект|few:{n} проекта|many:{n} проектов',
    'plan.people': 'one:{n} человек|few:{n} человека|many:{n} человек',
    'plan.waiting': 'one:{n} ждёт тебя|few:{n} ждут тебя|many:{n} ждут тебя',
    'plan.nobodyWaits': 'никто не ждёт',
    'plan.paper': 'ПЛАН ЭВАКУАЦИИ · ВАЛЕЙ',
    'plan.foot': 'лестницы нет — по коридорам и лифтом',
    'plan.here': 'ВЫ ЗДЕСЬ',
    'plan.floor': 'этаж {n}',
    'plan.desks': 'one:{n} стол|few:{n} стола|many:{n} столов',
    'plan.waits': 'ждёт тебя',
    'plan.go': 'ENTER — вести туда',
    'plan.empty': 'никого нет',
    'plan.you': 'ты',
    'plan.guest': 'гость',
    'plan.cat': 'кот',
    'plan.lgWork': 'работает',
    'plan.lgWait': 'ждёт тебя',
    'plan.lgIdle': 'отошёл',
    'plan.lgFree': 'стол пуст',
    'plan.lgMe': 'вы здесь',
    'plan.keys': '← ↑ → ↓ комната · ENTER идти · ESC',
  },
  en: {
    'plan.hint': 'office plan',
    'plan.place': 'the office plan', 'plan.place.close': 'close',
    'plan.place.go': 'lead me there', 'plan.place.room': 'room',
    'plan.title': 'OFFICE PLAN',
    'plan.floors': 'one:{n} floor|other:{n} floors',
    'plan.projects': 'one:{n} project|other:{n} projects',
    'plan.people': 'one:{n} person|other:{n} people',
    'plan.waiting': 'one:{n} waiting for you|other:{n} waiting for you',
    'plan.nobodyWaits': 'nobody is waiting',
    'plan.paper': 'EVACUATION PLAN · VALEY',
    'plan.foot': 'no stairs — corridors and the lift',
    'plan.here': 'YOU ARE HERE',
    'plan.floor': 'floor {n}',
    'plan.desks': 'one:{n} desk|other:{n} desks',
    'plan.waits': 'waiting for you',
    'plan.go': 'ENTER — take me there',
    'plan.empty': 'nobody here',
    'plan.you': 'you',
    'plan.guest': 'guest',
    'plan.cat': 'the cat',
    'plan.lgWork': 'working',
    'plan.lgWait': 'waiting for you',
    'plan.lgIdle': 'stepped away',
    'plan.lgFree': 'empty desk',
    'plan.lgMe': 'you are here',
    'plan.keys': '← ↑ → ↓ room · ENTER go · ESC',
  },
};

// The paper and the ink of the plan. Deliberately not from the office palette: a plan is a
// thing on a wall, it is not repainted along with the tone of the office, no more than the
// tiles in the rooms are.
const PAPER = '#f1e2bc', INK = '#2b1d14', LINE = '#5a4632', DIM = '#b9a480';
const ROOM = '#efe0b8', SERVICE = '#e3d3ab', GREEN = '#dfe6c2', HALL = '#e8d8b0', LANE = '#ecdcb4';
const WALL_C = '#cbb58a', GLASS = '#bfd8dc', DESK = '#c9a97a', SHAFT = '#e2cf9f', CABIN = '#7d6448';
const WORK = '#6cc27a', WAIT = '#f0b429', IDLE = '#8c7660', ME = '#3fa9f5', CAT = '#e08a3c', GUEST = '#7c6ab0';
// A stopped agent — cut off mid-step — is the office's --off, as on its bubble and card.
const STOP = '#c2795f';
// The squeeze: a quarter while the building fits; above that, as much as fits into the panel.
const SCALE = 0.25, MAP_W = 380, MAP_H = 340;

const $ = (s) => document.querySelector(s);
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
const box = (ctx, x, y, w, h, c) => { px(ctx, x, y, w, 1, c); px(ctx, x, y + h - 1, w, 1, c); px(ctx, x, y, 1, h, c); px(ctx, x + w - 1, y, 1, h, c); };
const dashed = (ctx, x, y, w, h, c) => {
  for (let k = 0; k < w; k += 4) { px(ctx, x + k, y, 2, 1, c); px(ctx, x + k, y + h - 1, 2, 1, c); }
  for (let k = 0; k < h; k += 4) { px(ctx, x, y + k, 1, 2, c); px(ctx, x + w - 1, y + k, 1, 2, c); }
};
const text = (ctx, s, x, y, c, size = 7, bold = false) => {
  ctx.font = `${bold ? '700 ' : ''}${size}px "JetBrains Mono", "Courier New", monospace`;
  ctx.fillStyle = c;
  ctx.fillText(s, x | 0, y | 0);
};

// The state of the office arrives on a tick; the panel is an element of its own, there is
// no hole for it in the core's markup.
let S = null;
let el = null;
let cells = [];        // the rooms on the plan in reading order: top to bottom, left to right
let focus = 0;
let builtSig = '';     // which plan the cells were assembled for
let detailKey = '';
let countKey = '';
let lastPaint = -1;
let geom = null;       // the scale and the size of the canvas in css pixels

function ensurePanel() {
  if (el) return;
  el = document.createElement('div');
  el.id = 'plan';
  el.hidden = true;
  document.body.appendChild(el);
}

export function planOpen() { return !!el && !el.hidden; }
// The key of the room in focus — for the stand, so that walking with the arrows is checked
// against the data rather than against a stand-in DOM.
export function planFocus() { return cells[focus] ? cells[focus].room.key : null; }

// ------------------------------------------------------------------ the data
const statusColor = (a) => (!a ? DIM : a.status === 'awaiting' ? WAIT : a.status === 'stopped' ? STOP : a.status === 'idle' ? IDLE : WORK);
const inRect = (p, r) => p && p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

function floorOf(L, room) {
  const f = (L.lift.floors || []).find((x) => x.rooms.includes(room.title));
  return f ? f.n : null;
}

// Who is in a room. In a project room those whose desks stand in it: somebody gone for
// coffee is still its person. A service room has no desks — those inside are counted.
function peopleIn(room) {
  const byId = new Map((S.agents || []).map((a) => [a.id, a]));
  if (room.agents && room.agents.length && !room.service) {
    return room.agents.map((id) => byId.get(id)).filter(Boolean);
  }
  const out = [];
  for (const act of (S.actors || new Map()).values()) {
    const a = byId.get(act.id);
    if (a && inRect(act, room)) out.push(a);
  }
  return out;
}

// Whom to highlight with the arrow: the one waiting, otherwise the one working, otherwise
// the first — the same choice as at the reception desk, so that "lead me there" leads to the
// same person.
function leadOf(list) {
  return list.find((a) => a.status === 'awaiting') || list.find((a) => a.status === 'working') || list[0] || null;
}

function scaleFor(L) {
  const k = Math.min(SCALE, MAP_W / L.w, MAP_H / L.h);
  return { k, w: Math.ceil(L.w * k), h: Math.ceil(L.h * k) };
}

// The cells of the plan: every room, project and service, in reading order. The focus walks
// over them and the buttons for the mouse stand on them.
function buildCells(L) {
  const { k } = geom;
  const rooms = [...(L.rooms || [])].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  cells = rooms.map((room) => ({
    room,
    x: room.x * k, y: room.y * k, w: room.w * k, h: room.h * k,
    cx: (room.x + room.w / 2) * k, cy: (room.y + room.h / 2) * k,
  }));
}

// ------------------------------------------------------------------ the panel
function chrome() {
  return `<div class="rwrap planwrap">
    <div class="vhead"><span>${tr('plan.title')} <i id="plancount"></i></span><button id="planx">✕</button></div>
    <div class="planbody">
      <div class="planmap" id="planmap"><canvas id="plancanvas"></canvas></div>
      <div class="plandetail" id="plandetail"></div>
    </div>
    <div class="planlegend">
      <span><s style="background:${WORK}"></s>${tr('plan.lgWork')}</span>
      <span><s style="background:${WAIT}"></s>${tr('plan.lgWait')}</span>
      <span><s style="background:${IDLE}"></s>${tr('plan.lgIdle')}</span>
      <span><s class="free"></s>${tr('plan.lgFree')}</span>
      <span><s style="background:${ME}"></s>${tr('plan.lgMe')}</span>
      <span class="k">${tr('plan.keys')}</span>
    </div></div>`;
}

export function openPlan() {
  if (!S || !S.layout) return;
  ensurePanel();
  const was = planOpen();
  el.hidden = false;
  el.innerHTML = chrome();
  $('#planx').onclick = closePlan;
  builtSig = ''; detailKey = ''; countKey = ''; lastPaint = -1;
  rebuild();
  // A change of language rebuilds an open panel the same way — and the focus stays on the
  // room it was looking at.
  if (!was) focus = startFocus();
  refresh(true);
}

export function closePlan() {
  if (!el) return;
  el.hidden = true;
}

// Rebuild the cells and the buttons under them: on opening, and when the plan changed under
// an open panel. The focus survives the rebuild by the key of the room — the room it was
// looking at stays the same.
function rebuild() {
  const L = S.layout;
  const was = planFocus();
  geom = scaleFor(L);
  buildCells(L);
  builtSig = S.sig || '';
  focus = Math.max(0, cells.findIndex((c) => c.room.key === was));
  const map = $('#planmap');
  const canvas = $('#plancanvas');
  if (!map || !canvas) return;
  canvas.width = geom.w * 2; canvas.height = geom.h * 2;
  canvas.style.width = geom.w + 'px'; canvas.style.height = geom.h + 'px';
  for (const b of map.querySelectorAll('.plancell')) b.remove();
  cells.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'plancell';
    b.dataset.key = c.room.key;
    b.title = c.room.title;
    b.style.left = (c.x + 10) + 'px'; b.style.top = (c.y + 10) + 'px';
    b.style.width = c.w + 'px'; b.style.height = c.h + 'px';
    b.onclick = () => { focus = i; refresh(true); };
    b.ondblclick = () => { focus = i; go(); };
    map.appendChild(b);
  });
}

// The first focus is the room you are standing in; in a corridor, the nearest door. From it
// the arrows read as "the neighbouring room" rather than "the first in the list".
function startFocus() {
  const p = S.player || { x: 0, y: 0 };
  let best = 0, bestD = Infinity;
  cells.forEach((c, i) => {
    const r = c.room;
    if (S.currentRoom && S.currentRoom.key === r.key) { best = i; bestD = -1; return; }
    if (bestD < 0) return;
    const d = r.doorPoint ? Math.hypot(r.doorPoint.x - p.x, r.doorPoint.y - p.y) : Infinity;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function refresh(force) {
  if (!planOpen() || !S || !S.layout) return;
  if ((S.sig || '') !== builtSig) rebuild();
  paintCount();
  paintDetail(force);
  paintMap();
  for (const b of $('#planmap').querySelectorAll('.plancell')) {
    b.classList.toggle('focus', b.dataset.key === planFocus());
  }
}

function paintCount() {
  const L = S.layout;
  const floors = (L.bands || []).filter((b) => !b.roof).length;
  const waiting = (S.agents || []).filter((a) => a.status === 'awaiting').length;
  const parts = [
    tr('plan.floors', { n: floors }),
    tr('plan.projects', { n: (L.projectRooms || []).length }),
    tr('plan.people', { n: (S.agents || []).length }),
    waiting ? tr('plan.waiting', { n: waiting }) : tr('plan.nobodyWaits'),
  ];
  const s = parts.join(' · ');
  if (s === countKey) return;
  countKey = s;
  const n = $('#plancount');
  if (n) n.textContent = s;
}

// The right column: the room in focus and who is in it. It is repainted only when its text
// has changed — otherwise the panel would flicker every two seconds on live data, as the
// round once did.
function paintDetail(force) {
  const c = cells[focus];
  const d = $('#plandetail');
  if (!c || !d) return;
  const room = c.room;
  const L = S.layout;
  const list = peopleIn(room).slice().sort((a, b) => (b.status === 'awaiting') - (a.status === 'awaiting'));
  const lead = leadOf(list);
  const n = floorOf(L, room);
  const sub = [room.sub, n != null ? tr('plan.floor', { n }) : '', room.desks && room.desks.length ? tr('plan.desks', { n: room.desks.length }) : '']
    .filter(Boolean).join(' · ');
  const rows = list.map((a) => {
    const said = clean(a.lastSaid).slice(0, 60);
    const line = a.status === 'awaiting'
      ? `${tr('plan.waits')}${said ? ' — «' + said + '»' : ''}`
      : (said || actText(a) || '');
    return `<div class="planrow${a.status === 'awaiting' ? ' wait' : ''}">
      <span class="plandot" style="background:${statusColor(a)}"></span>
      <div class="who"><b>${esc(a.name)}${roleText(a) ? ' · ' + esc(roleText(a)) : ''}</b>
      <i>${esc(line)}${a.idleFor != null ? ' · ' + esc(ago(a.idleFor)) : ''}</i></div></div>`;
  });
  // Who else is inside besides the agents: you yourself, the guests, the cat. They need no
  // arrow, but "where is who" without them is incomplete.
  const extra = [];
  if (inRect(S.player, room)) extra.push(`<span class="plandot" style="background:${ME}"></span>${tr('plan.you')}`);
  for (const q of (S.people || new Map()).values()) if (inRect(q, room)) extra.push(`<span class="plandot" style="background:${GUEST}"></span>${esc(q.name || tr('plan.guest'))}`);
  if (inRect(S.cat, room)) extra.push(`<span class="plandot" style="background:${CAT}"></span>${tr('plan.cat')}`);
  const html = `<h4>▣ ${esc(room.title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h4>
    ${rows.join('') || `<p class="hint">${tr('plan.empty')}</p>`}
    ${extra.length ? `<p class="planextra">${extra.join(' · ')}</p>` : ''}
    <div class="spacer"></div>
    ${lead ? `<button class="plango" id="plango">${tr('plan.go')}</button>` : ''}`;
  if (!force && html === detailKey) return;
  detailKey = html;
  d.innerHTML = html;
  const btn = $('#plango');
  if (btn) btn.onclick = go;
}

// "Lead me there" is the same arrow as at the round and at the desk: the core leads to an
// agent, not to a room, so we go to the one leadOf chose.
function go() {
  const c = cells[focus];
  if (!c) return;
  const lead = leadOf(peopleIn(c.room));
  if (!lead) { toast(tr('plan.empty')); return; }
  S.waypoint = lead.id;
  toast(tr('toast.guideHim'));
  closePlan();
}

// ------------------------------------------------------------------ the canvas
function paintMap() {
  const canvas = $('#plancanvas');
  if (!canvas || !geom) return;
  const ctx = canvas.getContext('2d');
  const L = S.layout;
  const { k, w: W, h: H } = geom;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // the paper
  px(ctx, 0, 0, W, H, PAPER);
  for (let i = 0; i < W; i += 6) for (let j = 0; j < H; j += 6) if (((i + j) / 6) % 7 === 0) px(ctx, i, j, 1, 1, '#e6d5ae');
  text(ctx, tr('plan.paper'), 6, 8, LINE, 6.5, true);
  text(ctx, tr('plan.foot'), 6, H - 3, DIM, 6);

  const lift = L.lift || { x: L.w, w: 0, floors: [], reception: [] };
  const bands = L.bands || [];
  // the corridors and the passages between the columns: that is where people walk
  for (const b of bands) px(ctx, (MARGIN / 2) * k, b.y * k, (lift.x + lift.w - MARGIN / 2) * k, b.h * k, HALL);
  if (bands.length) {
    const top = Math.min(...bands.map((b) => b.y)) * k, bot = Math.max(...bands.map((b) => b.y + b.h)) * k;
    for (const x of L.lanes || []) px(ctx, x * k - 1, top, 3, bot - top, LANE);
  }
  // the lift shaft from top to bottom, the cabin on its own floor
  if (lift.w) {
    const y0 = (bands[0] ? bands[0].y : MARGIN) * k, y1 = (L.h - MARGIN / 2) * k;
    px(ctx, lift.x * k, y0, lift.w * k, y1 - y0, SHAFT);
    box(ctx, lift.x * k, y0, lift.w * k, y1 - y0, LINE);
    for (let y = y0 + 4; y < y1 - 2; y += 6) px(ctx, (lift.x + lift.w / 2) * k - 1, y, 2, 3, DIM);
    const here = (lift.floors || []).find((f) => f.n === (S.lift || {}).floor);
    if (here) {
      const ch = Math.max(6, LIFT_DOOR_H * k);
      px(ctx, lift.x * k + 1, here.y * k - ch + 2, lift.w * k - 2, ch, CABIN);
      box(ctx, lift.x * k + 1, here.y * k - ch + 2, lift.w * k - 2, ch, INK);
    }
    for (const r of lift.reception || []) px(ctx, r.x * k, r.y * k, Math.max(3, r.w * k), Math.max(2, r.h * k), DESK);
  }
  // the floor numbers on the left, as in the lift: a corridor is a floor
  for (const f of lift.floors || []) text(ctx, String(f.n), 3, f.y * k + 3, INK, 9, true);

  // the smoking room: the sofa and the table — without walls, as in the office
  if (L.lounge) px(ctx, (L.lounge.x - 20) * k, (L.lounge.y - 6) * k, 40 * k, 14 * k, DESK);
  if (L.kicker) px(ctx, (L.kicker.x - 14) * k, (L.kicker.y - 6) * k, 28 * k, 12 * k, DESK);

  // the empty places in the grid: a dotted line where the next project will stand
  const pr = L.projectRooms || [];
  if (pr.length) {
    const cols = [...new Set(pr.map((r) => r.x))].sort((a, b) => a - b);
    const rows = new Map();
    for (const r of pr) { if (!rows.has(r.y)) rows.set(r.y, []); rows.get(r.y).push(r); }
    for (const [y, list] of rows) {
      const h = Math.max(...list.map((r) => r.h));
      for (const x of cols) if (!list.some((r) => r.x === x)) dashed(ctx, x * k, y * k, list[0].w * k, h * k, DIM);
    }
  }

  // the rooms
  const byId = new Map((S.agents || []).map((a) => [a.id, a]));
  const seated = new Set();
  for (const act of (S.actors || new Map()).values()) if (act.state === 'sit') seated.add(act.id);
  for (const c of cells) {
    const r = c.room;
    const fill = r.greenhouse ? GREEN : r.service ? SERVICE : ROOM;
    px(ctx, c.x, c.y, c.w, c.h, fill);
    box(ctx, c.x, c.y, c.w, c.h, INK);
    const wallH = Math.max(3, WALL * k);
    px(ctx, c.x + 1, c.y + 1, c.w - 2, wallH - 1, r.meeting ? GLASS : WALL_C);
    if (r.door) px(ctx, r.door.x * k, c.y, Math.max(3, r.door.w * k), wallH, PAPER);
    // The name is on the wall itself, to the right of the door, like a plaque in the office.
    // There is no room for it under the wall: the first row of desks begins right behind it,
    // and the caption lay over the dots of the people.
    const nameX = r.door ? Math.max(c.x + 3, (r.door.x + r.door.w) * k + 3) : c.x + 3;
    text(ctx, r.title.length > 13 ? r.title.slice(0, 12) + '…' : r.title, nameX, c.y + wallH - 1, INK, 7, true);
    // the desks: a taken one is simply a desk, the person is drawn where he is; an empty one
    // is an outline, and that is "the desk is empty" from the legend
    for (const d of r.desks || []) {
      px(ctx, d.x * k - 4, d.y * k, 8, 3, DESK);
      const a = byId.get(r.agents[d.i]);
      if (!a) box(ctx, d.x * k - 2, d.y * k - 6, 6, 6, DIM);
    }
  }
  // the focus: a double frame in amber, like the outline of the keyboard focus in the panels
  const fc = cells[focus];
  if (fc) { box(ctx, fc.x - 2, fc.y - 2, fc.w + 4, fc.h + 4, WAIT); box(ctx, fc.x - 1, fc.y - 1, fc.w + 2, fc.h + 2, WAIT); }

  // the path from you to the door of the room in focus: along the corridor, as the agents walk
  const p = S.player;
  if (fc && p && fc.room.doorPoint) {
    const band = fc.room.bandY != null ? fc.room.bandY : fc.room.y - 30;
    const pts = [[p.x, p.y], [p.x, band], [fc.room.doorPoint.x, band], [fc.room.doorPoint.x, fc.room.y + WALL]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i].map((v) => v * k), [bx, by] = pts[i + 1].map((v) => v * k);
      const n = Math.max(1, Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s < n; s += 4) px(ctx, ax + (bx - ax) * s / n, ay + (by - ay) * s / n, 2, 2, WAIT);
    }
  }

  // the people: the agents by status, the guests in their own colour, the cat, then you — over everyone
  const dot = (x, y, c) => { px(ctx, x * k - 3, y * k - 3, 7, 7, INK); px(ctx, x * k - 2, y * k - 2, 5, 5, c); };
  for (const act of (S.actors || new Map()).values()) {
    const a = byId.get(act.id);
    if (!a) continue;
    dot(act.x, act.y - (seated.has(act.id) ? 6 : 0), statusColor(a));
    if (a.status === 'awaiting') text(ctx, '!', act.x * k - 1, act.y * k - 4, INK, 7, true);
  }
  for (const q of (S.people || new Map()).values()) dot(q.x, q.y, GUEST);
  if (S.cat) px(ctx, S.cat.x * k - 2, S.cat.y * k - 1, 5, 3, CAT);
  if (p) {
    const x = p.x * k, y = p.y * k;
    px(ctx, x - 4, y - 4, 8, 8, INK); px(ctx, x - 3, y - 3, 6, 6, ME);
    px(ctx, x - 1, y - 8, 2, 3, ME); px(ctx, x - 1, y + 5, 2, 3, ME); px(ctx, x - 8, y - 1, 3, 2, ME); px(ctx, x + 5, y - 1, 3, 2, ME);
    // the caption goes to whichever side has room: by the lift, to the left
    const label = tr('plan.here'), lw = label.length * 4.4 + 6;
    const lx = x + 8 + lw > W ? x - 10 - lw : x + 10;
    px(ctx, lx, y - 5, lw, 11, INK);
    text(ctx, label, lx + 3, y + 3, PAPER, 7, true);
  }
}

// ------------------------------------------------------------------ the keys
// The arrows walk the plan geometrically: right is the neighbouring room of the same row,
// down is the nearest by vertical in the row below. The focus ring from ui.js walks a list,
// while a plan is a grid; the things in the bag have the same kind of walking of their own.
function moveFocus(dx, dy) {
  const cur = cells[focus];
  if (!cur || cells.length < 2) return;
  const others = cells.map((c, i) => ({ c, i })).filter((o) => o.i !== focus);
  const sameRow = (c) => Math.abs(c.cy - cur.cy) < (c.h + cur.h) / 4;
  let pick = null, best = Infinity;
  if (dx) {
    for (const o of others) {
      if (!sameRow(o.c) || (o.c.cx - cur.cx) * dx <= 0) continue;
      const d = Math.abs(o.c.cx - cur.cx);
      if (d < best) { best = d; pick = o; }
    }
    if (!pick) for (const o of others) {          // the end of a row — to its other end
      if (!sameRow(o.c)) continue;
      const d = (o.c.cx - cur.cx) * dx;
      if (d < best) { best = d; pick = o; }
    }
  } else {
    // We do not count the neighbour along the row as down: a room with two rows of desks is
    // taller than its neighbour, and its middle lies "lower" — the down arrow went sideways.
    for (const o of others) {
      if (sameRow(o.c) || (o.c.cy - cur.cy) * dy <= 0) continue;
      const d = Math.abs(o.c.cy - cur.cy) + 0.3 * Math.abs(o.c.cx - cur.cx);
      if (d < best) { best = d; pick = o; }
    }
    if (!pick) for (const o of others) {          // the roof or the basement — to the other edge of the building
      const d = -Math.abs(o.c.cy - cur.cy) + 0.3 * Math.abs(o.c.cx - cur.cx);
      if (d < best) { best = d; pick = o; }
    }
  }
  if (pick) { focus = pick.i; refresh(true); }
}

// We do not touch Escape: closeAll() in main.js catches it and gives it to the `esc` point.
export function planKey(raw) {
  if (!planOpen()) return false;
  const key = String(raw).toLowerCase();
  const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
  if (dir) { moveFocus(dir[0], dir[1]); return true; }
  if (key === 'enter' || key === ' ') { go(); return true; }
  return false;
}

export function register(api) {
  api.i18n(DICT);

  // The key is declared rather than tested letter by letter: the core holds the registry,
  // and the core is what will let it be remapped one day. `KeyK` is a physical key, so
  // under a Russian layout it is the same «Л», with no second branch in the code.
  api.keys([{ id: 'toggle', codes: ['KeyK'], group: 'panel', hint: 'plan.hint' }]);

  // While the panel is open the arrows are its; that is parsing inside a panel and stays
  // on the raw key, as in every other panel of the office.
  api.on('key', (raw) => planKey(raw));

  // On the entrance screen there is no plan: there is nothing to be "here" yet. The screen
  // is recognised by a class on body — that is how the core hides the HUD under it, and the
  // same is enough for the module.
  api.on('action', (id) => {
    if (id !== 'plan.toggle') return false;
    if (document.body.classList.contains('titling')) return false;
    planOpen() ? closePlan() : openPlan();
    return true;
  });
  api.on('esc', () => (planOpen() ? (closePlan(), true) : false));
  api.on('busy', () => planOpen());
  // Its own place on the keys board. The module says what its keys mean while the
  // plan is up — the arrows walk rooms here, not buttons — and answers `place` with
  // that id while it owns the screen. The core never learns the id: it asks.
  // `registry: true`: the module's `key` hook answers the arrows, ENTER and ESC
  // and returns false for everything else, so the floor's letters reach their
  // dispatch — with the plan open, C still opens the wardrobe over it.
  const [MAP] = api.places([{
    id: 'map',
    title: 'plan.place',
    registry: true,
    caps: {
      Escape: 'plan.place.close', KeyK: 'plan.place.close',
      Enter: 'plan.place.go', Space: 'plan.place.go',
      ArrowUp: 'plan.place.room', ArrowDown: 'plan.place.room',
      ArrowLeft: 'plan.place.room', ArrowRight: 'plan.place.room',
    },
  }]);
  api.on('place', () => (planOpen() ? MAP : null));
  api.on('tick', (state) => {
    S = state;
    if (!planOpen()) return;
    // people walk — the plan is alive, but ten frames a second are enough for it
    if (lastPaint >= 0 && state.t - lastPaint < 100) return;
    lastPaint = state.t;
    refresh(false);
  });
  api.on('lang', () => { if (planOpen()) openPlan(); });
}
