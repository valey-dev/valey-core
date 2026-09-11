import { lookOf, drawPerson, drawCat, normalizeLook, isSelfLabel, dressOf, dressMe } from './sprites.js';
import { potState, water as waterPot, tally, CAN_FULL } from './garden.js';
import { buildLayout, planSignature, blocked, roomAt, anchorOf, applyAnchor, pickRoom, WALL } from './layout.js';
import { loadModules, collect, first, attachStreams } from './modules.js';
import { owned, setTokens } from './owned.js';
import { initStand } from './stand.js';
import { switcherSign, drawCorridor, drawRoom, drawBoard, drawDesk, drawRoomProps, drawLight, drawSecurity, drawMeeting, drawGreenhouse, drawMicro, drawLift, drawReception, pxText, kickerBusy } from './office.js';
import { drawCamera, buildCameras } from './cctv.js';
import { syncActors, tickActors } from './actors.js';
import * as UI from './ui.js';
import { proceduralWeather, fromWeatherCode, flash } from './weather.js';
import { sound, tickSound } from './sound.js';
import { initPager, seePermits, renderPager, pagerKey, recall, waitingCount, forgetPermit } from './pager.js';
import { titleOf } from './paintings.js';
import { drawBubble } from './badges.js';
import { skateStep, rolling, drawSkateboard, ollieStep, canOllie, OLLIE_POP } from './skate.js';
import { readPad, edges as padEdges } from './pad.js';
import { viewport, stepScale, SCALE_MIN, SCALE_MAX } from './viewport.js';
// ui.scale is the interface size: the HUD and hint strips are stretched by it,
// and fit() must account for that when it measures their height.
import { ui, onUiScale } from './theme.js';
import { actionOf, codeOf, codesOf, hints } from './keymap.js';
import { renderKeys, closeKeys, keysOpen, readLayout } from './keys.js';
import { has as hasPlace } from './places.js';
// t was renamed to tr: in main.js `t` is the frame time in draw(t), and the import
// was silently shadowed by a number inside every drawing callback
import { t as tr, lang, setLang, onLang } from './i18n.js';
import { initTitle, drawTitle, renderTitle, titleKey, titleOpen, closeTitle, layoutTitle, tickTitle } from './title.js';

// Changed by fit(): the canvas takes the window instead of standing in letterbox bars.
let VW = 400, VH = 225;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VW; canvas.height = VH;
ctx.imageSmoothingEnabled = false;

const DEFAULT_ME = {
  skin: '#ffdcb8', hair: '#3a2a20', shirt: '#4fa89a', pants: '#3f4a63', boots: '#2a2118',
  // No name of one's own until somebody types one: «ТЫ» is how the office
  // addresses you, not how it introduces you to anybody else.
  style: 0, head: 'none', glasses: false, face: 'none', tall: 1, hands: 'none', name: '',
};

// What lies in localStorage was written by us — but not necessarily by this version
// and not necessarily whole: one broken value at the top level of a module brought
// the whole office down before the first frame, without a single line in the console.
const stored = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

const state = {
  agents: [], layout: null, sig: '', actors: new Map(), looks: new Map(),
  // vx/vy — the glide of the skateboard: the speed lives between frames, walking has none
  player: { x: 120, y: 60, dir: 0, moving: false, skate: false, vx: 0, vy: 0, z: 0, vz: 0 }, spawned: false,
  cat: { x: 200, y: 60, tx: 200, ty: 60 },
  me: normalizeLook({ ...DEFAULT_ME, ...stored('valey-me', {}) }),
  visited: new Set(), waypoint: null, currentRoom: null,
  // Where we sit: {x, y, dir, out} — the coordinate of the seat and the point people
  // stand up to. While it is not null the player does not walk and is drawn in the sit pose.
  seat: null,
  focus: null, dialogOpen: false, page: 'talk', typed: 0, notice: '', t: 0,
  prevStatus: new Map(),
  weather: proceduralWeather(), weatherAt: Date.now(), realWeather: null, wasFlashing: false,
  settings: { weather: { enabled: false }, delivery: { mode: 'default' } }, sun: null,
  delivery: { available: false },
  // The owner of the office or a guest. Asked once on arrival: the right does not
  // change on the fly, and a panel drawn before the answer would show a guest a button
  // the server will not accept anyway.
  owner: true, accessMode: 'private',
  // How the person ended up on the threshold: entry.from — who invited, entry.refused
  // — why they were not let in. needsCode — the office is shared and there is no pass.
  entry: null, needsCode: false,
  // Access to the agents: the meaning depends on who is looking. See project() on the
  // server — it is what decides whose view this is.
  access: null,
  stepDist: 0, doorRoom: null, dust: [], drink: null,
  // the control room: the card is recognised when it is you walking up; the cameras are switched on from the desk
  cctv: {
    unlocked: false, on: false, idx: 0, since: 0,
    // the automatic round: the cameras go in a circle by themselves; the choice is remembered between visits
    auto: localStorage.getItem('valey-cctv-auto') !== '0',
  },
  camList: [], camsSig: null,
  // the lift: there is one cabin per floor, so its position is part of the state of the
  // world rather than of a panel. open is the fraction the doors are open by, 0 closed,
  // 1 parted.
  lift: { floor: 1, open: 0, phase: 'idle', to: null, t0: 0, span: 1, andOpen: false },
  // Other people in the office. The key is their id, the value is where they were last
  // and where they are going: between presence messages a person "arrives" by himself,
  // otherwise at 8 frames a second somebody else's walking looks like teleportation.
  people: new Map(),
  // The permission requests the agents are waiting on. For a guest the list is always
  // empty — the server does not send it.
  permits: [], pagerWaiting: 0,
  soundOn: sound.on,
  // physical pixels per game pixel; filled in by the very first fit()
  zoom: { dev: 3, max: 3, auto: true, tight: false },
};

const keys = new Set();
// Whether the key of this action is held right now. The set is keyed by physical
// codes, so remapping the walking will one day work by itself.
const held = (id) => codesOf(id).some((c) => keys.has(c));
// Handles for debugging from the console. __ui is also needed because the bridge of the
// Claude in Chrome extension does not resolve a dynamic import() in the page: the call
// hangs and takes the whole channel with it, so reaching the module is only possible
// this way.
window.__game = state; window.__keys = keys; window.__ui = UI;

// ------------------------------------------------------------------- the owner
// The right to command arrives once as a link from the terminal and stays in this
// browser. The token is removed from the address at once: the address bar is copied into
// a chat and into a screenshot more often than one thinks.
let OWNER = (() => {
  const q = new URLSearchParams(location.hash.slice(1));
  const given = q.get('owner');
  if (given) {
    localStorage.setItem('valey-owner', given);
    q.delete('owner');
    const rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? '#' + rest : ''));
    return given;
  }
  return localStorage.getItem('valey-owner') || '';
})();

// A guest's token is given out in exchange for a code and lives next to the owner's. It
// grants no rights — it grants entry: in shared mode the office will not show even a
// corridor without it.
let GUEST = localStorage.getItem('valey-guest') || '';

// The code from the link. Like the owner's token, it is removed from the address at
// once: whether it is single-use or not, there is no reason to leave it in a string
// people copy into a chat.
const CODE = (() => {
  const q = new URLSearchParams(location.hash.slice(1));
  const given = q.get('code');
  if (!given) return '';
  q.delete('code');
  const rest = q.toString();
  history.replaceState(null, '', location.pathname + (rest ? '#' + rest : ''));
  return given;
})();

// A header rather than a cookie: the office lives on one port with other tabs of the
// same localhost, and they share a cookie.
setTokens({ owner: OWNER, guest: GUEST });

// The door. A code is exchanged for a token exactly once; after that the token lives,
// and a reload of the page does not put the person back out on the street.
async function knock() {
  if (!CODE) return null;
  const r = await fetch('/api/enter', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: CODE }),
  }).then((x) => x.json()).catch((e) => ({ error: e.message }));
  if (r && r.guest) {
    GUEST = r.guest;
    setTokens({ guest: GUEST });
    localStorage.setItem('valey-guest', GUEST);
  }
  return r;
}

// Saving the settings is needed by two: the panels through initUI and the little switch
// figure in the corridor. So it is a named function rather than a method of an object
// that is visible to nobody but the UI.
async function saveSettings(patch) {
  const r = await fetch('/api/settings', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }), body: JSON.stringify(patch),
  }).then((x) => x.json()).catch((e) => ({ error: e.message }));
  if (r.settings) state.settings = r.settings;
  if (r.packs) state.packs = r.packs;
  if (r.weather) applyWeather(r.weather);
  UI.renderHud();
  return r;
}

// A fresh office has no language yet — settings say 'auto', every tab resolves it
// from its own device, and the server, which has no device, would keep handing out
// Russian names to an English office. So the first page to arrive writes down what
// it resolved, and the office has one language from then on, switchable by the
// figure in the corridor like any other.
//
// A guest cannot write the settings and does not try: the office is not theirs to
// name, and their own tab is already in their own language either way. Failures
// are ignored for the same reason — this is a default being recorded, not work
// somebody is waiting on.
function pinLang(settings) {
  if (!settings || settings.lang === lang() || !state.owner) return;
  saveSettings({ lang: lang() }).catch(() => {});
}

// One entrance for both sources: the event and the snapshot. The counter of deferred
// ones lives in the state, because it is drawn by the header rather than by the pager.
function takePermits(list) {
  seePermits(list);
  const n = waitingCount();
  if (n !== state.pagerWaiting) { state.pagerWaiting = n; UI.renderHud(); }
}

initPager(state, {
  openPermit: (p) => { UI.openPermit(p.agentId); },
  toast: (text, kind) => UI.toast(text, kind),
  hudChanged: () => { state.pagerWaiting = waitingCount(); UI.renderHud(); },
});

UI.initUI(state, {
  // The badge in the corner presses the same thing H does. It lives here rather
  // than in the pager's callbacks because it is the HUD that calls it, and the two
  // objects are different `api`.
  recallPager: () => { if (recall()) { state.pagerWaiting = waitingCount(); UI.renderHud(); } },
  // The waiting counter opens the round: those agents are exactly what it lists.
  openRound: () => toggle('roster', UI.renderRoster, UI.closeRoster),
  close: closeAll,
  saveMe: () => {
    localStorage.setItem('valey-me', JSON.stringify(state.me));
    myWorn = dressMe(state.me, dressCode());
  },
  sendTask: (agentId, text, deliver = false, mode = null, resend = null) => fetch('/api/task', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }),
    body: JSON.stringify({ agentId, text, deliver, mode, resend }),
  }).then((r) => r.json()).catch((e) => ({ error: e.message })),
  guideTo: (id) => { state.waypoint = id; UI.toast(tr('toast.guide')); },
  // The standup opens a card without walking to the desk: the panel is
  // "walked up to everyone at once", and sending someone on foot after it
  // answers "go and look" to the question it has just closed. Everything else
  // is as it is after SPACE at a desk, down to the visited mark and the guide
  // arrow being taken off.
  openAgent: (id) => {
    const a = state.agents.find((x) => x.id === id);
    if (!a) return;
    state.focus = a; state.page = 'talk'; state.typed = 0; state.dialogOpen = true;
    state.visited.add(a.id);
    if (state.waypoint === a.id) state.waypoint = null;
    UI.renderDialog();
  },
  // The bag does not repeat the language, colour and sound panels — it leads to them.
  lang: () => switchLang(),
  setLang: (code) => switchLang(code),
  names: () => fetch('/api/names', { headers: owned() })
    .then((r) => r.json()).catch((e) => ({ error: e.message, packs: [] })),
  sound: () => { state.soundOn = sound.toggle(); UI.renderHud(); return state.soundOn; },
  geocode: (q) => fetch('/api/geocode?q=' + encodeURIComponent(q) + '&lang=' + encodeURIComponent(lang())).then((r) => r.json()).catch((e) => ({ error: e.message })),
  // The key card asks about the CLI again: somebody went to the terminal,
  // logged in and came back, and the server's answer lives a minute — no
  // reason to sit out that minute looking at «not logged in».
  recheckCli: () => fetch('/api/delivery?fresh=1', { headers: owned() })
    .then((r) => r.json()).then((d) => { state.delivery = d; return d; })
    .catch((e) => ({ error: e.message })),
  saveSettings,
  invites: () => fetch('/api/invites', { headers: owned() })
    .then((r) => r.json()).catch((e) => ({ error: e.message, invites: [] })),
  makeInvite: (name) => fetch('/api/invite', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }),
    // from — how a guest will see the inviter on the entrance screen. The server does not
    // know the owner's name: it lives in the browser, next to the look.
    body: JSON.stringify({ name, from: state.me.name || '' }),
  }).then((r) => r.json()).then((r) => {
    // We take the token: the office has just become shared, and without it this same page
    // will turn out to be a guest in its own office on the next request.
    if (r && r.owner) {
      OWNER = r.owner; setTokens({ owner: OWNER }); localStorage.setItem('valey-owner', OWNER);
      // The stream remembers who opened it: the server decides that once, at connection
      // time. Without a reopen an old stream went on as a guest projection after the switch
      // to shared — the owner saw his office with no lines and no files.
      openStream();
    }
    return r;
  }).catch((e) => ({ error: e.message })),
  answerPermit: (id, decision, message) => fetch('/api/permit/answer', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }),
    body: JSON.stringify({ id, decision, message }),
  }).then((r) => r.json()).catch((e) => ({ error: e.message })),
  forgetPermit: (id) => { forgetPermit(id); state.pagerWaiting = waitingCount(); UI.renderHud(); },
  askAccess: (agentId) => fetch('/api/access', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }),
    body: JSON.stringify({ agentId }),
  }).then((r) => r.json()).catch((e) => ({ error: e.message })),
  answerAccess: (id, yes) => fetch('/api/access/answer', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }),
    body: JSON.stringify({ id, yes }),
  }).then((r) => r.json()).catch((e) => ({ error: e.message })),
  revokeAccess: (guestId, agentId) => fetch('/api/access/revoke', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }),
    body: JSON.stringify({ guestId, agentId }),
  }).then((r) => r.json()).catch((e) => ({ error: e.message })),
  revokeInvite: (id) => fetch('/api/invite/revoke', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }),
    body: JSON.stringify({ id }),
  }).then((r) => r.json()).catch((e) => ({ error: e.message })),
});

