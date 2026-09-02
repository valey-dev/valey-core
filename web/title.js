// Экран входа: коридор перед дверью офиса.
//
// Разделение то же, что и во всём проекте: мир рисуется на холсте, панели —
// обычный DOM поверх него. Поэтому сцена (стена, окно, табличка, дверь, ты)
// живёт здесь в пикселях 400×225, а меню и карточки — в разметке: текст в них
// должен читаться, а не растягиваться вместе с холстом.
import { pxText, drawSwitcher } from './office.js';
import { t as tr, lang } from './i18n.js';
import { drawPerson } from './sprites.js';
import * as PF from './pixfont.js';

const $ = (s) => document.querySelector(s);
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

// Масштаб взят у движка, а не с макета: человек ростом 24 пикселя, поэтому
// дверь — 44, а не 100, иначе рядом с ней он выглядит муравьём.
const FLOOR = 150;
const DOOR = { x: 182, y: 106, w: 36, h: 44 };
const PLAQUE = { x: 148, y: 76, w: 104, h: 24 };
const WIN = { x: 40, y: 40, w: 64, h: 36 };

// Коридор, по которому теперь ходят. Слева упираешься в панель меню — за ней
// человека не видно вовсе, — справа в человечка-переключателя: в офисе он тоже
// сплошной, сквозь него не пройти.
const SPAWN = DOOR.x + DOOR.w / 2;
const LANG_X = 300;
const MENU_EDGE = 132;              // 7% + 26% холста: ответ на случай, если DOM ещё не мерился
const WALK_MAX = LANG_X - 14;
const REACH = { menu: 20, door: 22, lang: 22 };

let S = null, api = null, el = null;
const T = { open: true, idx: 0, page: 'menu', roomIdx: 0, x: SPAWN, dir: 1, moving: false, zone: null };

export function titleOpen() { return T.open; }

export function initTitle(state, callbacks) {
  S = state; api = callbacks; el = $('#title');
}

// --------------------------------------------------------------- что за дверью
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

// ------------------------------------------------------------ где ты стоишь
// Правый край панели меню в координатах холста. Меряется по живому DOM, а не
// берётся из процентов: у .tmenu есть min-width, и на узком окне она занимает
// заметно больше четверти экрана — человек, дошедший до «своих» 148, оказался
// бы за ней целиком.
function menuEdge() {
  const m = el && el.querySelector && el.querySelector('.tmenu');
  const c = document.getElementById('game');
  if (!m || !c || !m.getBoundingClientRect) return MENU_EDGE;
  const cb = c.getBoundingClientRect();
  if (!cb.width) return MENU_EDGE;
  return (m.getBoundingClientRect().right - cb.left) / cb.width * 400;
}

const walkMin = () => menuEdge() + 16;

// У чего стоишь: у меню, у переключателя, у двери — или посреди коридора.
function zone() {
  if (T.x <= walkMin() + REACH.menu) return 'menu';
  if (Math.abs(T.x - LANG_X) <= REACH.lang) return 'lang';
  if (Math.abs(T.x - SPAWN) <= REACH.door) return 'door';
  return null;
}

// Ходьба живёт здесь, а не в общем update(): офиса ещё нет, стен и мебели тоже,
// и единственное, обо что тут можно споткнуться, — панель меню и человечек.
export function tickTitle(dt, keys) {
  if (!T.open || T.page !== 'menu') { T.moving = false; return; }
  const ix = (keys.has('arrowright') || keys.has('d') || keys.has('в') ? 1 : 0)
    - (keys.has('arrowleft') || keys.has('a') || keys.has('ф') ? 1 : 0);
  if (ix) {
    T.x = Math.max(walkMin(), Math.min(WALK_MAX, T.x + ix * (keys.has('shift') ? 2.6 : 1.35) * dt));
    T.dir = ix;
  }
  T.moving = !!ix;
  const z = zone();
  if (z !== T.zone) { T.zone = z; if (el && !el.hidden) paintFocus(); }
}

