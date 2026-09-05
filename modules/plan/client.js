// План офиса — модуль. Клавиша K открывает схему всего здания: этажи как в
// лифте, комнаты как на плане, люди точками по своим настоящим координатам и
// синий крестик «вы здесь». Ответ на один вопрос: где кто, не выходя из своей
// комнаты и не катаясь лифтом.
//
// Нарисован как план эвакуации на стене: бумага, чёрные контуры, цветные
// точки. Геометрия не выдумывается — это тот же layout, ужатый в четыре раза,
// поэтому человек в коридоре стоит на плане ровно там, где стоит в офисе. Кадр
// утверждён 4 сентября 2026 (всё здание, клавиша K, модулем).
//
// Модуль, а не строка в ядре: панель, клавиша и словарь свои; от ядра нужны
// только точки `key`, `esc`, `busy`, `tick`, `lang`, `help` — все общие.
import { t as tr } from '../../web/i18n.js';
import { esc } from '../../web/esc.js';
import { toast, clean, actText, roleText, ago } from '../../web/ui.js';
import { WALL, LIFT_DOOR_H, MARGIN } from '../../web/layout.js';

const DICT = {
  ru: {
    'help.plan': 'K — план офиса',
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
    'help.plan': 'K office plan',
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

// Бумага и чернила плана. Не из палитры офиса нарочно: план — вещь на стене,
// он не перекрашивается вместе с тоном офиса, как и плитка в комнатах.
const PAPER = '#f1e2bc', INK = '#2b1d14', LINE = '#5a4632', DIM = '#b9a480';
const ROOM = '#efe0b8', SERVICE = '#e3d3ab', GREEN = '#dfe6c2', HALL = '#e8d8b0', LANE = '#ecdcb4';
const WALL_C = '#cbb58a', GLASS = '#bfd8dc', DESK = '#c9a97a', SHAFT = '#e2cf9f', CABIN = '#7d6448';
const WORK = '#6cc27a', WAIT = '#f0b429', IDLE = '#8c7660', ME = '#3fa9f5', CAT = '#e08a3c', GUEST = '#7c6ab0';
// Ужатие: четверть, пока здание влезает; выше — сколько влезет в панель.
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

// Состояние офиса приезжает тиком; панель — свой элемент, дырки под неё в
// разметке ядра нет.
let S = null;
let el = null;
let cells = [];        // комнаты на плане в порядке чтения: сверху вниз, слева направо
let focus = 0;
let builtSig = '';     // при какой планировке собраны клетки
let detailKey = '';
let countKey = '';
let lastPaint = -1;
let geom = null;       // масштаб и размер холста в css-пикселях

function ensurePanel() {
  if (el) return;
  el = document.createElement('div');
  el.id = 'plan';
  el.hidden = true;
  document.body.appendChild(el);
}

export function planOpen() { return !!el && !el.hidden; }
// Ключ комнаты в фокусе — стенду, чтобы проверять ходьбу стрелками по данным,
// а не по подставному DOM.
export function planFocus() { return cells[focus] ? cells[focus].room.key : null; }

// ------------------------------------------------------------------ данные
const statusColor = (a) => (!a ? DIM : a.status === 'awaiting' ? WAIT : a.status === 'idle' ? IDLE : WORK);
const inRect = (p, r) => p && p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

function floorOf(L, room) {
  const f = (L.lift.floors || []).find((x) => x.rooms.includes(room.title));
  return f ? f.n : null;
}

// Кто в комнате. У проектной — те, чьи столы в ней стоят: ушедший за кофе
// всё равно её человек. У сервисной столов нет — считаются те, кто внутри.
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

// Кого подсветить стрелкой: ждущего, иначе работающего, иначе первого — тот же
// выбор, что на стойке ресепшена, чтобы «вести туда» вело к тому же человеку.
function leadOf(list) {
  return list.find((a) => a.status === 'awaiting') || list.find((a) => a.status === 'working') || list[0] || null;
}

function scaleFor(L) {
  const k = Math.min(SCALE, MAP_W / L.w, MAP_H / L.h);
  return { k, w: Math.ceil(L.w * k), h: Math.ceil(L.h * k) };
}

// Клетки плана: все комнаты, проектные и сервисные, в порядке чтения. По ним
// ходит фокус и на них стоят кнопки для мыши.
function buildCells(L) {
  const { k } = geom;
  const rooms = [...(L.rooms || [])].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  cells = rooms.map((room) => ({
    room,
    x: room.x * k, y: room.y * k, w: room.w * k, h: room.h * k,
    cx: (room.x + room.w / 2) * k, cy: (room.y + room.h / 2) * k,
  }));
}

// ------------------------------------------------------------------ панель
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
  // Смена языка пересобирает открытую панель тем же путём — и фокус при
  // этом остаётся на той комнате, на которую смотрел.
  if (!was) focus = startFocus();
  refresh(true);
}

export function closePlan() {
  if (!el) return;
  el.hidden = true;
}

// Пересобрать клетки и кнопки под ними: при открытии и когда планировка
// сменилась под открытой панелью. Фокус переживает пересборку по ключу
// комнаты — комната, на которую смотрел, остаётся той же.
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

// Первый фокус — комната, где стоишь; в коридоре — ближайшая дверь. От неё
// стрелки читаются как «соседняя комната», а не «первая в списке».
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

// Правая колонка: комната в фокусе и кто в ней. Перерисовывается только когда
// её текст изменился — иначе панель мигала бы каждые две секунды на живых
// данных, как когда-то обход.
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
  // Кто ещё внутри, кроме агентов: ты сам, гости, кот. Им стрелка не нужна,
  // но «где кто» без них неполное.
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

// «Вести туда» — та же стрелка, что у обхода и стойки: ядро ведёт к агенту,
// не к комнате, поэтому идём к тому, кого выбрал leadOf.
function go() {
  const c = cells[focus];
  if (!c) return;
  const lead = leadOf(peopleIn(c.room));
  if (!lead) { toast(tr('plan.empty')); return; }
  S.waypoint = lead.id;
  toast(tr('toast.guideHim'));
  closePlan();
}

// ------------------------------------------------------------------ холст
function paintMap() {
  const canvas = $('#plancanvas');
  if (!canvas || !geom) return;
  const ctx = canvas.getContext('2d');
  const L = S.layout;
  const { k, w: W, h: H } = geom;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // бумага
  px(ctx, 0, 0, W, H, PAPER);
  for (let i = 0; i < W; i += 6) for (let j = 0; j < H; j += 6) if (((i + j) / 6) % 7 === 0) px(ctx, i, j, 1, 1, '#e6d5ae');
  text(ctx, tr('plan.paper'), 6, 8, LINE, 6.5, true);
  text(ctx, tr('plan.foot'), 6, H - 3, DIM, 6);

  const lift = L.lift || { x: L.w, w: 0, floors: [], reception: [] };
  const bands = L.bands || [];
  // коридоры и проходы между колоннами: по ним и ходят
  for (const b of bands) px(ctx, (MARGIN / 2) * k, b.y * k, (lift.x + lift.w - MARGIN / 2) * k, b.h * k, HALL);
  if (bands.length) {
    const top = Math.min(...bands.map((b) => b.y)) * k, bot = Math.max(...bands.map((b) => b.y + b.h)) * k;
    for (const x of L.lanes || []) px(ctx, x * k - 1, top, 3, bot - top, LANE);
  }
  // шахта лифта сверху донизу, кабина на своём этаже
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
  // номера этажей слева, как в лифте: коридор — это этаж
  for (const f of lift.floors || []) text(ctx, String(f.n), 3, f.y * k + 3, INK, 9, true);

  // курилка: диван и стол — без стен, как и в офисе
  if (L.lounge) px(ctx, (L.lounge.x - 20) * k, (L.lounge.y - 6) * k, 40 * k, 14 * k, DESK);
  if (L.kicker) px(ctx, (L.kicker.x - 14) * k, (L.kicker.y - 6) * k, 28 * k, 12 * k, DESK);

  // пустые места в сетке: пунктир там, куда встанет следующий проект
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

  // комнаты
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
    // Название — на самой стене, правее двери, как табличка в офисе. Под
    // стеной ему места нет: первый ряд столов начинается сразу за ней, и
    // подпись ложилась на точки людей.
    const nameX = r.door ? Math.max(c.x + 3, (r.door.x + r.door.w) * k + 3) : c.x + 3;
    text(ctx, r.title.length > 13 ? r.title.slice(0, 12) + '…' : r.title, nameX, c.y + wallH - 1, INK, 7, true);
    // столы: занятый — просто стол, человек дорисуется там, где он есть;
    // пустой — контур, и это «стол пуст» из легенды
    for (const d of r.desks || []) {
      px(ctx, d.x * k - 4, d.y * k, 8, 3, DESK);
      const a = byId.get(r.agents[d.i]);
      if (!a) box(ctx, d.x * k - 2, d.y * k - 6, 6, 6, DIM);
    }
  }
  // фокус: двойная рамка янтарём, как контур клавиатурного фокуса в панелях
  const fc = cells[focus];
  if (fc) { box(ctx, fc.x - 2, fc.y - 2, fc.w + 4, fc.h + 4, WAIT); box(ctx, fc.x - 1, fc.y - 1, fc.w + 2, fc.h + 2, WAIT); }

  // дорожка от тебя к двери комнаты в фокусе: по коридору, как ходят агенты
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

  // люди: агенты по статусу, гости своим цветом, кот, потом ты — поверх всех
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
    // подпись уходит в ту сторону, где есть место: у лифта — влево
    const label = tr('plan.here'), lw = label.length * 4.4 + 6;
    const lx = x + 8 + lw > W ? x - 10 - lw : x + 10;
    px(ctx, lx, y - 5, lw, 11, INK);
    text(ctx, label, lx + 3, y + 3, PAPER, 7, true);
  }
}