// We knock first and ask who we are after: with a code in hand the answer to the second
// question depends on the first.
//
// The whole chain is kept, because the modules have to wait for it. A guest who
// arrives by an invitation link is nobody until the code is exchanged, and
// `/api/modules` answers a refusal rather than a list to nobody: on 6 September
// 2026 a guest coming through a tunnel got an office with no modules at all —
// no voice, no microphone, an empty floor — while the owner on the same machine
// saw everything, because he needed no code and won the race by accident.
const admission = knock().then((entered) => {
  if (entered && entered.errorKey) state.entry = { refused: entered.errorKey };
  else if (entered && entered.ok) state.entry = { from: entered.from || '' };
  return fetch('/api/whoami', { headers: owned() }).then((r) => r.json());
}).then((r) => {
  // The token is in hand, if there is going to be one at all: the stream can be opened.
  openStream();
  state.owner = !!r.owner;
  state.accessMode = r.mode || 'private';
  state.needsCode = !!r.needsCode;
  if (r.guest && !state.entry) state.entry = { from: r.from || '' };
  // The entrance screen is drawn first: it is what the person is looking at right now.
  // If the HUD stumbles — and it reads fields a page that was not let in does not have —
  // the "you have been invited" card is already in place rather than lost along with it.
  renderTitle();
  UI.renderHud();
}).catch(() => { /* no answer — we count him a guest: silently giving more rights is worse */
  state.owner = false;
  // The stream is opened here as well: until 4 September 2026 a failed whoami left the
  // office empty forever, with no explanation — the snapshots simply never came.
  if (!es) openStream();
});

fetch('/api/settings', { headers: owned() }).then((r) => r.json()).then((r) => {
  if (r.settings) { state.settings = r.settings; setLang(r.settings.lang); pinLang(r.settings); paintSign(); }
  if (r.packs) state.packs = r.packs;
  if (r.weather) applyWeather(r.weather);
  UI.renderHud();
}).catch(() => {});

// The conservatory. The garden is shared and lives in the office settings; the
// watering can in your hands is your own and only yours: it is not a state of the
// office but what you are holding right now. Because of that, in a shared office two
// people will see the can on its hook at the same time — the price paid for not having
// to explain carrying it to the server.
const garden = () => (state.settings && state.settings.garden) || { pots: {}, can: { left: CAN_FULL } };
const canLeft = () => {
  const c = garden().can;
  return c && Number.isFinite(c.left) ? c.left : CAN_FULL;
};
// What drawGreenhouse shows: the state of every pot as of now.
function gardenView(room) {
  const g = garden(), now = Date.now(), st = {};
  for (const p of room.pots) st[p.i] = potState(g.pots && g.pots[p.i], now);
  const n = tally(g, room.pots, now);
  return {
    state: st, canTaken: !!state.carry, canLeft: canLeft(),
    sign: tr('sign.watered', { n: n.wet, total: n.total }),
  };
}
// We write both to the server and to ourselves at once: watering has to be visible in
// the same frame rather than a stream tick later. If the server refuses — a guest,
// somebody else's office — we put it back as it was and say so aloud.
async function saveGarden(next, wasCarry) {
  const before = garden();
  state.settings = { ...state.settings, garden: next };
  const r = await saveSettings({ garden: next });
  if (r && r.error) {
    state.settings = { ...state.settings, garden: before };
    if (wasCarry !== undefined) state.carry = wasCarry;
    UI.toast(tr('toast.gardenNotYours'), 'wait');
    return false;
  }
  return true;
}

function takeCan() {
  if (state.carry) {
    state.carry = false;
    UI.toast(tr('toast.canBack'));
    return;
  }
  state.carry = true;
  UI.toast(tr(canLeft() > 0 ? 'toast.canTaken' : 'toast.canTakenDry', { n: canLeft() }));
}

function fillCan() {
  if (!state.carry) { UI.toast(tr('toast.canFirst'), 'wait'); return; }
  if (canLeft() >= CAN_FULL) { UI.toast(tr('toast.canFull'), 'wait'); return; }
  const g = garden();
  saveGarden({ ...g, can: { left: CAN_FULL } });
  sound.pour(1);
  UI.toast(tr('toast.canFilled', { n: CAN_FULL }));
}

function pourOn(room, pot) {
  if (!state.carry) { UI.toast(tr('toast.canFirst'), 'wait'); return; }
  if (canLeft() <= 0) { UI.toast(tr('toast.canEmpty'), 'wait'); return; }
  const g = garden(), now = Date.now();
  const before = potState(g.pots && g.pots[pot.i], now);
  const next = {
    ...g,
    pots: { ...(g.pots || {}), [pot.i]: waterPot(g.pots && g.pots[pot.i], now) },
    can: { left: canLeft() - 1 },
  };
  saveGarden(next);
  sound.pour(0.7);
  const after = potState(next.pots[pot.i], now);
  // The only thing worth saying is what the person will not see anyway: that it has
  // flowered he will see, but "that was the last watering in the can" is written nowhere
  // on the screen.
  if (after === 'bloom' && before !== 'bloom') UI.toast(tr('toast.bloomed'));
  else if (next.can.left === 0) UI.toast(tr('toast.canRanOut'), 'wait');
}

// The dress code is a setting of the office, not of the browser: it arrives in settings
// and flies out to every open tab. The dressed look is computed once per change of the
// code rather than in every frame: there are three dozen people on the floor, and a new
// object for each of them sixty times a second is garbage for nothing.
const dressCode = () => (state.settings && state.settings.dress && state.settings.dress.code) || 'casual';
let wornCode = null;
let myWorn = null;
const dressed = (a) => dressOf(lookOf(a.id), a.id, a.gender, dressCode());
const myLook = () => {
  const look = myWorn || state.me;
  return state.carry ? { ...look, hands: 'can' } : look;
};
function dressAll() {
  wornCode = dressCode();
  state.looks.clear();
  for (const a of state.agents) state.looks.set(a.id, dressed(a));
  myWorn = dressMe(state.me, wornCode);
}

// The sky is either what open-meteo says, or what the browser makes up.
function applyWeather(w) {
  state.realWeather = w && w.enabled ? w : null;
  if (w && w.enabled && w.code != null) {
    const next = fromWeatherCode(w.code, w.wind);
    next.temp = w.temp;
    next.label = w.label;
    state.weather = next;
    state.sun = w.sun && w.sun.rise != null ? { ...w.sun, at: Date.now() } : null;
  } else {
    state.sun = null;
    if (!state.weather || state.weather.source !== 'procedural') state.weather = proceduralWeather();
  }
}

// ---------------------------------------------------------------- presence
// Who you are to the others: an id, a name and a look. The id lives in localStorage
// rather than in sessionStorage — two tabs of one browser are one person, not two.
const MY_ID = (() => {
  let v = localStorage.getItem('valey-id');
  if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem('valey-id', v); }
  return v;
})();
// The office's own id, put where the modules can see it. A module in the floor
// tier has to sign what it sends — an offer says who it is from — and reaching
// into localStorage for the same key from two places is how the two of them
// quietly stop agreeing.
state.meId = MY_ID;

// While you walk, often; while you stand, rarely. The threshold is by distance rather
// than by "is a key pressed": the lift carries a person by itself, and staying silent
// during that is not allowed.
const HERE_MOVING_MS = 140, HERE_IDLE_MS = 1500;
let hereAt = 0, hereX = null, hereY = null;

function tellWhereIAm(now) {
  const p = state.player;
  const moved = hereX === null || Math.hypot(p.x - hereX, p.y - hereY) > 1;
  const due = now - hereAt > (moved ? HERE_MOVING_MS : HERE_IDLE_MS);
  if (!due) return;
  hereAt = now; hereX = p.x; hereY = p.y;
  const room = state.currentRoom;
  fetch('/api/here', {
    method: 'POST',
    headers: owned({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      // Outward the office sends a third-person name. Until 5 September 2026 it
      // sent «ТЫ», so everyone who had not renamed themselves stood in somebody
      // else's office labelled YOU — the one word that cannot be true of another
      // person. Named yourself and the name goes as it is.
      id: MY_ID, name: state.me.name || tr(state.owner === false ? 'label.guest' : 'label.host'),
      look: myLook(),
      x: p.x, y: p.y, dir: p.dir || 1, moving: !!p.moving,
      room: room ? room.key : null,
    }),
  }).catch(() => { /* the office survives a lost presence packet */ });
}

// Closed the tab — disappeared at once rather than in eight seconds. sendBeacon because
// an ordinary fetch in pagehide is no longer something the browser has to deliver.
addEventListener('pagehide', () => {
  try {
    // sendBeacon cannot set headers, so the pass travels in the query string —
    // the same road the stream takes, and for the same reason.
    const pass = OWNER ? '?owner=' + encodeURIComponent(OWNER)
      : GUEST ? '?guest=' + encodeURIComponent(GUEST) : '';
    navigator.sendBeacon('/api/gone' + pass, new Blob([JSON.stringify({ id: MY_ID })], { type: 'application/json' }));
  } catch { /* not delivered — the TTL will remove him in eight seconds */ }
});

// Somebody else's look is completed to a full one by the same defaults as your own. The
// server has already thrown out the junk, but it does not invent what is missing — while
// drawPerson paints a figure through and through and falls over on undefined.
const theirLook = (look) => normalizeLook({ ...DEFAULT_ME, ...(look && typeof look === 'object' ? look : {}) });

function seePeople(list) {
  const seen = new Set();
  for (const q of list || []) {
    if (q.id === MY_ID) continue;
    seen.add(q.id);
    const had = state.people.get(q.id);
    if (had) {
      // the old place becomes where we are coming from, the new one where to
      had.tx = q.x; had.ty = q.y; had.dir = q.dir; had.moving = q.moving;
      had.name = q.name; had.look = theirLook(q.look); had.room = q.room;
    } else {
      state.people.set(q.id, {
        id: q.id, name: q.name, look: theirLook(q.look),
        x: q.x, y: q.y, tx: q.x, ty: q.y, dir: q.dir, moving: q.moving, room: q.room,
      });
    }
  }
  for (const id of [...state.people.keys()]) if (!seen.has(id)) state.people.delete(id);
}