// та же плашка, что рисует label() в офисе: подсказка читается на любой стене
function label(ctx, x, y, text, color = '#ffd166') {
  ctx.font = '7px "JetBrains Mono", "Courier New", monospace';
  const w = ctx.measureText(text).width;
  px(ctx, x - w / 2 - 2, y - 7, w + 4, 9, 'rgba(24,18,14,0.75)');
  pxText(ctx, text, x - w / 2, y, color);
}

// ------------------------------------------------------------------ фонарь
// Коридор освещён щелью под дверью и больше ничем, поэтому человечка у правой
// стены не видно вовсе. Фонарь над ним — причина посмотреть направо, и он
// нарочно плохой: ровный тёплый свет сделал бы из коридора холл гостиницы, а
// нужна контора после закрытия.
// Макет: https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=694-2
//
// Высота выбрана не на глаз и не по макету: сверху полосу держит карточка «за
// дверью» (.tcard, right/top 4%), снизу — табличка переключателя на FLOOR-44.
// Карточка живёт в DOM и с холстом НЕ масштабируется: на макете её низ лёг на
// y 70, а на кадре при ×2 оказался на 75 — на 72 плита фонаря пряталась под
// неё. Чем меньше зум, тем ниже карточка, поэтому 76 — не запас, а край.
const LAMP_Y = 76;

// Дрожь: 0.72 базовых, две синусоиды на мелкое дребезжание, раз в 2.6 секунды
// просадка на 120 мс. Ниже 0.25 не опускается — погасший фонарь читается как
// поломка сцены, а не как настроение.
function lampGlow(t) {
  const jitter = Math.sin(t / 190) * 0.5 + Math.sin(t / 77) * 0.25;
  const dip = t % 2600 < 120 ? 0.3 : 1;
  return Math.max(0.25, (0.72 + jitter * 0.12) * dip);
}

// Свет кладётся до человечка и до его таблички: он закрывает их собой, как
// закрыл бы настоящий. Корпус не мигает никогда — мигающий силуэт читается
// как дрожь всей сцены, а не как больная лампа.
function drawLamp(ctx, t) {
  const k = lampGlow(t);
  const x = LANG_X;
  const y = LAMP_Y + 19;                            // где кончается корпус
  // Четыре ступени вместо трёх: на кадре три давали ровную полосу, похожую на
  // столб, а не на свет. Прозрачности тоже подняты — макетные 0.16 на тёмной
  // стене не читались вовсе.
  ctx.globalAlpha = 0.22 * k; px(ctx, x - 5, y, 10, 12, '#d8be86');
  ctx.globalAlpha = 0.14 * k; px(ctx, x - 9, y + 12, 18, 16, '#d8be86');
  ctx.globalAlpha = 0.09 * k; px(ctx, x - 14, y + 28, 28, 16, '#d8be86');
  ctx.globalAlpha = 0.05 * k; px(ctx, x - 19, y + 44, 38, FLOOR - y - 44, '#d8be86');
  ctx.globalAlpha = 0.09 * k; px(ctx, x - 16, FLOOR, 32, 4, '#d8be86');
  ctx.globalAlpha = 0.05 * k; px(ctx, x - 22, FLOOR + 4, 44, 5, '#d8be86');
  ctx.globalAlpha = 1;
  px(ctx, x - 4, LAMP_Y, 8, 3, '#4a423a');          // плита на стене
  px(ctx, x - 1, LAMP_Y + 3, 2, 4, '#3a322c');      // штанга
  px(ctx, x - 8, LAMP_Y + 7, 16, 3, '#5a4f45');     // верхний обод
  px(ctx, x - 7, LAMP_Y + 10, 14, 7, '#6b5f4e');    // плафон
  ctx.globalAlpha = 0.35 + 0.65 * k;                // светится только стекло
  px(ctx, x - 5, LAMP_Y + 12, 10, 4, '#c9a95f');
  px(ctx, x - 3, LAMP_Y + 13, 6, 2, '#e8cf8a');
  ctx.globalAlpha = 1;
  px(ctx, x - 7, LAMP_Y + 17, 14, 2, '#463d33');    // нижний обод
}