// ------------------------------------------------------------------ клавиши
// Стрелки ходят по плану геометрически: вправо — соседняя комната того же
// ряда, вниз — ближайшая по вертикали в ряду ниже. Кольцо фокуса из ui.js
// ходит по списку, а план — сетка; такая же своя ходьба у вещей в инвентаре.
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
    if (!pick) for (const o of others) {          // край ряда — на другой его конец
      if (!sameRow(o.c)) continue;
      const d = (o.c.cx - cur.cx) * dx;
      if (d < best) { best = d; pick = o; }
    }
  } else {
    // Соседа по ряду вниз не считаем: комната с двумя рядами столов выше
    // соседней, и её середина лежит «ниже» — стрелка вниз уходила вбок.
    for (const o of others) {
      if (sameRow(o.c) || (o.c.cy - cur.cy) * dy <= 0) continue;
      const d = Math.abs(o.c.cy - cur.cy) + 0.3 * Math.abs(o.c.cx - cur.cx);
      if (d < best) { best = d; pick = o; }
    }
    if (!pick) for (const o of others) {          // крыша или подвал — на другой край здания
      const d = -Math.abs(o.c.cy - cur.cy) + 0.3 * Math.abs(o.c.cx - cur.cx);
      if (d < best) { best = d; pick = o; }
    }
  }
  if (pick) { focus = pick.i; refresh(true); }
}