// -------------------------------------------------------------------- stream
// EventSource cannot do headers, so the pass goes into the stream as a parameter. It is
// the same token: there is no sense hiding it from the query string — it lies in the
// localStorage of this same page anyway.
//
// The stream is opened not at once but after we have knocked: a guest who came by a link
// has no token at the moment of loading — it is given out in exchange for a code. A
// stream opened earlier got a 403, and the person saw an empty office until the first
// reload. Found on 30 August 2026 by the very first real entry by link.
let es = null;
// EventSource reconnects by itself only after a break in the network. A 4xx/5xx answer
// — the office restarted in another mode, the pass was revoked, the server fell over for
// a second — closes it for good, and the page silently freezes on the last snapshot. So a
// closed stream is opened again, with a growing pause.
let streamRetry = 2000;
function openStream() {
  if (es) es.close();
  const pass = OWNER ? 'owner=' + encodeURIComponent(OWNER)
    : GUEST ? 'guest=' + encodeURIComponent(GUEST) : '';
  // The stream says whose it is. Presence goes to everybody and never needed a
  // name; an event addressed to one person does — that is how the meeting room's
  // hub sends an offer to one browser and not to the floor.
  const named = (pass ? pass + '&' : '') + 'me=' + encodeURIComponent(MY_ID);
  es = new EventSource('/api/stream?' + named);
  // The pager has to beep at once: in the snapshot tick it would be "somebody called me".
  es.addEventListener('permits', (e) => {
    try { takePermits(JSON.parse(e.data)); } catch { /* junk in the frame — we skip it */ }
  });
  es.addEventListener('people', (e) => {
    try { seePeople(JSON.parse(e.data)); } catch { /* junk in the frame — we skip it */ }
  });
  attachStreams(es);
  es.onmessage = (e) => { streamRetry = 2000; onSnapshot(e); };
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED) return;   // the network blinked — the browser will come back by itself
    const wait = streamRetry;
    streamRetry = Math.min(streamRetry * 2, 30000);
    setTimeout(() => { if (es.readyState === EventSource.CLOSED) openStream(); }, wait);
  };
}

const onSnapshot = (e) => {
  const data = JSON.parse(e.data);
  state.agents = data.agents || [];
  // Presence comes in the snapshot too — it is what greets an arrival, so that people are
  // on the screen at once rather than after the first quick tick.
  if (data.people) seePeople(data.people);
  // Access rides with the snapshot: for a guest it is his own view, for the owner who is
  // asking and to whom it is open.
  state.access = data.access || null;
  // An open invitation panel is a register, not a snapshot of one moment: a
  // request that arrives while it is open has to show up in it.
  UI.syncInvite();
  takePermits(data.permits || []);
  // The stream is taken apart field by field rather than assigned whole, so a new field
  // has to be carried over by hand — otherwise the title screen shows a dash instead of the
  // version, and that is visible only on a frame.
  state.version = data.version || state.version;
  state.release = data.release || null;
  if (wornCode !== dressCode()) dressAll();
  else for (const a of state.agents) if (!state.looks.has(a.id)) state.looks.set(a.id, dressed(a));

  // A module can affect the composition of the plan — the easel does not stand in every
  // room, only where a file is named in the settings. The signature has to take that into
  // account, or the plan will not be rebuilt when the composition changed: the thing would
  // appear only after the next arrival or departure of an agent.
  const sig = planSignature(state.agents) + collect('sig', state).join('');
  if (sig !== state.sig) {
    state.sig = sig;
    // The plan is rebuilt whole, and the rooms in it stand in new places: the rows grow
    // from the top, so somebody else's project that began a minute ago shifts the whole
    // floor down. World coordinates after that point into the neighbouring room, while the
    // person has gone nowhere. So before the rebuild we remember where he stood relative to
    // his room, and afterwards put him back in the same place.
    const wasP = anchorOf(state.layout, state.player);
    const wasC = anchorOf(state.layout, state.cat);
    // The rooms of modules are asked for inside the assembly: the plan has to know about
    // them before the height of the world is counted and the lift is put together.
    state.layout = buildLayout(state.agents, { rooms: (anchor) => collect('room', anchor, state) });
    // The modules hang their own things on the finished plan: a thing, an approach point
    // and a rectangle nobody walks through.
    collect('layout', state.layout, state);
    applyAnchor(state.layout, state.player, wasP);
    applyAnchor(state.layout, state.cat, wasC);
    if (wasC) { state.cat.tx = state.cat.x; state.cat.ty = state.cat.y; }
  }
  syncActors(state.actors, state.agents, state.layout);

  if (!state.spawned && state.layout.projectRooms.length) {
    const q = new URLSearchParams(location.hash.slice(1));
    const named = pickRoom(state.layout, q.get('room'));
    const r = named || state.layout.projectRooms[0];
    state.player.x = Number(q.get('x')) || (named ? r.x + r.w / 2 : r.doorPoint.x);
    state.player.y = Number(q.get('y')) || (named ? r.y + r.h - 60 : r.y - 30);
    state.cat.x = state.player.x + 30; state.cat.y = state.player.y;
    state.spawned = true;
  }

  for (const a of state.agents) {
    const was = state.prevStatus.get(a.id);
    if (was === 'working' && a.status === 'awaiting') UI.toast(tr('toast.freed', { name: a.name, a: a.gender === 'f' ? 'ась' : 'ся' }), 'wait');
    state.prevStatus.set(a.id, a.status);
  }

  if (state.focus) {
    const fresh = state.agents.find((a) => a.id === state.focus.id);
    if (fresh) { const changed = fresh.lastSaid !== state.focus.lastSaid; state.focus = fresh; if (changed) state.typed = 0; }
  }
  if (data.settings) {
    const changed = JSON.stringify(data.settings) !== JSON.stringify(state.settings);
    state.settings = data.settings;
    // the dress code could have been switched by somebody in a neighbouring tab — we change
    // clothes on the spot, without a reload: an office is an office for a reason
    if (wornCode !== dressCode()) dressAll();
    // the language could have been switched by somebody in a neighbouring tab — we catch up
    setLang(data.settings.lang);
    // And here too, not only on the boot fetch: that one races with whoami, so on a
    // fresh office the page can learn the settings before it knows it is the owner,
    // and the language would stay unresolved until the next reload.
    pinLang(data.settings);
    paintSign();
    if (changed && !document.getElementById('sky').hidden) UI.renderSky();
  }
  if (data.delivery) state.delivery = data.delivery;
  if (data.weather) applyWeather(data.weather);
  UI.renderHud();
  if (state.dialogOpen) UI.renderDialog();
  if (!document.getElementById('roster').hidden) UI.renderRoster();
  // the counters on the entrance screen are live: that is what it is for, to learn this before entering
  if (titleOpen()) renderTitle();
};

// --------------------------------------------------------------------- input
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => sound.init(), { once: true });

// A pinch on the trackpad and Ctrl+wheel are counted by the browser as its own zoom — we
// take them for ourselves. The keyboard zoom (Cmd+= / Cmd+−) cannot be intercepted, it is
// an accelerator of the browser itself; but it does the game no harm either: the scale is
// counted from devicePixelRatio, and after a browser zoom the canvas stays the same
// physical size.
addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  stepZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  addEventListener(ev, (e) => e.preventDefault());
}

// One handler for the keyboard and the gamepad: the gamepad's buttons arrive here as the
// names of keys, and the panels answer them without knowing where the press came from.
function onKey(e) {
  const k = e.key.toLowerCase();
  // The physical key and the action that hangs on it. No letters are compared
  // below: `code` is the same under every layout, and what it means is decided by
  // the registry in web/keymap.js.
  const code = codeOf(e);
  const act = actionOf(e);
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  // Keyboard-first has a price, and it comes due on a panel with more than one
  // control. The office takes Tab, Space and Enter from the browser for itself,
  // so somebody who has stepped onto a button with the keyboard can neither
  // press it nor move on: the keys are eaten before the browser sees them. While
  // the focus sits on a control, those three belong to the browser and do the
  // ordinary thing — walk the focus, press the button.
  //
  // It stayed invisible because every card the office ships has exactly one
  // button: «Enter — встал, Enter — нажал» worked, and there was nowhere to walk
  // to. The mail key card has six controls, and there the trap is the whole
  // interaction. Found by Sergey on 6 September 2026.
  //
  // Letters are not in the list on purpose: C still closes the inventory from a
  // focused button, and the office does not lose its own keys to a stray focus.
  if (/^(BUTTON|SELECT|A)$/.test(e.target.tagName) && ['Tab', 'Space', 'Enter'].includes(code)) return;
  // A combination with Cmd, Ctrl or Alt belongs to the browser and to the system, not to
  // the office. Without this line Cmd+R reloaded the page and rolled the radio out into the
  // bargain — the letter arrived here bare, and nobody looked at the modifier. The same
  // happened with Cmd+N, Cmd+C and any combination whose letter is taken in the office: a
  // person does an ordinary browser thing and gets a panel on top. Shift does not count —
  // it is ours here: Shift+F9 and running.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // the open board eats the arrows before the office sees them
  if (UI.viewerKey(e.key, e.shiftKey)) { e.preventDefault(); return; }
  // The lift panel and the reception desk are the same: while they are open the arrows
  // walk the floors rather than the office.
  if (UI.liftKey(e.key)) { e.preventDefault(); return; }
  // The standup is handed the whole event: its "lead me" is caught by the
  // physical key code, not by a letter that is a different letter under
  // another layout.
  if (UI.rosterKey(e)) { e.preventDefault(); return; }
  // The action first, the raw key second: a module that declared its keys through
  // api.keys() answers an id rather than a letter. The old seam stays alive — the
  // modules nobody rewrote are held up by it.
  if (act && first('action', act, e)) { e.preventDefault(); return; }
  if (first('key', e.key, e.shiftKey)) { e.preventDefault(); return; }
  if (UI.notesKey(e.key)) { e.preventDefault(); return; }
  if (UI.bagKey(e.key)) { e.preventDefault(); return; }
  if (UI.skyKey(e.key)) { e.preventDefault(); return; }
  if (UI.skinKey(e.key)) { e.preventDefault(); return; }
  if (UI.langKey(e.key)) { e.preventDefault(); return; }
  // What we take from the browser: scrolling on space, moving focus on Tab. Counted by
  // the physical key rather than by the character: under a Russian layout the space bar
  // is still the space bar, while a check by character walked past Cyrillic in silence.
  if (['Tab', 'Space', 'Escape'].includes(code)) e.preventDefault();
  if (state.dialogOpen && (k.startsWith('arrow') || k === 'enter')) e.preventDefault();
  if (code) keys.add(code);

  // The entrance screen takes the keys for itself — but only while nothing is open over
  // it: "change clothes" and "the window on the world" are called straight from here and
  // have to answer the arrows and ESC themselves.
  if (titleFree()) {
    if (titleKey(e)) { e.preventDefault(); return; }
  }

  // The pager holds its two keys while there is no card: Enter answers, Esc defers. An
  // open card takes them for itself — it is on top, and it already has both "allow" and
  // "close".
  // Esc closes the thing in front of you and nothing else. The pager sits in the
  // corner under every panel, and until 6 September 2026 it took Esc and Enter
  // whenever it was open: closing a panel deferred a request nobody meant to
  // defer, and the badge in the corner was the only trace of it.
  if (!aboveThePager() && pagerKey(e.key)) { e.preventDefault(); return; }

  // Esc on "deny with a note" is a step back to the buttons rather than closing the card:
  // the person pressed deny and has not sent anything yet.
  if (k === 'escape') { if (UI.permitEscape()) return; return closeAll(); }

  // the character sheet is keyboard-driven too: arrows walk its bottom row
  if (state.dialogOpen) {
    if (UI.dialogNumber(e.key)) return;
    if (k === 'arrowleft') return UI.moveDialogFocus(-1);
    if (k === 'arrowright') return UI.moveDialogFocus(1);
    if (k === 'arrowup') return UI.dialogUp();
    if (k === 'arrowdown') return UI.dialogDown();
    if (k === 'enter' || k === ' ') return UI.pressDialogFocus();
  }
  // F9 stands above everything else: it is a service key and has to work in any state of
  // the office. While it stood lower, the camera branch returned earlier — and taking a
  // shot of a camera view was impossible at all, exactly the frame Prod illustrates the
  // control room with. Found on 30 August 2026 while reshooting the plates.
  if (act === 'service.shot') { e.preventDefault(); saveShot(e.shiftKey ? 4 : 1); return; }
  // The keys panel stands as high as F9 and for the same reason: it has to answer
  // everywhere, and «everywhere» includes the screens that return before the
  // dispatch below. The control room did exactly that — its branch ends in an
  // unconditional return, so «/» never reached the panel, and the one place whose
  // board says «этаж не слышен» was the one place you could not read it from.
  //
  // Not through toggle(): that one looks the node up by id, and this panel creates
  // its own on first opening — on an empty office toggle would throw on the first press.
  if (act === 'service.keys') { e.preventDefault(); return keysOpen() ? closeKeys() : renderKeys(currentPlace()); }

  if (state.cctv.on) {
    if (act === 'move.left') return switchCam(-1);
    if (act === 'move.right') return switchCam(1);
    if (act === 'cams.auto') return toggleAutoCams();
    if (act === 'act.interact' || k === 'enter') return closeCams();
    return;
  }
  // the scale: works always, even over open panels
  if (act === 'zoom.in') { e.preventDefault(); return stepZoom(1); }
  if (act === 'zoom.out') { e.preventDefault(); return stepZoom(-1); }
  if (act === 'zoom.reset') { e.preventDefault(); return setZoom(0); }

  if (act === 'panel.standup') return toggle('roster', UI.renderRoster, UI.closeRoster);
  // N from outside shows all the notes; inside a conversation the same key writes them
  if (act === 'panel.notes') return toggle('notes', UI.renderNotes, UI.closeNotes);
  // C opens the bag on "worn" — where this key has always led.
  if (act === 'panel.bag') return toggle('bag', () => UI.renderBag('self'), UI.closeBag);
  if (act === 'panel.sky') return toggle('sky', UI.renderSky, UI.closeSky);
  if (act === 'panel.skin') return toggle('skin', UI.renderSkin, UI.closeSkin);
  // I — invite. The frames do not fix the key, it is a choice made here: G is taken by
  // the drawn "team floor", and of the free letters I was the only one that reads as the
  // same button in Russian too. The panel is the owner's only; a guest has nobody to
  // invite, and for him I opens the bag on the tab he was on. Two branches laid claim to
  // the letter from 2 September 2026, the bag stood higher and the invitation opened for
  // nobody — and the panel has no other entrance.
  if (act === 'panel.invite') {
    if (state.owner !== false) return UI.inviteOpen() ? UI.closeInvite() : UI.openInvite();
    return toggle('bag', UI.renderBag, UI.closeBag);
  }
  // H — bring back a deferred pager.
  if (act === 'panel.pager' && recall()) return;
  // B — the skateboard. It was chosen because S held the step down in WASD; WASD was
  // removed on 5 September 2026 and S is free again, but the key stays: fingers already
  // remember it, and moving it would not add a free letter.
  if (act === 'act.skate') return toggleSkate();
  if (act === 'act.sound') {
    state.soundOn = sound.toggle();
    UI.renderHud();
    UI.toast(state.soundOn ? tr('toast.soundOn') : tr('toast.soundOff'));
    return;
  }
  if (act === 'act.interact' && !state.dialogOpen) {
    // On the board SPACE jumps — but only where it had nothing to do before. Otherwise
    // talking to an agent without getting off the board would become impossible.
    if (canOllie(state.player) && !nearest()) state.player.vz = OLLIE_POP;
    else interact();
  }
}
addEventListener('keydown', onKey);

