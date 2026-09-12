// The newsstand in the entrance corridor: public Telegram channels as newspapers.
//
// Frames: section «WIP — Газета: публичные каналы Telegram» (#newsstand), node
// 1944:424 — the paper 1946:473, at 175% 1962:624, no channels 1966:3693, the
// channel list 1962:2610, the guest 1966:3718 and 1966:3790, the key card
// 1966:3500, the stand sprite 1963:673.
//
// One channel is one paper: a masthead in the office's own pixel font, the
// newest post as the lead with its picture in halftone, the rest in three
// columns. The server does the fetching (see server.js for what goes out and
// how often); this half only draws, and it never talks to Telegram itself.
import { t as tr, lang, locale } from '../../web/i18n.js';
import { toast, focusRing, openKeyCard, closeBag } from '../../web/ui.js';
import { MARGIN } from '../../web/layout.js';
import { owned } from '../../web/owned.js';
import { esc } from '../../web/esc.js';
import { WIDE, SMALL, upper, GLYPH_H } from '../../web/pixfont.js';
import { splitHeadline, normalizeChannel } from './feed.js';

const $ = (s, root = document) => root.querySelector(s);
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

// Paper and ink are the office's own light text and dark ground, swapped.
// The canvas cannot read CSS variables cheaply on every frame, so the sprite and
// the halftone carry the same values as literals; style.css names them.
const C = {
  sheet: '#f6e3c0', ink: '#1b120c', rule: '#8c7660', dim: '#6b4a2e', stamp: '#7a3a2e',
  wire: '#8a6247', shadow: '#3a2a1e', flag: '#ffd166',
};

