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

// Офисный дресс-код. Светлый верх, тёмная обувь, галстук, пиджак и крой низа —
// пять вещей поверх свободного вида; цвет штанов и юбки остаётся своим, иначе
// весь этаж встанет в одинаковых, а по цвету людей и различают.
export const SHIRT_WORK = ['#eae7de', '#dfe6ef', '#e9e2d2'];
export const BLOUSE     = ['#eae7de', '#efe0e6', '#e2e9e6', '#e9e2d2'];
export const JACKET     = ['#2f3440', '#33333d', '#33403a', '#3a3340'];
export const TIE        = ['#8c2f33', '#2f4a8c', '#3f6b45', '#6b4a8c', '#b08a2f', '#2b2b33'];
export const CUTS       = ['plain', 'slim', 'stripe', 'bow'];
export const BOTTOMS    = ['pants', 'skirt'];
export const WORK_BOOTS = '#2a2118';

export const HEADS  = ['none', 'cap', 'ball', 'phones'];
export const FACES  = ['none', 'stubble', 'mous', 'beard'];
export const HANDS  = ['none', 'mug', 'cup', 'pad'];

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

// Офисный вид считается ОТДЕЛЬНЫМ хешем, а не новыми битами в lookOf(): сдвинь
// там хоть один — и перетасуется весь офис, Петя вернётся другим человеком.
// Поэтому свободный стиль остаётся байт в байт тем, что был, биты 29–31 всё ещё
// свободны, а офисная одежда живёт в своём числе и ни на что не давит.
export function dressOf(look, id, gender, code) {
  if (code !== 'office') return look;
  const h = hash(id + ':office');
  const f = gender === 'f';
  // Мужчины в галстуках почти все, женщины — редко и бабочкой: так офис
  // читается офисом, а не съездом фокусников.
  const tie = f
    ? (((h >>> 13) % 5) === 0 ? { cut: 'bow', color: pick(TIE, h >>> 11) } : null)
    : { cut: ((h >>> 17) % 7) === 0 ? 'stripe' : ((h >>> 17) % 6) === 0 ? 'slim' : 'plain',
        color: pick(TIE, h >>> 11) };
  return {
    ...look,
    office: true,
    shirt: pick(f ? BLOUSE : SHIRT_WORK, h),
    boots: WORK_BOOTS,
    jacket: ((h >>> 5) % 3) === 0 ? pick(JACKET, h >>> 7) : null,
    bottom: f && ((h >>> 3) % 4) !== 0 ? 'skirt' : 'pants',
    tie,
  };
}

