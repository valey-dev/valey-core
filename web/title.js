// The entrance screen: the corridor in front of the office door.
//
// The split is the same as everywhere in the project: the world is drawn on the
// canvas, the panels are ordinary DOM over it. So the scene (the wall, the window,
// the plaque, the door, you) lives here in 400×225 pixels, while the menu and the
// cards are in markup: the text in them has to be readable rather than stretched
// along with the canvas.
import { pxText, drawSwitcher } from './office.js';
import { t as tr, lang } from './i18n.js';
import { esc } from './esc.js';
import { drawPerson } from './sprites.js';
import { PLAQUE, drawPlaque } from './plaque.js';
import { actionOf, codesOf } from './keymap.js';

const $ = (s) => document.querySelector(s);
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

// The scale is taken from the engine, not from the mock-up: a person is 24 pixels
// tall, so the door is 44 and not 100 — otherwise next to it he looks like an ant.
const FLOOR = 150;
const DOOR = { x: 182, y: 106, w: 36, h: 44 };
const WIN = { x: 40, y: 40, w: 64, h: 36 };

// The corridor people now walk along. On the left you run into the menu panel —
// behind it a person is not visible at all — on the right into the little switch
// figure: in the office he is solid too, you cannot walk through him.
const SPAWN = DOOR.x + DOOR.w / 2;
const LANG_X = 300;
const MENU_EDGE = 132;              // 7% + 26% of the canvas: the answer for when the DOM has not been measured yet
const WALK_MAX = LANG_X - 14;
const REACH = { menu: 20, door: 22, lang: 22 };

let S = null, api = null, el = null;
const T = { open: true, idx: 0, page: 'menu', roomIdx: 0, x: SPAWN, dir: 1, moving: false, zone: null };

export function titleOpen() { return T.open; }

export function initTitle(state, callbacks) {
  S = state; api = callbacks; el = $('#title');
}

// --------------------------------------------------------------- what is behind the door
function tally() {
  const a = S.agents || [];
  return {
    total: a.length,
    waiting: a.filter((x) => x.status === 'awaiting').length,
    working: a.filter((x) => x.status === 'working').length,
    idle: a.filter((x) => x.status === 'idle').length,
    rooms: (S.layout && S.layout.projectRooms) || [],
  };
}

// ------------------------------------------------------------ where you stand
// The right edge of the menu panel in canvas coordinates. It is measured off the
// live DOM rather than taken from percentages: .tmenu has a min-width, and on a
// narrow window it takes noticeably more than a quarter of the screen — a person
// who walked to "his" 148 would end up behind it entirely.
function menuEdge() {
  const m = el && el.querySelector && el.querySelector('.tmenu');
  const c = document.getElementById('game');
  if (!m || !c || !m.getBoundingClientRect) return MENU_EDGE;
  const cb = c.getBoundingClientRect();
  if (!cb.width) return MENU_EDGE;
  return (m.getBoundingClientRect().right - cb.left) / cb.width * 400;
}

const walkMin = () => menuEdge() + 16;

// What you are standing at: the menu, the switch, the door — or the middle of the corridor.
function zone() {
  if (T.x <= walkMin() + REACH.menu) return 'menu';
  if (Math.abs(T.x - LANG_X) <= REACH.lang) return 'lang';
  if (Math.abs(T.x - SPAWN) <= REACH.door) return 'door';
  return null;
}

// The walking lives here rather than in the common update(): there is no office
// yet, no walls and no furniture, and the only things to stumble over here are the
// menu panel and the little figure.
export function tickTitle(dt, keys) {
  if (!T.open || T.page !== 'menu') { T.moving = false; return; }
  const held = (id) => codesOf(id).some((c) => keys.has(c));
  const ix = (held('move.right') ? 1 : 0) - (held('move.left') ? 1 : 0);
  if (ix) {
    T.x = Math.max(walkMin(), Math.min(WALK_MAX, T.x + ix * (held('move.run') ? 2.6 : 1.35) * dt));
    T.dir = ix;
  }
  T.moving = !!ix;
  const z = zone();
  if (z !== T.zone) { T.zone = z; if (el && !el.hidden) paintFocus(); }
}