// Who is driving, the keyboard or the mouse. The office answers to both, and a
// list showed it: the arrows moved the focus while :hover stayed lit under a
// cursor nobody had touched for minutes, so two cells claimed to be the current
// one. Worse, scrollIntoView pulls new cells under a still pointer, so the stray
// highlight crawled by itself. The class turns hover off across the office (see
// .bykeys in style.css) and hides the pointer with it.
// Capture, so the flag is already right by the time a panel repaints on this
// same key. Any key counts, walking included: the mouse is not being used then
// either, and a pointer parked over the floor lights nothing but noise.
let byKeys = false;
const driving = (keys) => {
  if (byKeys === keys) return;               // toggling a class on every mousemove is not free
  byKeys = keys;
  document.body.classList.toggle('bykeys', keys);
};
addEventListener('keydown', () => driving(true), true);
// Only a genuine movement hands it back. mouseover is what fires when content
// scrolls under a still cursor, and honouring that would undo the fix on the
// very key press that caused it.
addEventListener('mousemove', () => driving(false), true);
addEventListener('mousedown', () => driving(false), true);
addEventListener('wheel', () => driving(false), { capture: true, passive: true });
// The entrance screen is open and nothing is over it — so both the keys and the walking
// along the corridor belong to it.
const titleFree = () => titleOpen()
  && ['bag', 'sky', 'viewer', 'roster', 'lang'].every((id) => document.getElementById(id).hidden);
const NO_KEYS = new Set();

// A release is counted by the same physical key as the press. While the set was
// keyed by character, switching layout with a key held dropped rubbish into it
// forever: pressed under Latin, released under Cyrillic, the entry was never
// removed and the office kept walking by itself.
addEventListener('keyup', (e) => { const c = codeOf(e); if (c) keys.delete(c); });
addEventListener('blur', () => keys.clear());

// The gamepad is polled once a frame: the Gamepad API has no events for buttons, only a
// snapshot. The buttons go into onKey as keys, the releases into keys, as a keyup. The
// axes stay here, as an analogue: update() takes them instead of the keys when the stick
// is tilted.
const pad = { x: 0, y: 0, down: new Set(), seen: false };
const typing = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
};
function tickPad() {
  const list = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of list) if (g) { gp = g; break; }
  if (gp && !pad.seen) { pad.seen = true; UI.toast(tr('toast.pad')); }
  const next = readPad(gp);
  const { pressed, released } = padEdges(pad, next);
  for (const key of pressed) {
    sound.init();
    // While typing, the arrows from the stick stay with the text: a stick under a thumb
    // trembles, and the focus in the card must not ride off because of it.
    if (typing() && key.startsWith('Arrow')) continue;
    onKey({ key, shiftKey: next.down.has('Shift'), target: { tagName: 'GAMEPAD' }, preventDefault() {} });
  }
  for (const key of released) { const c = codeOf({ key }); if (c) keys.delete(c); }
  pad.x = next.x; pad.y = next.y; pad.down = next.down;
}

function toggle(id, open, close) {
  const node = document.getElementById(id);
  if (node.hidden) open(); else close();
}

// Getting off, we zero the speed: without that the player rides on for another second
// and a half already on foot, and it reads as a stuck key.
function toggleSkate() {
  const p = state.player;
  p.skate = !p.skate;
  if (!p.skate) { p.vx = 0; p.vy = 0; p.z = 0; p.vz = 0; }
  UI.toast(tr(p.skate ? 'toast.skateOn' : 'toast.skateOff'));
}

// A shot of the canvas onto disk, into .shots next to the code. The point is that a
// headless browser does not photograph this office: the page keeps /api/stream open, the
// load event never happens, and `chrome --screenshot` simply waits forever. And small text
// cannot be judged from a mock-up — 400×225 is stretched by whole pixels, and a real
// letter can be seen only here.
//
// ONLY the canvas is shot: the panels, the HUD and the toasts are ordinary DOM over it,
// and they do not get into canvas.toDataURL. The ×4 scale repeats what the office itself
// does: magnification without smoothing, a pixel into a square.
async function saveShot(scale) {
  let url = canvas.toDataURL('image/png');
  if (scale > 1) {
    const off = document.createElement('canvas');
    off.width = VW * scale; off.height = VH * scale;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(canvas, 0, 0, off.width, off.height);
    url = off.toDataURL('image/png');
  }
  // the name carries the time, or a second shot overwrites the first and there is nothing to compare
  const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  const name = `office-${stamp}${scale > 1 ? `-x${scale}` : ''}`;
  try {
    const res = await fetch(`/api/shot?name=${name}`, { method: 'POST', headers: owned(), body: url });
    const j = await res.json();
    if (!res.ok || !j.file) throw new Error(j.error || res.status);
    UI.toast(tr('toast.shot', { file: j.file.split('/').pop() }));
  } catch (err) {
    UI.toast(tr('toast.shotFail', { why: err.message }), 'wait');
  }
}

// Everything written in words is repainted on a change of language. The canvas does not
// count: it is repainted every frame anyway and takes its strings from t() on the fly.
// The plaque above the little switch figure. "RU" — the interface and the names are
// Russian, "RU·EN" — the names are detached from the language. It is computed here rather
// than in the drawing: the office settings are not visible to it and must not be.
function paintSign() {
  const choice = (state.settings && state.settings.namePack) || 'auto';
  const l = lang().toUpperCase();
  switcherSign.code = (choice === 'auto' || choice === lang()) ? l : `${l}·${choice.toUpperCase()}`;
}

function renderStatic() {
  document.title = tr('doc.title');
  document.documentElement.lang = lang();
  paintSign();
  UI.relabel();
  if (titleOpen()) renderTitle();
}
onLang(renderStatic);
renderStatic();
// What the keys are really engraved with is asked once, and only of a browser
// that knows; the rest make do with the QWERTY labels.
readLayout().then(() => { if (keysOpen()) renderKeys(); });

function nearest() {
  const p = state.player;
  let best = null, bestD = 40;
  for (const act of state.actors.values()) {
    const d = Math.hypot(act.x - p.x, act.y + 10 - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'agent', id: act.id }; }
  }

  for (const prop of (state.layout.props || [])) {
    if (prop.kind !== 'lang') continue;
    const d = Math.hypot(prop.x - p.x, prop.y - 10 - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'lang', prop }; }
  }

  for (const prop of (state.layout.props || [])) {
    if (prop.kind !== 'kicker') continue;
    const d = Math.hypot(prop.x - p.x, prop.y - 8 - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'kicker', prop }; }
  }

  for (const prop of (state.layout.props || [])) {
    if (prop.kind !== 'cooler') continue;
    const d = Math.hypot(prop.x - p.x, prop.y - 8 - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'water', prop }; }
  }

  // The benches: for the corridor one the seats are counted from its width (34 px, drawn
  // from the centre), for the conservatory one they lie ready in the layout. They are
  // approached from the front — both have a back behind.
  for (const prop of (state.layout.props || [])) {
    if (prop.kind !== 'bench') continue;
    for (const sx of [prop.x - 8, prop.x + 8]) {
      const d = Math.hypot(sx - p.x, prop.y + 4 - p.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'seat', seat: { x: sx, y: prop.y - 6 }, out: { x: sx, y: prop.y + 14 } };
      }
    }
  }

  const gh = state.layout.greenhouse;
  if (gh) {
    if (gh.bench) {
      for (const st of gh.bench.seats) {
        const d = Math.hypot(st.x - p.x, st.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'seat', seat: st, out: { x: st.x, y: gh.bench.y + 22 } };
        }
      }
    }
    for (const pot of gh.pots) {
      const d = Math.hypot(pot.spot.x - p.x, pot.spot.y - p.y);
      if (d < bestD) { bestD = d; best = { kind: 'pot', room: gh, pot }; }
    }
    const dt = Math.hypot(gh.tap.spot.x - p.x, gh.tap.spot.y - p.y);
    if (dt < bestD) { bestD = dt; best = { kind: 'tap', room: gh }; }
    const dh = Math.hypot(gh.hook.spot.x - p.x, gh.hook.spot.y - p.y);
    if (dh < bestD) { bestD = dh; best = { kind: 'hook', room: gh }; }
  }

  const cur0 = state.currentRoom;
  if (cur0 && cur0.micro) {
    const d = Math.hypot(cur0.micro.x - p.x, cur0.micro.y + 8 - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'micro', room: cur0 }; }
  }

  const cur = state.currentRoom;
  if (cur && cur.coffee) {
    const d = Math.hypot(cur.coffee.x - p.x - 18, cur.coffee.y - 10 - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'coffee', room: cur }; }
  }

  // pictures: you look at them from the floor just below the wall
  for (const a of pictureSlots()) {
    const d = Math.hypot(a.x + a.w / 2 - p.x, a.y + a.h + 14 - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'art', art: a }; }
  }

  const sec = state.layout.security;
  if (sec) {
    const c = sec.consolePoint;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'cams', sec }; }
    // the poster is looked at from the floor below it, like the paintings
    if (sec.poster) {
      const a = sec.poster;
      const dp = Math.hypot(a.x + a.w / 2 - p.x, a.y + a.h + 14 - p.y);
      if (dp < bestD) { bestD = dp; best = { kind: 'poster', slot: a }; }
    }
  }

  const lf = state.layout.lift;
  if (lf) {
    for (const f of lf.floors) {
      // the doors are approached from the left: to the right of the shaft there is no floor any more
      const d = Math.hypot(lf.x - 16 - p.x, f.y - 8 - p.y);
      if (d < bestD) { bestD = d; best = { kind: 'lift', floor: f }; }
    }
    for (const r of lf.reception || []) {
      const d = Math.hypot(r.spot.x - p.x, r.spot.y - p.y);
      if (d < bestD) { bestD = d; best = { kind: 'reception', desk: r }; }
    }
  }

  const room = state.currentRoom;
  if (room && room.board) {
    const b = room.board;
    const d = Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h + 16 - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'board', room }; }
  }
  // The modules add their own targets the same way: a candidate with a distance, the
  // nearest wins. The core does not know what kind of thing it is.
  for (const c of collect('near', p, state.layout, room)) {
    if (c && c.d < bestD) { bestD = c.d; best = c; }
  }
  return best;
}

