import { lookOf, drawPerson, drawCat, normalizeLook, dressOf, dressMe } from './sprites.js';
import { potState, water as waterPot, tally, CAN_FULL } from './garden.js';
import { buildLayout, planSignature, blocked, roomAt, anchorOf, applyAnchor, WALL } from './layout.js';
import { loadModules, collect, first } from './modules.js';
import { initStand } from './stand.js';
import { drawCorridor, drawRoom, drawBoard, drawDesk, drawRoomProps, drawLight, drawSecurity, drawMeeting, drawGreenhouse, drawMicro, drawLift, drawReception, pxText, kickerBusy } from './office.js';
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
import { actionOf, codeOf, codesOf, hints } from './keymap.js';
// t переименован в tr: в main.js `t` — это время кадра у draw(t), и импорт
// молча перекрывался числом внутри каждого колбэка отрисовки
import { t as tr, lang, setLang, onLang } from './i18n.js';
import { initTitle, drawTitle, renderTitle, titleKey, titleOpen, closeTitle, layoutTitle, tickTitle } from './title.js';

const VW = 400, VH = 225;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VW; canvas.height = VH;
ctx.imageSmoothingEnabled = false;

const DEFAULT_ME = {
  skin: '#ffdcb8', hair: '#3a2a20', shirt: '#4fa89a', pants: '#3f4a63', boots: '#2a2118',
  style: 0, head: 'none', glasses: false, face: 'none', tall: 1, hands: 'none', name: tr('label.me'),
};

// Что лежит в localStorage, писали мы же — но не обязательно этой версией и
// не обязательно целиком: одно битое значение на верхнем уровне модуля
// роняло весь офис до первого кадра, без единой строки в консоли.
const stored = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

const state = {
  agents: [], layout: null, sig: '', actors: new Map(), looks: new Map(),
  // vx/vy — накат скейта: скорость живёт между кадрами, у пешей ходьбы её нет
  player: { x: 120, y: 60, dir: 0, moving: false, skate: false, vx: 0, vy: 0, z: 0, vz: 0 }, spawned: false,
  cat: { x: 200, y: 60, tx: 200, ty: 60 },
  me: normalizeLook({ ...DEFAULT_ME, ...stored('valey-me', {}) }),
  visited: new Set(), waypoint: null, currentRoom: null,
  // Где сидим: {x, y, dir, out} — координата сиденья и точка, откуда встают.
  // Пока не null, игрок не ходит и рисуется в позе sit.
  seat: null,
  focus: null, dialogOpen: false, page: 'talk', typed: 0, notice: '', t: 0,
  prevStatus: new Map(),
  weather: proceduralWeather(), weatherAt: Date.now(), realWeather: null, wasFlashing: false,
  settings: { weather: { enabled: false }, delivery: { mode: 'default' } }, sun: null,
  delivery: { available: false },
  // Хозяин офиса или гость. Спрашивается один раз при заходе: право не меняется
  // на лету, а панель, нарисованная до ответа, показала бы гостю кнопку, которую
  // сервер всё равно не примет.
  owner: true, accessMode: 'private',
  // Как человек оказался на пороге: entry.from — кто позвал, entry.refused —
  // почему не пустили. needsCode — офис общий, а пропуска нет.
  entry: null, needsCode: false,
  // Доступ к агентам: смысл зависит от того, кто смотрит. См. project() на
  // сервере — он и решает, чей это вид.
  access: null,
  stepDist: 0, doorRoom: null, dust: [], drink: null,
  // пультовая: карточка признаётся, когда подходишь ты; камеры включаются с пульта
  cctv: {
    unlocked: false, on: false, idx: 0, since: 0,
    // автообход: камеры сами идут по кругу; выбор запоминается между заходами
    auto: localStorage.getItem('valey-cctv-auto') !== '0',
  },
  camList: [], camsSig: null,
  // лифт: кабина одна на этаж, поэтому её положение — часть состояния мира,
  // а не панели. open — доля раскрытия створок, 0 закрыты, 1 разъехались.
  lift: { floor: 1, open: 0, phase: 'idle', to: null, t0: 0, span: 1, andOpen: false },
  // Другие люди в офисе. Ключ — их id, значение — где они были в последний раз
  // и куда едут: между посылками присутствия человек «доезжает» сам, иначе на
  // 8 кадрах в секунду чужая ходьба выглядит телепортацией.
  people: new Map(),
  // Запросы разрешения, которых ждут агенты. У гостя список всегда пуст —
  // сервер его не присылает.
  permits: [], pagerWaiting: 0,
  soundOn: sound.on,
  // физических пикселей на пиксель игры; заполняется первым же fit()
  zoom: { dev: 3, max: 3, auto: true, clamped: false },
};

const keys = new Set();
// Зажата ли сейчас клавиша этого действия. Множество ключуется физическими
// кодами, поэтому переназначение ходьбы однажды заработает само собой.
const held = (id) => codesOf(id).some((c) => keys.has(c));
// Ручки для отладки из консоли. __ui нужен ещё и потому, что мост расширения
// Claude in Chrome не резолвит динамический import() в странице: вызов повисает
// и уносит с собой весь канал, так что дотянуться до модуля можно только так.
window.__game = state; window.__keys = keys; window.__ui = UI;

// ------------------------------------------------------------------- хозяин
// Право командовать приезжает один раз ссылкой из терминала и остаётся в этом
// браузере. Из адреса токен сразу убирается: строка адреса копируется в чат
// и в скриншот чаще, чем кажется.
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

// Токен гостя выдаётся за код и живёт рядом с хозяйским. Он не даёт прав —
// он даёт войти: в общем режиме офис без него не покажет даже коридора.
let GUEST = localStorage.getItem('valey-guest') || '';

// Код из ссылки. Как и токен хозяина, из адреса убирается сразу: одноразовый
// он или нет, оставлять его в строке, которую копируют в чат, незачем.
const CODE = (() => {
  const q = new URLSearchParams(location.hash.slice(1));
  const given = q.get('code');
  if (!given) return '';
  q.delete('code');
  const rest = q.toString();
  history.replaceState(null, '', location.pathname + (rest ? '#' + rest : ''));
  return given;
})();

// Заголовок вместо куки: офис живёт на одном порту с чужими вкладками того же
// localhost, а куку они делят.
const owned = (extra = {}) => {
  const h = { ...extra };
  if (OWNER) h['x-valey-owner'] = OWNER;
  if (GUEST) h['x-valey-guest'] = GUEST;
  return h;
};