// the same plate label() draws in the office: a hint reads on any wall
function label(ctx, x, y, text, color = '#ffd166') {
  ctx.font = '7px "JetBrains Mono", "Courier New", monospace';
  const w = ctx.measureText(text).width;
  px(ctx, x - w / 2 - 2, y - 7, w + 4, 9, 'rgba(24,18,14,0.75)');
  pxText(ctx, text, x - w / 2, y, color);
}

// ------------------------------------------------------------------ the lamp
// The corridor is lit by the crack under the door and by nothing else, so the
// little figure by the right wall is not visible at all. The lamp above him is a
// reason to look right, and it is deliberately bad: an even warm light would turn
// the corridor into a hotel lobby, while what is needed is an office after closing.
// The mock-up: https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=694-2
//
// The height was chosen neither by eye nor from the mock-up: from above the strip
// is held by the "behind the door" card (.tcard, right/top 4%), from below by the
// plaque of the switch at FLOOR-44. The card lives in the DOM and does NOT scale
// with the canvas: in the mock-up its bottom lay at y 70, and on a frame at ×2 it
// turned out to be at 75 — at 72 the plate of the lamp hid behind it. The smaller
// the zoom, the lower the card, so 76 is not a margin but the edge.
const LAMP_Y = 76;

// The flicker: 0.72 of the base, two sine waves for a fine buzz, and once every
// 2.6 seconds a 120 ms dip. It never goes below 0.25 — a lamp gone out reads as a
// broken scene rather than as a mood.
function lampGlow(t) {
  const jitter = Math.sin(t / 190) * 0.5 + Math.sin(t / 77) * 0.25;
  const dip = t % 2600 < 120 ? 0.3 : 1;
  return Math.max(0.25, (0.72 + jitter * 0.12) * dip);
}

// The light is laid down before the little figure and before his plaque: it covers
// them, as a real one would. The body never blinks — a blinking silhouette reads as
// a shudder of the whole scene rather than as a sick lamp.
function drawLamp(ctx, t) {
  const k = lampGlow(t);
  const x = LANG_X;
  const y = LAMP_Y + 19;                            // where the body ends
  // Four steps instead of three: on a frame three gave an even strip that looked
  // like a column rather than like light. The opacities were raised too — the
  // mock-up's 0.16 was not readable at all on a dark wall.
  ctx.globalAlpha = 0.22 * k; px(ctx, x - 5, y, 10, 12, '#d8be86');
  ctx.globalAlpha = 0.14 * k; px(ctx, x - 9, y + 12, 18, 16, '#d8be86');
  ctx.globalAlpha = 0.09 * k; px(ctx, x - 14, y + 28, 28, 16, '#d8be86');
  ctx.globalAlpha = 0.05 * k; px(ctx, x - 19, y + 44, 38, FLOOR - y - 44, '#d8be86');
  ctx.globalAlpha = 0.09 * k; px(ctx, x - 16, FLOOR, 32, 4, '#d8be86');
  ctx.globalAlpha = 0.05 * k; px(ctx, x - 22, FLOOR + 4, 44, 5, '#d8be86');
  ctx.globalAlpha = 1;
  px(ctx, x - 4, LAMP_Y, 8, 3, '#4a423a');          // the plate on the wall
  px(ctx, x - 1, LAMP_Y + 3, 2, 4, '#3a322c');      // the bar
  px(ctx, x - 8, LAMP_Y + 7, 16, 3, '#5a4f45');     // the top rim
  px(ctx, x - 7, LAMP_Y + 10, 14, 7, '#6b5f4e');    // the shade
  ctx.globalAlpha = 0.35 + 0.65 * k;                // only the glass glows
  px(ctx, x - 5, LAMP_Y + 12, 10, 4, '#c9a95f');
  px(ctx, x - 3, LAMP_Y + 13, 6, 2, '#e8cf8a');
  ctx.globalAlpha = 1;
  px(ctx, x - 7, LAMP_Y + 17, 14, 2, '#463d33');    // the bottom rim
}