const DICT = {
  ru: {
    'news.hint': 'газета',
    'news.title': 'Газета',
    'news.titleChannels': 'Газета · каналы',
    'news.keysPaper': '⇥ газета · + канал · ← → выпуск · Enter — в Telegram',
    'news.keysPaperGuest': '⇥ газета · ← → выпуск · Enter — в Telegram',
    'news.keysList': '⇥ газета · ↑↓ канал · Del — убрать · Esc — к газете',
    'news.keysEmpty': 'Enter — добавить · Esc — закрыть',
    'news.keysGuest': 'Esc — закрыть',
    'news.addTab': '+ канал',
    'news.newN': 'one:{n} новый|few:{n} новых|many:{n} новых|other:{n} новых',
    'news.newShort': 'новое',
    'news.hintStand': '[ ПРОБЕЛ ] газета',
    'news.hintFresh': '[ ПРОБЕЛ ] свежий выпуск',
    'news.hintEmpty': '[ ПРОБЕЛ ] положить газету',
    'news.hintGuestEmpty': 'стойка пуста',
    'news.emptyTitle': 'На стойке пока ни одной газеты',
    'news.emptyNote': 'Каждый публичный канал Telegram становится своей газетой. Впиши адрес канала — первый выпуск ляжет на стойку у входа.',
    'news.guestEmptyTitle': 'Хозяин ещё не положил газет на стойку',
    'news.guestEmptyNote': 'Газеты кладёт хозяин офиса. Когда появятся, они будут здесь — читать можно все.',
    'news.field': 'адрес канала',
    'news.fieldMore': 'ещё канал',
    'news.add': 'добавить',
    'news.remove': 'убрать',
    'news.addrHint': 'Подойдёт t.me/имя, @имя или просто имя. Закрытые каналы, группы и личные чаты газета не читает.',
    'news.netPointer': 'Что газета отправляет наружу и как часто — в Ключах, карточка Telegram.',
    'news.toKeys': 'в Ключи',
    'news.onStand': 'на стойке',
    'news.badName': 'Это не похоже на адрес публичного канала.',
    'news.noFeed': 'У {name} нет открытой ленты: канал закрытый, это группа или такого нет. Газета читает только публичные каналы.',
    'news.netFail': 'Telegram не ответил. Проверь сеть и попробуй ещё раз.',
    'news.already': 'Эта газета уже на стойке.',
    'news.full': 'На стойке нет места: больше двенадцати газет она не держит.',
    'news.added': 'Газета «{title}» на стойке.',
    'news.removed': 'Газету «{title}» убрали со стойки.',
    'news.issueLine': '№ {id} · {date}',
    'news.circulation': 'тираж {n}',
    'news.subs': 'тираж {n}',
    'news.latestIssue': 'свежий выпуск · {n} заметок',
    'news.olderIssue': 'выпуск от {date} · {n} заметок',
    'news.earlier': '← раньше',
    'news.later': 'позже →',
    'news.open': 'в Telegram ↗',
    'news.loading': 'Выпуск печатается…',
    'news.failed': 'Выпуск не пришёл: {err}',
    'news.photo': 'Фото',
    'news.video': 'Видео',
    'news.yesterday': 'вчера',
    'news.stateLatest': 'выпуск {time}',
    'news.stateNoFeed': 'ленты нет',
    'key.news.name': 'Telegram',
    'key.news.on': 'one:{n} канал|few:{n} канала|many:{n} каналов|other:{n} канала',
    'key.news.off': 'выключена',
    'key.news.gives': 'Что даёт: газеты на стойке у входа — публичные каналы Telegram, по газете на канал. Личных чатов, групп и закрытых каналов тут нет и не будет: газета только читает открытое.',
    'key.news.where': 'куда', 'key.news.whereVal': 'только t.me — открытая веб-лента t.me/s/<канал>',
    'key.news.what': 'что', 'key.news.whatVal': 'адреса каналов со стойки; ни логина, ни токена, ни номера',
    'key.news.often': 'как часто', 'key.news.oftenVal': 'раз в 15 минут на канал; выпуск раньше — по нажатию',
    'key.news.pics': 'картинки', 'key.news.picsVal': 'забирает сервер офиса; браузер в Telegram не ходит',
    'key.news.note': 'Выключить — убрать все каналы: пока их нет, газета в сеть не ходит вовсе. Каналы кладёт и убирает только хозяин офиса — запросы в t.me делает его сервер.',
    'key.news.foot': 'каналы — в самой газете, вкладка «+ канал»',
    'key.news.toStand': 'к стойке',
  },
  en: {
    'news.hint': 'newspaper',
    'news.title': 'Newspaper',
    'news.titleChannels': 'Newspaper · channels',
    'news.keysPaper': '⇥ paper · + channel · ← → issue · Enter — to Telegram',
    'news.keysPaperGuest': '⇥ paper · ← → issue · Enter — to Telegram',
    'news.keysList': '⇥ paper · ↑↓ channel · Del — remove · Esc — back to the paper',
    'news.keysEmpty': 'Enter — add · Esc — close',
    'news.keysGuest': 'Esc — close',
    'news.addTab': '+ channel',
    'news.newN': 'one:{n} new|other:{n} new',
    'news.newShort': 'new',
    'news.hintStand': '[ SPACE ] newspaper',
    'news.hintFresh': '[ SPACE ] fresh issue',
    'news.hintEmpty': '[ SPACE ] put a paper out',
    'news.hintGuestEmpty': 'the stand is empty',
    'news.emptyTitle': 'Not a single paper on the stand yet',
    'news.emptyNote': 'Every public Telegram channel becomes a newspaper of its own. Type a channel address and its first issue lands on the stand by the entrance.',
    'news.guestEmptyTitle': 'The host has not put any papers out yet',
    'news.guestEmptyNote': 'The host of the office puts the papers out. Once they appear, they will be here — anyone may read them.',
    'news.field': 'channel address',
    'news.fieldMore': 'one more channel',
    'news.add': 'add',
    'news.remove': 'remove',
    'news.addrHint': 't.me/name, @name or just the name will do. Private channels, groups and personal chats are not read.',
    'news.netPointer': 'What the paper sends out and how often — in Keys, the Telegram card.',
    'news.toKeys': 'to Keys',
    'news.onStand': 'on the stand',
    'news.badName': 'That does not look like the address of a public channel.',
    'news.noFeed': '{name} has no open feed: the channel is private, a group, or does not exist. Only public channels can be read.',
    'news.netFail': 'Telegram did not answer. Check the network and try again.',
    'news.already': 'This paper is already on the stand.',
    'news.full': 'The stand is full: it holds no more than twelve papers.',
    'news.added': '“{title}” is on the stand.',
    'news.removed': '“{title}” was taken off the stand.',
    'news.issueLine': 'No. {id} · {date}',
    'news.circulation': 'circulation {n}',
    'news.subs': 'circulation {n}',
    'news.latestIssue': 'latest issue · {n} items',
    'news.olderIssue': 'issue of {date} · {n} items',
    'news.earlier': '← earlier',
    'news.later': 'later →',
    'news.open': 'to Telegram ↗',
    'news.loading': 'The issue is being printed…',
    'news.failed': 'The issue did not arrive: {err}',
    'news.photo': 'Photo',
    'news.video': 'Video',
    'news.yesterday': 'yesterday',
    'news.stateLatest': 'issue {time}',
    'news.stateNoFeed': 'no feed',
    'key.news.name': 'Telegram',
    'key.news.on': 'one:{n} channel|other:{n} channels',
    'key.news.off': 'off',
    'key.news.gives': 'What it gives: newspapers on the stand by the entrance — public Telegram channels, one paper per channel. No personal chats, groups or private channels, now or later: the paper only reads what is open.',
    'key.news.where': 'where', 'key.news.whereVal': 't.me only — the open web feed t.me/s/<channel>',
    'key.news.what': 'what', 'key.news.whatVal': 'the addresses of the channels on the stand; no login, no token, no phone number',
    'key.news.often': 'how often', 'key.news.oftenVal': 'once every 15 minutes per channel; earlier issues only when asked for',
    'key.news.pics': 'pictures', 'key.news.picsVal': 'fetched by the office server; the browser never talks to Telegram',
    'key.news.note': 'To switch it off, take every channel off the stand: with none left the paper makes no requests at all. Only the host puts channels on and takes them off — the requests to t.me come from the host’s server.',
    'key.news.foot': 'channels live in the paper itself, the «+ channel» tab',
    'key.news.toStand': 'to the stand',
  },
};

// --------------------------------------------------------------------- state

let api = null;
let S = null;             // the office state from the last tick
let owner = false;
const stand = {
  channels: [],           // [{ name, title, latest, ids, error }]
  loadedFor: '',          // the settings list the stand was last fetched for
  cur: 0,                 // which paper is open
  view: 'paper',          // 'paper' | 'channels'
  issues: new Map(),      // name → { stack: [before…], data, error, loading }
  msg: '',                // the error line under the add field
};

