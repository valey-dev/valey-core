// Procedural 8-bit people. Every agent gets a stable look derived from its id.
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (arr, n) => arr[Math.abs(n >>> 0) % arr.length];

export const SKIN   = ['#f4c9a0', '#e8ad7e', '#cf8f5f', '#a86b41', '#7d4a2c', '#ffdcb8'];
export const HAIR   = ['#3a2a20', '#6b3f2a', '#a8542a', '#d9a441', '#8d8d9a', '#2b2b3a', '#c96a4b', '#5a3b6b'];
export const SHIRT  = ['#c25a4b', '#4a7fa8', '#7aa85a', '#d59a3c', '#8a6bb0', '#4fa89a', '#d4707f', '#5a6b8a'];
export const PANTS  = ['#3f4a63', '#4a3b32', '#2f4a3f', '#53415e', '#3a3a46'];
export const BOOTS  = ['#2a2118', '#6b4a2a', '#c2a06b', '#8a3a3a'];

export const HEADS  = ['none', 'cap', 'ball', 'phones'];
export const FACES  = ['none', 'stubble', 'mous', 'beard'];
export const HANDS  = ['none', 'mug', 'pad'];

export function lookOf(id) {
  const h = hash(id);
  // Старый acc читается как два слота сразу: очки — на лицо, наушники и кепка —
  // на голову. Никаких новых бит на это не нужно, поэтому каждый агент
  // остаётся ровно в том, в чём был, а носить очки с наушниками умеет тот, кто
  // одевается руками.
  const acc = (h >>> 17) % 4;
  return {
    skin: pick(SKIN, h),
    hair: pick(HAIR, h >>> 3),
    shirt: pick(SHIRT, h >>> 7),
    pants: pick(PANTS, h >>> 11),
    style: (h >>> 13) % 5,
    head: acc === 2 ? 'phones' : acc === 3 ? 'cap' : 'none',
    glasses: acc === 1,
    // Щетина и усы агентам не раздаются: вид растительности взялся бы из
    // свободных бит, и пятая часть бородатых сменила бы лицо. Своему
    // персонажу они доступны в панели переодевания.
    face: ((h >>> 21) % 5) === 0 ? 'beard' : 'none',
    tall: ((h >>> 23) % 3) === 0 ? 1 : 0,
    // Новые слоты садятся на СВОБОДНЫЕ старшие биты, а не двигают существующие
    // сдвиги: сдвинь любой — и перетасуется весь офис, Петя вернётся другим
    // человеком. Биты 29–31 остаются в резерве под следующий слот.
    boots: pick(BOOTS, h >>> 25),
    hands: ['none', 'mug', 'none', 'pad'][(h >>> 27) % 4],
  };
}

// Перебор значений слота стрелками. Значения из старого сохранения в списке
// может не быть — тогда стрелка ставит первое, а не улетает в конец списка.
export const cycle = (list, value, dir) => {
  const i = list.indexOf(value);
  return i < 0 ? list[0] : list[(i + dir + list.length) % list.length];
};