// ------------------------------------------------------------------- the window
// Behind the glass is a night city: the corridor runs along the outer wall, exactly
// as in the office itself, where drawCorridor keeps live weather behind the windows.
// Here there is no weather: the entrance screen does not follow your sun, it is
// always dusk there.
function drawNightCity(ctx, WIN) {
  px(ctx, WIN.x, WIN.y, WIN.w, WIN.h, '#2b3a5c');
  px(ctx, WIN.x + 8, WIN.y + 7, 9, 9, '#ffd166');
  for (const [dx, dy, w, h] of [[2, 22, 12, 14], [16, 16, 9, 20], [28, 24, 13, 12], [44, 18, 10, 18], [56, 26, 8, 10]])
    px(ctx, WIN.x + dx, WIN.y + dy, w, h, '#16203a');
  for (const [dx, dy] of [[19, 21], [47, 23], [59, 29]]) px(ctx, WIN.x + dx, WIN.y + dy, 2, 2, '#ffd166');
}

// ------------------------------------------------------------------- the scene
// opts opens the scene outwards, and opens it for exactly three things, each of
// which is needed by the valey.dev holding page — it draws this same screen in its
// own repository and must not be a second office "after the motifs":
//   sub      — the bottom line of the plaque instead of «офиса агентов»;
//   window   — its own picture behind the glass: (ctx, WIN) => void;
//   controls — false removes the language switch and the hints.
// The last one is not decoration but honesty: nobody walks along the holding page's
// corridor, nobody enters the door, and a control that does nothing promises more
// than the page can deliver.
export function drawTitle(ctx, VW, VH, t, opts = {}) {
  const lit = (S.agents || []).length > 0;
  const controls = opts.controls !== false;

  px(ctx, 0, 0, VW, FLOOR, '#2f2b28');
  for (let x = 0; x < VW; x += 25) px(ctx, x, 0, 1, FLOOR, '#282422');
  for (let y = 25; y < FLOOR; y += 25) px(ctx, 0, y, VW, 1, '#282422');
  px(ctx, 0, FLOOR, VW, VH - FLOOR, '#332e2a');
  px(ctx, 0, FLOOR + 12, VW, 10, '#5e3230');
  for (let x = 6; x < VW; x += 34) px(ctx, x, FLOOR + 12, 18, 10, '#6b3a37');

  // the window: the frame
  px(ctx, WIN.x - 3, WIN.y - 3, WIN.w + 6, WIN.h + 6, '#8a6247');
  // Behind the glass it is the caller who draws. The frame, the glazing bars and
  // the place stay shared: the window is part of this wall, not a picture that can
  // be swapped out whole.
  (opts.window || drawNightCity)(ctx, WIN);
  px(ctx, WIN.x + WIN.w / 2 - 1, WIN.y, 2, WIN.h, '#8a6247');
  px(ctx, WIN.x, WIN.y + WIN.h / 2 - 1, WIN.w, 2, '#8a6247');

  // The plaque over the door is a logo, but as an object in the scene. plaque.js
  // draws it: the generator of the form's cover prints the same plaque, and the two
  // must not drift apart.
  //
  // opts.sub changes the bottom line, and only it. That is how the holding page
  // takes the plaque: "OPENING SOON" in the wide face at full size — 142 px against
  // the plaque's own 104, it does not fit — while the name above it stays the name
  // of the office on the door rather than a second logo of the page.
  drawPlaque(ctx, PLAQUE, opts.sub || tr('title.sub'), pxText);

  // the door
  px(ctx, DOOR.x - 4, DOOR.y - 4, DOOR.w + 8, DOOR.h + 4, '#1d1510');
  px(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, '#4a3325');
  px(ctx, DOOR.x, DOOR.y, 2, DOOR.h, '#6b4a2e');
  px(ctx, DOOR.x + DOOR.w - 2, DOOR.y, 2, DOOR.h, '#6b4a2e');
  px(ctx, DOOR.x + 5, DOOR.y + 6, 11, 13, lit ? '#8a6a3a' : '#3a2a1e');
  px(ctx, DOOR.x + 20, DOOR.y + 6, 11, 13, lit ? '#8a6a3a' : '#3a2a1e');
  px(ctx, DOOR.x + 5, DOOR.y + 24, 26, 16, '#3a2a1e');
  px(ctx, DOOR.x + DOOR.w - 7, DOOR.y + 22, 3, 3, '#c9a06a');

  // the light from under the door. It goes out when there is nobody in the office:
  // an empty office should be visible from the threshold rather than opening as a
  // surprise inside
  if (lit) {
    ctx.globalAlpha = 0.5; px(ctx, DOOR.x, FLOOR - 2, DOOR.w, 2, '#ffd166');
    ctx.globalAlpha = 0.13; px(ctx, DOOR.x - 6, FLOOR, DOOR.w + 12, 5, '#ffd166');
    ctx.globalAlpha = 0.08; px(ctx, DOOR.x - 14, FLOOR + 5, DOOR.w + 28, 6, '#ffd166');
    ctx.globalAlpha = 0.05; px(ctx, DOOR.x - 24, FLOOR + 11, DOOR.w + 48, 7, '#ffd166');
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha = 0.06; px(ctx, DOOR.x, FLOOR - 2, DOOR.w, 2, '#ffd166'); ctx.globalAlpha = 1;
  }

  drawLamp(ctx, t);

  // The little switch figure by the right wall. He is drawn by the same code as in
  // the office corridor: a second copy would diverge from it silently at the first
  // edit to the sprite. He looks at you, and on his plaque is the language he will
  // switch to.
  if (controls) drawSwitcher(ctx, { x: LANG_X, y: FLOOR }, t, T.x < LANG_X ? -1 : 1);

  // you in the corridor. The engine has no back view — the same sprite as in the office
  drawPerson(ctx, T.x, FLOOR, S.me, {
    pose: T.moving ? 'walk' : 'stand',
    frame: Math.floor(t / 130), dir: T.dir,
    bob: T.moving ? 0 : Math.floor(t / 700) % 2,
  });

  // the hint at whatever you are standing next to. hint.lang is taken from the
  // office word for word: it is one and the same figure, and there is no point
  // explaining him twice
  // Above the switch the plate hangs where it does in the office — right above his
  // plaque. At the door it is lower: at the office height the VALEY plaque covered
  // it, and «офис агентов» was half readable. Found by the very first frame.
  const z = controls ? zone() : null;
  if (z === 'door') label(ctx, SPAWN, FLOOR - 28, tr('title.hintDoor'));
  if (z === 'lang') label(ctx, LANG_X, FLOOR - 44, tr('hint.lang'));

  // the vignette
  const g = ctx.createRadialGradient(VW / 2, VH / 2, VH / 3.2, VW / 2, VH / 2, VH * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(20,13,8,0.72)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
}

// ---------------------------------------------------------------- the overlay
// The menu is tied to the canvas rather than to the window: the canvas is centred
// with margins, and a panel fixed to the viewport would drift away from the door on
// a wide screen.
//
// It is not shown until it stands there. #title is position:fixed with no
// coordinates of its own; this function sets them from the canvas box, and on the
// first render the canvas has not been measured yet — until 5 September 2026 the
// menu flashed in the middle of the screen and then jumped into its corner. While
// it is invisible the scene with its lamp is what fills the screen, so the entrance
// assembles by fading in rather than by snapping into place.
export function layoutTitle() {
  if (!el || el.hidden) return;
  const c = document.getElementById('game').getBoundingClientRect();
  // A zero box means the canvas has not been laid out yet. Setting coordinates
  // from it would pin the menu to a corner of the screen; we wait for the next
  // frame, and there are sixty of those a second.
  if (!(c.width > 0 && c.height > 0)) {
    // It calls itself back: a screen whose canvas was measured late would
    // otherwise lose its menu for good, which is worse than the flash being
    // fixed here.
    requestAnimationFrame(layoutTitle);
    return;
  }
  // On a phone the entrance stops being a corridor: the canvas is a small strip
  // in the middle of a tall screen, and pinning the menu to it left the cards
  // stacked on top of each other over 300 px of nothing. Below 720 px the inline
  // box is dropped entirely so the stylesheet can lay the screen out as an
  // ordinary column — see the @media block next to `.tmeta` in web/style.css.
  //
  // The properties are cleared rather than overwritten: an inline `left` beats
  // any rule in the sheet, and one left behind on a rotation would pin the
  // column back to the strip.
  // The width is asked of the document's own window rather than the global one:
  // the keyboard stands run this file against a stub DOM where `window` does not
  // exist at all, and a bare `window.innerWidth` took the whole stand down.
  const view = (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window === 'undefined' ? null : window);
  if (view && view.innerWidth <= 720) {
    for (const k of ['left', 'top', 'width', 'height']) el.style.removeProperty(k);
  } else {
    el.style.left = c.left + 'px';
    el.style.top = c.top + 'px';
    el.style.width = c.width + 'px';
    el.style.height = c.height + 'px';
  }
  // The class goes on after the coordinates are written: the browser gets to
  // paint the menu where it belongs, and the CSS transition takes it from zero
  // to one instead of dragging it across the screen.
  el.classList.add('ready');
}

// The caption is taken from the dictionary on every paint rather than once at load:
// the language is switched at the little figure in the corridor, and the menu has to
// move along with him.
const MENU = [
  { k: 'title.enter', key: '⏎', act: () => api.enter(null) },
  { k: 'title.who', key: 'TAB', act: () => { T.page = 'rooms'; T.roomIdx = 0; renderTitle(); } },
  { k: 'title.dress', key: 'C', act: () => api.bag() },
  { k: 'title.sky', key: 'P', act: () => api.sky() },
];

export function renderTitle() {
  if (!el) return;
  el.hidden = false;
  const n = tally();
  el.innerHTML = T.page === 'rooms' ? roomsHtml(n) : menuHtml(n);
  layoutTitle();

  if (T.page === 'menu') {
    el.querySelectorAll('.tbtn').forEach((b, i) => {
      b.onclick = () => { T.idx = i; MENU[i].act(); };
      b.onmouseenter = () => { T.idx = i; paintFocus(); };
    });
  } else {
    el.querySelectorAll('.trow').forEach((r, i) => {
      r.onclick = () => api.enter(r.dataset.room);
      r.onmouseenter = () => { T.roomIdx = i; paintFocus(); };
    });
    const back = $('#tback'); if (back) back.onclick = () => { T.page = 'menu'; renderTitle(); };
  }
  bindName();
  paintFocus();
}

// The entrance redraws on every snapshot, and a name is typed one letter at a
// time: without this the caret jumped out of the field every couple of seconds.
// The value itself survives on its own — it is read back from S.me on each
// render — so only the focus and the caret have to be put back.
function bindName() {
  const input = el.querySelector('#tname');
  if (!input) { nameFocus = null; return; }
  input.oninput = () => { api.setName(input.value.toUpperCase().slice(0, 14)); nameFocus = input.selectionStart; };
  // Enter in the field is the door, not a newline: the hands are already there.
  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    api.enter(null);
  };
  if (nameFocus === null) return;
  input.focus();
  try { input.setSelectionRange(nameFocus, nameFocus); } catch { /* the field may be empty */ }
}
let nameFocus = null;

