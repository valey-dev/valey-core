// node tools/test-look.mjs — внешность агентов: офис не перетасовывается
// новыми слотами. Стенд ходит по старой раздаче, переписанной здесь целиком:
// если сдвиг в web/sprites.js поедет, тест увидит это, а не поверит на слово.
import { lookOf, normalizeLook, drawPerson, cycle, hash, SKIN, HAIR, SHIRT, PANTS, BOOTS, HEADS, FACES, HANDS } from '../web/sprites.js';

const pick = (arr, n) => arr[Math.abs(n >>> 0) % arr.length];

// Раздача до появления роста-в-панели, слотов и предметов, слово в слово.
const oldLookOf = (id) => {
  const h = hash(id);
  return {
    skin: pick(SKIN, h),
    hair: pick(HAIR, h >>> 3),
    shirt: pick(SHIRT, h >>> 7),
    pants: pick(PANTS, h >>> 11),
    style: (h >>> 13) % 5,
    acc: (h >>> 17) % 4,
    beard: ((h >>> 21) % 5) === 0,
    tall: ((h >>> 23) % 3) === 0 ? 1 : 0,
  };
};

const ids = [];
for (const p of ['carbonara-restaurant', 'budget-app', 'AI valey', 'shebis', 'pingator']) {
  for (let i = 0; i < 60; i++) ids.push(`${p}-${i}`);
}
ids.push('Петя', 'Petya', 'agent', '', 'ы');

let failed = 0;
const bad = (msg) => { failed++; console.log('ПЛОХО |', msg); };

// ---- ни один существующий сдвиг не поехал
for (const id of ids) {
  const was = oldLookOf(id), now = lookOf(id);
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'style', 'tall']) {
    if (was[k] !== now[k]) bad(`${id}: ${k} было ${was[k]}, стало ${now[k]}`);
  }
  // acc разъехался на два слота, но каждый агент остался в том же
  const head = was.acc === 2 ? 'phones' : was.acc === 3 ? 'cap' : 'none';
  if (now.head !== head) bad(`${id}: acc=${was.acc} даёт голову ${now.head}, ждали ${head}`);
  if (now.glasses !== (was.acc === 1)) bad(`${id}: acc=${was.acc} даёт очки ${now.glasses}`);
  // борода осталась бородой: щетина и усы агентам не раздаются
  if (now.face !== (was.beard ? 'beard' : 'none')) bad(`${id}: борода ${was.beard} стала лицом ${now.face}`);
  if (now.face === 'stubble' || now.face === 'mous') bad(`${id}: агенту досталась ${now.face}`);
}

// ---- новые слоты живут в свободных старших битах и ничего не занимают ниже 25
for (const id of ids) {
  const h = hash(id), l = lookOf(id);
  if (l.boots !== pick(BOOTS, h >>> 25)) bad(`${id}: обувь не с бита 25`);
  if (l.hands !== ['none', 'mug', 'none', 'pad'][(h >>> 27) % 4]) bad(`${id}: предмет не с бита 27`);
  if (!BOOTS.includes(l.boots)) bad(`${id}: обувь вне списка: ${l.boots}`);
  if (!HANDS.includes(l.hands)) bad(`${id}: предмет вне списка: ${l.hands}`);
  if (!HEADS.includes(l.head)) bad(`${id}: голова вне списка: ${l.head}`);
  if (!FACES.includes(l.face)) bad(`${id}: лицо вне списка: ${l.face}`);
}

// ---- раздача не выродилась: все четыре цвета обуви и оба предмета встречаются
const seen = { boots: new Set(), hands: new Set() };
for (const id of ids) { const l = lookOf(id); seen.boots.add(l.boots); seen.hands.add(l.hands); }
if (seen.boots.size < 4) bad(`обувь: из четырёх цветов встретилось ${seen.boots.size}`);
if (seen.hands.size < 3) bad(`руки: из трёх значений встретилось ${seen.hands.size}`);