// Everything hanging on a wall near you: the room you stand in, plus the corridor
function pictureSlots() {
  const L = state.layout;
  if (!L) return [];
  const room = state.currentRoom;
  return room ? (room.art || []) : (L.wallArt || []);
}

// A cup at the cooler or the coffee machine: you stand still, drink, and feel
// slightly better about the day.
const DRINK_MS = 2800;

function startDrink(target) {
  if (state.drink) return;
  const water = target.kind === 'water';
  const spot = water ? target.prop : target.room.coffee;
  const p = state.player;
  state.drink = {
    kind: target.kind,
    x: water ? spot.x - 16 : spot.x - 18,
    y: water ? spot.y : spot.y - 6,
    spot,
    until: state.t + DRINK_MS,
    gulps: [900, 1600, 2250],
    started: state.t,
  };
  p.dir = state.drink.x > p.x ? 1 : -1;
  p.moving = false;
  sound.pour(water ? 1 : 0.7);
}

// Table football. There are two sides, and agents can take them: if both are taken, they
// play without you, and that is more honest than squeezing a third in at a table for two.
const PLAY_MS = 5400;

function freeSide() {
  const k = state.layout && state.layout.kicker;
  if (!k) return -1;
  const taken = new Set();
  for (const act of state.actors.values()) if (act.kicking && act.seatIdx != null) taken.add(act.seatIdx);
  return k.sides.findIndex((_, i) => !taken.has(i));
}

function startPlay() {
  if (state.play) return;
  const k = state.layout.kicker;
  const i = freeSide();
  if (i < 0) { UI.toast(tr('toast.kickBusy')); return; }
  const spot = k.sides[i];
  const p = state.player;
  state.play = {
    x: spot.x, y: spot.y, side: i, mine: 0, his: 0,
    goals: [1100, 2200, 3200, 4300, 5000],
    until: state.t + PLAY_MS,
  };
  p.dir = k.x > spot.x ? 1 : -1;
  p.moving = false;
  sound.chime();
}

function tickPlay(now) {
  const g = state.play;
  if (!g) return;
  while (g.goals.length && now >= g.until - PLAY_MS + g.goals[0]) {
    g.goals.shift();
    if (Math.random() < 0.5) g.mine += 1; else g.his += 1;
    sound.step(0.8, 'tile');
  }
  if (now < g.until) return;
  state.play = null;
  state.me.kicks = (state.me.kicks || 0) + 1;
  if (g.mine > g.his) state.me.kickWins = (state.me.kickWins || 0) + 1;
  localStorage.setItem('valey-me', JSON.stringify(state.me));
  const key = g.mine > g.his ? 'toast.kickWin' : g.mine < g.his ? 'toast.kickLose' : 'toast.kickDraw';
  UI.toast(tr(key, { a: g.mine, b: g.his }));
}

// The fish in the microwave. It heats for six seconds, then the ping — and for another
// fourteen seconds the smell goes along the floor. Nothing except the smell happens: that
// is the joke.
const MICRO_RUN = 6000, MICRO_SMELL = 14000;

function startMicro(room) {
  if (state.micro) {
    // It is already heating — there is no room for a second fish. Staying silent here is
    // not allowed: the person presses SPACE and does not understand why nothing happened.
    UI.toast(tr(state.micro.phase === 'run' ? 'toast.microBusy' : 'toast.microSmell'), 'wait');
    return;
  }
  state.micro = { key: room.key, at: state.t, phase: 'run' };
  state.player.moving = false;
  UI.toast(tr('toast.microOn'));
  sound.pour(0.5);
}

function tickMicro(now) {
  const m = state.micro;
  if (!m) return;
  const passed = now - m.at;
  if (m.phase === 'run' && passed > MICRO_RUN) {
    m.phase = 'smell';
    sound.chime();
    UI.toast(tr('toast.microDing'), 'wait');
    // The agents learn about the fish the same way as about everything else in the office — as news
    const who = state.agents[Math.floor(Math.random() * state.agents.length)];
    if (who) UI.toast(tr('news.micro', { name: who.name }), 'news');
  }
  if (m.phase === 'smell' && passed > MICRO_RUN + MICRO_SMELL) state.micro = null;
}

// ------------------------------------------------------------------ the bench
// Sitting down and doing nothing is the whole mechanic, and two small things matter in it.
//
// The first: the seat lies inside furniture, and furniture takes up the floor. So people
// stand up not where they sat but onto a point in front of the bench: otherwise a person
// ends up inside a block and comes out of it sideways, as out of a wardrobe.
//
// The second: any movement lifts you. A separate "stand up" key would be honest but
// inconvenient — somebody sitting presses forward and expects to go, not to have the
// office answer "no".
function sitDown(n) {
  const p = state.player;
  state.seat = { x: n.seat.x, y: n.seat.y, out: n.out, dir: p.dir || 1 };
  p.x = n.seat.x; p.y = n.seat.y;
  p.moving = false; p.running = false; p.vx = 0; p.vy = 0;
  if (p.skate) p.skate = false;              // people do not sit with a board
  state.stepDist = 22;
}

function standUp() {
  const s = state.seat;
  if (!s) return;
  const p = state.player;
  p.x = s.out.x; p.y = s.out.y;
  p.moving = false;
  state.seat = null;
  sound.step(0.7, surfaceUnder(state.layout, p.x, p.y));
}

function tickDrink(now) {
  const d = state.drink;
  if (!d) return;
  const elapsed = now - d.started;
  while (d.gulps.length && elapsed >= d.gulps[0]) {
    d.gulps.shift();
    sound.gulp(d.kind === 'water' ? 1 : 0.8);
    d.lastGulp = now;
    if (d.kind === 'water') setTimeout(() => sound.bubble(), 120);
  }
  if (now >= d.until) {
    state.drink = null;
    const key = d.kind === 'water' ? 'drinks' : 'coffees';
    state.me[key] = (state.me[key] || 0) + 1;
    localStorage.setItem('valey-me', JSON.stringify(state.me));
    UI.toast(tr(d.kind === 'water' ? 'toast.waterDone' : 'toast.coffeeDone',
      { n: state.me[d.kind === 'water' ? 'drinks' : 'coffees'] }));
  }
}

function boardItems(room) {
  const out = [], seen = new Set();
  const ids = room ? new Set(room.agents) : null;
  for (const a of state.agents) {
    if (ids && !ids.has(a.id)) continue;
    for (const f of a.artifacts || []) {
      if (seen.has(f.path)) continue;
      seen.add(f.path); out.push({ ...f, agent: a });
    }
  }
  return out;
}

function interact() {
  // While sitting, SPACE lifts you — and only that. Otherwise it would find the same
  // bench again and the person would stay seated, pressing the "stand up" key.
  if (state.seat) return standUp();
  const n = nearest();
  if (!n) return;
  // We give the event to the module before the core — but only about its own targets:
  // it will not recognise somebody else's kind and will return a lie.
  if (first('act', n, state)) return;
  if (n.kind === 'agent') {
    const a = state.agents.find((x) => x.id === n.id);
    if (!a) return;
    state.focus = a; state.page = 'talk'; state.typed = 0; state.dialogOpen = true;
    state.visited.add(a.id);
    if (state.waypoint === a.id) state.waypoint = null;
    UI.renderDialog();
  } else if (n.kind === 'art') {
    const { name, medium } = titleOf(n.art);
    UI.toast(`«${name}» · ${medium}`);
  } else if (n.kind === 'poster') {
    UI.toast(`«${tr('poster.name')}» · ${tr('poster.medium')}`);
  } else if (n.kind === 'water' || n.kind === 'coffee') {
    startDrink(n);
  } else if (n.kind === 'seat') {
    sitDown(n);
  } else if (n.kind === 'hook') {
    takeCan();
  } else if (n.kind === 'tap') {
    fillCan();
  } else if (n.kind === 'pot') {
    pourOn(n.room, n.pot);
  } else if (n.kind === 'micro') {
    startMicro(n.room);
  } else if (n.kind === 'kicker') {
    startPlay();
  } else if (n.kind === 'lang') {
    UI.openLang();
    } else if (n.kind === 'cams') {
    openCams();
    } else if (n.kind === 'reception') {
    UI.openReception(n.desk, (id) => { state.waypoint = id; UI.toast(tr('toast.guideHim')); });
  } else if (n.kind === 'lift') {
    callLift(n.floor);
  } else {
    UI.openGallery(boardItems(n.room), tr('board.title', { room: n.room.title }));
  }
}

// the list of cameras is rebuilt along with the plan of the floor
function cameras() {
  if (state.camsSig !== state.sig) { state.camsSig = state.sig; state.camList = buildCameras(state.layout); }
  return state.camList;
}

function openCams() {
  const cams = cameras();
  if (!cams.length) return UI.toast(tr('toast.noOffices'));
  state.cctv.on = true;
  state.cctv.since = state.t;
  state.cctv.idx = Math.min(state.cctv.idx, cams.length - 1);
  sound.chime();
  UI.toast(state.cctv.auto
    ? tr('toast.camsAuto')
    : tr('toast.camsManual'));
  UI.renderHud();
}

function closeCams() {
  state.cctv.on = false;
  UI.renderHud();
}

// how long the desk holds one camera in the automatic round
const CAM_DWELL = 6200;

function switchCam(step, auto = false) {
  const n = cameras().length;
  if (!n) return;
  state.cctv.idx = (state.cctv.idx + step + n) % n;
  state.cctv.since = state.t;
  if (!auto) sound.step(0.7, 'tile');
}

function toggleAutoCams() {
  const c = state.cctv;
  c.auto = !c.auto;
  localStorage.setItem('valey-cctv-auto', c.auto ? '1' : '0');
  c.since = state.t;
  UI.toast(c.auto ? tr('toast.autoOn') : tr('toast.autoOff'));
}

// --------------------------------------------------------------------- the lift
// Three phases in a circle: the doors closed → the cabin moved → the doors opened. A
// person rides with the cabin only if he chose the floor in the panel himself; when the
// lift was simply called, it arrives empty to whoever pressed the button.
const LIFT_DOORS = 320, LIFT_PER_SCREEN = 260;

const floorOf = (n) => (state.layout.lift.floors || []).find((f) => f.n === n);

function liftPhase(phase) {
  const st = state.lift;
  st.phase = phase; st.t0 = state.t;
  if (phase === 'moving') {
    const a = floorOf(st.floor), b = floorOf(st.to);
    st.span = Math.max(1, Math.abs((a ? a.y : 0) - (b ? b.y : 0)) / 200);
    sound.lift('move');
  } else if (phase !== 'idle') sound.lift('doors');
}

function callLift(floor) {
  const st = state.lift;
  if (st.phase !== 'idle') return;
  st.riding = false; st.andOpen = true;
  if (st.floor === floor.n) return liftPhase('opening');
  st.to = floor.n;
  liftPhase(st.open > 0 ? 'closing' : 'moving');
}

function openLiftPanel() {
  UI.openLift(state.layout.lift, state.lift.floor, (n) => {
    const st = state.lift;
    st.to = n; st.riding = true; st.andOpen = false;
    liftPhase('closing');
  });
}

function tickLift(now) {
  const st = state.lift;
  if (st.phase === 'idle') return;
  const dur = st.phase === 'moving' ? LIFT_PER_SCREEN * st.span : LIFT_DOORS;
  const k = Math.min(1, (now - st.t0) / dur);
  if (st.phase === 'closing') st.open = 1 - k;
  if (st.phase === 'opening') st.open = k;
  if (k < 1) return;

  if (st.phase === 'closing') return liftPhase('moving');
  if (st.phase === 'moving') {
    st.floor = st.to; st.to = null;
    const f = floorOf(st.floor);
    if (st.riding && f) {
      state.player.x = state.layout.lift.x - 18;
      state.player.y = f.y - 8;
      state.player.dir = -1;
    }
    sound.lift('ding');
    return liftPhase('opening');
  }
  st.phase = 'idle'; st.open = 1; st.riding = false;
  if (st.andOpen) { st.andOpen = false; openLiftPanel(); }
}

// What stands in front of the pager. Deliberately the same list closeAll() walks
// rather than panelsOpen(): panelsOpen answers «can the person walk», and it does
// not know about the notes or the wardrobe, so the pager would still have stolen
// Esc from those two. One question, one list.
const ABOVE_PAGER = ['viewer', 'roster', 'bag', 'sky', 'skin', 'notes', 'lift', 'invite', 'lang'];
function aboveThePager() {
  if (titleOpen() || state.dialogOpen || state.cctv.on || state.lift.phase !== 'idle') return true;
  if (keysOpen() || collect('busy').some(Boolean)) return true;
  return ABOVE_PAGER.some((id) => { const n = document.getElementById(id); return n && !n.hidden; });
}