// Свой персонаж одевается руками, а не хешем: галстук, пиджак и крой лежат в
// его собственных слотах. Свободный верх при этом не теряется — офисный живёт
// отдельным полем, иначе переключение туда-обратно съедало бы выбранный цвет.
export function dressMe(me, code) {
  if (code !== 'office') return me;
  return {
    ...me,
    office: true,
    shirt: me.shirtWork || SHIRT_WORK[0],
    jacket: me.jacket || null,
    tie: me.tie || null,
    bottom: me.bottom || 'pants',
  };
}

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
  if (o.shirtWork === undefined) o.shirtWork = SHIRT_WORK[0];
  if (o.jacket === undefined) o.jacket = null;
  if (o.tie === undefined) o.tie = null;
  if (o.bottom === undefined) o.bottom = 'pants';
  delete o.acc; delete o.beard;
  return o;
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// x = horizontal center, y = feet line
// ms — время в миллисекундах, и нужно оно тому, что тлеет и парит: дыму
// сигареты и пару над стаканом. Кадр ходьбы для этого не годится, он тикает
// раз в 130 мс рывками. Имя не `t`:
// оно внутри уже занято ростом (`look.tall`), и параметр молча его затенял.
export function drawPerson(ctx, x, y, look, { pose = 'stand', frame = 0, dir = 0, bob = 0, ms = 0 } = {}) {
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

  // legs — или юбка. Под ней две ноги по два пикселя, и качаются они тем же
  // размахом ±1, что штанины: иначе шаг в юбке читается как скольжение.
  const swing = pose === 'walk' ? [0, 1, 0, -1][frame % 4] : 0;
  const sw = pose === 'walk' ? [0, -1, 0, 1][frame % 4] : 0;
  const skirt = look.bottom === 'skirt';
  if (!sitting) {
    if (skirt) {
      p(x - 5, hipY, 10, 3, look.pants);
      p(x - 5, hipY + 2, 10, 1, shade(look.pants, 0.8));
      p(x - 3, hipY + 3, 2, 2 + swing, look.skin);
      p(x + 1, hipY + 3, 2, 2 - swing, look.skin);
      p(x - 3, feet - 2 + swing, 2, 2, look.boots || BOOTS[0]);
      p(x + 1, feet - 2 - swing, 2, 2, look.boots || BOOTS[0]);
    } else {
      p(x - 4, hipY, 3, 7 + swing, look.pants);
      p(x + 1, hipY, 3, 7 - swing, look.pants);
      p(x - 4, feet - 2 + swing, 3, 2, look.boots || BOOTS[0]);
      p(x + 1, feet - 2 - swing, 3, 2, look.boots || BOOTS[0]);
    }
  } else {
    p(x - (skirt ? 5 : 4), hipY, skirt ? 10 : 8, 4, look.pants);
  }

  // torso. Ремень в офисе тёмный: на светлой рубашке своя же тень читается
  // грязным пятном, а не поясом.
  p(x - 5, torsoTop, 10, hipY - torsoTop, look.shirt);
  p(x - 5, hipY - 2, 10, 2, look.office ? '#3a2a1e' : shade(look.shirt, 0.8));

  // arms — рукав пиджака, если он надет, и манжета рубашки под ним
  const sleeve = look.jacket || look.shirt;
  const typing = sitting ? [0, 1, 0, 2][frame % 4] : 0;
  if (sitting) {
    p(x - 7, torsoTop + 2, 2, 5, sleeve);
    p(x + 5, torsoTop + 2, 2, 5, sleeve);
    p(x - 8, hipY - 1 + typing, 3, 2, look.skin);
    p(x + 5, hipY - 1 + (2 - typing), 3, 2, look.skin);
  } else {
    p(x - 7, torsoTop + 1 + sw, 2, 6, sleeve);
    p(x + 5, torsoTop + 1 - sw, 2, 6, sleeve);
    if (look.jacket) {
      p(x - 7, torsoTop + 6 + sw, 2, 1, look.shirt);
      p(x + 5, torsoTop + 6 - sw, 2, 1, look.shirt);
    }
    p(x - 7, torsoTop + 7 + sw, 2, 2, look.skin);
    p(x + 5, torsoTop + 7 - sw, 2, 2, look.skin);
  }

  // Офисный верх поверх торса: пиджак закрывает бока, воротник — две зарубки,
  // галстук — две колонки посередине. Всё это рисуется после рук, чтобы лацкан
  // лёг на рукав, а не наоборот.
  if (look.office) {
    if (look.jacket) {
      p(x - 5, torsoTop, 3, hipY - torsoTop, look.jacket);
      p(x + 2, torsoTop, 3, hipY - torsoTop, look.jacket);
      p(x - 2, torsoTop, 1, 3, shade(look.jacket, 1.25));
      p(x + 1, torsoTop, 1, 3, shade(look.jacket, 1.25));
    } else {
      p(x - 2, torsoTop, 1, 2, shade(look.shirt, 0.82));
      p(x + 1, torsoTop, 1, 2, shade(look.shirt, 0.82));
    }
    const tie = look.tie;
    if (tie && tie.color) {
      if (tie.cut === 'bow') {
        p(x - 3, torsoTop, 2, 2, tie.color);
        p(x + 1, torsoTop, 2, 2, tie.color);
        p(x - 1, torsoTop, 2, 2, shade(tie.color, 0.75));
      } else if (tie.cut === 'slim') {
        p(x - 1, torsoTop, 2, 1, shade(tie.color, 0.7));
        p(x, torsoTop + 1, 1, 5, tie.color);
      } else {
        p(x - 1, torsoTop, 2, 1, shade(tie.color, 0.7));
        p(x - 1, torsoTop + 1, 2, 5, tie.color);
        // Полоска на двух пикселях ширины читается как галстук посветлее, а не
        // как полоска. Так и задумано: это её честный предел, и он утверждён.
        if (tie.cut === 'stripe') {
          p(x - 1, torsoTop + 2, 2, 1, shade(tie.color, 1.35));
          p(x - 1, torsoTop + 4, 2, 1, shade(tie.color, 1.35));
        }
      }
    }
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

  // Сигарета. Не слот руки и не слот лица: она во рту, а рот на этой голове —
  // два пикселя под бородой, и изо рта её не видно вовсе. Поэтому торчит из
  // угла рта, и зеркалится вместе с dir — иначе при повороте влево вылезает из
  // затылка. Дым остаётся вертикальным: он поднимается, а не летит за головой.
  if (look.cig) {
    const cd = dir === -1 ? -1 : 1;
    p(cd === 1 ? x + 2 : x - 5, headTop + 6, 3, 1, '#efe7d8');
    const ember = cd === 1 ? x + 5 : x - 6;
    p(ember, headTop + 6, 1, 1, '#ff8a3c');
    const a = ctx.globalAlpha;
    for (let i = 0; i < 3; i++) {
      const f = ((ms / 900) + i / 3) % 1;
      ctx.globalAlpha = a * 0.45 * (1 - f);
      p(ember + (i % 2 ? cd : 0), headTop + 5 - Math.round(f * 7), 1, 1, '#d8d2c4');
    }
    ctx.globalAlpha = a;
  }

  // Предмет в правой руке. Своей анимации не заводит — едет за той рукой,
  // которая уже нарисована: на ходу качается с ней, за столом печатает.
  if (look.hands && look.hands !== 'none') {
    const hy = sitting ? hipY - 1 + (2 - typing) : torsoTop + 7 - sw;
    if (look.hands === 'mug') {
      p(x + 7, hy - 1, 3, 3, '#d9d3c8');
      p(x + 7, hy - 1, 3, 1, '#8a6247');
      p(x + 10, hy, 1, 1, '#d9d3c8');
    }
    // Стакан с собой. Отдельно от кружки, а не вместо неё: у кружки есть ручка
    // и нет крышки, и агент, которому хеш выдал кружку, остаётся с кружкой.
    // Две правки пришли с первого настоящего кадра, а не из макета: крышка была
    // тёмной и пропадала на тёмной стене целиком, а светлое тулово стояло
    // вплотную к рукаву того же светлого тона и читалось пятном на рубашке.
    // Поэтому крышка тёплая, а левый столбец тулова притенён — это тот самый
    // край, которого не хватало.
    if (look.hands === 'cup') {
      p(x + 7, hy - 3, 3, 1, '#8a6247');
      p(x + 7, hy - 2, 3, 4, '#f0ece0');
      p(x + 7, hy - 2, 1, 4, '#c9c2b4');
      p(x + 7, hy, 3, 1, '#b8845a');
      // Пар. Две струйки вместо трёх у сигареты и вдвое медленнее: кофе парит,
      // а не дымит. Идёт столбцом x+8 — он проходит мимо туловища, поэтому пар
      // виден на тёмной стене, а не тонет в светлой рубашке.
      const ca = ctx.globalAlpha;
      for (let i = 0; i < 2; i++) {
        const f = ((ms / 1300) + i / 2) % 1;
        ctx.globalAlpha = ca * 0.34 * (1 - f);
        p(x + 8 + (f < 0.5 ? 0 : 1), hy - 4 - Math.round(f * 5), 1, 1, '#e4dfd4');
      }
      ctx.globalAlpha = ca;
    }
    // Лейка. В HANDS её нет и не будет: её берут с крючка в оранжерее, а не
    // выбирают в инвентаре, — поэтому и нарисована она только здесь.
    if (look.hands === 'can') {
      p(x + 7, hy - 2, 5, 4, '#7f9aa8');
      p(x + 7, hy - 2, 5, 1, '#9ab4c2');
      p(x + 12, hy - 1, 3, 1, '#7f9aa8');
      p(x + 6, hy - 4, 2, 2, '#7f9aa8');
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

// Предмет крупно и без человека, в клетке 12×12: сетка инвентаря показывает
// вещь, а не строку «голова — наушники». Куски те же самые, что рисуются на
// фигурке, просто вынутые из неё, — поэтому кепка в клетке и кепка на голове
// не могут разъехаться.
export function drawItem(ctx, slot, value, look = {}) {
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const H = look.hair || HAIR[1];
  const dash = () => p(4, 6, 4, 1, '#6d5a48');

  if (slot === 'head') {
    if (value === 'cap') { p(1, 4, 10, 3, shade(H, 0.6)); p(0, 7, 12, 1, shade(H, 0.5)); return; }
    if (value === 'ball') { p(1, 4, 10, 3, shade(H, 0.6)); p(6, 7, 6, 1, shade(H, 0.5)); return; }
    if (value === 'phones') {
      p(1, 3, 10, 1, '#3a3a46');
      p(0, 4, 2, 4, '#3a3a46'); p(10, 4, 2, 4, '#3a3a46');
      return;
    }
    return dash();
  }
  if (slot === 'glasses') {
    if (!value) return dash();
    p(1, 5, 4, 4, '#3a2e28'); p(7, 5, 4, 4, '#3a2e28');
    p(5, 6, 2, 1, '#3a2e28');
    p(2, 6, 2, 2, '#cfe8ff'); p(8, 6, 2, 2, '#cfe8ff');
    return;
  }
  // Офисные слоты. Галстук в клетке рисуется тем кроем, который сейчас выбран,
  // а крой — цветом выбранного галстука: так две строки читаются как одна вещь.
  if (slot === 'tie' || slot === 'cut') {
    const color = slot === 'tie' ? value : ((look.tie && look.tie.color) || TIE[0]);
    const cut = slot === 'cut' ? value : ((look.tie && look.tie.cut) || 'plain');
    if (slot === 'tie' && !value) return dash();
    if (cut === 'bow') {
      p(2, 4, 3, 3, color); p(7, 4, 3, 3, color); p(5, 4, 2, 3, shade(color, 0.75));
      return;
    }
    p(4, 2, 4, 2, shade(color, 0.7));
    if (cut === 'slim') { p(5, 4, 2, 7, color); return; }
    p(4, 4, 4, 7, color);
    if (cut === 'stripe') { p(4, 5, 4, 1, shade(color, 1.35)); p(4, 8, 4, 1, shade(color, 1.35)); }
    return;
  }
  if (slot === 'jacket') {
    if (!value) return dash();
    p(2, 2, 8, 9, value);
    p(5, 2, 2, 6, '#eae7de');
    p(4, 2, 1, 5, shade(value, 1.25)); p(7, 2, 1, 5, shade(value, 1.25));
    return;
  }
  if (slot === 'hands') {
    if (value === 'mug') {
      p(3, 4, 5, 5, '#d9d3c8'); p(3, 4, 5, 1, '#8a6247'); p(8, 5, 2, 2, '#d9d3c8');
      return;
    }
    if (value === 'pad') {
      p(3, 3, 6, 7, '#e6d9b8'); p(3, 3, 6, 1, '#c25a4b'); p(4, 6, 4, 1, '#8c7660');
      return;
    }
    return dash();
  }
  dash();
}