// ------------------------------------------------------------------- сцена
export function drawTitle(ctx, VW, VH, t) {
  const lit = (S.agents || []).length > 0;

  px(ctx, 0, 0, VW, FLOOR, '#2f2b28');
  for (let x = 0; x < VW; x += 25) px(ctx, x, 0, 1, FLOOR, '#282422');
  for (let y = 25; y < FLOOR; y += 25) px(ctx, 0, y, VW, 1, '#282422');
  px(ctx, 0, FLOOR, VW, VH - FLOOR, '#332e2a');
  px(ctx, 0, FLOOR + 12, VW, 10, '#5e3230');
  for (let x = 6; x < VW; x += 34) px(ctx, x, FLOOR + 12, 18, 10, '#6b3a37');

  // окно: за ним всегда сумерки — экран входа не следит за твоим солнцем
  px(ctx, WIN.x - 3, WIN.y - 3, WIN.w + 6, WIN.h + 6, '#8a6247');
  px(ctx, WIN.x, WIN.y, WIN.w, WIN.h, '#2b3a5c');
  px(ctx, WIN.x + 8, WIN.y + 7, 9, 9, '#ffd166');
  for (const [dx, dy, w, h] of [[2, 22, 12, 14], [16, 16, 9, 20], [28, 24, 13, 12], [44, 18, 10, 18], [56, 26, 8, 10]])
    px(ctx, WIN.x + dx, WIN.y + dy, w, h, '#16203a');
  for (const [dx, dy] of [[19, 21], [47, 23], [59, 29]]) px(ctx, WIN.x + dx, WIN.y + dy, 2, 2, '#ffd166');
  px(ctx, WIN.x + WIN.w / 2 - 1, WIN.y, 2, WIN.h, '#8a6247');
  px(ctx, WIN.x, WIN.y + WIN.h / 2 - 1, WIN.w, 2, '#8a6247');

  // табличка над дверью — логотип, но предметом в сцене
  px(ctx, PLAQUE.x, PLAQUE.y, PLAQUE.w, PLAQUE.h, '#8a5f3a');
  px(ctx, PLAQUE.x + 2, PLAQUE.y + 2, PLAQUE.w - 4, PLAQUE.h - 4, '#6b472a');
  px(ctx, PLAQUE.x + 12, PLAQUE.y - 4, 3, 5, '#6d5040');
  px(ctx, PLAQUE.x + PLAQUE.w - 15, PLAQUE.y - 4, 3, 5, '#6d5040');
  // Обе строки набираются пикселями, а не fillText. Пятый кегль на холсте
  // 400×225 рисуется серыми полутонами, а офис раздувает каждый полутон в
  // квадрат: на кадре из офиса «офис агентов» не читалось ни одной буквой.
  //
  // Лицо выбирается по самой строке, а не по языку. Русской нужна широкая
  // гарнитура — кириллицы в 3×5 нет и не будет; английской хватает 3×5, где
  // латиница полная. Если строку не берёт ни одно лицо, остаётся прежний
  // fillText: мыльная подпись лучше пропавшей.
  const mid = PLAQUE.x + PLAQUE.w / 2;
  PF.drawText(ctx, 'VALEY', Math.round(mid - PF.textWidth('VALEY', PF.WIDE, 2) / 2), PLAQUE.y + 3, '#ffd166', PF.WIDE, 2);
  const sub = tr('title.sub');
  const face = PF.canDraw(sub, PF.WIDE) ? PF.WIDE : PF.canDraw(sub) ? PF.SMALL : null;
  if (face) PF.drawText(ctx, sub, Math.round(mid - PF.textWidth(sub, face) / 2), PLAQUE.y + 15, '#c9b391', face);
  else pxText(ctx, sub, PLAQUE.x + 30, PLAQUE.y + 20, '#c9b391', 5);

  // дверь
  px(ctx, DOOR.x - 4, DOOR.y - 4, DOOR.w + 8, DOOR.h + 4, '#1d1510');
  px(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, '#4a3325');
  px(ctx, DOOR.x, DOOR.y, 2, DOOR.h, '#6b4a2e');
  px(ctx, DOOR.x + DOOR.w - 2, DOOR.y, 2, DOOR.h, '#6b4a2e');
  px(ctx, DOOR.x + 5, DOOR.y + 6, 11, 13, lit ? '#8a6a3a' : '#3a2a1e');
  px(ctx, DOOR.x + 20, DOOR.y + 6, 11, 13, lit ? '#8a6a3a' : '#3a2a1e');
  px(ctx, DOOR.x + 5, DOOR.y + 24, 26, 16, '#3a2a1e');
  px(ctx, DOOR.x + DOOR.w - 7, DOOR.y + 22, 3, 3, '#c9a06a');

  // свет из-под двери. Гаснет, когда в офисе никого: пустой офис должен быть
  // виден с порога, а не открываться сюрпризом внутри
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

  // Человечек-переключатель у правой стены. Рисуется тем же кодом, что и в
  // коридоре офиса: вторая копия разошлась бы с ним молча при первой же правке
  // спрайта. Смотрит он на тебя, а на табличке — язык, на который переключит.
  drawSwitcher(ctx, { x: LANG_X, y: FLOOR }, t, T.x < LANG_X ? -1 : 1);

  // ты в коридоре. Вида со спины в движке нет — тот же спрайт, что и в офисе
  drawPerson(ctx, T.x, FLOOR, S.me, {
    pose: T.moving ? 'walk' : 'stand',
    frame: Math.floor(t / 130), dir: T.dir,
    bob: T.moving ? 0 : Math.floor(t / 700) % 2,
  });

  // подсказка у того, возле чего стоишь. hint.lang взят у офиса слово в слово:
  // человечек один и тот же, и объясняться ему дважды незачем
  // Над переключателем плашка висит там же, где в офисе, — вплотную над его
  // табличкой. У двери она ниже: на офисной высоте её накрывала табличка
  // VALEY, и «офис агентов» читалось наполовину. Нашлось первым же кадром.
  const z = zone();
  if (z === 'door') label(ctx, SPAWN, FLOOR - 28, tr('title.hintDoor'));
  if (z === 'lang') label(ctx, LANG_X, FLOOR - 44, tr('hint.lang'));

  // виньетка
  const g = ctx.createRadialGradient(VW / 2, VH / 2, VH / 3.2, VW / 2, VH / 2, VH * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(20,13,8,0.72)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
}

// ---------------------------------------------------------------- оверлей
// Меню привязано к холсту, а не к окну: холст центрируется с полями, и
// фиксированная по вьюпорту панель уезжала бы от двери на широком экране.
export function layoutTitle() {
  if (!el || el.hidden) return;
  const c = document.getElementById('game').getBoundingClientRect();
  el.style.left = c.left + 'px';
  el.style.top = c.top + 'px';
  el.style.width = c.width + 'px';
  el.style.height = c.height + 'px';
}

// Подпись берётся из словаря при каждой отрисовке, а не один раз при загрузке:
// язык переключают у человечка в коридоре, и меню должно поехать вместе с ним.
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
  paintFocus();
}

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