// ---- сохранённый старый look читается, а не сбрасывает человека в незнакомца
const legacy = { skin: '#ffdcb8', hair: '#3a2a20', shirt: '#4fa89a', pants: '#3f4a63', style: 2, acc: 1, beard: true, tall: 1, name: 'ТЫ' };
const m = normalizeLook(legacy);
if (m.glasses !== true) bad('старый acc=1 не превратился в очки');
if (m.head !== 'none') bad(`старый acc=1 надел на голову ${m.head}`);
if (m.face !== 'beard') bad('старая борода потерялась');
if (m.boots !== BOOTS[0]) bad('обуви без сохранённой не досталось значения по умолчанию');
if (m.hands !== 'none') bad('в руке из ниоткуда взялся предмет');
if (m.tall !== 1 || m.style !== 2 || m.name !== 'ТЫ') bad('перенос потерял то, что было сохранено');
if ('acc' in m || 'beard' in m) bad('старые поля остались в look после переноса');
// бейсболка человечка-переключателя жила в acc=5 и должна доехать головой
if (normalizeLook({ acc: 5 }).head !== 'ball') bad('acc=5 не стал бейсболкой');

// ---- стрелки в панели: круг замыкается, галочка стала списком из двух
for (const list of [HEADS, FACES, HANDS, BOOTS, [0, 1], [false, true]]) {
  let v = list[0];
  for (let i = 0; i < list.length; i++) v = cycle(list, v, 1);
  if (v !== list[0]) bad(`полный круг вперёд по ${list.length} значениям не вернулся в начало`);
  if (cycle(list, list[0], -1) !== list[list.length - 1]) bad('стрелка назад с первого значения не ушла в конец');
}
if (cycle([false, true], false, 1) !== true) bad('очки не надеваются: false в списке считается пустым местом');
if (cycle([0, 1], 1, 1) !== 0) bad('рост не возвращается с высокого на обычный');
// значение, которого в списке нет (из чужого сохранения), не вешает стрелку
if (cycle(HANDS, 'бутерброд', 1) !== HANDS[0]) bad('незнакомое значение не сбросилось в первое');
if (cycle(HANDS, undefined, -1) !== HANDS[0]) bad('пустой слот не сбросился в первое значение');

// ---- рисовалка переживает любое сочетание слотов во всех позах
// Холста здесь нет: подставной контекст записывает прямоугольники, и по ним
// видно, что новый кусок вообще нарисовался, а не потерялся в ветке.
const stub = () => {
  const rects = [];
  return {
    rects,
    set fillStyle(c) { this._c = c; },
    get fillStyle() { return this._c; },
    fillRect: function (x, y, w, h) { rects.push({ x, y, w, h, c: this._c }); },
    beginPath() {}, ellipse() {}, fill() {},
  };
};
const base = { skin: '#e8ad7e', hair: '#6b3f2a', shirt: '#c25a4b', pants: '#3f4a63', boots: '#c2a06b', style: 0 };
for (const pose of ['stand', 'walk', 'sit']) {
  for (let frame = 0; frame < 4; frame++) {
    for (const head of HEADS) for (const face of FACES) for (const hands of HANDS) {
      const look = { ...base, head, face, hands, glasses: true, tall: 1 };
      const ctx = stub();
      try {
        drawPerson(ctx, 20, 40, look, { pose, frame, dir: 1, bob: 1 });
      } catch (e) {
        bad(`рисовалка упала: ${pose}/${frame}/${head}/${face}/${hands}: ${e.message}`);
        continue;
      }
      if (!ctx.rects.length) bad(`${pose}: ничего не нарисовано`);
      const has = (c) => ctx.rects.some((r) => r.c === c);
      // обувь есть только на ногах — сидящий поджал их под стол
      if (pose !== 'sit' && !has('#c2a06b')) bad(`${pose}: обувь своим цветом не нарисовалась`);
      if (hands === 'mug' && !has('#d9d3c8')) bad(`${pose}: кружка не нарисовалась`);
      if (hands === 'pad' && !has('#e6d9b8')) bad(`${pose}: блокнот не нарисовался`);
      if (head === 'phones' && !has('#3a3a46')) bad(`${pose}: наушники не нарисовались`);
      if (!has('#cfe8ff')) bad(`${pose}: очки не нарисовались вместе с «${head}»`);
    }
  }
}

// ---- старый look рисуется и после переноса: очки не пропали вместе с acc
const legacyCtx = stub();
drawPerson(legacyCtx, 20, 40, normalizeLook({ ...base, acc: 1, beard: true, tall: 0 }), { pose: 'stand' });
if (!legacyCtx.rects.some((r) => r.c === '#cfe8ff')) bad('очки из старого acc=1 не нарисовались');

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : 'ХОРОШО | внешность: сдвиги на месте, старые look читаются, слоты рисуются');
process.exit(failed ? 1 : 0);