function closeAll() {
  if (state.lift.phase !== 'idle') return;
  if (!document.getElementById('lift').hidden) return UI.closeLift();
  if (state.cctv.on) return closeCams();
  if (keysOpen()) return closeKeys();
  if (!document.getElementById('viewer').hidden) return UI.closeViewer();
  if (!document.getElementById('roster').hidden) return UI.closeRoster();
  if (!document.getElementById('bag').hidden) return UI.closeBag();
  if (!document.getElementById('sky').hidden) return UI.closeSky();
  if (!document.getElementById('skin').hidden) return UI.closeSkin();
  if (!document.getElementById('lang').hidden) return UI.closeLang();
  if (!document.getElementById('notes').hidden) return UI.closeNotes();
  // The invitation stood in panelsOpen() and did not stand here: the panel held the
  // office, while Escape fell past it into closing the dialog and looked broken. It could
  // only be closed by the cross — that one has a handler of its own.
  if (UI.inviteOpen()) return UI.closeInvite();
  if (first('esc')) return;
  // Standing up is "back" too: sitting is a state Escape has to lead out of, or it is
  // the only thing in the office that does nothing.
  if (state.seat) return standUp();
  state.dialogOpen = false; state.focus = null; state.notice = ''; UI.closeDialog();
}

// ---------------------------------------------------------------- simulation
// wood in the rooms, runner or bare tile in the corridors
function surfaceUnder(L, x, y) {
  if (roomAt(L, x, y)) return 'wood';
  for (const b of L.bands || []) {
    const cy = b.y + b.h / 2 - 12;
    if (y > cy && y < cy + 26 && x > 24 && x < L.w - 24) return 'carpet';
  }
  return 'tile';
}

function panelsOpen() {
  // a moving cabin holds the person in place too: the doors are closed, there is nowhere to go out to
  return titleOpen() || state.dialogOpen || state.cctv.on || UI.inviteOpen() || state.lift.phase !== 'idle'
    // A module panel holds the screen too: the core does not know its ids and must not.
    || keysOpen()
    || collect('busy').some(Boolean)
    || ['viewer', 'roster', 'bag', 'sky', 'lift', 'invite', 'lang'].some((id) => !document.getElementById(id).hidden);
}

// Where the office is standing, for the keys panel to draw the right board.
//
// The order is the order onKey resolves a press in, and it has to be: whoever
// eats the key first is the place you are in. Read the other way round the panel
// would describe a screen lying underneath another one — the control room while
// the lift is open over it, say.
//
// This lives here and not in keys.js on purpose. Only the entry point knows what
// is on top of what; the panel is given an answer and draws it.
function currentPlace() {
  if (state.cctv.on) return 'cctv';
  // The viewer is two places. A wall of thumbnails is walked like any panel; one
  // open file has its own keys, and ESC out of it goes back to the wall.
  const viewer = UI.viewerOpen();
  if (viewer) return { single: 'viewer', transcript: 'transcript', gallery: 'gallery' }[viewer];
  if (UI.liftOpen() || state.lift.phase !== 'idle') return 'lift';
  if (UI.rosterOpen()) return 'standup';
  // One panel, two places: on «поговорить» the cursor is in the field, so the
  // letters type instead of opening anything. That is the state this whole
  // feature was asked for.
  if (state.dialogOpen) return 'card';
  // A module that owns the screen names its own place; the core does not know
  // module ids and must not learn them.
  const mine = first('place');
  if (mine && hasPlace(mine)) return mine;
  // A panel with no board of its own is still a panel: the floor is not listening.
  if (['bag', 'sky', 'skin', 'notes', 'invite', 'lang'].some((id) => {
    const n = document.getElementById(id);
    return n && !n.hidden;
  })) return 'panel';
  if (collect('busy').some(Boolean)) return 'panel';
  // Standing at something on the floor: the floor still answers, and only the
  // thing under your hand renames SPACE.
  const near = nearest();
  if (near && near.kind === 'water') return 'cooler';
  return 'floor';
}

function update(dt, now) {
  // The corridor in front of the door is the only place people walk in before the office
  // is built: the layout below may still be empty, while walking is already needed.
  if (titleOpen()) tickTitle(dt, titleFree() ? keys : NO_KEYS);

  const L = state.layout;
  if (!L) return;
  const p = state.player;

  tickDrink(now);
  tickMicro(now);
  tickPlay(now);
  tickLift(now);
  tellWhereIAm(now);

  // Other people arrive at their last known place by themselves. The speed is taken
  // slightly above walking: catching up has to happen by the next message, otherwise a
  // person is always trailing behind his real self. A jump of more than half the screen is
  // a lift or somebody else's reload, and showing it as a jump is more honest than as a
  // ride through the walls.
  for (const q of state.people.values()) {
    const dx = q.tx - q.x, dy = q.ty - q.y;
    const d = Math.hypot(dx, dy);
    if (d > 200) { q.x = q.tx; q.y = q.ty; continue; }
    if (d < 0.5) { q.x = q.tx; q.y = q.ty; continue; }
    const step = Math.min(d, 1.9 * dt);
    q.x += (dx / d) * step; q.y += (dy / d) * step;
  }

  if (!panelsOpen() && !state.drink && !state.play) {
    const running = held('move.run');
    // The stick takes precedence over the keys: it also puts arrows into keys when tilted
    // past the threshold, and adding them to the analogue would mean losing the analogue.
    const ix = pad.x || (held('move.right') ? 1 : 0) - (held('move.left') ? 1 : 0);
    const iy = pad.y || (held('move.down') ? 1 : 0) - (held('move.up') ? 1 : 0);
    // Somebody sitting is lifted by the very first movement — and in the same frame he is already walking.
    if (state.seat && (ix || iy)) standUp();
    let dx = 0, dy = 0;
    if (p.skate) {
      // on a board the keys set not a displacement but a push: the speed lives between
      // frames, so let go and you are still rolling
      const v = skateStep(p, { x: ix, y: iy, push: running }, dt);
      p.vx = v.vx; p.vy = v.vy;
      dx = p.vx * dt; dy = p.vy * dt;
      p.moving = rolling(p);
      p.running = false;
      // The flight is counted separately from the rolling: along the ground the board
      // moves, upwards everything flies together. landed goes up for one frame — under the
      // sound of the landing.
      const air = ollieStep(p, dt);
      p.z = air.z; p.vz = air.vz;
      if (air.landed) sound.step(0.8, surfaceUnder(L, p.x, p.y));
    } else {
      const sp = (running ? 2.6 : 1.35) * dt;
      dx = ix * sp; dy = iy * sp;
      p.vx = 0; p.vy = 0;
      p.moving = !!(dx || dy);
      p.running = p.moving && running;
    }
    if (dx) p.dir = Math.sign(dx);
    const was = { x: p.x, y: p.y };
    // If the player has ended up inside furniture after all — a cabinet that moved, a new
    // thing in an old place — the walls do not hold him until he gets out.
    const stuck = blocked(L, p.x, p.y);
    // walked in small increments: a sprint on a laggy frame must not tunnel a wall
    const glide = (axis, delta) => {
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / 2));
      const inc = delta / steps;
      for (let i = 0; i < steps; i++) {
        const nx = axis === 'x' ? p.x + inc : p.x;
        const ny = axis === 'y' ? p.y + inc : p.y;
        // ran into something: on a skateboard the glide along this axis has to be killed,
        // or the player stands in a wall and goes on "riding" — it looks like a frozen game
        if (!stuck && blocked(L, nx, ny)) { if (axis === 'x') p.vx = 0; else p.vy = 0; break; }
        p.x = nx; p.y = ny;
      }
    };
    if (dx) glide('x', dx);
    if (dy) glide('y', dy);

    const travelled = Math.hypot(p.x - was.x, p.y - was.y);
    state.stepDist += travelled;
    // running takes shorter, harder steps; on a skateboard these are no longer steps but
    // the joints of the floorboards under the wheels — rarer and quieter
    const stride = p.skate ? 46 : (p.running ? 22 : 30);
    if (state.stepDist > stride) {
      state.stepDist = 0;
      sound.step(p.skate ? 0.55 : (p.running ? 1.3 : 1), surfaceUnder(L, p.x, p.y));
      if (p.running) state.dust.push({ x: p.x - p.dir * 5, y: p.y, life: 1 });
    }
  } else {
    p.moving = false; p.running = false; state.stepDist = 22;
    p.vx = 0; p.vy = 0;   // an open panel or a cup in hand — the glide is zeroed
  }
  if (state.drink) { p.x += (state.drink.x - p.x) * Math.min(1, 0.12 * dt); p.y += (state.drink.y - p.y) * Math.min(1, 0.12 * dt); }
  // at the table the player stands on his own side and does not slide anywhere
  if (state.play) { p.x += (state.play.x - p.x) * Math.min(1, 0.14 * dt); p.y += (state.play.y - p.y) * Math.min(1, 0.14 * dt); }

  for (const d of state.dust) d.life -= 0.045 * dt;
  if (state.dust.length) state.dust = state.dust.filter((d) => d.life > 0).slice(-14);

  // creak of whichever doorway you are stepping through
  const inFront = (r) => p.y > r.y - 8 && p.y < r.y + WALL + 8
    && p.x > r.door.x - 2 && p.x < r.door.x + r.door.w + 2;
  const inBack = (r) => {
    const b = r.back;
    if (!b) return false;
    return b.side === 'bottom'
      ? p.x > b.x - 2 && p.x < b.x + b.w + 2 && p.y > b.y - 8 && p.y < b.y + 14
      : p.y > b.y - 2 && p.y < b.y + b.h + 2 && p.x > b.x - 8 && p.x < b.x + 16;
  };
  const through = L.rooms.find((r) => inFront(r) || inBack(r));
  const key = through && (inBack(through) ? through.key + '-back' : through.key);
  if (through && state.doorRoom !== key) { state.doorRoom = key; sound.door(); }
  if (!through) state.doorRoom = null;

  const room = roomAt(L, p.x, p.y);
  if (room !== state.currentRoom) { state.currentRoom = room; UI.renderHud(); }

  // the reader recognises you a couple of steps away and holds the doors open while you are near
  const sec = L.security;
  if (sec) {
    const r = sec.reader;
    const near = Math.hypot(r.x + 4 - p.x, r.y + 6 - p.y) < 70
      || Math.hypot(sec.doorPoint.x - p.x, sec.doorPoint.y - p.y) < 70
      || state.currentRoom === sec;
    if (near !== state.cctv.unlocked) {
      state.cctv.unlocked = near;
      if (near) { sound.chime(); UI.toast(tr('toast.badge'), 'news'); }
    }
    // walked out of the control room — the cameras go off by themselves
    if (state.cctv.on && state.currentRoom !== sec) closeCams();
    // the automatic round: the desk moves on to the next camera by itself while you stand and watch
    if (state.cctv.on && state.cctv.auto && now - state.cctv.since > CAM_DWELL) switchCam(1, true);
  }

  tickActors(state.actors, state.agents, L, dt, now, (ev) => {
    if (ev.kind === 'news') { UI.toast(ev.text, 'news'); sound.chime(); }
  });

  if (!state.realWeather && now - state.weatherAt > 60_000) {
    state.weatherAt = now;
    const fresh = proceduralWeather();
    if (fresh.kind !== state.weather.kind) UI.toast(tr('sky.outside', { what: tr('sky.' + fresh.kind) }));
    state.weather = fresh;
  }
  const f = flash(state.t, state.weather);
  if (f > 0.55 && !state.wasFlashing) { state.wasFlashing = true; sound.thunder(0.6 + Math.random() * 0.5); }
  if (f === 0) state.wasFlashing = false;
  tickSound(state, dt, state.weather);
  // Every frame goes to the modules. It is needed by those with something to lead through
  // time: that is how the radio damps the office and changes the volume by the distance to
  // the receiver. The point was declared in the loader from the very beginning and was never
  // called once — that is, a module standing in it would silently do nothing.
  collect('tick', state, dt);

  const c = state.cat;
  if (Math.hypot(c.tx - c.x, c.ty - c.y) < 3) {
    if (Math.random() < 0.008) {
      const target = state.currentRoom || L.projectRooms[0];
      c.tx = target.x + 30 + Math.random() * (target.w - 60);
      c.ty = target.y + target.h - 40 - Math.random() * 30;
    }
  } else {
    c.x += Math.sign(c.tx - c.x) * 0.3 * dt;
    c.y += Math.sign(c.ty - c.y) * 0.3 * dt;
  }
}