// Дверь. Код меняется на токен ровно один раз; дальше живёт токен, и
// перезагрузка страницы не выставляет человека обратно на улицу.
async function knock() {
  if (!CODE) return null;
  const r = await fetch('/api/enter', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: CODE }),
  }).then((x) => x.json()).catch((e) => ({ error: e.message }));
  if (r && r.guest) {
    GUEST = r.guest;
    localStorage.setItem('valey-guest', GUEST);
  }
  return r;
}

// Сохранение настроек нужно двоим: панелям через initUI и человечку-переключателю
// в коридоре. Поэтому это функция с именем, а не метод объекта, который никому,
// кроме UI, не виден.
async function saveSettings(patch) {
  const r = await fetch('/api/settings', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }), body: JSON.stringify(patch),
  }).then((x) => x.json()).catch((e) => ({ error: e.message }));
  if (r.settings) state.settings = r.settings;
  if (r.weather) applyWeather(r.weather);
  UI.renderHud();
  return r;
}

// Один вход для обоих источников: событие и снимок. Счётчик отложенных живёт
// в состоянии, потому что рисует его шапка, а не пейджер.
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
  // Инвентарь не повторяет панели языка, цвета и звука — он до них доводит.
  lang: () => switchLang(),
  sound: () => { state.soundOn = sound.toggle(); UI.renderHud(); return state.soundOn; },
  geocode: (q) => fetch('/api/geocode?q=' + encodeURIComponent(q)).then((r) => r.json()).catch((e) => ({ error: e.message })),
  saveSettings,
  invites: () => fetch('/api/invites', { headers: owned() })
    .then((r) => r.json()).catch((e) => ({ error: e.message, invites: [] })),
  makeInvite: (name) => fetch('/api/invite', {
    method: 'POST', headers: owned({ 'content-type': 'application/json' }),
    // from — как гость увидит зовущего на экране входа. Сервер имени хозяина
    // не знает: оно живёт в браузере, рядом с внешностью.
    body: JSON.stringify({ name, from: state.me.name || '' }),
  }).then((r) => r.json()).then((r) => {
    // Забираем токен: офис только что стал общим, и без него эта же страница
    // на следующем запросе окажется гостем в собственном офисе.
    if (r && r.owner) {
      OWNER = r.owner; localStorage.setItem('valey-owner', OWNER);
      // Поток помнит, кем открыт: сервер решает это один раз при подключении.
      // Без переоткрытия старый поток после перехода в shared шёл гостевой
      // проекцией — хозяин видел свой офис без реплик и файлов.
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

// Сначала стучимся, потом спрашиваем, кто мы: с кодом в руках ответ на второй
// вопрос зависит от первого.
knock().then((entered) => {
  if (entered && entered.errorKey) state.entry = { refused: entered.errorKey };
  else if (entered && entered.ok) state.entry = { from: entered.from || '' };
  return fetch('/api/whoami', { headers: owned() }).then((r) => r.json());
}).then((r) => {
  // Токен уже на руках, если он вообще будет: поток можно открывать.
  openStream();
  state.owner = !!r.owner;
  state.accessMode = r.mode || 'private';
  state.needsCode = !!r.needsCode;
  if (r.guest && !state.entry) state.entry = { from: r.from || '' };
  // Экран входа рисуется первым: он и есть то, на что человек сейчас смотрит.
  // Если HUD споткнётся — а он читает поля, которых у непущенной страницы нет,
  // — карточка «тебя позвали» уже на месте, а не потеряна вместе с ним.
  renderTitle();
  UI.renderHud();
}).catch(() => { /* не ответил — считаем гостем: молча дать больше прав хуже */
  state.owner = false;
  // Поток открывается и здесь: до 4 сентября 2026 упавший whoami оставлял
  // офис пустым навсегда, без объяснения, — снимки просто не приходили.
  if (!es) openStream();
});

fetch('/api/settings').then((r) => r.json()).then((r) => {
  if (r.settings) { state.settings = r.settings; setLang(r.settings.lang); }
  if (r.weather) applyWeather(r.weather);
  UI.renderHud();
}).catch(() => {});

// Оранжерея. Сад общий и живёт в настройках офиса; в руках лейка — своя, и
// только твоя: это не состояние офиса, а то, что ты сейчас держишь. Из-за
// этого в общем офисе двое увидят лейку на крючке одновременно — цена, которую
// платим за то, что носить её не нужно объяснять серверу.
const garden = () => (state.settings && state.settings.garden) || { pots: {}, can: { left: CAN_FULL } };
const canLeft = () => {
  const c = garden().can;
  return c && Number.isFinite(c.left) ? c.left : CAN_FULL;
};
// То, что показывает drawGreenhouse: состояние каждого горшка на сейчас.
function gardenView(room) {
  const g = garden(), now = Date.now(), st = {};
  for (const p of room.pots) st[p.i] = potState(g.pots && g.pots[p.i], now);
  const n = tally(g, room.pots, now);
  return {
    state: st, canTaken: !!state.carry, canLeft: canLeft(),
    sign: tr('sign.watered', { n: n.wet, total: n.total }),
  };
}
// Пишем и на сервер, и к себе сразу: полив должен быть виден в тот же кадр, а
// не через такт потока. Если сервер откажет — гость, чужой офис — возвращаем
// как было и говорим вслух.
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
  // Сказать стоит только то, что человек и так не увидит: зацвёл — увидит,
  // а вот «это был последний полив в лейке» на экране ничем не написано.
  if (after === 'bloom' && before !== 'bloom') UI.toast(tr('toast.bloomed'));
  else if (next.can.left === 0) UI.toast(tr('toast.canRanOut'), 'wait');
}

// Дресс-код — настройка офиса, а не браузера: он приезжает в settings и
// разлетается по всем открытым вкладкам. Одетый вид считается один раз на смену
// кода, а не в каждом кадре: людей на этаже три десятка, и новый объект на
// каждого шестьдесят раз в секунду — мусор ради ничего.
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
    if (!state.weather || state.weather.source !== 'выдумана') state.weather = proceduralWeather();
  }
}

// ---------------------------------------------------------------- присутствие
// Кто ты для остальных: id, имя и внешность. id живёт в localStorage, а не в
// sessionStorage — две вкладки одного браузера это один человек, а не двое.
const MY_ID = (() => {
  let v = localStorage.getItem('valey-id');
  if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem('valey-id', v); }
  return v;
})();

// Пока идёшь — часто, пока стоишь — редко. Порог по расстоянию, а не по
// «нажата ли клавиша»: лифт возит человека сам, и молчать в это время нельзя.
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
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: MY_ID, name: state.me.name || tr('label.me'), look: myLook(),
      x: p.x, y: p.y, dir: p.dir || 1, moving: !!p.moving,
      room: room ? room.key : null,
    }),
  }).catch(() => { /* офис переживает потерянный пакет присутствия */ });
}