// What the owner has already read, per channel: the newest post id seen. Kept
// in this browser, like the look — it is a reader's bookmark, not a setting.
const SEEN_KEY = 'valey-newsstand-seen';
const seen = (() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; } })();
const saveSeen = () => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* private mode */ } };
const unread = (c) => (c.ids || []).filter((id) => id > (seen[c.name] || 0)).length;
const fresh = () => stand.channels.some((c) => unread(c) > 0);

const settingsList = () => ((S && S.settings && S.settings.newsstand && S.settings.newsstand.channels) || []);

async function loadStand() {
  const list = settingsList();
  stand.loadedFor = list.join(',');
  if (!list.length) { stand.channels = []; paint(); return; }
  try {
    const r = await fetch('/api/newsstand', { headers: owned() });
    const j = await r.json();
    stand.channels = Array.isArray(j.channels) ? j.channels : [];
  } catch { /* the stand keeps what it had; the next poll tries again */ }
  paint();
}

// --------------------------------------------------------------- the floor

// The stand, 26×36 pixels of the world, the same drawing as the frame. Three
// tiers; a paper per channel, up to three; the flag when something is unread.
function drawStand(ctx, x, y) {
  const n = Math.min(3, stand.channels.length);
  const left = x - 13, top = y - 36;
  const hl = (x0, x1, yy, c) => px(ctx, left + x0, top + yy, x1 - x0 + 1, 1, c);
  const vl = (xx, y0, y1, c) => px(ctx, left + xx, top + y0, 1, y1 - y0 + 1, c);
  hl(1, 24, 35, C.shadow);
  vl(2, 8, 34, C.wire); vl(23, 8, 34, C.wire);
  hl(0, 5, 34, C.wire); hl(20, 25, 34, C.wire);
  hl(2, 23, 8, C.wire);
  const tiers = [9, 17, 25];
  const mast = [[7, 18], [6, 15], [8, 17]];
  tiers.forEach((ty, i) => {
    hl(3, 22, ty + 7, C.wire); px(ctx, left + 3, top + ty + 6, 1, 1, C.wire); px(ctx, left + 22, top + ty + 6, 1, 1, C.wire);
    if (i >= n) return;
    px(ctx, left + 5, top + ty + 1, 16, 6, C.sheet);
    hl(mast[i][0], mast[i][1], ty + 2, C.ink);
    hl(6, 11, ty + 4, C.rule); hl(14, 19, ty + 4, C.rule);
    hl(5, 20, ty + 6, C.rule);
  });
  if (n && fresh()) {
    vl(23, 1, 7, C.wire);
    px(ctx, left + 18, top + 1, 5, 4, C.flag);
    px(ctx, left + 17, top + 2, 1, 2, C.flag);
    px(ctx, left + 5, top + 9, 16, 1, C.sheet);
    px(ctx, left + 18, top + 10, 2, 1, C.stamp);
  }
}

// --------------------------------------------------------------- the panel

const el = { root: null };
const isOpen = () => !!(el.root && el.root.classList.contains('open'));

function ensurePanel() {
  if (el.root) return;
  el.root = document.createElement('div');
  el.root.id = 'newsstand';
  document.body.appendChild(el.root);
}

// The ring walks the notes in the paper and the controls in the channel list.
const RING = '.nsnote, .nslist button, #nsaddr, .nsaddbtn, .nsguide';
const ring = focusRing(() => el.root && $('.nsbody', el.root), RING);
// In the paper the ring appears only once the arrows are used. Painted on
// opening, it put the lead under the focus, and scrollIntoView then scrolled
// the masthead out of sight — at 175% the first screen had no name on it.
let ringOn = false;

function open() {
  ensurePanel();
  el.root.classList.add('open');
  if (!stand.channels.length) stand.view = owner ? 'channels' : 'paper';
  paint();
  loadIssue();
  ring.reset();
  ringOn = false;
  if (stand.view === 'channels' || !stand.channels.length) { ringOn = true; ring.paint(); }
}
function close() {
  if (el.root) el.root.classList.remove('open');
  ring.reset();
}

const curChannel = () => stand.channels[Math.max(0, Math.min(stand.channels.length - 1, stand.cur))] || null;
const navOf = (name) => {
  if (!stand.issues.has(name)) stand.issues.set(name, { stack: [], data: null, error: '', loading: false });
  return stand.issues.get(name);
};

async function loadIssue() {
  const c = curChannel();
  if (!c || stand.view !== 'paper') return;
  const nav = navOf(c.name);
  const before = nav.stack[nav.stack.length - 1] || 0;
  if (nav.data && (nav.data.cursor || 0) === before) { markRead(c, nav.data); return paint(); }
  nav.loading = true; nav.error = '';
  paint();
  try {
    const r = await fetch(`/api/newsstand/issue?ch=${encodeURIComponent(c.name)}${before ? `&before=${before}` : ''}`, { headers: owned() });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    j.cursor = before;
    nav.data = j;
    if (stand.view === 'paper' && curChannel() === c) markRead(c, j);
  } catch (e) {
    nav.error = String(e.message || e);
    // An older issue the server no longer knows (it restarted) is not an error
    // worth showing: go back to the newest one.
    if (before && nav.error === 'unknown issue') { nav.stack = []; nav.loading = false; return loadIssue(); }
  }
  nav.loading = false;
  if (stand.view === 'paper' && curChannel() === c) paint();
}