function paintFocus() {
  if (T.page === 'menu') {
    const on = zone() === 'menu';
    el.querySelectorAll('.tbtn').forEach((b, i) => b.classList.toggle('focus', on && i === T.idx));
    const m = el.querySelector('.tmenu');
    if (m) m.classList.toggle('away', !on);
  } else {
    el.querySelectorAll('.trow').forEach((r, i) => r.classList.toggle('focus', i === T.roomIdx));
  }
}


// The menu and the bottom service line are drawn identically in all three entrance
// cards — the owner's, the guest's and the refusal — so they lie here rather than as
// three copies inside menuHtml. On 30 August 2026 there did become three copies: the
// guest ones arrived on another branch, with the old "focus at once" markup and
// without the line about the arrows. The focus was pulled out by paintFocus(), which
// walks the ready DOM and knows about away; the hint, though, disappeared entirely —
// a guest saw a darkened menu and nowhere read what lights it up.
function menuButtons() {
  // The menu is dark until you walk up: the entrance screen has a corridor of its
  // own, and the menu in it is an object on the wall rather than a panel hanging over
  // everything.
  const on = zone() === 'menu';
  return `<div class="tmenu${on ? '' : ' away'}">${MENU.map((m, i) =>
    `<button class="tbtn${i === 0 ? ' main' : ''}${on && i === T.idx ? ' focus' : ''}">${tr(m.k)}<kbd>${m.key}</kbd></button>`).join('')}</div>`;
}

