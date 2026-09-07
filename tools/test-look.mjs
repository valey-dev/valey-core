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
const bad = (msg) => { failed++; console.log('FAIL  |', msg); };

// ---- not one existing shift has moved
for (const id of ids) {
  const was = oldLookOf(id), now = lookOf(id);
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'style', 'tall']) {
    if (was[k] !== now[k]) bad(`${id}: ${k} was ${was[k]}, became ${now[k]}`);
  }
  // acc moved by two slots, but every agent stayed in the same one
  const head = was.acc === 2 ? 'phones' : was.acc === 3 ? 'cap' : 'none';
  if (now.head !== head) bad(`${id}: acc=${was.acc} gives head ${now.head}, waited for ${head}`);
  if (now.glasses !== (was.acc === 1)) bad(`${id}: acc=${was.acc} gives points ${now.glasses}`);
  // a beard stayed a beard: stubble and a moustache are not handed to agents
  if (now.face !== (was.beard ? 'beard' : 'none')) bad(`${id}: the beard ${was.beard} became the face of ${now.face}`);
  if (now.face === 'stubble' || now.face === 'mous') bad(`${id}: agent got ${now.face}`);
}

// ---- new slots live in the free high bits and take nothing below 25
for (const id of ids) {
  const h = hash(id), l = lookOf(id);
  if (l.boots !== pick(BOOTS, h >>> 25)) bad(`${id}: shoes not included 25`);
  if (l.hands !== ['none', 'mug', 'none', 'pad'][(h >>> 27) % 4]) bad(`${id}: item not from bit 27`);
  if (!BOOTS.includes(l.boots)) bad(`${id}: shoes not listed: ${l.boots}`);
  if (!HANDS.includes(l.hands)) bad(`${id}: item not listed: ${l.hands}`);
  if (!HEADS.includes(l.head)) bad(`${id}: head out of list: ${l.head}`);
  if (!FACES.includes(l.face)) bad(`${id}: face out of list: ${l.face}`);
}

// ---- the allocation has not degenerated: all four boot colours and both props occur
const seen = { boots: new Set(), hands: new Set() };
for (const id of ids) { const l = lookOf(id); seen.boots.add(l.boots); seen.hands.add(l.hands); }
if (seen.boots.size < 4) bad(`shoes: out of four colors there were ${seen.boots.size}`);
if (seen.hands.size < 3) bad(`hands: out of three values, ${seen.hands.size} was found`);

// ---- a saved old look is read rather than turning the person into a stranger
// The name here is a real one on purpose: «ТЫ» stopped being a name on
// 5 September 2026 and is shed by the same migration, which the block at the end
// of this stand checks.
const legacy = { skin: '#ffdcb8', hair: '#3a2a20', shirt: '#4fa89a', pants: '#3f4a63', style: 2, acc: 1, beard: true, tall: 1, name: 'ЛИЗА' };
const m = normalizeLook(legacy);
if (m.glasses !== true) bad('old acc=1 did not turn into points');
if (m.head !== 'none') bad(`old acc=1 put ${m.head} on his head`);
if (m.face !== 'beard') bad('old beard lost');
if (m.boots !== BOOTS[0]) bad('shoes without saved ones did not get the default value');
if (m.hands !== 'none') bad('an object came out of nowhere in my hand');
if (m.tall !== 1 || m.style !== 2 || m.name !== 'ЛИЗА') bad('transfer lost what was saved');
if ('acc' in m || 'beard' in m) bad('old fields remained in look after transfer');
// the switcher person's cap lived in acc=5 and must arrive as headwear
if (normalizeLook({ acc: 5 }).head !== 'ball') bad('acc=5 did not become a baseball cap');
// The haircut: a look built by hand arrives without a style, and hair is drawn
// only for 0…4. The office has no bald variant — the wardrobe offers five
// haircuts — so an empty style is a forgotten field, not a decision.
if (normalizeLook({ skin: SKIN[0] }).style !== 0) bad('appearance without hair remained bald');
if (normalizeLook({ style: 3 }).style !== 3) bad('the specified hairstyle is replaced by default');