// Закрыл вкладку — исчез сразу, а не через восемь секунд. sendBeacon потому,
// что обычный fetch в pagehide браузер уже не обязан доводить.
addEventListener('pagehide', () => {
  try {
    navigator.sendBeacon('/api/gone', new Blob([JSON.stringify({ id: MY_ID })], { type: 'application/json' }));
  } catch { /* не довели — TTL уберёт через восемь секунд */ }
});

// Чужая внешность достраивается до полной теми же умолчаниями, что своя.
// Сервер уже отбросил мусор, но недостающего он не выдумывает — а drawPerson
// красит фигуру насквозь и на undefined падает.
const theirLook = (look) => normalizeLook({ ...DEFAULT_ME, ...(look && typeof look === 'object' ? look : {}) });

function seePeople(list) {
  const seen = new Set();
  for (const q of list || []) {
    if (q.id === MY_ID) continue;
    seen.add(q.id);
    const had = state.people.get(q.id);
    if (had) {
      // прежнее место становится тем, откуда едем, новое — куда
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
// EventSource не умеет заголовки, поэтому в поток пропуск уходит параметром.
// Это тот же токен: прятать его от строки запроса смысла нет — он и так
// лежит в localStorage этой же страницы.
//
// Поток открывается не сразу, а после того, как мы постучались: у гостя,
// пришедшего по ссылке, токена в момент загрузки ещё нет — он выдаётся за код.
// Открытый раньше поток получал 403, и человек видел пустой офис до первой
// перезагрузки. Найдено 30 августа 2026 первым же настоящим входом по ссылке.
let es = null;
// EventSource сам переподключается только после обрыва сети. Ответ 4xx/5xx —
// офис перезапустился в другом режиме, пропуск отозван, сервер упал на
// секунду — закрывает его насовсем, и страница молча замирает на последнем
// снимке. Поэтому закрытый поток открывается заново, с растущей паузой.
let streamRetry = 2000;
function openStream() {
  if (es) es.close();
  const pass = OWNER ? 'owner=' + encodeURIComponent(OWNER)
    : GUEST ? 'guest=' + encodeURIComponent(GUEST) : '';
  es = new EventSource('/api/stream' + (pass ? '?' + pass : ''));
  // Пейджер должен пищать сразу: в такте снимка это было бы «мне звонили».
  es.addEventListener('permits', (e) => {
    try { takePermits(JSON.parse(e.data)); } catch { /* мусор в кадре — пропускаем */ }
  });
  es.addEventListener('people', (e) => {
    try { seePeople(JSON.parse(e.data)); } catch { /* мусор в кадре — пропускаем */ }
  });
  es.onmessage = (e) => { streamRetry = 2000; onSnapshot(e); };
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED) return;   // сеть моргнула — браузер сам вернётся
    const wait = streamRetry;
    streamRetry = Math.min(streamRetry * 2, 30000);
    setTimeout(() => { if (es.readyState === EventSource.CLOSED) openStream(); }, wait);
  };
}

const onSnapshot = (e) => {
  const data = JSON.parse(e.data);
  state.agents = data.agents || [];
  // Присутствие приходит и в снимке — им встречают вошедшего, чтобы люди были
  // на экране сразу, а не через первый быстрый такт.
  if (data.people) seePeople(data.people);
  // Доступ едет со снимком: у гостя это его собственный вид, у хозяина —
  // кто просит и кому открыто.
  state.access = data.access || null;
  takePermits(data.permits || []);
  // Поток разбирается по полям, а не присваивается целиком, поэтому новое поле
  // надо переносить руками — иначе титульный экран показывает прочерк вместо
  // версии, и это видно только на кадре.
  state.version = data.version || state.version;
  state.release = data.release || null;
  if (wornCode !== dressCode()) dressAll();
  else for (const a of state.agents) if (!state.looks.has(a.id)) state.looks.set(a.id, dressed(a));

  // Модуль может влиять на состав плана — мольберт стоит не во всякой комнате,
  // а только там, где в настройках назван файл. Подпись обязана это учитывать,
  // иначе план не пересоберётся, когда состав изменился: предмет появится лишь
  // после следующего прихода-ухода агента.
  const sig = planSignature(state.agents) + collect('sig', state).join('');
  if (sig !== state.sig) {
    state.sig = sig;
    // План пересобирается целиком, и комнаты в нём стоят на новых местах: ряды
    // прирастают сверху, поэтому чужой проект, начавшийся минуту назад, сдвигает
    // весь этаж вниз. Мировые координаты после такого указывают в соседнюю
    // комнату, а человек при этом никуда не шёл. Поэтому перед пересборкой
    // запоминаем, где он стоял относительно своей комнаты, и после — ставим
    // обратно туда же.
    const wasP = anchorOf(state.layout, state.player);
    const wasC = anchorOf(state.layout, state.cat);
    // Комнаты модулей спрашиваются внутри сборки: планировке нужно знать про
    // них до того, как посчитается высота мира и соберётся лифт.
    state.layout = buildLayout(state.agents, { rooms: (anchor) => collect('room', anchor, state) });
    // Модули довешивают своё на готовую планировку: предмет, точку подхода
    // и прямоугольник, через который не ходят.
    collect('layout', state.layout, state);
    applyAnchor(state.layout, state.player, wasP);
    applyAnchor(state.layout, state.cat, wasC);
    if (wasC) { state.cat.tx = state.cat.x; state.cat.ty = state.cat.y; }
  }
  syncActors(state.actors, state.agents, state.layout);

  if (!state.spawned && state.layout.projectRooms.length) {
    const q = new URLSearchParams(location.hash.slice(1));
    const named = q.get('room') && state.layout.projectRooms.find((r) => r.title.startsWith(q.get('room')));
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
    // дресс-код мог переключить кто-то в соседней вкладке — переодеваемся на
    // месте, без перезагрузки: офис на то и офис
    if (wornCode !== dressCode()) dressAll();
    // язык мог переключить кто-то в соседней вкладке — догоняем
    setLang(data.settings.lang);
    if (changed && !document.getElementById('sky').hidden) UI.renderSky();
  }
  if (data.delivery) state.delivery = data.delivery;
  if (data.weather) applyWeather(data.weather);
  UI.renderHud();
  if (state.dialogOpen) UI.renderDialog();
  if (!document.getElementById('roster').hidden) UI.renderRoster();
  // счётчики на экране входа живые: он и нужен, чтобы узнать это до входа
  if (titleOpen()) renderTitle();
};

// --------------------------------------------------------------------- input
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => sound.init(), { once: true });

