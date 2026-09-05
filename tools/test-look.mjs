// node tools/test-look.mjs — the agents' looks: the office is not reshuffled by
// new slots. The stand walks the old allocation, rewritten here in full: if a
// shift in web/sprites.js moves, the test sees it rather than taking it on trust.
import { lookOf, normalizeLook, isSelfLabel, drawPerson, dressOf, dressMe, cycle, hash, SKIN, HAIR, SHIRT, PANTS, BOOTS, HEADS, FACES, HANDS,
  SHIRT_WORK, BLOUSE, JACKET, TIE, WORK_BOOTS } from '../web/sprites.js';

const pick = (arr, n) => arr[Math.abs(n >>> 0) % arr.length];

// The allocation before height-in-panel, slots and props appeared, word for word.
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

// ---- not one existing shift has moved
for (const id of ids) {
  const was = oldLookOf(id), now = lookOf(id);
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'style', 'tall']) {
    if (was[k] !== now[k]) bad(`${id}: ${k} было ${was[k]}, стало ${now[k]}`);
  }
  // acc moved by two slots, but every agent stayed in the same one
  const head = was.acc === 2 ? 'phones' : was.acc === 3 ? 'cap' : 'none';
  if (now.head !== head) bad(`${id}: acc=${was.acc} даёт голову ${now.head}, ждали ${head}`);
  if (now.glasses !== (was.acc === 1)) bad(`${id}: acc=${was.acc} даёт очки ${now.glasses}`);
  // a beard stayed a beard: stubble and a moustache are not handed to agents
  if (now.face !== (was.beard ? 'beard' : 'none')) bad(`${id}: борода ${was.beard} стала лицом ${now.face}`);
  if (now.face === 'stubble' || now.face === 'mous') bad(`${id}: агенту досталась ${now.face}`);
}

// ---- new slots live in the free high bits and take nothing below 25
for (const id of ids) {
  const h = hash(id), l = lookOf(id);
  if (l.boots !== pick(BOOTS, h >>> 25)) bad(`${id}: обувь не с бита 25`);
  if (l.hands !== ['none', 'mug', 'none', 'pad'][(h >>> 27) % 4]) bad(`${id}: предмет не с бита 27`);
  if (!BOOTS.includes(l.boots)) bad(`${id}: обувь вне списка: ${l.boots}`);
  if (!HANDS.includes(l.hands)) bad(`${id}: предмет вне списка: ${l.hands}`);
  if (!HEADS.includes(l.head)) bad(`${id}: голова вне списка: ${l.head}`);
  if (!FACES.includes(l.face)) bad(`${id}: лицо вне списка: ${l.face}`);
}

// ---- the allocation has not degenerated: all four boot colours and both props occur
const seen = { boots: new Set(), hands: new Set() };
for (const id of ids) { const l = lookOf(id); seen.boots.add(l.boots); seen.hands.add(l.hands); }
if (seen.boots.size < 4) bad(`обувь: из четырёх цветов встретилось ${seen.boots.size}`);
if (seen.hands.size < 3) bad(`руки: из трёх значений встретилось ${seen.hands.size}`);

// ---- a saved old look is read rather than turning the person into a stranger
// The name here is a real one on purpose: «ТЫ» stopped being a name on
// 5 September 2026 and is shed by the same migration, which the block at the end
// of this stand checks.
const legacy = { skin: '#ffdcb8', hair: '#3a2a20', shirt: '#4fa89a', pants: '#3f4a63', style: 2, acc: 1, beard: true, tall: 1, name: 'ЛИЗА' };
const m = normalizeLook(legacy);
if (m.glasses !== true) bad('старый acc=1 не превратился в очки');
if (m.head !== 'none') bad(`старый acc=1 надел на голову ${m.head}`);
if (m.face !== 'beard') bad('старая борода потерялась');
if (m.boots !== BOOTS[0]) bad('обуви без сохранённой не досталось значения по умолчанию');
if (m.hands !== 'none') bad('в руке из ниоткуда взялся предмет');
if (m.tall !== 1 || m.style !== 2 || m.name !== 'ЛИЗА') bad('перенос потерял то, что было сохранено');
if ('acc' in m || 'beard' in m) bad('старые поля остались в look после переноса');
// the switcher person's cap lived in acc=5 and must arrive as headwear
if (normalizeLook({ acc: 5 }).head !== 'ball') bad('acc=5 не стал бейсболкой');