// The address is taken from the browser's own bar rather than written here. A
// hardcoded `localhost:5177` was false on any other port, and worse than false
// for a guest over the network: it read as the address of THEIR machine, where
// no office is running. The neighbouring stand.js already knew the price of
// this — two offices on different ports look exactly alike, and that has cost
// time before.
const metaRow = () => `<div class="tmeta left">v${esc(S?.version || '—')} · ${esc(location.host)}</div>
    <div class="tmeta center">${tr('title.walk')}</div>
    <div class="tmeta right">valey.dev</div>`;

function menuHtml(n) {
  // A guest is met not by "behind the door · 8 agents" but by who invited him and
  // what is allowed. The card is one and the same in its layout — only the lines
  // change: the decision was approved by frames on 30 August 2026, we start no
  // separate screen for a guest.
  const entry = S && S.entry;
  if (entry && entry.refused) {
    return `${menuButtons()}
      <div class="tcard">
        <span class="tlabel">${tr('title.inviteLabel')}</span>
        <b>${tr('title.inviteBad')}</b>
        <span class="twait">${esc(tr(entry.refused))}</span>
        <span class="tidle">${tr('title.inviteAskAgain')}</span>
      </div>
      ${metaRow()}`;
  }
  if (entry) {
    // The name is asked for here rather than left to the inventory: a guest who
    // walks in unnamed stands over somebody else's floor as «ГОСТЬ», and the
    // owner sees that somebody came without seeing who. Empty is allowed —
    // demanding a name from a person you invited by link is a turnstile where an
    // agreement already exists.
    return `${menuButtons()}
      <div class="tcard">
        <span class="tlabel">${tr('title.invitedBy')}</span>
        <b>${esc(entry.from || tr('title.someone'))}</b>
        <span class="twork">${tr('title.guestMay')}</span>
        <span class="tidle">${tr('title.guestMayNot')}</span>
        <input id="tname" maxlength="14" autocomplete="off"
          placeholder="${esc(tr('title.yourName'))}" value="${esc((S && S.me && S.me.name) || '')}">
        <span class="tidle small">${tr('title.nameLater')}</span>
        <span class="tlabel">${tr('title.codeBurns')}</span>
      </div>
      ${metaRow()}`;
  }
  const card = n.total
    ? `<div class="tcard">
         <span class="tlabel">${tr('title.behindDoor')}</span>
         <b>${agents(n.total)}</b>
         ${n.waiting ? `<span class="twait">${tr('title.waiting', { n: n.waiting, word: word('title.wait', n.waiting) })}</span>` : ''}
         ${n.working ? `<span class="twork">${tr('title.working', { n: n.working })}</span>` : ''}
         ${n.idle ? `<span class="tidle">${tr('title.idleN', { n: n.idle, word: word('title.idle', n.idle) })}</span>` : ''}
       </div>`
    : `<div class="tcard dim">
         <span class="tlabel">${tr('title.behindDoor')}</span>
         <b>${tr('title.nobody')}</b>
         <span class="thint">${tr('title.emptyWhy')}</span>
       </div>`;
  // The nudge about the release video. Visible to the owner only and only when there
  // is something to nudge about — the state arrives from the server already decided,
  // it is not recomputed here. The frame: WIP — «Пинок про релизный ролик», approved
  // 1 September 2026.
  const rel = S && S.release;
  const relCard = !rel ? '' : `<div class="tcard release">
         <span class="tlabel">${tr('title.releaseLabel')}</span>
         <b>${tr('title.releaseNot', { tag: esc(rel.tag) })}</b>
         <span class="twait">${rel.days === null ? ''
           : rel.days === 0 ? tr('title.releaseToday')
           : tr('title.releaseAge', { n: rel.days, word: word('title.day', rel.days) })}</span>
         <span class="tidle">${rel.hasDraft
           ? tr('title.releaseDraft', { file: esc(rel.draft) })
           : tr('title.releaseNoDraft')}</span>
       </div>`;
  const hint = n.total ? '' : `<div class="tnote">
      <b>${tr('title.roomsCome')}</b>
      <span>${tr('title.roomsHow')}</span>
    </div>`;
  return `${menuButtons()}
    ${card}${relCard}${hint}
    ${metaRow()}`;
}