// Escape не трогаем: его ловит closeAll() в main.js и отдаёт в точку `esc`.
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

  // Клавиша объявляется, а не проверяется буквой: ядро держит реестр, и оно же
  // однажды даст её переназначить. `KeyK` — физическая клавиша, поэтому под
  // русской раскладкой это та же «Л», без второй ветки в коде.
  api.keys([{ id: 'toggle', codes: ['KeyK'], group: 'panel' }]);

  // Пока панель открыта — стрелки её; это разбор внутри панели, он остаётся на
  // сырой клавише, как у всех остальных панелей офиса.
  api.on('key', (raw) => planKey(raw));

  // На экране входа плана нет: там ещё нечему быть «здесь». Экран узнаётся по
  // классу на body — так ядро прячет под ним HUD, и модулю хватает того же.
  api.on('action', (id) => {
    if (id !== 'plan.toggle') return false;
    if (document.body.classList.contains('titling')) return false;
    planOpen() ? closePlan() : openPlan();
    return true;
  });
  api.on('esc', () => (planOpen() ? (closePlan(), true) : false));
  api.on('busy', () => planOpen());
  api.on('tick', (state) => {
    S = state;
    if (!planOpen()) return;
    // люди ходят — план живой, но десяти кадров в секунду ему хватает
    if (lastPaint >= 0 && state.t - lastPaint < 100) return;
    lastPaint = state.t;
    refresh(false);
  });
  api.on('lang', () => { if (planOpen()) openPlan(); });
  api.on('help', () => tr('help.plan'));
}