// ---- the arrows in the panel: the ring closes, the tick became a list of two
for (const list of [HEADS, FACES, HANDS, BOOTS, [0, 1], [false, true]]) {
  let v = list[0];
  for (let i = 0; i < list.length; i++) v = cycle(list, v, 1);
  if (v !== list[0]) bad(`полный круг вперёд по ${list.length} значениям не вернулся в начало`);
  if (cycle(list, list[0], -1) !== list[list.length - 1]) bad('стрелка назад с первого значения не ушла в конец');
}
if (cycle([false, true], false, 1) !== true) bad('очки не надеваются: false в списке считается пустым местом');
if (cycle([0, 1], 1, 1) !== 0) bad('рост не возвращается с высокого на обычный');
// a value absent from the list (from somebody else's save) does not hang the arrow
if (cycle(HANDS, 'бутерброд', 1) !== HANDS[0]) bad('незнакомое значение не сбросилось в первое');
if (cycle(HANDS, undefined, -1) !== HANDS[0]) bad('пустой слот не сбросился в первое значение');

// ---- the drawing survives any combination of slots in every pose
// There is no canvas here: a stand-in context records rectangles, and by them one
// can see that the new piece was drawn at all rather than lost in a branch.
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
      // boots exist only on legs — a seated person has tucked them under the desk
      if (pose !== 'sit' && !has('#c2a06b')) bad(`${pose}: обувь своим цветом не нарисовалась`);
      if (hands === 'mug' && !has('#d9d3c8')) bad(`${pose}: кружка не нарисовалась`);
      if (hands === 'pad' && !has('#e6d9b8')) bad(`${pose}: блокнот не нарисовался`);
      if (head === 'phones' && !has('#3a3a46')) bad(`${pose}: наушники не нарисовались`);
      if (!has('#cfe8ff')) bad(`${pose}: очки не нарисовались вместе с «${head}»`);
    }
  }
}

// ---- the dress code: office clothes are counted separately and leave the casual look alone
for (const id of ids) {
  const free = lookOf(id);
  const same = dressOf(free, id, 'm', 'casual');
  if (same !== free) bad(`${id}: свободный дресс-код вернул не тот же самый look`);
  const work = dressOf(free, id, 'm', 'office');
  // the main thing: dressing does NOT mutate the original look
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'style', 'tall', 'boots', 'head', 'face', 'hands', 'glasses']) {
    if (JSON.stringify(free[k]) !== JSON.stringify(lookOf(id)[k])) bad(`${id}: dressOf испортил свободный ${k}`);
  }
  // and does not touch what a person is recognised by
  for (const k of ['skin', 'hair', 'style', 'tall', 'head', 'face', 'hands', 'glasses', 'pants']) {
    if (JSON.stringify(work[k]) !== JSON.stringify(free[k])) bad(`${id}: офис поменял ${k}, а не должен`);
  }
  if (!work.office) bad(`${id}: офисный вид не помечен office`);
  if (work.boots !== WORK_BOOTS) bad(`${id}: обувь в офисе осталась ${work.boots}`);
  if (!SHIRT_WORK.includes(work.shirt)) bad(`${id}: мужская рубашка вне палитры: ${work.shirt}`);
  if (work.jacket && !JACKET.includes(work.jacket)) bad(`${id}: пиджак вне палитры: ${work.jacket}`);
  if (work.tie && !TIE.includes(work.tie.color)) bad(`${id}: галстук вне палитры: ${work.tie.color}`);
  if (work.bottom !== 'pants') bad(`${id}: мужчина в юбке`);
}

// the allocation has not degenerated: jackets, all three male cuts and skirts are needed
const seenWork = { cuts: new Set(), jackets: 0, skirts: 0, trousers: 0, blouses: new Set(), bows: 0, women: 0 };
for (const id of ids) {
  const m = dressOf(lookOf(id), id, 'm', 'office');
  if (m.tie) seenWork.cuts.add(m.tie.cut);
  if (m.jacket) seenWork.jackets++;
  const w = dressOf(lookOf(id), id, 'f', 'office');
  seenWork.women++;
  seenWork.blouses.add(w.shirt);
  if (w.bottom === 'skirt') seenWork.skirts++; else seenWork.trousers++;
  if (w.tie) { seenWork.bows++; if (w.tie.cut !== 'bow') bad(`${id}: женщине достался галстук кроя ${w.tie.cut}`); }
}
if (seenWork.cuts.size < 3) bad(`кроёв галстука встретилось ${seenWork.cuts.size} из трёх`);
if (!seenWork.jackets) bad('пиджаков не досталось никому');
if (seenWork.jackets === ids.length) bad('пиджак достался вообще всем');
if (!seenWork.skirts || !seenWork.trousers) bad(`юбки: ${seenWork.skirts}, брюки: ${seenWork.trousers}`);
if (seenWork.blouses.size < 3) bad(`блузок встретилось ${seenWork.blouses.size}`);
if (!seenWork.bows) bad('бабочка не досталась ни одной');
if (seenWork.bows > seenWork.women / 2) bad(`бабочек ${seenWork.bows} на ${seenWork.women} женщин — это не «иногда»`);