function roomsHtml(n) {
  const rows = n.rooms.map((r, i) => {
    const list = (S.agents || []).filter((a) => r.agents.includes(a.id));
    const wait = list.filter((a) => a.status === 'awaiting').length;
    const work = list.filter((a) => a.status === 'working').length;
    const note = wait ? tr('title.waiting', { n: wait, word: word('title.wait', wait) })
      : work ? tr('title.working', { n: work }) : tr('title.idleShort');
    const cls = wait ? 'twait' : work ? 'twork' : 'tidle';
    return `<div class="trow${i === T.roomIdx ? ' focus' : ''}" data-room="${esc(r.key)}">
        <span class="tname">▣ ${esc(r.title)}</span>
        <span class="tcount">${agents(list.length)}</span>
        <span class="${cls}">${note}</span>
      </div>`;
  }).join('');
  return `<div class="trooms">
      <div class="throoms">${tr('title.roomsHead', {
        agents: agents(n.total),
        rooms: tr('title.count', { n: n.rooms.length, word: word('title.room', n.rooms.length) }),
      })}<button id="tback">ESC</button></div>
      ${rows || `<p class="thint">${tr('title.noRooms')}</p>`}
      <p class="thint">${tr('title.enterRoom')}</p>
    </div>`;
}

// The number forms are chosen by the language: English has two, Russian three.
function word(base, n) {
  if (lang() === 'en') return tr(base + (n === 1 ? '.one' : '.many'));
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return tr(base + '.many');
  if (b > 1 && b < 5) return tr(base + '.few');
  return tr(base + (b === 1 ? '.one' : '.many'));
}
const agents = (n) => tr('title.count', { n, word: word('title.agent', n) });