// Щипок на трекпаде и Ctrl+колесо браузер считает своим зумом — забираем себе.
// Клавиатурный зум (Cmd+= / Cmd+−) перехватить нельзя, это акселератор самого
// браузера; но он игре и не вредит: масштаб считается от devicePixelRatio, и
// холст после браузерного зума остаётся того же физического размера.
addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  stepZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  addEventListener(ev, (e) => e.preventDefault());
}

// Один обработчик на клавиатуру и геймпад: кнопки геймпада приходят сюда
// именами клавиш, и панели отвечают им, не зная, откуда нажатие.
function onKey(e) {
  const k = e.key.toLowerCase();
  // Физическая клавиша и действие, которое на ней висит. Буквы ниже не
  // сравниваются: `code` одинаков под любой раскладкой, а что он значит,
  // решает реестр в web/keymap.js.
  const code = codeOf(e);
  const act = actionOf(e);
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  // Сочетание с Cmd, Ctrl или Alt принадлежит браузеру и системе, а не офису.
  // Без этой строки Cmd+R перезагружал страницу и заодно выкатывал приёмник —
  // буква доходила сюда голой, модификатор никто не смотрел. То же самое было
  // с Cmd+N, Cmd+C и всяким сочетанием, чья буква занята в офисе: человек
  // делает обычную вещь браузера и получает вдобавок панель. Shift не в счёт —
  // он тут свой: Shift+F9 и бег.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // the open board eats the arrows before the office sees them
  if (UI.viewerKey(e.key, e.shiftKey)) { e.preventDefault(); return; }
  // Панель лифта и стойка — то же самое: пока они открыты, стрелки ходят по
  // этажам, а не по офису.
  if (UI.liftKey(e.key)) { e.preventDefault(); return; }
  if (UI.rosterKey(e.key)) { e.preventDefault(); return; }
  // Сначала действие, потом сырая клавиша: модуль, объявивший свои клавиши
  // через api.keys(), отвечает на идентификатор, а не на букву. Старая точка
  // остаётся живой — на ней держатся модули, которые не переписывали.
  if (act && first('action', act, e)) { e.preventDefault(); return; }
  if (first('key', e.key, e.shiftKey)) { e.preventDefault(); return; }
  if (UI.notesKey(e.key)) { e.preventDefault(); return; }
  if (UI.bagKey(e.key)) { e.preventDefault(); return; }
  if (UI.skyKey(e.key)) { e.preventDefault(); return; }
  if (UI.skinKey(e.key)) { e.preventDefault(); return; }
  // Что отнимаем у браузера: прокрутку по пробелу, переход фокуса по Tab.
  // Считаем по физической клавише, а не по символу: под русской раскладкой
  // пробел остаётся пробелом, а вот проверка по символу мимо кириллицы
  // проходила молча.
  if (['Tab', 'Space', 'Escape'].includes(code)) e.preventDefault();
  if (state.dialogOpen && (k.startsWith('arrow') || k === 'enter')) e.preventDefault();
  if (code) keys.add(code);

  // Экран входа забирает клавиши себе — но только когда поверх него ничего не
  // открыто: «переодеться» и «окно в мир» зовутся прямо отсюда и должны сами
  // отвечать на стрелки и ESC.
  if (titleFree()) {
    if (titleKey(e)) { e.preventDefault(); return; }
  }

  // Пейджер держит свои две клавиши, пока карточки нет: Enter отвечает, Esc
  // откладывает. Открытая карточка забирает их себе — она поверх, и в ней уже
  // есть и «разрешить», и «закрыть».
  if (!state.dialogOpen && pagerKey(e.key)) { e.preventDefault(); return; }

  // Esc на «отказать с запиской» — шаг назад к кнопкам, а не закрытие карточки:
  // человек нажал отказ и ещё ничего не отправил.
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
  // F9 выше всего остального: он служебный и должен работать в любом состоянии
  // офиса. Пока он стоял ниже, ветка камер возвращалась раньше — и снять вид с
  // камеры было нельзя вообще, ровно тот кадр, которым Prod и иллюстрирует
  // пультовую. Нашлось 30 августа 2026 при пересъёмке плит.
  if (act === 'service.shot') { e.preventDefault(); saveShot(e.shiftKey ? 4 : 1); return; }

  if (state.cctv.on) {
    if (act === 'move.left') return switchCam(-1);
    if (act === 'move.right') return switchCam(1);
    if (act === 'cams.auto') return toggleAutoCams();
    if (act === 'act.interact' || k === 'enter') return closeCams();
    return;
  }
  // масштаб: работает всегда, даже поверх открытых панелей
  if (act === 'zoom.in') { e.preventDefault(); return stepZoom(1); }
  if (act === 'zoom.out') { e.preventDefault(); return stepZoom(-1); }
  if (act === 'zoom.reset') { e.preventDefault(); return setZoom(0); }

  if (act === 'panel.round') return toggle('roster', UI.renderRoster, UI.closeRoster);
  // N снаружи показывает все заметки; внутри разговора та же клавиша их пишет
  if (act === 'panel.notes') return toggle('notes', UI.renderNotes, UI.closeNotes);
  // C открывает инвентарь на «на себе» — там, где эта клавиша была всегда.
  if (act === 'panel.bag') return toggle('bag', () => UI.renderBag('self'), UI.closeBag);
  if (act === 'panel.sky') return toggle('sky', UI.renderSky, UI.closeSky);
  if (act === 'panel.skin') return toggle('skin', UI.renderSkin, UI.closeSkin);
  // I — пригласить. Кадры клавишу не задают, это выбор здесь: G занята
  // нарисованным «этажом команды», а из свободных букв I — единственная,
  // которая читается и по-русски (ш) как та же кнопка. Панель только у
  // хозяина; гостю звать некого, и у него I открывает инвентарь на той
  // вкладке, где он был. Две ветки претендовали на букву с 2 сентября 2026,
  // инвентарь стоял выше и приглашение не открывалось ни у кого — а другого
  // входа у панели нет.
  if (act === 'panel.invite') {
    if (state.owner !== false) return UI.inviteOpen() ? UI.closeInvite() : UI.openInvite();
    return toggle('bag', UI.renderBag, UI.closeBag);
  }
  // H — вернуть отложенный пейджер. Не E: она в офисе равна ПРОБЕЛу, и
  // «перезвоню» с возвратом на одну клавишу были бы разговором с агентом.
  if (act === 'panel.pager' && recall()) return;
  // B — скейт. Не S: та занята шагом вниз в WASD, и переназначить её нельзя,
  // не сломав ходьбу.
  if (act === 'act.skate') return toggleSkate();
  if (act === 'act.sound') {
    state.soundOn = sound.toggle();
    UI.renderHud();
    UI.toast(state.soundOn ? tr('toast.soundOn') : tr('toast.soundOff'));
    return;
  }
  if (act === 'act.interact' && !state.dialogOpen) {
    // На доске ПРОБЕЛ прыгает — но только там, где ему раньше нечего было
    // делать. Иначе с агентом стало бы не поговорить, не слезая с доски.
    if (canOllie(state.player) && !nearest()) state.player.vz = OLLIE_POP;
    else interact();
  }
}
addEventListener('keydown', onKey);
// Экран входа открыт и поверх него ничего нет — значит и клавиши, и ходьба
// по коридору принадлежат ему.
const titleFree = () => titleOpen()
  && ['bag', 'sky', 'viewer', 'roster'].every((id) => document.getElementById(id).hidden);