// Opening the newest issue is reading it: the flag on the stand goes down.
function markRead(c, data) {
  if (data.cursor || !data.posts || !data.posts.length) return;
  const top = data.posts[0].id;
  if ((seen[c.name] || 0) < top) { seen[c.name] = top; saveSeen(); }
}

function turn(step) {
  const c = curChannel();
  if (!c) return;
  const nav = navOf(c.name);
  if (step < 0) {                 // earlier
    if (!nav.data || !nav.data.before) return;
    nav.stack.push(nav.data.before);
  } else {                        // later
    if (!nav.stack.length) return;
    nav.stack.pop();
  }
  nav.data = null;
  ringOn = false;
  loadIssue();
  const body = el.root && $('.nsbody', el.root);
  if (body) body.scrollTop = 0;
  ring.reset();
}

function pickPaper(i) {
  if (!stand.channels.length) return;
  stand.cur = (i + stand.channels.length) % stand.channels.length;
  stand.view = 'paper';
  ringOn = false;
  paint();
  loadIssue();
  ring.reset();
  const body = el.root && $('.nsbody', el.root);
  if (body) body.scrollTop = 0;
}

// ------------------------------------------------------------- formatting

const dayOf = (iso) => (iso ? new Date(iso) : null);
const sameDay = (a, b) => a && b && a.toDateString() === b.toDateString();
function fmtDate(iso) {
  const d = dayOf(iso);
  return d ? d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
}
function fmtWhen(iso, issueDay) {
  const d = dayOf(iso);
  if (!d) return '';
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (sameDay(d, issueDay)) return time;
  const y = new Date(issueDay); y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return tr('news.yesterday');
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}
// Telegram counts views as «702K» and «1.73M»; a Russian paper prints «702 тыс.».
function fmtViews(v) {
  const m = /^([\d.,]+)\s*([KM]?)$/i.exec(String(v || '').trim());
  if (!m) return v || '';
  if (lang() !== 'ru') return m[1] + m[2].toUpperCase();
  const num = m[1].replace('.', ',');
  return m[2].toUpperCase() === 'K' ? `${num} тыс.` : m[2].toUpperCase() === 'M' ? `${num} млн` : num;
}

// ------------------------------------------------------------ the masthead

// The channel's name in the office's pixel font. The wide 5×5 face has the
// Cyrillic capitals; the Latin ones live in the 3×5 face. A title mixes them
// freely, so the face is chosen per letter, and whatever neither face has — an
// emoji, a quote mark — is simply not printed: a masthead is letters.
// The wide face has only the five Latin letters of VALEY, so a Latin title set
// letter by letter came out in two widths — «TELEGRAM NEWS» with fat E, L and A.
// Latin goes to the narrow face whole; the wide one is for Cyrillic.
const CYR = /[А-ЯЁ]/;
function mastGlyphs(title) {
  const out = [];
  for (const ch of upper(title)) {
    if (CYR.test(ch) && WIDE.FONT[ch]) out.push({ g: WIDE.FONT[ch], w: WIDE.W, adv: WIDE.ADVANCE });
    else if (SMALL.FONT[ch]) out.push({ g: SMALL.FONT[ch], w: SMALL.W, adv: SMALL.ADVANCE });
    else if (WIDE.FONT[ch]) out.push({ g: WIDE.FONT[ch], w: WIDE.W, adv: WIDE.ADVANCE });
  }
  // no double spaces left behind by dropped characters, none at the ends
  return out.filter((x, i, a) => !(x.g === SMALL.FONT[' '] && (i === 0 || i === a.length - 1 || a[i - 1].g === SMALL.FONT[' '])));
}

function paintMast(cv, title, maxScale) {
  const glyphs = mastGlyphs(title);
  const units = glyphs.reduce((s, x) => s + x.adv, 0) - 1;
  const room = cv.parentElement ? cv.parentElement.clientWidth : 600;
  const scale = Math.max(2, Math.min(maxScale, Math.floor(room / Math.max(1, units))));
  const w = Math.max(1, units * scale), h = GLYPH_H * scale;
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.ink;
  let x = 0;
  for (const { g, w: gw, adv } of glyphs) {
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < gw; col++) if (g[row][col] === '#') ctx.fillRect((x + col) * scale, row * scale, scale, scale);
    }
    x += adv;
  }
}

// ------------------------------------------------------------- the halftone

// A photo becomes two colours of the paper: an ordered 4×4 Bayer dither with a
// cell of `cell` CSS pixels. A colour photograph on the cream sheet fell out of
// the office; dots are both the newspaper and the pixel.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const pictures = new Map();   // src → HTMLImageElement (loaded) | 'fail'