// ------------------------------------------------------------------ the keys
// true — the key was taken by the entrance screen, the office need not see it
export function titleKey(ev) {
  if (!T.open) return false;
  // The arrows, Enter and Esc are parsed by the screen itself — that is how it is
  // built. The letters that open panels come from the shared registry: one key,
  // one action, wherever it is pressed.
  const k = (typeof ev === 'string' ? ev : ev.key).toLowerCase();
  const act = typeof ev === 'string' ? null : actionOf(ev);

  if (T.page === 'rooms') {
    const rooms = (S.layout && S.layout.projectRooms) || [];
    if (k === 'escape') { T.page = 'menu'; renderTitle(); return true; }
    if (k === 'arrowup' || k === 'arrowdown') {
      const d = k === 'arrowdown' ? 1 : -1;
      T.roomIdx = Math.max(0, Math.min(rooms.length - 1, T.roomIdx + d));
      paintFocus(); return true;
    }
    if (k === 'enter' || k === ' ') {
      const r = rooms[T.roomIdx];
      if (r) api.enter(r.key);
      return true;
    }
    return ['arrowleft', 'arrowright', 'tab'].includes(k);
  }

  const z = zone();
  if (k === 'arrowup' || k === 'arrowdown') {
    // up and down walk the menu only at the menu itself: otherwise these are the
    // only keys that work from a distance, and walking up becomes pointless
    if (z !== 'menu') return true;
    const d = k === 'arrowdown' ? 1 : -1;
    T.idx = (T.idx + d + MENU.length) % MENU.length;
    paintFocus(); return true;
  }
  // SPACE and ⏎ touch what you stand at. The door answers by itself, or the first
  // press at the start would go into the void — and "Enter" stays in the menu as well.
  if (k === 'enter' || k === ' ') {
    if (z === 'menu') MENU[T.idx].act();
    else if (z === 'door') api.enter(null);
    else if (z === 'lang') api.lang();
    return true;
  }
  if (act === 'panel.round') { T.page = 'rooms'; T.roomIdx = 0; renderTitle(); return true; }
  if (act === 'panel.bag') { api.bag(); return true; }
  if (act === 'panel.sky') { api.sky(); return true; }
  if (k === 'escape') return true;   // there is nowhere to leave the office to, ESC means nothing here
  // The walking keys are swallowed by the screen: otherwise a step along the
  // corridor would also reach the office standing behind it.
  return act === 'move.left' || act === 'move.right';
}

export function closeTitle() {
  T.open = false;
  if (el) el.hidden = true;
}