const NO_KEYS = new Set();

// Отпускание считается по той же физической клавише, что и нажатие. Пока
// множество ключевалось символом, смена раскладки при зажатой клавише роняла
// туда мусор навсегда: нажал под латиницей, отпустил под кириллицей — запись
// не удалялась, и офис продолжал идти сам.
addEventListener('keyup', (e) => { const c = codeOf(e); if (c) keys.delete(c); });
addEventListener('blur', () => keys.clear());

// Геймпад опрашивается раз в кадр: у Gamepad API нет событий на кнопки, только
// снимок. Кнопки уходят в onKey как клавиши, отпускания — в keys, как keyup.
// Оси остаются здесь, аналогом: update() берёт их вместо клавиш, когда стик
// наклонён.
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
    // Пока печатают, стрелки со стика остаются при тексте: стик под большим
    // пальцем дрожит, а фокус в карточке от этого уезжать не должен.
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

// Слезая, скорость обнуляем: без этого игрок уезжает ещё полторы секунды уже
// пешком, и это читается как залипшая клавиша.
function toggleSkate() {
  const p = state.player;
  p.skate = !p.skate;
  if (!p.skate) { p.vx = 0; p.vy = 0; p.z = 0; p.vz = 0; }
  UI.toast(tr(p.skate ? 'toast.skateOn' : 'toast.skateOff'));
}

// Снимок холста на диск, в .shots рядом с кодом. Смысл в том, что headless-
// браузер этот офис не снимает: страница держит открытым /api/stream, событие
// load не наступает, и `chrome --screenshot` просто ждёт вечно. А судить о
// мелком тексте по макету нельзя — 400×225 растягиваются целыми пикселями, и
// увидеть настоящую букву можно только здесь.
//
// Снимается ТОЛЬКО холст: панели, HUD и тосты — обычный DOM поверх него, и в
// canvas.toDataURL они не попадают. Масштаб ×4 повторяет то, что делает сам
// офис: увеличение без сглаживания, пиксель в квадрат.
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
  // имя со временем, иначе второй снимок затирает первый и сравнивать нечего
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