// Look, сохранённый прошлой версией офиса, знает про acc и борода-да-нет.
// Читаем его теми же правилами, что и хеш, чтобы свой персонаж не сбрасывался
// в незнакомца после обновления.
export function normalizeLook(look) {
  const o = { ...look };
  if (o.head === undefined) o.head = o.acc === 2 ? 'phones' : o.acc === 3 ? 'cap' : o.acc === 5 ? 'ball' : 'none';
  if (o.glasses === undefined) o.glasses = o.acc === 1;
  if (o.face === undefined) o.face = o.beard ? 'beard' : 'none';
  if (o.boots === undefined) o.boots = BOOTS[0];
  if (o.hands === undefined) o.hands = 'none';
  if (o.tall === undefined) o.tall = 0;
  delete o.acc; delete o.beard;
  return o;
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// x = horizontal center, y = feet line
export function drawPerson(ctx, x, y, look, { pose = 'stand', frame = 0, dir = 0, bob = 0 } = {}) {
  const p = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(px), Math.round(py), w, h); };
  const t = look.tall;
  const oy = -bob;
  const sitting = pose === 'sit';
  const feet = y + oy;
  const hipY = feet - (sitting ? 4 : 7);
  const torsoTop = hipY - 8 - t;
  const headBot = torsoTop + 1;
  const headTop = headBot - 8;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, feet + 1, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();

  // legs
  if (!sitting) {
    const swing = pose === 'walk' ? [0, 1, 0, -1][frame % 4] : 0;
    p(x - 4, hipY, 3, 7 + swing, look.pants);
    p(x + 1, hipY, 3, 7 - swing, look.pants);
    p(x - 4, feet - 2 + swing, 3, 2, look.boots || BOOTS[0]);
    p(x + 1, feet - 2 - swing, 3, 2, look.boots || BOOTS[0]);
  } else {
    p(x - 4, hipY, 8, 4, look.pants);
  }

  // torso
  p(x - 5, torsoTop, 10, hipY - torsoTop, look.shirt);
  p(x - 5, hipY - 2, 10, 2, shade(look.shirt, 0.8));

  // arms
  const typing = sitting ? [0, 1, 0, 2][frame % 4] : 0;
  if (sitting) {
    p(x - 7, torsoTop + 2, 2, 5, look.shirt);
    p(x + 5, torsoTop + 2, 2, 5, look.shirt);
    p(x - 8, hipY - 1 + typing, 3, 2, look.skin);
    p(x + 5, hipY - 1 + (2 - typing), 3, 2, look.skin);
  } else {
    const sw = pose === 'walk' ? [0, -1, 0, 1][frame % 4] : 0;
    p(x - 7, torsoTop + 1 + sw, 2, 6, look.shirt);
    p(x + 5, torsoTop + 1 - sw, 2, 6, look.shirt);
    p(x - 7, torsoTop + 7 + sw, 2, 2, look.skin);
    p(x + 5, torsoTop + 7 - sw, 2, 2, look.skin);
  }

  // neck + head
  p(x - 1, headBot - 1, 2, 2, shade(look.skin, 0.85));
  p(x - 4, headTop, 8, 8, look.skin);
  p(x - 4, headTop + 7, 8, 1, shade(look.skin, 0.85));

  // face
  const eyeY = headTop + 4;
  const ex = dir === -1 ? -1 : dir === 1 ? 1 : 0;
  p(x - 2 + ex, eyeY, 1, 1, '#2b2118');
  p(x + 1 + ex, eyeY, 1, 1, '#2b2118');
  // Растительность рисуется до рта: рот — это тень на коже, и поверх бороды он
  // читается ямкой, а из-под неё не виден вовсе.
  if (look.face === 'stubble') p(x - 3, headTop + 6, 6, 2, shade(look.skin, 0.72));
  if (look.face === 'mous') p(x - 2, headTop + 5, 4, 1, shade(look.hair, 0.85));
  if (look.face === 'beard') {
    p(x - 3, headTop + 6, 6, 2, shade(look.hair, 0.85));
    p(x - 4, headTop + 4, 1, 3, shade(look.hair, 0.85));
    p(x + 3, headTop + 4, 1, 3, shade(look.hair, 0.85));
  }
  p(x - 1, headTop + 6, 2, 1, shade(look.skin, 0.7));

  // hair
  const H = look.hair;
  if (look.style === 0) { p(x - 4, headTop - 1, 8, 3, H); p(x - 5, headTop, 1, 3, H); p(x + 4, headTop, 1, 3, H); }
  if (look.style === 1) { p(x - 4, headTop - 1, 8, 3, H); p(x - 5, headTop, 1, 8, H); p(x + 4, headTop, 1, 8, H); }
  if (look.style === 2) { p(x - 4, headTop - 1, 8, 2, H); p(x - 1, headTop - 3, 3, 2, H); }
  if (look.style === 3) { p(x - 5, headTop + 1, 1, 4, H); p(x + 4, headTop + 1, 1, 4, H); p(x - 4, headTop - 1, 8, 1, H); }
  if (look.style === 4) { p(x - 4, headTop - 1, 8, 3, H); p(x - 1, headTop - 4, 4, 3, H); }

  // лицо: очки — свой слот, поэтому надеваются вместе с чем угодно на голове
  if (look.glasses) {
    p(x - 3, eyeY - 1, 3, 3, 'rgba(40,30,25,0.85)');
    p(x + 1, eyeY - 1, 3, 3, 'rgba(40,30,25,0.85)');
    p(x - 2, eyeY, 1, 1, '#cfe8ff'); p(x + 2, eyeY, 1, 1, '#cfe8ff');
  }

  // голова: наушники, кепка, бейсболка
  if (look.head === 'phones') {
    p(x - 5, headTop - 2, 10, 1, '#3a3a46');
    p(x - 6, headTop, 2, 4, '#3a3a46'); p(x + 4, headTop, 2, 4, '#3a3a46');
  }
  if (look.head === 'cap') {
    p(x - 5, headTop - 2, 10, 3, shade(H, 0.6));
    p(x - 6, headTop + 1, 12, 1, shade(H, 0.5));
  }
  // Бейсболка. Отдельно от кепки: у той козырёк торчит в обе стороны и на
  // человечке-переключателе читается шляпой, а не кепкой.
  if (look.head === 'ball') {
    p(x - 5, headTop - 2, 10, 3, shade(H, 0.6));
    p(x - 1, headTop + 1, 8, 1, shade(H, 0.5));
  }

  // Предмет в правой руке. Своей анимации не заводит — едет за той рукой,
  // которая уже нарисована: на ходу качается с ней, за столом печатает.
  if (look.hands && look.hands !== 'none') {
    const sw = pose === 'walk' ? [0, -1, 0, 1][frame % 4] : 0;
    const hy = sitting ? hipY - 1 + (2 - typing) : torsoTop + 7 - sw;
    if (look.hands === 'mug') {
      p(x + 7, hy - 1, 3, 3, '#d9d3c8');
      p(x + 7, hy - 1, 3, 1, '#8a6247');
      p(x + 10, hy, 1, 1, '#d9d3c8');
    }
    if (look.hands === 'pad') {
      p(x + 7, hy - 2, 4, 5, '#e6d9b8');
      p(x + 7, hy - 2, 4, 1, '#c25a4b');
      p(x + 8, hy, 2, 1, '#8c7660');
    }
  }
}

export function drawCat(ctx, x, y, frame) {
  const p = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(px), Math.round(py), w, h); };
  const tail = [0, -1, 0, 1][frame % 4];
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x, y + 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  p(x - 4, y - 5, 8, 5, '#d99a5c');
  p(x - 5, y - 8, 5, 4, '#d99a5c');
  p(x - 5, y - 10, 2, 2, '#d99a5c'); p(x - 2, y - 10, 2, 2, '#d99a5c');
  p(x - 4, y - 6, 1, 1, '#2b2118'); p(x - 2, y - 6, 1, 1, '#2b2118');
  p(x + 3, y - 7 + tail, 2, 4, '#c98a4c');
  p(x - 4, y - 1, 2, 1, '#b87a44'); p(x + 1, y - 1, 2, 1, '#b87a44');
}