// ---- the arrows in the panel: the ring closes, the tick became a list of two
for (const list of [HEADS, FACES, HANDS, BOOTS, [0, 1], [false, true]]) {
  let v = list[0];
  for (let i = 0; i < list.length; i++) v = cycle(list, v, 1);
  if (v !== list[0]) bad(`full circle forward through ${list.length} values did not return to the beginning`);
  if (cycle(list, list[0], -1) !== list[list.length - 1]) bad('the back arrow did not go to the end from the first value');
}
if (cycle([false, true], false, 1) !== true) bad('glasses are not worn: false is considered an empty space in the list');
if (cycle([0, 1], 1, 1) !== 0) bad('growth does not return from high to normal');
// a value absent from the list (from somebody else's save) does not hang the arrow
if (cycle(HANDS, 'бутерброд', 1) !== HANDS[0]) bad('unknown value was not reset to first');
if (cycle(HANDS, undefined, -1) !== HANDS[0]) bad('empty slot was not reset to the first value');

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
        bad(`painter crashed: ${pose}/${frame}/${head}/${face}/${hands}: ${e.message}`);
        continue;
      }
      if (!ctx.rects.length) bad(`${pose}: nothing drawn`);
      const has = (c) => ctx.rects.some((r) => r.c === c);
      // boots exist only on legs — a seated person has tucked them under the desk
      if (pose !== 'sit' && !has('#c2a06b')) bad(`${pose}: shoes are not drawn in their own color`);
      if (hands === 'mug' && !has('#d9d3c8')) bad(`${pose}: mug was not drawn`);
      if (hands === 'pad' && !has('#e6d9b8')) bad(`${pose}: notepad not drawn`);
      if (head === 'phones' && !has('#3a3a46')) bad(`${pose}: headphones are not drawn`);
      if (!has('#cfe8ff')) bad(`${pose}: glasses were not drawn with "${head}"`);
    }
  }
}

// ---- the dress code: office clothes are counted separately and leave the casual look alone
for (const id of ids) {
  const free = lookOf(id);
  const same = dressOf(free, id, 'm', 'casual');
  if (same !== free) bad(`${id}: free dress code did not return the same look`);
  const work = dressOf(free, id, 'm', 'office');
  // the main thing: dressing does NOT mutate the original look
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'style', 'tall', 'boots', 'head', 'face', 'hands', 'glasses']) {
    if (JSON.stringify(free[k]) !== JSON.stringify(lookOf(id)[k])) bad(`${id}: dressOf spoiled free ${k}`);
  }
  // and does not touch what a person is recognised by
  for (const k of ['skin', 'hair', 'style', 'tall', 'head', 'face', 'hands', 'glasses', 'pants']) {
    if (JSON.stringify(work[k]) !== JSON.stringify(free[k])) bad(`${id}: the office changed ${k}, but should not`);
  }
  if (!work.office) bad(`${id}: office view is not tagged office`);
  if (work.boots !== WORK_BOOTS) bad(`${id}: shoes left in the office ${work.boots}`);
  if (!SHIRT_WORK.includes(work.shirt)) bad(`${id}: men's off-palette shirt: ${work.shirt}`);
  if (work.jacket && !JACKET.includes(work.jacket)) bad(`${id}: off-palette jacket: ${work.jacket}`);
  if (work.tie && !TIE.includes(work.tie.color)) bad(`${id}: tie out of palette: ${work.tie.color}`);
  if (work.bottom !== 'pants') bad(`${id}: man in skirt`);
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
  if (w.tie) { seenWork.bows++; if (w.tie.cut !== 'bow') bad(`${id}: the woman received a tie cut ${w.tie.cut}`); }
}
if (seenWork.cuts.size < 3) bad(`there were ${seenWork.cuts.size} out of three tie cuts`);
if (!seenWork.jackets) bad('no one got any jackets');
if (seenWork.jackets === ids.length) bad('Everyone got the jacket');
if (!seenWork.skirts || !seenWork.trousers) bad(`skirts: ${seenWork.skirts}, trousers: ${seenWork.trousers}`);
if (seenWork.blouses.size < 3) bad(`blouses found ${seenWork.blouses.size}`);
if (!seenWork.bows) bad('not a single one got the butterfly');
if (seenWork.bows > seenWork.women / 2) bad(`butterflies ${seenWork.bows} on ${seenWork.women} women - this is not “sometimes”`);