const esc = (v) => String(v).replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' }[c]));

// Меню и нижняя служебная строка рисуются одинаково во всех трёх карточках
// входа — хозяйской, гостевой и отказной, — поэтому лежат здесь, а не тремя
// копиями внутри menuHtml. 30 августа 2026 копий и стало три: гостевые
// приехали другой веткой, с прежней разметкой «фокус сразу» и без строки про
// стрелки. Фокус вытянул paintFocus(), он ходит по готовому DOM и знает про
// away; а подсказка пропала совсем — гость видел погашенное меню и нигде не
// читал, чем его зажечь.
function menuButtons() {
  // Меню гаснет, пока ты не подошёл: у экрана входа есть свой коридор, и меню
  // в нём — предмет на стене, а не панель, висящая поверх всего.
  const on = zone() === 'menu';
  return `<div class="tmenu${on ? '' : ' away'}">${MENU.map((m, i) =>
    `<button class="tbtn${i === 0 ? ' main' : ''}${on && i === T.idx ? ' focus' : ''}">${tr(m.k)}<kbd>${m.key}</kbd></button>`).join('')}</div>`;
}

const metaRow = () => `<div class="tmeta left">v${S?.version || '—'} · localhost:5177</div>
    <div class="tmeta center">${tr('title.walk')}</div>
    <div class="tmeta right">valey.dev</div>`;