function halftone(cv) {
  const src = cv.dataset.src;
  const cell = Number(cv.dataset.cell || 4);
  const w = cv.clientWidth || Number(cv.dataset.w) || 240;
  const h = cv.clientHeight || Number(cv.dataset.h) || 150;
  const gw = Math.max(1, Math.floor(w / cell)), gh = Math.max(1, Math.floor(h / cell));
  cv.width = gw * cell; cv.height = gh * cell;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.sheet; ctx.fillRect(0, 0, cv.width, cv.height);
  const img = pictures.get(src);
  if (!img || img === 'fail') {
    // Until the picture arrives, a grey of dots — the plate is on the page.
    ctx.fillStyle = C.rule;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if ((x + y) % 4 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
    if (!img) {
      pictures.set(src, null);
      const im = new Image();
      im.onload = () => { pictures.set(src, im); document.querySelectorAll(`canvas.nsphoto[data-src="${CSS.escape(src)}"]`).forEach(halftone); };
      im.onerror = () => pictures.set(src, 'fail');
      im.src = src;
    }
    return;
  }
  // cover-fit the picture into the grid, read its luminance, dither
  const off = document.createElement('canvas');
  off.width = gw; off.height = gh;
  const o = off.getContext('2d');
  const k = Math.max(gw / img.naturalWidth, gh / img.naturalHeight);
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  o.drawImage(img, (gw - dw) / 2, (gh - dh) / 2, dw, dh);
  const d = o.getImageData(0, 0, gw, gh).data;
  ctx.fillStyle = C.ink;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = (y * gw + x) * 4;
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      // a little contrast: newsprint has no mid-greys to spare
      const L = Math.min(1, Math.max(0, (lum - 0.5) * 1.25 + 0.5));
      if (L < (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

// ------------------------------------------------------------ painting

const ui = () => Number(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;

function tabsHtml() {
  const tabs = stand.channels.map((c, i) => {
    const n = unread(c);
    const label = esc(c.title || c.name) + (n ? ` · ${esc(tr('news.newN', { n }))}` : '');
    return `<button class="nstab${i === stand.cur && stand.view === 'paper' ? ' on' : ''}" data-i="${i}">${label}${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}</button>`;
  });
  if (owner && stand.channels.length) tabs.push(`<button class="nstab nsaddtab${stand.view === 'channels' ? ' on' : ''}">${esc(tr('news.addTab'))}</button>`);
  return tabs.join('');
}

function noteHtml(p, cls, issueDay) {
  const { head, body } = splitHeadline(p.text);
  const title = head || (p.kind === 'video' ? tr('news.video') : tr('news.photo'));
  const meta = [fmtWhen(p.date, issueDay), p.views ? tr('news.circulation', { n: esc(fmtViews(p.views)) }) : ''].filter(Boolean).join(' · ');
  const photo = p.photo ? `<canvas class="nsphoto" data-src="${esc(p.photo)}" data-cell="${cls === 'nslead' ? 4 : 3}"></canvas>` : '';
  const text = body ? `<p class="nstext">${esc(body).replace(/\n/g, '<br>')}</p>` : '';
  if (cls === 'nslead') {
    return `<section class="nsnote nslead" tabindex="-1" data-id="${p.id}">
      <h3>${esc(title)}</h3>
      <div class="nsleadrow${photo ? '' : ' nophoto'}">${photo}<div class="nsleadtext">${text}<div class="nsmeta">${meta}</div></div></div>
    </section>`;
  }
  return `<article class="nsnote" tabindex="-1" data-id="${p.id}">
    <h4>${esc(title)}</h4>${photo}${text}<div class="nsmeta">${meta}</div></article>`;
}

function paperHtml(c) {
  const nav = navOf(c.name);
  const d = nav.data;
  if (!d) {
    const line = nav.error ? tr('news.failed', { err: esc(nav.error === 'nofeed' ? tr('news.stateNoFeed') : nav.error) }) : tr('news.loading');
    return `<div class="nspaper nswait"><p>${line}</p></div>`;
  }
  const [lead, ...rest] = d.posts;
  const issueDay = lead ? dayOf(lead.date) : new Date();
  const sub = [d.about, d.subscribers ? tr('news.subs', { n: fmtViews(d.subscribers) }) : ''].filter(Boolean).join(' · ');
  return `<div class="nspaper">
    <div class="nsissue"><span>${esc(tr('news.issueLine', { id: lead ? lead.id : '—', date: fmtDate(lead && lead.date) }))}</span><span>t.me/${esc(c.name)}</span></div>
    <div class="nsrule"></div>
    <div class="nsmastwrap"><canvas class="nsmast" data-title="${esc(d.title || c.name)}"></canvas></div>
    ${sub ? `<div class="nssub">${esc(sub)}</div>` : ''}
    <div class="nsdbl"></div>
    ${lead ? noteHtml(lead, 'nslead', issueDay) : ''}
    ${rest.length ? `<div class="nsrule"></div><div class="nscols">${rest.map((p) => noteHtml(p, '', issueDay)).join('')}</div>` : ''}
  </div>`;
}

function footHtml(c) {
  const nav = navOf(c.name);
  const d = nav.data;
  const n = d ? d.posts.length : 0;
  const label = !d ? '' : nav.stack.length
    ? tr('news.olderIssue', { date: d.posts[0] ? new Date(d.posts[0].date).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) : '', n })
    : tr('news.latestIssue', { n });
  return `<div class="nsfoot">
    <button class="obtn nsearlier"${d && d.before ? '' : ' disabled'}>${esc(tr('news.earlier'))}</button>
    <span class="nsfootmid">${esc(label)}</span>
    <button class="obtn nslater"${nav.stack.length ? '' : ' disabled'}>${esc(tr('news.later'))}</button>
    <button class="obtn nsopen">${esc(tr('news.open'))}</button>
  </div>`;
}

function channelsHtml() {
  const has = stand.channels.length > 0;
  if (!owner) {
    return `<div class="nsempty"><b>${esc(tr('news.guestEmptyTitle'))}</b><p>${esc(tr('news.guestEmptyNote'))}</p></div>`;
  }
  const list = has ? `<p class="nscap">${esc(tr('news.onStand'))}</p><div class="nslist">${stand.channels.map((c, i) => {
    const n = unread(c);
    const nav = stand.issues.get(c.name);
    const state = c.error === 'nofeed' ? tr('news.stateNoFeed')
      : n ? tr('news.newN', { n })
        : nav && nav.data && nav.data.posts[0] ? tr('news.stateLatest', { time: fmtWhen(nav.data.posts[0].date, new Date()) }) : '';
    return `<div class="nsrow"><span class="nsname">${esc(c.title || c.name)}</span><span class="nsaddr">t.me/${esc(c.name)}</span>
      <span class="nsstate${n ? ' fresh' : ''}${c.error ? ' bad' : ''}">${esc(state)}</span>
      <button class="obtn nsrm" data-i="${i}">${esc(tr('news.remove'))}</button></div>`;
  }).join('')}</div>` : `<div class="nsempty"><b>${esc(tr('news.emptyTitle'))}</b><p>${esc(tr('news.emptyNote'))}</p></div>`;
  return `${list}
    <label class="nsfield">${esc(tr(has ? 'news.fieldMore' : 'news.field'))}
      <span class="nsaddrow"><input id="nsaddr" placeholder="t.me/…" autocomplete="off" spellcheck="false"><button class="obtn nsaddbtn">${esc(tr('news.add'))}</button></span>
    </label>
    ${stand.msg ? `<p class="nsmsg">${esc(stand.msg)}</p>` : ''}
    <p class="hint">${esc(tr('news.addrHint'))}</p>
    <div class="nsnet"><span>${esc(tr('news.netPointer'))}</span><button class="obtn nsguide">${esc(tr('news.toKeys'))}</button></div>`;
}

function paint() {
  if (!el.root || !isOpen()) return;
  const c = curChannel();
  const listView = stand.view === 'channels' || !c;
  const keysHint = !c ? (owner ? 'news.keysEmpty' : 'news.keysGuest') : listView ? 'news.keysList' : owner ? 'news.keysPaper' : 'news.keysPaperGuest';
  const keep = $('.nsbody', el.root);
  const scroll = keep && !listView ? keep.scrollTop : 0;
  const typed = $('#nsaddr', el.root);
  const draft = typed ? typed.value : '';
  // A repaint that lands while the address is being typed — an issue arriving
  // late, the stand list refreshing — must not take the caret away with it.
  const typing = typed && document.activeElement === typed ? [typed.selectionStart, typed.selectionEnd] : null;
  el.root.innerHTML = `<div class="rwrap nswrap${ui() >= 1.5 ? ' tight' : ''}">
    <div class="vhead"><span>${esc(tr(listView && c ? 'news.titleChannels' : 'news.title'))}</span>
      <span class="nshead"><span class="nskeys">${esc(tr(keysHint))}</span><button id="nsx">✕</button></span></div>
    ${stand.channels.length ? `<div class="nstabs">${tabsHtml()}</div>` : ''}
    <div class="nsbody">${listView ? channelsHtml() : paperHtml(c)}</div>
    ${listView ? '' : footHtml(c)}
  </div>`;
  const body = $('.nsbody', el.root);
  if (scroll) body.scrollTop = scroll;
  const addr = $('#nsaddr', el.root);
  if (addr && draft) addr.value = draft;
  if (addr && typing) { addr.focus(); addr.setSelectionRange(typing[0], typing[1]); }
  bind();
  const mast = $('.nsmast', el.root);
  if (mast) paintMast(mast, mast.dataset.title, ui() >= 1.5 ? 4 : 6);
  el.root.querySelectorAll('canvas.nsphoto').forEach(halftone);
  if (ringOn || listView) ring.paint();
}

function bind() {
  const r = el.root;
  $('#nsx', r).onclick = close;
  r.querySelectorAll('.nstab[data-i]').forEach((b) => { b.onclick = () => pickPaper(Number(b.dataset.i)); });
  const addTab = $('.nsaddtab', r);
  if (addTab) addTab.onclick = () => openAdd();
  const on = (sel, fn) => { const b = $(sel, r); if (b) b.onclick = fn; };
  on('.nsearlier', () => turn(-1));
  on('.nslater', () => turn(1));
  on('.nsopen', () => openPost(focusedPostId()));
  on('.nsaddbtn', () => addChannel());
  on('.nsguide', () => { close(); openKeyCard('telegram'); });
  r.querySelectorAll('.nsrm').forEach((b) => { b.onclick = () => removeChannel(Number(b.dataset.i)); });
  r.querySelectorAll('.nsnote').forEach((n) => { n.ondblclick = () => openPost(Number(n.dataset.id)); });
  const addr = $('#nsaddr', r);
  if (addr) {
    // The field lets go by itself, as the radio's does: main.js hands nothing
    // from an INPUT to the office, so without this Escape would never close.
    addr.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); addr.blur(); ring.paint(); return; }
      if (e.key === 'Enter') { e.preventDefault(); addChannel(); }
      // Tab from the field goes on round the tabs like everywhere else in the
      // panel; left to the browser it stopped on «добавить» and stayed there.
      if (e.key === 'Tab' && stand.channels.length) { e.preventDefault(); addr.blur(); cycle(e.shiftKey ? -1 : 1); }
    };
  }
}

function focusedPostId() {
  const f = el.root && $('.nsnote.focus', el.root);
  if (f) return Number(f.dataset.id);
  const c = curChannel();
  const d = c && navOf(c.name).data;
  return d && d.posts[0] ? d.posts[0].id : 0;
}

function openPost(id) {
  const c = curChannel();
  if (!c || !id) return;
  window.open(`https://t.me/${encodeURIComponent(c.name)}/${id}`, '_blank', 'noopener,noreferrer');
}

// --------------------------------------------------------- the channel list

async function addChannel() {
  const input = $('#nsaddr', el.root);
  const raw = input ? input.value : '';
  const name = normalizeChannel(raw);
  stand.msg = '';
  if (!name) { stand.msg = tr('news.badName'); return paint(); }
  const list = settingsList();
  if (list.includes(name)) { stand.msg = tr('news.already'); return paint(); }
  if (list.length >= 12) { stand.msg = tr('news.full'); return paint(); }
  let probe;
  try {
    const r = await fetch(`/api/newsstand/probe?ch=${encodeURIComponent(name)}`, { headers: owned() });
    probe = await r.json();
  } catch { probe = { error: 'network' }; }
  if (probe.error) {
    stand.msg = probe.error === 'nofeed' ? tr('news.noFeed', { name: '@' + name }) : probe.error === 'badname' ? tr('news.badName') : tr('news.netFail');
    return paint();
  }
  // A new paper arrives whole and unread: every post in it is news.
  const saved = await api.saveSettings({ newsstand: { channels: [...list, name] } });
  if (!saved || saved.error) { stand.msg = tr('news.netFail'); return paint(); }
  seen[name] = 0; saveSeen();
  if (input) input.value = '';
  toast(tr('news.added', { title: probe.title || name }));
  // The core puts the saved settings into the office state; the stand is
  // fetched for them straight away rather than on the next tick.
  await loadStand();
  pickPaper(stand.channels.findIndex((c) => c.name === name));
}

async function removeChannel(i) {
  const c = stand.channels[i];
  if (!c) return;
  const list = settingsList().filter((n) => n !== c.name);
  const saved = await api.saveSettings({ newsstand: { channels: list } });
  if (!saved || saved.error) return toast(tr('news.netFail'));
  stand.issues.delete(c.name);
  delete seen[c.name]; saveSeen();
  toast(tr('news.removed', { title: c.title || c.name }));
  stand.cur = Math.min(stand.cur, Math.max(0, list.length - 1));
  await loadStand();
  ring.reset();
  paint();
}

// --------------------------------------------------------- keys

// «+ канал» as a place of its own: the list with the ring and the real focus
// already in the address field, so the next thing typed is the address.
function openAdd() {
  if (!owner) return false;
  stand.view = 'channels';
  stand.msg = '';
  ringOn = true;
  paint();
  const input = el.root && $('#nsaddr', el.root);
  if (input) { ring.on(input); input.focus(); }
  return true;
}

// Tab walks the papers and then «+ канал», the way the tabs are laid out; it
// used to skip the last one, so adding a channel needed the mouse. A guest has
// no «+ канал» and goes straight round.
function cycle(step) {
  const n = stand.channels.length;
  if (!n) return;
  const stops = n + (owner ? 1 : 0);
  const at = stand.view === 'channels' ? n : stand.cur;
  const next = (at + step + stops) % stops;
  if (next === n) openAdd(); else pickPaper(next);
}

function onKey(raw, shift) {
  if (!isOpen()) return false;
  const k = String(raw).toLowerCase();
  const c = curChannel();
  const listView = stand.view === 'channels' || !c;
  if (k === 'tab') { cycle(shift ? -1 : 1); return true; }
  const n = Number(k);
  if (Number.isInteger(n) && n >= 1 && n <= 9) {
    if (n <= stand.channels.length) pickPaper(n - 1);
    return true;
  }
  if (!listView && (k === 'arrowleft' || k === 'arrowright')) { turn(k === 'arrowleft' ? -1 : 1); return true; }
  if (!listView && k === 'enter') { openPost(focusedPostId()); return true; }
  if (listView && (k === 'delete' || k === 'backspace')) {
    const f = el.root && $('.nsrm.focus', el.root);
    if (f) removeChannel(Number(f.dataset.i));
    return true;
  }
  const moved = ring.key(raw, true);
  if (moved && !ringOn) { ringOn = true; ring.paint(); }
  return moved;
}

// ------------------------------------------------------------- the key card

function keyIcon(c) {
  c.fillStyle = '#1c130d'; c.fillRect(0, 0, 48, 36);
  c.fillStyle = C.sheet; c.fillRect(10, 5, 28, 26);
  c.fillStyle = C.ink; c.fillRect(13, 8, 22, 3); c.fillRect(13, 13, 22, 1);
  c.fillStyle = C.rule; c.fillRect(13, 16, 10, 2); c.fillRect(25, 16, 10, 2); c.fillRect(13, 20, 10, 2); c.fillRect(13, 24, 10, 2);
  c.fillStyle = C.dim; c.fillRect(25, 20, 10, 6);
  c.fillStyle = C.rule; c.fillRect(10, 31, 28, 1);
}

const keyState = () => (settingsList().length ? 'on' : 'off');
const keyCard = () => ({
  id: 'telegram',
  name: tr('key.news.name'),
  state: keyState(),
  word: () => (keyState() === 'on' ? tr('key.news.on', { n: settingsList().length }) : tr('key.news.off')),
  icon: keyIcon,
  body: () => {
    const rows = [['where', 'whereVal'], ['what', 'whatVal'], ['often', 'oftenVal'], ['pics', 'picsVal']]
      .map(([a, b]) => `<div class="nsout"><span>${esc(tr('key.news.' + a))}</span><b>${esc(tr('key.news.' + b))}</b></div>`).join('');
    return `<p class="keygives">${esc(tr('key.news.gives'))}</p>
      <div class="nsouts">${rows}</div>
      <p class="hint">${esc(tr('key.news.note'))}</p>
      <div class="keyfoot"><span class="dim">${esc(tr('key.news.foot'))}</span>
        <button class="obtn" data-act="tostand">${esc(tr('key.news.toStand'))}</button></div>`;
  },
  bind: (root) => {
    const b = root.querySelector('[data-act="tostand"]');
    // «к стойке» leads to where the channels are: the owner to the list, a guest to the paper.
    if (b) b.onclick = () => { closeBag(); stand.view = owner ? 'channels' : 'paper'; open(); };
  },
});

// --------------------------------------------------------------- register

export function register(a) {
  api = a;
  api.i18n(DICT);

  // In the entrance corridor — the bottom row's, where a person appears — pressed
  // to its top wall between the bench (MARGIN + 150) and the water cooler
  // (MARGIN + 300). The frame said «beside the radio, by the entrance», and the
  // two turned out not to be one place: the radio stands on bands[0], which by
  // the time module layout points run is the roof landing. The entrance won —
  // a paper is read on the way in. Found on the live page, 12 September 2026.
  api.on('layout', (L) => {
    const rows = (L.bands || []).filter((b) => !b.roof);
    const b = rows[rows.length - 1];
    if (!b || !L.props || L.props.some((q) => q.kind === 'newsstand')) return;
    L.props.push({ kind: 'newsstand', x: MARGIN + 226, y: b.y + 26, w: 26, h: 36 });
  });
  api.on('near', (p, L) => {
    const q = (L.props || []).find((x) => x.kind === 'newsstand');
    if (!q) return null;
    return { kind: 'newsstand', prop: q, d: Math.hypot(q.x - p.x, q.y - 10 - p.y) };
  });
  api.on('act', (n) => {
    if (n.kind !== 'newsstand') return false;
    if (!stand.channels.length && !owner) { toast(tr('news.hintGuestEmpty')); return true; }
    open();
    return true;
  });
  api.on('hint', (near) => {
    if (!near || near.kind !== 'newsstand') return null;
    const q = near.prop;
    const text = !stand.channels.length ? (owner ? tr('news.hintEmpty') : tr('news.hintGuestEmpty'))
      : fresh() ? tr('news.hintFresh') : tr('news.hintStand');
    return { x: q.x, y: q.y - 44, text, color: fresh() ? '#ffd166' : '#9fe0a8' };
  });
  api.on('draw', (L) => {
    const q = (L.props || []).find((x) => x.kind === 'newsstand');
    return q ? { y: q.y, fn: (ctx) => drawStand(ctx, q.x, q.y) } : null;
  });

  // G: «газета» spelt in Latin letters; under the Russian layout the same key is
  // «п», as in «пресса». Free on the floor under both layouts; the standup uses
  // it only inside its own panel.
  api.keys([{ id: 'toggle', codes: ['KeyG'], group: 'panel', hint: 'news.hint' }]);
  api.on('action', (id) => {
    if (id === 'newsstand.toggle') { isOpen() ? close() : open(); return true; }
    if (!isOpen()) return false;
    // While the paper is open, + is «add a channel» and the other scale keys
    // do nothing: the office behind a panel has nothing to zoom for, and a
    // reader who presses + wants the tab labelled with it. Actions reach
    // modules before the core, so taking them here keeps them from the zoom.
    if (id === 'zoom.in') { openAdd(); return true; }
    if (id === 'zoom.out' || id === 'zoom.reset') return true;
    return false;
  });
  api.on('key', (raw, shift) => onKey(raw, shift));
  api.on('esc', () => {
    if (!isOpen()) return false;
    // Esc in the channel list goes back to the paper, as the frame says; from
    // the paper it closes.
    if (stand.view === 'channels' && stand.channels.length) { pickPaper(stand.cur); return true; }
    close();
    return true;
  });
  api.on('busy', () => isOpen());
  api.on('keys', () => keyCard());
  api.on('lang', () => paint());

  // The stand is fetched when its list changes and then every five minutes;
  // the server decides whether that turns into a request to t.me (at most one
  // per channel per quarter of an hour). With the list empty nothing is asked.
  api.on('tick', (state) => {
    S = state;
    owner = state.owner !== false;
    const list = settingsList().join(',');
    if (list !== stand.loadedFor) loadStand();
  });
  setInterval(() => { if (settingsList().length) loadStand(); }, 5 * 60 * 1000);
}

export { open as openNewsstand, close as closeNewsstand, isOpen as newsstandOpen, onKey as newsstandKey };