// your own character is dressed by hand, and the casual top is not lost by it
const me = normalizeLook({ ...base, name: 'ТЫ' });
const meFree = dressMe(me, 'casual');
if (meFree !== me) bad('свой персонаж в свободном режиме подменился копией');
const meWork = dressMe({ ...me, shirtWork: BLOUSE[1], tie: { cut: 'plain', color: TIE[0] }, bottom: 'skirt' }, 'office');
if (meWork.shirt !== BLOUSE[1]) bad('офисный верх своего персонажа не взялся из shirtWork');
if (meWork.bottom !== 'skirt') bad('крой низа своего персонажа потерялся');
if (me.shirt !== base.shirt) bad('свободный верх своего персонажа затёрся офисным');
if (dressMe(me, 'office').shirt !== SHIRT_WORK[0]) bad('без выбранного верха офис не подставил первый');

// ---- a skirt and a tie are really drawn rather than lost in a branch
for (const pose of ['stand', 'walk', 'sit']) {
  for (let frame = 0; frame < 4; frame++) {
    const look = { ...base, office: true, shirt: SHIRT_WORK[0], boots: WORK_BOOTS,
      bottom: 'skirt', jacket: JACKET[0], tie: { cut: 'plain', color: TIE[0] } };
    const ctx = stub();
    drawPerson(ctx, 20, 40, look, { pose, frame });
    const has = (c) => ctx.rects.some((r) => r.c === c);
    if (!has(JACKET[0])) bad(`${pose}/${frame}: пиджак не нарисовался`);
    if (pose !== 'sit' && !has(TIE[0])) bad(`${pose}/${frame}: галстук не нарисовался`);
    if (pose !== 'sit') {
      // the skin of the legs shows under a skirt — that is exactly what makes it not trousers
      const legs = ctx.rects.filter((r) => r.c === base.skin && r.y > 40 - 7 && r.w === 2);
      if (!legs.length) bad(`${pose}/${frame}: под юбкой не видно ног`);
    }
  }
}
for (const cut of ['plain', 'slim', 'stripe', 'bow']) {
  const ctx = stub();
  drawPerson(ctx, 20, 40, { ...base, office: true, shirt: SHIRT_WORK[0], tie: { cut, color: TIE[4] } }, { pose: 'stand' });
  if (!ctx.rects.some((r) => r.c === TIE[4])) bad(`крой ${cut} не нарисовался`);
}

// ---- an old look is drawn after the migration too: the glasses did not vanish with acc
const legacyCtx = stub();
drawPerson(legacyCtx, 20, 40, normalizeLook({ ...base, acc: 1, beard: true, tall: 0 }), { pose: 'stand' });
if (!legacyCtx.rects.some((r) => r.c === '#cfe8ff')) bad('очки из старого acc=1 не нарисовались');

// ---- the word «ТЫ» is not a name -------------------------------------------
// Older versions stored it as one: the field wrote it back whenever it was
// cleared. Such a person then walked into somebody else's office labelled YOU,
// which is the one thing that cannot be true of another person. normalizeLook
// does this migration alongside acc and beard, so a page picks it up on load.
{
  const shed = normalizeLook({ name: 'ТЫ', style: 0 });
  const shedEn = normalizeLook({ name: 'you', style: 0 });
  const kept = normalizeLook({ name: 'ЛИЗА', style: 0 });
  const blank = normalizeLook({ style: 0 });
  const say = (name, ok, got) => { if (ok) console.log('ok    |', name); else { failed++; console.log('ПЛОХО |', name, '→', JSON.stringify(got)); } };
  say('«ТЫ» из памяти перестаёт быть именем', shed.name === '', shed.name);
  say('и «you» тоже, в любом регистре', shedEn.name === '', shedEn.name);
  say('настоящее имя переживает загрузку', kept.name === 'ЛИЗА', kept.name);
  say('человек без имени остаётся без имени', blank.name === undefined || blank.name === '', blank.name);
  say('isSelfLabel знает оба слова и не трогает прочие',
    isSelfLabel('ТЫ') && isSelfLabel(' you ') && !isSelfLabel('ТЫСЯЧА') && !isSelfLabel(''), null);
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : 'ХОРОШО | внешность: сдвиги на месте, старые look читаются, слоты рисуются');
process.exit(failed ? 1 : 0);