// Всё, что написано словами, перерисовывается при смене языка. Холст не в
// счёт: он и так перерисовывается каждый кадр и берёт строки из t() на лету.
function renderStatic() {
  const help = document.getElementById('help');
  // Строка помощи собирается из реестра клавиш, а не пишется руками: подпись
  // берётся у действия, клавиша — у его привязки. Пока строка была текстом в
  // словаре, она отставала от кода — в ней не было ни E, ни F9, ни H, потому
  // что клавишу добавляли в одном месте, а строку правили в другом.
  //
  // Модулям точка `help` оставлена: ей пользуются те, кто ещё не объявил свои
  // клавиши через api.keys(), и им незачем ломаться из-за нашей уборки.
  const cap = (c) => { const t = tr('keycap.' + c); return t === 'keycap.' + c ? c : t; };
  const strip = hints().map((h) => `${h.caps.map(cap).join(' ')} — ${tr(h.hint)}`);
  if (help) help.textContent = [...strip, ...collect('help'), tr('help.tail')].join(' · ');
  document.title = tr('doc.title');
  document.documentElement.lang = lang();
  UI.relabel();
  if (titleOpen()) renderTitle();
}
onLang(renderStatic);
renderStatic();

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

  // Скамейки: у коридорной сиденья считаются из её ширины (34 px, рисуется от
  // центра), у оранжерейной лежат готовыми в раскладке. Подходят спереди —
  // сзади у обеих спинка.
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
    // на плакат смотрят с пола под ним, как и на картины
    if (sec.poster) {
      const a = sec.poster;
      const dp = Math.hypot(a.x + a.w / 2 - p.x, a.y + a.h + 14 - p.y);
      if (dp < bestD) { bestD = dp; best = { kind: 'poster', slot: a }; }
    }
  }

  const lf = state.layout.lift;
  if (lf) {
    for (const f of lf.floors) {
      // к дверям подходят слева: справа от шахты этажа уже нет
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
  // Модули добавляют свои цели тем же способом: кандидат с расстоянием,
  // ближайший побеждает. Ядро не знает, что это за предмет.
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

// Настольный футбол. Сторон две, и занять их могут агенты: если обе заняты —
// играют без тебя, и это честнее, чем втискивать третьего к столу на двоих.
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

// Рыба в микроволновке. Шесть секунд она греется, потом звонок — и ещё
// четырнадцать секунд по этажу идёт запах. Ничего, кроме запаха, не
// происходит: в этом и шутка.
const MICRO_RUN = 6000, MICRO_SMELL = 14000;

function startMicro(room) {
  if (state.micro) {
    // Уже греется — второй рыбе места нет. Молчать тут нельзя: человек жмёт
    // ПРОБЕЛ и не понимает, почему ничего не случилось.
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
    // Агенты узнают о рыбе так же, как обо всём остальном в офисе, — новостью
    const who = state.agents[Math.floor(Math.random() * state.agents.length)];
    if (who) UI.toast(tr('news.micro', { name: who.name }), 'news');
  }
  if (m.phase === 'smell' && passed > MICRO_RUN + MICRO_SMELL) state.micro = null;
}

// ------------------------------------------------------------------ скамейка
// Сесть и ничего не делать — это вся механика, и в ней важны две мелочи.
//
// Первая: сиденье лежит внутри мебели, а мебель занимает пол. Поэтому встают
// не туда, где сидели, а на точку перед скамьёй: иначе человек оказывается
// внутри блока и выходит из него бочком, как из шкафа.
//
// Вторая: любое движение поднимает. Клавиша «встать» отдельной кнопкой была бы
// честной, но неудобной — сидящий жмёт вперёд и ждёт, что пойдёт, а не что
// офис ответит «нет».
function sitDown(n) {
  const p = state.player;
  state.seat = { x: n.seat.x, y: n.seat.y, out: n.out, dir: p.dir || 1 };
  p.x = n.seat.x; p.y = n.seat.y;
  p.moving = false; p.running = false; p.vx = 0; p.vy = 0;
  if (p.skate) p.skate = false;              // с доской не сидят
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
    UI.toast(d.kind === 'water'
      ? `Стакан воды. Сегодня ${state.me.drinks}-й`
      : `Кофе налит. Всего ${state.me.coffees}`);
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
  // Сидя ПРОБЕЛ поднимает — и только это. Иначе он снова найдёт ту же скамью
  // и человек останется сидеть, нажимая клавишу «встать».
  if (state.seat) return standUp();
  const n = nearest();
  if (!n) return;
  // Модулю отдаём событие раньше ядра — но только про его собственные цели:
  // чужой kind он не узнает и вернёт ложь.
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
    switchLang();
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

// список камер пересобирается вместе с планом этажа
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

// сколько пульт держит одну камеру в автообходе
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

// --------------------------------------------------------------------- лифт
// Три фазы по кругу: створки закрылись → кабина поехала → створки открылись.
// Человек переезжает вместе с кабиной только если сам выбрал этаж в панели;
// когда лифт просто вызвали, он приезжает пустым к тому, кто нажал кнопку.
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

function closeAll() {
  if (state.lift.phase !== 'idle') return;
  if (!document.getElementById('lift').hidden) return UI.closeLift();
  if (state.cctv.on) return closeCams();
  if (!document.getElementById('viewer').hidden) return UI.closeViewer();
  if (!document.getElementById('roster').hidden) return UI.closeRoster();
  if (!document.getElementById('bag').hidden) return UI.closeBag();
  if (!document.getElementById('sky').hidden) return UI.closeSky();
  if (!document.getElementById('skin').hidden) return UI.closeSkin();
  if (!document.getElementById('notes').hidden) return UI.closeNotes();
  // Приглашение стояло в panelsOpen() и не стояло здесь: панель держала офис,
  // а Escape проваливался мимо неё в закрытие диалога и выглядел сломанным.
  // Закрыть её можно было только крестиком — у него свой обработчик.
  if (UI.inviteOpen()) return UI.closeInvite();
  if (first('esc')) return;
  // Встать — тоже «назад»: сидение это состояние, из которого Escape обязан
  // выводить, иначе он единственный в офисе ничего не делает.
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
  // едущая кабина тоже держит человека на месте: створки закрыты, выходить некуда
  return titleOpen() || state.dialogOpen || state.cctv.on || UI.inviteOpen() || state.lift.phase !== 'idle'
    // Панель модуля тоже держит экран: своих id ядро не знает и знать не должно.
    || collect('busy').some(Boolean)
    || ['viewer', 'roster', 'bag', 'sky', 'lift', 'invite'].some((id) => !document.getElementById(id).hidden);
}

function update(dt, now) {
  // Коридор перед дверью — единственное место, где ходят до того, как офис
  // построен: layout ниже может быть ещё пустым, а идти уже надо.
  if (titleOpen()) tickTitle(dt, titleFree() ? keys : NO_KEYS);

  const L = state.layout;
  if (!L) return;
  const p = state.player;

  tickDrink(now);
  tickMicro(now);
  tickPlay(now);
  tickLift(now);
  tellWhereIAm(now);

  // Чужие доезжают до последнего известного места сами. Скорость взята чуть
  // выше пешей: догнать надо к следующей посылке, иначе человек всё время
  // тянется позади себя настоящего. Прыжок больше половины экрана — это лифт
  // или чужая перезагрузка, и его честнее показать прыжком, чем проездом
  // сквозь стены.
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
    // Стик берёт верх над клавишами: он же и кладёт стрелки в keys, когда
    // наклонён за порог, и складывать их с аналогом значило бы терять аналог.
    const ix = pad.x || (held('move.right') ? 1 : 0) - (held('move.left') ? 1 : 0);
    const iy = pad.y || (held('move.down') ? 1 : 0) - (held('move.up') ? 1 : 0);
    // Сидящего поднимает первое же движение — и в этом же кадре он уже идёт.
    if (state.seat && (ix || iy)) standUp();
    let dx = 0, dy = 0;
    if (p.skate) {
      // на скейте клавиши задают не смещение, а толчок: скорость живёт между
      // кадрами, поэтому отпустил — и ещё катишься
      const v = skateStep(p, { x: ix, y: iy, push: running }, dt);
      p.vx = v.vx; p.vy = v.vy;
      dx = p.vx * dt; dy = p.vy * dt;
      p.moving = rolling(p);
      p.running = false;
      // Полёт считается отдельно от качения: по земле едет доска, вверх летит
      // всё вместе. landed поднимается один кадр — под звук приземления.
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
    // Если игрок всё-таки оказался внутри мебели — сдвинутая тумба, новый предмет
    // на старом месте — стены его не держат, пока он не выберется наружу.
    const stuck = blocked(L, p.x, p.y);
    // walked in small increments: a sprint on a laggy frame must not tunnel a wall
    const glide = (axis, delta) => {
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / 2));
      const inc = delta / steps;
      for (let i = 0; i < steps; i++) {
        const nx = axis === 'x' ? p.x + inc : p.x;
        const ny = axis === 'y' ? p.y + inc : p.y;
        // упёрлись: на скейте накат по этой оси надо погасить, иначе игрок
        // стоит в стене и продолжает «ехать» — выглядит как зависшая игра
        if (!stuck && blocked(L, nx, ny)) { if (axis === 'x') p.vx = 0; else p.vy = 0; break; }
        p.x = nx; p.y = ny;
      }
    };
    if (dx) glide('x', dx);
    if (dy) glide('y', dy);

    const travelled = Math.hypot(p.x - was.x, p.y - was.y);
    state.stepDist += travelled;
    // running takes shorter, harder steps; на скейте это уже не шаги, а стыки
    // половиц под колёсами — реже и тише
    const stride = p.skate ? 46 : (p.running ? 22 : 30);
    if (state.stepDist > stride) {
      state.stepDist = 0;
      sound.step(p.skate ? 0.55 : (p.running ? 1.3 : 1), surfaceUnder(L, p.x, p.y));
      if (p.running) state.dust.push({ x: p.x - p.dir * 5, y: p.y, life: 1 });
    }
  } else {
    p.moving = false; p.running = false; state.stepDist = 22;
    p.vx = 0; p.vy = 0;   // открытая панель или стакан в руке — накат обнуляется
  }
  if (state.drink) { p.x += (state.drink.x - p.x) * Math.min(1, 0.12 * dt); p.y += (state.drink.y - p.y) * Math.min(1, 0.12 * dt); }
  // у стола игрок стоит на своей стороне и никуда не съезжает
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

  // считыватель узнаёт тебя за пару шагов и держит створки открытыми, пока ты рядом
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
    // вышел из пультовой — камеры гаснут сами
    if (state.cctv.on && state.currentRoom !== sec) closeCams();
    // автообход: пульт сам переходит к следующей камере, пока ты стоишь и смотришь
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
  // Каждый кадр — модулям. Нужна тем, у кого есть что вести во времени: радио
  // так приглушает офис и меняет громкость по расстоянию до приёмника. Точка
  // была объявлена в загрузчике с самого начала и не вызывалась ни разу — то
  // есть модуль, вставший в неё, молча ничего бы не делал.
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

  // экран входа рисуется вместо офиса: за дверью его не видно
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
      online: t - state.cctv.since > 260,   // короткая рябь при переключении
    }, t);
    return;
  }

  const p = state.player;
  const camX = Math.max(0, Math.min(Math.max(0, L.w - VW), Math.round(p.x - VW / 2)));
  const camY = Math.max(0, Math.min(Math.max(0, L.h - VH), Math.round(p.y - VH / 2)));
  ctx.save(); ctx.translate(-camX, -camY);

  const night = nightAmount();
  // Стол оживает, только пока за ним кто-то стоит. Рисовалка про агентов и
  // игрока не знает — ей говорят отсюда, до отрисовки коридора.
  if (state.play) kickerBusy.since = t;
  else for (const act of state.actors.values()) {
    if (act.kicking && act.lounge && !act.path.length) { kickerBusy.since = t; break; }
  }
  drawCorridor(ctx, L, t, night, state.weather);
  const visible = L.rooms.filter((r) => r.x < camX + VW + 40 && r.x + r.w > camX - 40 && r.y - 20 < camY + VH && r.y + r.h > camY - 40);
  for (const r of visible) {
    // Своя кисть у комнаты — это её содержимое, а не особый случай в движке:
    // отсечение по камере, порядок и коллизии у неё общие с проектными.
    if (r.draw === 'security') {
      drawSecurity(ctx, r, t, { unlocked: state.cctv.unlocked, camsOn: state.cctv.on });
      continue;
    }
    if (r.draw === 'meeting') { drawMeeting(ctx, r, t); continue; }
    if (r.draw === 'greenhouse') {
      drawGreenhouse(ctx, r, t, { night: nightAmount(), weather: state.weather, garden: gardenView(r) });
      continue;
    }
    // Комната модуля: своя кисть у неё своя, и красит её модуль в точке draw.
    // Ядру тут делать нечего — drawRoom нарисовал бы поверх читальни обычный
    // кабинет с тоном и столами, которых у неё нет.
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
    // Доска висит только у проектной комнаты: она про её задачи. У сервисных
    // её нет — и это не «нечего показать», а отсутствующее поле. Без проверки
    // drawBoard читает r.board.x у undefined и валится на каждом кадре; падение
    // рвёт очередь draws, и всё, что стояло в ней ниже — агенты, кот, сам
    // игрок, — просто перестаёт рисоваться. Найдено 30 августа 2026, когда
    // человек пропал с экрана, стоило подойти к курилке на сервисном ярусе.
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
    // судим по тому, где агент стоит, а не где его комната: в курилку он уходит
    // в коридор, и там его тоже должно быть видно
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

  // Другие люди. Рисуются в той же очереди, что агенты и ты сам, поэтому кто
  // ниже — тот и ближе, без отдельного слоя «гости».
  for (const q of state.people.values()) {
    if (q.x < camX - 30 || q.x > camX + VW + 30 || q.y < camY - 40 || q.y > camY + VH + 40) continue;
    draws.push({ y: q.y + 0.5, fn: () => {
      drawPerson(ctx, q.x, q.y, q.look, {
        pose: q.moving ? 'walk' : 'stand',
        frame: Math.floor(t / 130), dir: q.dir,
        bob: q.moving ? 0 : Math.floor(t / 800) % 2,
      });
      // Имя над чужим — всегда, а не по подходу: иначе в коридоре стоят
      // безымянные фигуры и непонятно, кто из них кто.
      label(q.x, q.y - 34, q.name || '?', '#8fc8ff');
    } });
  }

  draws.push({ y: state.cat.y, fn: () => drawCat(ctx, state.cat.x, state.cat.y, Math.floor(t / 300)) });
  draws.push({ y: p.y, fn: () => {
    for (const d of state.dust) {
      ctx.fillStyle = `rgba(226,206,170,${0.35 * d.life})`;
      ctx.fillRect(d.x | 0, (d.y - 1 - (1 - d.life) * 3) | 0, 2, 1);
    }
    const dr = state.drink;
    // доска под ногами — до человека, он на ней стоит
    if (p.skate) drawSkateboard(ctx, p.x, p.y, p.dir, p.moving, t, p.z);
    // Человек летит вместе с доской, тень остаётся на полу — её рисует сама
    // доска и сжимает по высоте.
    drawPerson(ctx, p.x, p.y - p.z, myLook(), {
      // на скейте ноги стоят на деке, а не переступают
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
    // счёт висит над головой, пока идёт партия: без него понять, что вообще
    // происходит у стола, можно только по мячу
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

  // Модули рисуют себя тем же списком и той же сортировкой по y: предмет
  // модуля не должен оказаться поверх того, кто стоит перед ним.
  // Холст отдаём в fn аргументом, а не даём модулю захватить его: захваченный
  // однажды ctx переживёт смену масштаба и будет рисовать в старый буфер.
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

// Холст масштабируется целым числом ФИЗИЧЕСКИХ пикселей, а не css-пикселей.
// На дробном зуме (125%, 150%) css-пиксель перестаёт быть целым числом точек
// экрана, и пиксель офиса растягивается на 3.3 точки: часть рядов выходит по
// три точки, часть по четыре, и семипиксельный шрифт над головами превращается
// в мыло. Считаем масштаб в точках — тогда каждый пиксель занимает ровно N.
// Масштаб считается в ФИЗИЧЕСКИХ пикселях на пиксель игры — только целое число
// даёт чёткую картинку. Ступени фиксированные, ×2…×8; ноль означает «по окну».
const ZOOM_KEY = 'valey-zoom';
// Ниже ×6 не опускаемся: на этой ступени подсказка снизу помещается целиком, а
// мельче офис читается плохо. Уменьшение оставлено только как аварийный выход,
// когда окно физически не вмещает ×6 — тогда ступень зажимается сама.
const ZOOM_MIN = 6, ZOOM_MAX = 8;
let zoomWanted = Math.max(0, Number(localStorage.getItem(ZOOM_KEY)) || 0);
if (zoomWanted && zoomWanted < ZOOM_MIN) zoomWanted = ZOOM_MIN;

function setZoom(next) {
  zoomWanted = next;
  if (next) localStorage.setItem(ZOOM_KEY, String(next));
  else localStorage.removeItem(ZOOM_KEY);
  refit();
  UI.renderHud();
  UI.toast(next ? `Масштаб ×${state.zoom.dev}` : `Масштаб по окну — ×${state.zoom.dev}`);
}

function stepZoom(dir) {
  const from = zoomWanted || state.zoom.dev;
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, from + dir));
  if (dir < 0 && from <= ZOOM_MIN) {
    UI.toast(tr('toast.zoomFloor', { n: ZOOM_MIN }));
    return;
  }
  if (next === zoomWanted) return;
  setZoom(next);
}

function fit() {
  const dpr = window.devicePixelRatio || 1;
  const hud = document.getElementById('hud');
  const help = document.getElementById('help');
  // сколько отъели полосы сверху и снизу — мерим, а не угадываем: подсказка
  // переносится на три-четыре строки, стоит окно сузить или зазумить
  const top = (hud ? hud.offsetHeight : 0) + 20;
  const bottom = (help ? help.offsetHeight : 0) + 16;
  document.body.style.paddingTop = top + 'px';
  document.body.style.paddingBottom = bottom + 'px';
  // тосты встают над подсказкой, а не поверх неё: она бывает и трёхстрочной
  const toasts = document.getElementById('toasts');
  if (toasts) toasts.style.bottom = (bottom + 8) + 'px';

  const availW = Math.max(VW, innerWidth - 16);
  const availH = Math.max(VH, innerHeight - top - bottom);
  const max = Math.max(1, Math.floor(Math.min(availW * dpr / VW, availH * dpr / VH)));
  // выбранная ступень не может быть больше того, что влезает в окно
  // «по окну» тоже не мельчит: берём ×6, даже если окно позволяет больше видеть
  const dev = Math.max(1, Math.min(zoomWanted || Math.max(ZOOM_MIN, max), max));
  canvas.style.width = VW * dev / dpr + 'px';
  canvas.style.height = VH * dev / dpr + 'px';
  state.zoom = {
    dev, max, auto: !zoomWanted,
    clamped: !!zoomWanted && dev < zoomWanted,
    tight: dev < ZOOM_MIN,   // окно меньше, чем нужно для ×6 — это видно в баре
  };
  layoutTitle();   // меню входа привязано к холсту, а не к окну
  return top + bottom;
}

// Подсказка переносится на новую строку от той же смены ширины, что вызвала
// пересчёт, и первый замер застаёт её ещё однострочной. Меряем ещё раз по
// следующему кадру и, если полосы выросли, ужимаем холст — один лишний проход.
function refit() {
  const was = fit();
  requestAnimationFrame(() => { if (fit() !== was) fit(); });
}
addEventListener('resize', refit);

// Зум меняет devicePixelRatio, а resize за ним прилетает не в каждом браузере.
// Подписка живёт ровно на текущее значение, поэтому её каждый раз переоформляем.
let dprQuery = null;
function watchDpr() {
  if (dprQuery) dprQuery.removeEventListener('change', onDpr);
  dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  dprQuery.addEventListener('change', onDpr);
}
function onDpr() { refit(); watchDpr(); }
watchDpr();

// ------------------------------------------------------------- экран входа
// Человечек-переключатель стоит и в коридоре офиса, и на экране входа, поэтому
// само переключение живёт здесь одно на двоих. Язык уходит в настройки, а не в
// localStorage: пусть переключится во всех вкладках сразу, как это делает погода.
function switchLang() {
  const next = lang() === 'ru' ? 'en' : 'ru';
  saveSettings({ lang: next });
  setLang(next);
  UI.toast(tr('toast.lang'));
  sound.chime();
}

initTitle(state, {
  // roomKey — войти сразу в комнату. Второй источник — #room= в адресе: он
  // был описан этим комментарием как отладочный вход, но не читался никем.
  // На стенде без него не проверить служебные комнаты: пешком до пультовой
  // не дойти, а в списке TAB её нет.
  enter(roomKey) {
    const fromHash = (location.hash.match(/^#room=(.+)$/) || [])[1];
    const key = roomKey || (fromHash && decodeURIComponent(fromHash));
    // Ищем среди всех комнат, а не только проектных: служебные — пультовая,
    // переговорка — иначе не открываются вовсе, и проверить в них нечего.
    const r = key && (state.layout.rooms || []).find((x) => x.key === key);
    if (r) {
      state.player.x = r.x + r.w / 2;
      state.player.y = r.y + r.h - 60;
      state.cat.x = state.player.x + 30; state.cat.y = state.player.y;
      state.currentRoom = r;
    }
    closeTitle();
    document.body.classList.remove('titling');
    UI.renderHud();
    sound.init();
    sound.door(0.8);
  },
  bag: () => UI.renderBag('self'),
  sky: () => UI.renderSky(),
  lang: () => switchLang(),
});
document.body.classList.add('titling');
renderTitle();

// Модули поднимаются до первого кадра: их предметы должны попасть в
// планировку сразу, иначе первый проход нарисует офис без них и мигнёт.
await loadModules();
// Статику пересобрать: строка подсказки внизу собирается один раз на старте, а
// клавиши модулей приезжают позже — без этого бесплатная и платная сборки
// показывали бы одну и ту же подсказку.
renderStatic();
await initStand();
// Планировка успевает собраться раньше, чем поднимутся модули: она строится по
// первому же снимку из SSE, а модули едут отдельным запросом. Тогда точка
// layout по ней не проходит, предмета модуля в планировке нет — и рисовать
// нечего, хотя модуль встал и словарь влился. Ровно так пропал шкаф картотеки
// 1 сентября 2026: в реестре он был, на экране его не было.
// Догоняем один раз; точка обязана быть идемпотентной.
if (state.layout) collect('layout', state.layout, state);

refit();
UI.renderHud();
rafId = requestAnimationFrame(loop);