function menuHtml(n) {
  // Гостя встречает не «за дверью · 8 агентов», а кто его позвал и что можно.
  // Карточка одна и та же по вёрстке — меняются только строки: решение
  // утверждено кадрами 30 августа 2026, своего экрана для гостя не заводим.
  const entry = S && S.entry;
  if (entry && entry.refused) {
    return `${menuButtons()}
      <div class="tcard">
        <span class="tlabel">${tr('title.inviteLabel')}</span>
        <b>${tr('title.inviteBad')}</b>
        <span class="twait">${tr(entry.refused)}</span>
        <span class="tidle">${tr('title.inviteAskAgain')}</span>
      </div>
      ${metaRow()}`;
  }
  if (entry) {
    return `${menuButtons()}
      <div class="tcard">
        <span class="tlabel">${tr('title.invitedBy')}</span>
        <b>${esc(entry.from || tr('title.someone'))}</b>
        <span class="twork">${tr('title.guestMay')}</span>
        <span class="tidle">${tr('title.guestMayNot')}</span>
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
  // Пинок про релизный ролик. Виден только владельцу и только когда есть за
  // что пинать — состояние приходит с сервера уже решённым, здесь его не
  // пересчитывают. Кадр: WIP — Пинок про релизный ролик, утверждён 1 сентября
  // 2026.
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

// Формы числа выбирает язык: в английском их две, в русском три.
function word(base, n) {
  if (lang() === 'en') return tr(base + (n === 1 ? '.one' : '.many'));
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return tr(base + '.many');
  if (b > 1 && b < 5) return tr(base + '.few');
  return tr(base + (b === 1 ? '.one' : '.many'));
}
const agents = (n) => tr('title.count', { n, word: word('title.agent', n) });


// ------------------------------------------------------------------ клавиши
// true — клавишу забрал экран входа, офису её видеть не нужно
export function titleKey(raw) {
  if (!T.open) return false;
  const k = raw.toLowerCase();

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
    // вверх-вниз ходят по меню только у самого меню: иначе это единственные
    // клавиши, которые действуют издалека, и подходить становится незачем
    if (z !== 'menu') return true;
    const d = k === 'arrowdown' ? 1 : -1;
    T.idx = (T.idx + d + MENU.length) % MENU.length;
    paintFocus(); return true;
  }
  // ПРОБЕЛ и ⏎ трогают то, у чего стоишь. Дверь отвечает сама, иначе первое
  // нажатие на старте уходило бы в пустоту — а «Войти» остаётся и в меню.
  if (k === 'enter' || k === ' ') {
    if (z === 'menu') MENU[T.idx].act();
    else if (z === 'door') api.enter(null);
    else if (z === 'lang') api.lang();
    return true;
  }
  if (k === 'tab') { T.page = 'rooms'; T.roomIdx = 0; renderTitle(); return true; }
  if (k === 'c' || k === 'с') { api.bag(); return true; }
  if (k === 'p' || k === 'з') { api.sky(); return true; }
  if (k === 'escape') return true;   // из офиса выйти некуда, ESC тут ничего не значит
  return ['arrowleft', 'arrowright', 'a', 'd', 'ф', 'в'].includes(k);
}

export function closeTitle() {
  T.open = false;
  if (el) el.hidden = true;
}