// ------------------------------------------------------------------ painting
function nightAmount() {
  const sun = state.sun;
  if (sun) {
    const dusk = 55; // minutes of half-light on each side
    const mins = (sun.now + (Date.now() - sun.at) / 60_000 + 1440) % 1440;
    if (mins <= sun.rise + dusk) return clamp01((sun.rise + dusk - mins) / (dusk * 2));
    if (mins >= sun.set - dusk) return clamp01((mins - (sun.set - dusk)) / (dusk * 2));
    return 0;
  }
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return 1 - Math.max(0, Math.cos(((h - 13.5) / 24) * Math.PI * 2));
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function label(x, y, text, color = '#f6e3c0') {
  ctx.font = '7px "JetBrains Mono", "Courier New", monospace';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(24,18,14,0.75)';
  ctx.fillRect(x - w / 2 - 2, y - 7, w + 4, 9);
  pxText(ctx, text, x - w / 2, y, color);
}

function draw(t) {
  const L = state.layout;
  ctx.fillStyle = '#1b120c'; ctx.fillRect(0, 0, VW, VH);

  // the entrance screen is drawn instead of the office: behind the door it is not visible
  if (titleOpen()) { drawTitle(ctx, VW, VH, t); return; }

  if (!L) { pxText(ctx, tr('label.searching'), VW / 2 - 30, VH / 2, '#8c7660'); return; }

  if (state.cctv.on) {
    const cams = cameras();
    drawCamera(ctx, VW, VH, cams[state.cctv.idx], {
      agents: state.agents, actors: state.actors, looks: state.looks, boardItems,
      layout: L, night: nightAmount(), weather: state.weather, cat: state.cat,
      player: state.player, me: myLook(), unlocked: state.cctv.unlocked,
      index: state.cctv.idx, total: cams.length,
      auto: state.cctv.auto, dwell: CAM_DWELL, since: state.cctv.since,
      online: t - state.cctv.since > 260,   // a short ripple on switching
    }, t);
    return;
  }

  const p = state.player;
  const camX = Math.max(0, Math.min(Math.max(0, L.w - VW), Math.round(p.x - VW / 2)));
  const camY = Math.max(0, Math.min(Math.max(0, L.h - VH), Math.round(p.y - VH / 2)));
  ctx.save(); ctx.translate(-camX, -camY);

  const night = nightAmount();
  // The table comes alive only while somebody is standing at it. The drawing knows nothing
  // about the agents and the player — it is told from here, before the corridor is drawn.
  if (state.play) kickerBusy.since = t;
  else for (const act of state.actors.values()) {
    if (act.kicking && act.lounge && !act.path.length) { kickerBusy.since = t; break; }
  }
  drawCorridor(ctx, L, t, night, state.weather);
  const visible = L.rooms.filter((r) => r.x < camX + VW + 40 && r.x + r.w > camX - 40 && r.y - 20 < camY + VH && r.y + r.h > camY - 40);
  for (const r of visible) {
    // A brush of its own is a room's content rather than a special case in the engine: the
    // clipping by camera, the order and the collisions are shared with the project rooms.
    if (r.draw === 'security') {
      drawSecurity(ctx, r, t, { unlocked: state.cctv.unlocked, camsOn: state.cctv.on });
      continue;
    }
    if (r.draw === 'meeting') { drawMeeting(ctx, r, t); continue; }
    if (r.draw === 'greenhouse') {
      drawGreenhouse(ctx, r, t, { night: nightAmount(), weather: state.weather, garden: gardenView(r) });
      continue;
    }
    // A module's room: its own brush is its own, and the module paints it at the draw point.
    // The core has nothing to do here — drawRoom would paint an ordinary office with a tone
    // and desks over the reading room, and it has neither.
    if (r.draw) continue;
    drawRoom(ctx, r, t); drawRoomProps(ctx, r, t);
    if (r.micro) drawMicro(ctx, r.micro, t, state.micro && state.micro.key === r.key ? state.micro : null);
  }
  drawLift(ctx, L, t, state.lift);
  drawReception(ctx, L, t);

  const near = nearest();
  const draws = [];
  const byId = new Map(state.agents.map((a) => [a.id, a]));

  for (const r of visible) {
    // The board hangs only in a project room: it is about that room's tasks. The service
    // ones have none — and that is not "nothing to show" but a missing field. Without the
    // check drawBoard reads r.board.x off undefined and falls over on every frame; the fall
    // tears the draws queue, and everything below it — the agents, the cat, the player
    // himself — simply stops being drawn. Found on 30 August 2026, when a person disappeared
    // from the screen the moment he walked up to the smoking room on the service tier.
    if (r.board) {
      const showcasing = [...state.actors.values()].some((ac) => ac.room === r && ac.showcase > t && !ac.path.length);
      draws.push({ y: r.y - 1, fn: () => drawBoard(ctx, r, boardItems(r), t, showcasing) });
    }
    for (const d of r.desks) {
      const a = byId.get(r.agents[d.i]);
      draws.push({ y: d.y + 12, fn: () => drawDesk(ctx, d, a, t) });
    }
  }

  for (const act of state.actors.values()) {
    const a = byId.get(act.id);
    // we judge by where the agent stands rather than by where his room is: he goes off to
    // the smoking room into the corridor, and he has to be visible there too
    if (!a) continue;
    if (act.x < camX - 30 || act.x > camX + VW + 30 || act.y < camY - 40 || act.y > camY + VH + 40) continue;
    const sitting = act.state === 'sit';
    const frame = act.state === 'walk' ? Math.floor(t / 130) : (a.status === 'working' ? Math.floor(t / 160) : Math.floor(t / 520));
    draws.push({ y: act.y + (sitting ? 0 : 0.5), fn: () => {
      drawPerson(ctx, act.x, act.y, state.looks.get(a.id), {
        pose: sitting ? 'sit' : act.state === 'walk' ? 'walk' : 'stand',
        frame, dir: act.dir, bob: !sitting && act.state !== 'walk' ? Math.floor(t / 700) % 2 : 0,
      });
      drawBubble(ctx, act.x + 14, act.y - 26, a, t);
      if (state.waypoint === a.id) {
        const jump = Math.abs(Math.sin(t / 300)) * 3;
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(act.x - 2, act.y - 40 - jump, 4, 5);
        ctx.fillRect(act.x - 4, act.y - 36 - jump, 8, 2);
      }
    } });
    if (near && near.kind === 'agent' && near.id === a.id) {
      draws.push({ y: 1e9, fn: () => {
        label(act.x, act.y - 34, `${a.name} · ${UI.roleText(a)}`);
        label(act.x, act.y + 30, a.limited ? tr('label.limited') : UI.actText(a).slice(0, 34), a.limited ? '#ffd166' : '#ffdf9e');
        label(act.x, act.y + 40, tr('hint.talk'), '#9fe0a8');
      } });
    }
  }

  if (state.drink && state.drink.kind === 'water') {
    const sp = state.drink.spot;
    draws.push({ y: sp.y + 1, fn: () => {
      for (let i = 0; i < 3; i++) {
        const phase = ((t / 620) + i / 3) % 1;
        ctx.fillStyle = `rgba(190,225,240,${0.7 - phase * 0.5})`;
        ctx.fillRect((sp.x - 4 + i * 3) | 0, (sp.y - 28 - phase * 9) | 0, 1, 1);
      }
    } });
  }

  // Other people. They are drawn in the same queue as the agents and you yourself, so
  // whoever is lower is nearer, without a separate "guests" layer.
  for (const q of state.people.values()) {
    if (q.x < camX - 30 || q.x > camX + VW + 30 || q.y < camY - 40 || q.y > camY + VH + 40) continue;
    draws.push({ y: q.y + 0.5, fn: () => {
      drawPerson(ctx, q.x, q.y, q.look, {
        pose: q.moving ? 'walk' : 'stand',
        frame: Math.floor(t / 130), dir: q.dir,
        bob: q.moving ? 0 : Math.floor(t / 800) % 2,
      });
      // A name over somebody else is always there rather than on approach: otherwise
      // nameless figures stand in the corridor and it is unclear who is who.
      // A page that has not been reloaded since 5 September 2026 still sends
      // «ТЫ» as its name. Over somebody else it is a lie whoever sent it, so it
      // is read here as what it means: a person who has not named himself.
      label(q.x, q.y - 34, (isSelfLabel(q.name) ? tr('label.guest') : q.name) || '?', '#8fc8ff');
    } });
  }

  draws.push({ y: state.cat.y, fn: () => drawCat(ctx, state.cat.x, state.cat.y, Math.floor(t / 300)) });
  draws.push({ y: p.y, fn: () => {
    for (const d of state.dust) {
      ctx.fillStyle = `rgba(226,206,170,${0.35 * d.life})`;
      ctx.fillRect(d.x | 0, (d.y - 1 - (1 - d.life) * 3) | 0, 2, 1);
    }
    const dr = state.drink;
    // the board underfoot — before the person, he is standing on it
    if (p.skate) drawSkateboard(ctx, p.x, p.y, p.dir, p.moving, t, p.z);
    // The person flies together with the board, the shadow stays on the floor — the board
    // draws it itself and squeezes it by the height.
    drawPerson(ctx, p.x, p.y - p.z, myLook(), {
      // on a skateboard the feet stand on the deck rather than stepping
      pose: state.seat ? 'sit' : p.skate ? 'stand' : (p.moving ? 'walk' : 'stand'),
      frame: Math.floor(t / (p.running ? 80 : 130)), dir: p.dir,
      bob: p.skate
        ? 2 + (p.moving && Math.floor(t / 90) % 2 ? 1 : 0)
        : (p.moving ? (p.running ? Math.floor(t / 80) % 2 : 0) : Math.floor(t / 800) % 2),
    });
    if (dr) {
      const sipping = t - (dr.lastGulp || -999) < 260;
      const cx = p.x + (p.dir || 1) * 5;
      const cy = p.y - (sipping ? 17 : 12);
      ctx.fillStyle = dr.kind === 'water' ? '#eef4f8' : '#e8ddc8';
      ctx.fillRect(cx - 1, cy, 4, 5);
      ctx.fillStyle = dr.kind === 'water' ? '#9fd4e8' : '#6b4a2e';
      ctx.fillRect(cx, cy + 1, 2, 2);
      if (sipping) label(p.x, p.y - 40, dr.kind === 'water' ? tr('label.gulp') : tr('label.ah'), '#9fd4e8');
    }
    // the score hangs above the head while a game is on: without it, what is going on at
    // the table can only be understood from the ball
    if (state.play) label(p.x, p.y - 42, `${state.play.mine}:${state.play.his}`, '#ffd166');
    label(p.x, p.y - 34, state.me.name || tr('label.me'), '#9fe0a8');
  } });

  if (near && near.kind === 'lang') {
    const q = near.prop;
    draws.push({ y: 1e9, fn: () => label(q.x, q.y - 44, tr('hint.lang'), '#ffd166') });
  }

  if (near && near.kind === 'kicker' && !state.play) {
    const k = near.prop;
    draws.push({ y: 1e9, fn: () => label(k.x, k.y - 30, tr('hint.kicker'), '#9fe0a8') });
  }

  if (near && near.kind === 'cams') {
    const c = near.sec.console;
    draws.push({ y: 1e9, fn: () => label(c.x, c.y + 40, state.cctv.on ? tr('hint.camsOn') : tr('hint.cams'), '#9fe0a8') });
  }

  // The modules draw themselves with the same list and the same sorting by y: a module's
  // thing must not end up over somebody standing in front of it.
  // The canvas is given to fn as an argument rather than let the module capture it: a ctx
  // captured once outlives a change of scale and will draw into the old buffer.
  for (const d of collect('draw', state.layout, t, near)) draws.push({ y: d.y, fn: () => d.fn(ctx) });
  for (const h of collect('hint', near, state)) {
    draws.push({ y: 1e9, fn: () => label(h.x, h.y, h.text, h.color || '#9fe0a8') });
  }

  if (near && near.kind === 'poster' && !state.drink) {
    const a = near.slot;
    draws.push({ y: 1e9, fn: () => label(a.x + a.w / 2, a.y + a.h + 16, tr('hint.art'), '#ffd166') });
  }
  if (near && near.kind === 'art' && !state.drink) {
    const a = near.art;
    draws.push({ y: 1e9, fn: () => label(a.x + a.w / 2, a.y + a.h + 16, tr('hint.art'), '#ffd166') });
  }

  if (near && near.kind === 'water' && !state.drink) {
    const w = near.prop;
    draws.push({ y: 1e9, fn: () => label(w.x, w.y + 16, tr('hint.water'), '#9fd4e8') });
  }
  if (near && (near.kind === 'pot' || near.kind === 'tap' || near.kind === 'hook')) {
    const left = canLeft();
    const spot = near.kind === 'pot' ? near.pot.spot : near.kind === 'tap' ? near.room.tap.spot : near.room.hook.spot;
    const key = near.kind === 'hook' ? (state.carry ? 'hint.canBack' : 'hint.can')
      : near.kind === 'tap' ? 'hint.tap'
      : !state.carry ? 'hint.potNoCan' : left > 0 ? 'hint.pot' : 'hint.potEmpty';
    draws.push({ y: 1e9, fn: () => label(spot.x, spot.y + 12, tr(key, { n: left }), state.carry ? '#9fd4e8' : '#9fe0a8') });
  }
  if (state.seat) {
    const s = state.seat;
    draws.push({ y: 1e9, fn: () => label(s.x, s.y + 26, tr('hint.standUp'), '#9fe0a8') });
  } else if (near && near.kind === 'seat') {
    const st = near.seat;
    draws.push({ y: 1e9, fn: () => label(st.x, st.y + 26, tr('hint.sit'), '#9fe0a8') });
  }
  if (near && near.kind === 'micro') {
    const m = near.room.micro;
    const mine = state.micro && state.micro.key === near.room.key ? state.micro : null;
    const key = mine ? (mine.phase === 'run' ? 'hint.microOn' : 'hint.microSmell') : 'hint.micro';
    draws.push({ y: 1e9, fn: () => label(m.x, m.y + 16, tr(key), mine ? '#ffd166' : '#9fe0a8') });
  }
  if (near && near.kind === 'coffee' && !state.drink) {
    const c = near.room.coffee;
    draws.push({ y: 1e9, fn: () => label(c.x - 12, c.y + 14, tr('hint.coffee'), '#ffd166') });
  }

  if (near && near.kind === 'reception') {
    const r = near.desk;
    draws.push({ y: 1e9, fn: () => label(r.x + r.w / 2, r.y + 26, tr('hint.reception'), '#9fe0a8') });
  }

  if (near && near.kind === 'lift' && state.lift.phase === 'idle') {
    const f = near.floor;
    const here = state.lift.floor === f.n;
    draws.push({ y: 1e9, fn: () => label(L.lift.x - 20, f.y - 30,
      here ? tr('hint.liftIn') : tr('hint.liftCall'), '#9fd4e8') });
  }

  if (near && near.kind === 'board') {
    const b = near.room.board;
    draws.push({ y: 1e9, fn: () => label(b.x + b.w / 2, b.y + b.h + 14, tr('hint.board'), '#9fe0a8') });
  }

  draws.sort((a, b) => a.y - b.y).forEach((d) => d.fn());

  drawLight(ctx, L, t, night);
  ctx.restore();

  const bolt = flash(t, state.weather);
  if (bolt > 0) {
    const indoors = state.currentRoom ? 0.45 : 1;
    ctx.fillStyle = `rgba(214,228,255,${0.5 * bolt * indoors})`;
    ctx.fillRect(0, 0, VW, VH);
  }

  // waypoint arrow at the screen edge
  if (state.waypoint) {
    const act = state.actors.get(state.waypoint);
    if (act) {
      const sx = act.x - camX, sy = act.y - camY;
      if (sx < 6 || sx > VW - 6 || sy < 6 || sy > VH - 6) {
        const ang = Math.atan2(sy - VH / 2, sx - VW / 2);
        const ax = VW / 2 + Math.cos(ang) * (VW / 2 - 12);
        const ay = VH / 2 + Math.sin(ang) * (VH / 2 - 12);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(-4, -2, 8, 4); ctx.fillRect(3, -4, 2, 8);
        ctx.restore();
      }
    } else state.waypoint = null;
  }

  // daylight lifts the whole floor, night drops a cold blanket over it
  if (night < 0.95) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(96,86,64,${0.20 * (1 - night)})`;
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  }
  ctx.fillStyle = `rgba(26,20,58,${0.03 + night * 0.34})`;
  ctx.fillRect(0, 0, VW, VH);
  const g = ctx.createRadialGradient(VW / 2, VH / 2, VH / 3, VW / 2, VH / 2, VH);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(30,14,4,${0.45 + night * 0.15})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
}

let lastT = performance.now();
let rafId = 0;
function loop(now) {
  const dt = Math.min(3, (now - lastT) / 16.67); lastT = now;
  state.t = now;
  tickPad();
  update(dt, now); draw(now);
  if (!document.hidden) { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop); }
}
// keep the office ticking (slowly) while the tab sits in the background
setInterval(() => { if (document.hidden) loop(performance.now()); }, 250);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { lastT = performance.now(); cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop); }
});

// The canvas is scaled by a whole number of PHYSICAL pixels, not of css pixels. At a
// fractional zoom (125%, 150%) a css pixel stops being a whole number of screen dots, and
// an office pixel is stretched over 3.3 dots: some rows come out three dots, some four,
// and the seven-pixel font above the heads turns into soap. We count the scale in dots —
// then every pixel takes exactly N.
// The scale is counted in PHYSICAL pixels per game pixel — only a whole number gives a
// crisp picture. The steps are ×2…×8; a zero means "count it from the width".
// All the arithmetic lives in web/viewport.js and is covered by a stand; this is canvas only.
const ZOOM_KEY = 'valey-zoom';
let zoomWanted = Math.max(0, Number(localStorage.getItem(ZOOM_KEY)) || 0);
if (zoomWanted) zoomWanted = Math.max(SCALE_MIN, Math.min(SCALE_MAX, zoomWanted));

function setZoom(next) {
  zoomWanted = next;
  if (next) localStorage.setItem(ZOOM_KEY, String(next));
  else localStorage.removeItem(ZOOM_KEY);
  refit();
  UI.renderHud();
  UI.toast(next ? tr('toast.zoomSet', { n: state.zoom.dev }) : tr('toast.zoomAuto', { n: state.zoom.dev }));
}

function stepZoom(dir) {
  const next = stepScale(zoomWanted || state.zoom.dev, dir);
  if (next === null) {
    UI.toast(dir < 0 ? tr('toast.zoomFloor', { n: SCALE_MIN }) : tr('toast.zoomCeil', { n: SCALE_MAX }));
    return;
  }
  setZoom(next);
}

function fit() {
  const dpr = window.devicePixelRatio || 1;
  const hud = document.getElementById('hud');
  // The strips measure in their own pixels while zoom:var(--ui) stretches them on
  // screen, and offsetHeight knows nothing about it. Without the multiplier the hint
  // at 175% lies on top of the office — visible on the "интерфейс 175%" frame.
  const k = ui.scale || 1;
  const top = (hud ? hud.offsetHeight * k : 0) + 20;
  // Nothing sits along the bottom any more — the key list moved into the ? panel — so the
  // office only keeps a gap the size of the one above it, and takes the rest.
  const bottom = 20;
  document.body.style.paddingTop = top + 'px';
  document.body.style.paddingBottom = bottom + 'px';
  // the toasts stand above the hint rather than over it: it can be three lines tall
  const toasts = document.getElementById('toasts');
  if (toasts) toasts.style.bottom = (bottom + 8) + 'px';

  const availW = Math.max(160, innerWidth - 16);
  const availH = Math.max(90, innerHeight - top - bottom);
  // The entrance is drawn in 400×225 and its composition is approved by its own
  // frames: it does not stretch — the office behind its door does.
  const v = viewport(availW, availH, dpr, zoomWanted, titleOpen());
  if (canvas.width !== v.vw || canvas.height !== v.vh) {
    canvas.width = v.vw; canvas.height = v.vh;
    ctx.imageSmoothingEnabled = false;   // resizing the canvas resets the context
  }
  VW = v.vw; VH = v.vh;
  canvas.style.width = VW * v.scale / dpr + 'px';
  canvas.style.height = VH * v.scale / dpr + 'px';
  state.zoom = { dev: v.scale, max: SCALE_MAX, auto: v.auto, tight: v.tight };
  layoutTitle();   // the entrance menu is tied to the canvas rather than to the window
  return top + bottom;
}

// The hint wraps onto a new line from the same change of width that caused the recount,
// and the first measurement catches it still on one line. We measure again on the next
// frame and, if the strips have grown, squeeze the canvas — one extra pass.
function refit() {
  const was = fit();
  requestAnimationFrame(() => { if (fit() !== was) fit(); });
}
addEventListener('resize', refit);
// A bigger interface means a taller HUD, and the office is laid out around it. The
// browser fires no event for that, so the size control tells us itself.
onUiScale(() => refit());

// A zoom changes devicePixelRatio, and a resize does not arrive after it in every browser.
// The subscription lives on exactly the current value, so we re-register it every time.
let dprQuery = null;
function watchDpr() {
  if (dprQuery) dprQuery.removeEventListener('change', onDpr);
  dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  dprQuery.addEventListener('change', onDpr);
}
function onDpr() { refit(); watchDpr(); }
watchDpr();

// ------------------------------------------------------------- the entrance screen
// The little switch figure stands both in the office corridor and on the entrance screen,
// so the switching itself lives here, one for both. The language goes into the settings
// rather than into localStorage: let it switch in every tab at once, as the weather does.
function switchLang(next = lang() === 'ru' ? 'en' : 'ru') {
  if (next === lang()) return;
  saveSettings({ lang: next });
  setLang(next);
  UI.toast(tr('toast.lang'));
  sound.chime();
}

initTitle(state, {
  // roomKey — enter a room straight away. The second source is #room= in the address: it
  // was described by this comment as a debug entrance and was read by nobody. On a stand
  // there is no checking the service rooms without it: the control room cannot be walked to,
  // and it is not in the TAB list.
  enter(roomKey) {
    const fromHash = (location.hash.match(/^#room=(.+)$/) || [])[1];
    const key = roomKey || (fromHash && decodeURIComponent(fromHash));
    // We search among all the rooms, not only the project ones: the service ones — the
    // control room, the meeting room — cannot be opened otherwise at all, and there is
    // nothing to check in them.
    const r = key && (state.layout.rooms || []).find((x) => x.key === key);
    if (r) {
      state.player.x = r.x + r.w / 2;
      state.player.y = r.y + r.h - 60;
      state.cat.x = state.player.x + 30; state.cat.y = state.player.y;
      state.currentRoom = r;
    }
    closeTitle();
    document.body.classList.remove('titling');
    // The entrance is drawn in a fixed 400×225 and the office is not: the canvas has to
    // be recounted the moment the door closes behind us, or the office keeps the
    // entrance's size and sits in bars.
    refit();
    UI.renderHud();
    sound.init();
    sound.door(0.8);
  },
  bag: () => UI.renderBag('self'),
  sky: () => UI.renderSky(),
  lang: () => switchLang(),
  // The name typed on the entrance card is the same name the inventory edits and
  // presence sends: one field, stored in one place, so a guest who named himself
  // at the door is not «ГОСТЬ» a second later.
  setName(name) { state.me.name = name; localStorage.setItem('valey-me', JSON.stringify(state.me)); },
});
document.body.classList.add('titling');
// The canvas gets its size before the menu goes looking for its place. #title is
// positioned from the canvas box, so a menu laid out before the first fit() stands
// on a canvas that is still the wrong size and jumps as soon as fit() runs — the
// flash everyone sees on the way in. The HUD is drawn first for the same reason:
// fit() measures it to decide how much room the office gets.
UI.renderHud();
refit();
renderTitle();

// The modules come up before the first frame: their things have to get into the plan at
// once, or the first pass will draw the office without them and it will flicker.
// Nothing is asked of the office before it knows who is asking. For the owner
// this changes nothing; for a guest it is the difference between an office and
// an empty room.
await admission;
await loadModules({ saveSettings });
// The modules arrive later than the first stream, so their listeners are hung on
// the open one now. Without this their events would be silently lost until the
// network happened to blink and the stream was reopened.
if (es) attachStreams(es);
// Rebuild the static: the hint line at the bottom is assembled once at start-up, while the
// keys of the modules arrive later — without this a free build and a paid one would show
// the same hint.
renderStatic();
await initStand();
// The plan manages to be assembled before the modules come up: it is built on the very
// first snapshot from SSE, while the modules ride in on a separate request. The layout
// point then does not run over it, a module's thing is not in the plan — and there is
// nothing to draw, though the module came up and its dictionary was poured in. That is
// exactly how the card-index cabinet disappeared on 1 September 2026: it was in the
// registry, it was not on the screen.
// We catch up once; the point has to be idempotent.
if (state.layout) collect('layout', state.layout, state);

rafId = requestAnimationFrame(loop);