// your own character is dressed by hand, and the casual top is not lost by it
const me = normalizeLook({ ...base, name: 'ТЫ' });
const meFree = dressMe(me, 'casual');
if (meFree !== me) bad('replaced your character in free mode with a copy');
const meWork = dressMe({ ...me, shirtWork: BLOUSE[1], tie: { cut: 'plain', color: TIE[0] }, bottom: 'skirt' }, 'office');
if (meWork.shirt !== BLOUSE[1]) bad('his character\'s office top didn\'t come from ShirtWork');
if (meWork.bottom !== 'skirt') bad('the cut of your character\'s bottom was lost');
if (me.shirt !== base.shirt) bad('the loose top of his character was rubbed with office');
if (dressMe(me, 'office').shirt !== SHIRT_WORK[0]) bad('without the selected top the office did not substitute the first one');

// ---- a skirt and a tie are really drawn rather than lost in a branch
for (const pose of ['stand', 'walk', 'sit']) {
  for (let frame = 0; frame < 4; frame++) {
    const look = { ...base, office: true, shirt: SHIRT_WORK[0], boots: WORK_BOOTS,
      bottom: 'skirt', jacket: JACKET[0], tie: { cut: 'plain', color: TIE[0] } };
    const ctx = stub();
    drawPerson(ctx, 20, 40, look, { pose, frame });
    const has = (c) => ctx.rects.some((r) => r.c === c);
    if (!has(JACKET[0])) bad(`${pose}/${frame}: the jacket is not drawn`);
    if (pose !== 'sit' && !has(TIE[0])) bad(`${pose}/${frame}: tie not drawn`);
    if (pose !== 'sit') {
      // the skin of the legs shows under a skirt — that is exactly what makes it not trousers
      const legs = ctx.rects.filter((r) => r.c === base.skin && r.y > 40 - 7 && r.w === 2);
      if (!legs.length) bad(`${pose}/${frame}: no legs visible under skirt`);
    }
  }
}
for (const cut of ['plain', 'slim', 'stripe', 'bow']) {
  const ctx = stub();
  drawPerson(ctx, 20, 40, { ...base, office: true, shirt: SHIRT_WORK[0], tie: { cut, color: TIE[4] } }, { pose: 'stand' });
  if (!ctx.rects.some((r) => r.c === TIE[4])) bad(`${cut} cut was not drawn`);
}

// ---- an old look is drawn after the migration too: the glasses did not vanish with acc
const legacyCtx = stub();
drawPerson(legacyCtx, 20, 40, normalizeLook({ ...base, acc: 1, beard: true, tall: 0 }), { pose: 'stand' });
if (!legacyCtx.rects.some((r) => r.c === '#cfe8ff')) bad('the glasses from the old acc=1 didn\'t show up');

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
  const say = (name, ok, got) => { if (ok) console.log('ok    |', name); else { failed++; console.log('FAIL  |', name, '→', JSON.stringify(got)); } };
  say('“YOU” ceases to be a name from memory', shed.name === '', shed.name);
  say('and “you” too, in any case', shedEn.name === '', shedEn.name);
  say('real name survives loading', kept.name === 'ЛИЗА', kept.name);
  say('a man without a name remains without a name', blank.name === undefined || blank.name === '', blank.name);
  say('isSelfLabel knows both words and does not touch the others',
    isSelfLabel('ТЫ') && isSelfLabel(' you ') && !isSelfLabel('ТЫСЯЧА') && !isSelfLabel(''), null);
}

console.log(failed ? `\nFAILED: ${failed}` : 'GOOD | внешность: сдвиги на месте, старые look читаются, слоты рисуются');
process.exit(failed ? 1 : 0);
