// The font was made for exactly one thing: so that the version number reads
// correctly. So the first thing checked here is not "does anything draw" but that
// the glyphs which are easy to confuse really are different pictures. 0/O/8 is
// that very case: "v0.1.0" on a frame from the office read as "v8.1.8".
import * as PF from '../web/pixfont.js';
import { drawNameplate } from '../web/office.js';

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('FAIL  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};

// ------------------------------------------------------------------- the font

const glyph = (c) => PF.FONT[c].join('/');
ok('zero is not equal to the letter O', glyph('0') !== glyph('O'), [glyph('0'), glyph('O')]);
ok('zero is not equal to eight', glyph('0') !== glyph('8'), [glyph('0'), glyph('8')]);
ok('one is not equal to I', glyph('1') !== glyph('I'));
ok('N is not equal to M', glyph('N') !== glyph('M'));
ok('U is not equal to V', glyph('U') !== glyph('V'));
ok('S is not equal to 5', glyph('S') !== glyph('5'));

// Every glyph is the same size — otherwise a line slides on the first unusual one
const wrong = Object.entries(PF.FONT).filter(([, g]) =>
  g.length !== PF.GLYPH_H || g.some((row) => row.length !== PF.GLYPH_W || /[^#.]/.test(row)));
ok('each sign is exactly 3x5 and only # and .', wrong.length === 0, wrong.map(([c]) => c));

const need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.·/:';
ok('Latin alphabet, numbers and version symbols are in place', PF.canDraw(need), [...need].filter((c) => !PF.canDraw(c)));
ok('lowercase converted to uppercase', PF.canDraw('budget-app'));
ok('the font does not use the Cyrillic alphabet - and says so', !PF.canDraw('Проект'));
ok('empty line is drawable', PF.canDraw(''));

ok('line width in step 4 without tail', PF.textWidth('AI VALEY') === 31, PF.textWidth('AI VALEY'));
ok('empty line width zero', PF.textWidth('') === 0);
ok('version and stack fit in 63', PF.textWidth('V0.1.0 · NODE') === 51, PF.textWidth('V0.1.0 · NODE'));

// ------------------------------------------------- the second face, 5×5
//
// Made for the caption on the sign above the door. What is checked is not "does
// anything draw" but what it exists for: that Cyrillic is taken, that the narrow
// face did not change by a single glyph because of it, and that the letter pairs
// which merged in three columns are different pictures here.

const w = (c) => PF.FONT_WIDE[c].join('/');
ok('And not equal to N - that’s why the face was turned on', w('И') !== w('Н'), [w('И'), w('Н')]);
ok('Z is not equal to E', w('З') !== w('Э'), [w('З'), w('Э')]);
ok('C is not equal to Sh', w('Ц') !== w('Щ'));
ok('Cyrillic Sha and Shcha have different widths', w('Ш') !== w('Щ'));
ok('b is not equal to y', w('Ь') !== w('Ы'));
ok('O is not equal to F', w('О') !== w('Ф'));

const wrongWide = Object.entries(PF.FONT_WIDE).filter(([, g]) =>
  g.length !== PF.GLYPH_H || g.some((row) => row.length !== 5 || /[^#.]/.test(row)));
ok('each wide face sign is exactly 5x5 and only made up of # and .', wrongWide.length === 0, wrongWide.map(([c]) => c));

const alphabet = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
ok('the entire alphabet is in place', PF.canDraw(alphabet, PF.WIDE), [...alphabet].filter((c) => !PF.canDraw(c, PF.WIDE)));
ok('E and J add up to E and I', PF.canDraw('ЁЖ ЙОД', PF.WIDE));
ok('the sign on the sign is drawable', PF.canDraw('офис агентов', PF.WIDE));
ok('Latin in wide face only on VALEY', PF.canDraw('VALEY', PF.WIDE) && !PF.canDraw('OFFICE', PF.WIDE));

// The narrow face is the same as it was. If this check fails, every room sign
// moved at once, and that only becomes visible on a frame.
ok('the narrow face was left without the Cyrillic alphabet', !PF.canDraw('Проект') && !PF.canDraw('Проект', PF.SMALL));
ok('narrow face by default', PF.textWidth('AI VALEY') === PF.textWidth('AI VALEY', PF.SMALL));
ok('the narrow face\'s step is the same', PF.SMALL.ADVANCE === 4 && PF.SMALL.W === 3);

// The geometry of the sign above the door: the field inside the frame is 100
// pixels wide, and both lines have to fit into it — in both languages.
ok('AGENTS OFFICE fits into the field of the sign', PF.textWidth('ОФИС АГЕНТОВ', PF.WIDE) === 71, PF.textWidth('ОФИС АГЕНТОВ', PF.WIDE));
ok('AN OFFICE OF AGENTS fits into the field of the sign', PF.textWidth('AN OFFICE OF AGENTS') === 75, PF.textWidth('AN OFFICE OF AGENTS'));
ok('both signatures have fields of 100', Math.max(PF.textWidth('ОФИС АГЕНТОВ', PF.WIDE), PF.textWidth('AN OFFICE OF AGENTS')) <= 100);
ok('VALEY in double size is narrower than the fields', PF.textWidth('VALEY', PF.WIDE, 2) === 58, PF.textWidth('VALEY', PF.WIDE, 2));

// The scale multiplies the width, the height and the step: if it multiplies only
// the font, the line spreads out into separate letters.
{
  const hits = [];
  const ctx = { fillStyle: '', fillRect: (x, y, ww, hh) => hits.push({ x, y, w: ww, h: hh }) };
  PF.drawText(ctx, 'ВВ', 0, 0, '#fff', PF.WIDE, 2);
  const right = Math.max(...hits.map((r) => r.x + r.w));
  const low = Math.max(...hits.map((r) => r.y + r.h));
  // "В" fills its last column, so the right edge of what was drawn matches
  // textWidth exactly: for a letter with an empty last column it would be further
  // left, and comparing with the line width would not be possible.
  ok('at double size the line is twice as wide', right === PF.textWidth('ВВ', PF.WIDE, 2), [right, PF.textWidth('ВВ', PF.WIDE, 2)]);
  ok('in double size the line is twice as high', low === 10, low);
  ok('pixels are multiples of scale', hits.every((r) => r.h === 2 && r.w % 2 === 0), hits.filter((r) => r.h !== 2 || r.w % 2));
}

// ---- drawing: how many rectangles and where
const fakeCtx = () => {
  const c = { font: '', fillStyle: '', rects: [], texts: [],
    measureText: (s) => ({ width: s.length * (parseInt(c.font, 10) || 7) * 0.6 }),
    fillRect: (x, y, w, h) => c.rects.push({ x, y, w, h, c: c.fillStyle }),
    fillText: (s, x, y) => c.texts.push({ s, x, y, c: c.fillStyle, size: parseInt(c.font, 10) }) };
  return c;
};

const one = fakeCtx();
PF.drawText(one, 'I', 10, 20, '#fff');
// I is ###, .#., .#., .#., ### — two bars of three pixels and three of one
ok('the letter is drawn with rectangles rather than text', one.texts.length === 0 && one.rects.length === 5, one.rects.length);
ok('adjacent pixels are merged into one rectangle', one.rects.some((r) => r.w === 3), one.rects);
ok('the letter is where it was placed', one.rects[0].x === 10 && one.rects[0].y === 20, one.rects[0]);
const box = one.rects.reduce((a, r) => ({
  x0: Math.min(a.x0, r.x), y0: Math.min(a.y0, r.y),
  x1: Math.max(a.x1, r.x + r.w), y1: Math.max(a.y1, r.y + r.h),
}), { x0: 99, y0: 99, x1: 0, y1: 0 });
ok('the sign does not come out beyond its 3x5', box.x1 - box.x0 === 3 && box.y1 - box.y0 === 5, box);

const two = fakeCtx();
PF.drawText(two, 'II', 0, 0, '#fff');
ok('the second character is shifted by step 4', two.rects.some((r) => r.x === 4), two.rects.map((r) => r.x));

const skip = fakeCtx();
PF.drawText(skip, 'Ъ', 0, 0, '#fff');
ok('an unfamiliar sign is simply skipped without falling', skip.rects.length === 0);

// ---------------------------------------------------------------- the sign

const plate = (title, sub) => {
  const ctx = fakeCtx();
  const box = drawNameplate(ctx, { title, sub, y: 300 }, { x: 100, w: 36 });
  return { ctx, box };
};
const p1 = plate('budget-app', '');
const p2 = plate('budget-app', 'v3.5.6 · Next 16');

ok('one line sign 9 pixels', p1.box.h === 9, p1.box);
ok('two-line 17', p2.box.h === 17, p2.box);
ok('the bottom edge didn\'t move', p1.box.y + p1.box.h === p2.box.y + p2.box.h, [p1.box, p2.box]);
ok('the sign does not fit over the opening', p2.box.y + p2.box.h < 300, p2.box);
ok('sign in the center of the door', p2.box.x + p2.box.w / 2 === 118, p2.box);
ok('even width', p1.box.w % 2 === 0 && p2.box.w % 2 === 0, [p1.box.w, p2.box.w]);
ok('long line width: 16 characters + margins', p2.box.w === 74, p2.box.w);
ok('a short name does not compress the plate less than forty', plate('ai', '').box.w === 40);
ok('both lines are drawn in pixels', p2.ctx.texts.length === 0, p2.ctx.texts);
ok('ruler between lines only for two-line',
  p2.ctx.rects.some((r) => r.h === 1 && r.c === '#74502f') && !p1.ctx.rects.some((r) => r.c === '#74502f'));

// ---- falling back to fillText: there is nothing to draw a Cyrillic name with, but it has to be shown
const ru = plate('Проект', 'v1.0.0 · Node');
ok('the Cyrillic name goes into fillText', ru.ctx.texts.some((t) => t.s === 'Проект'), ru.ctx.texts.map((t) => t.s));
ok('the second line is still pixelated', !ru.ctx.texts.some((t) => t.s.includes('Node')), ru.ctx.texts.map((t) => t.s));
ok('the rollback sign is still in the center of the door', ru.box.x + ru.box.w / 2 === 118, ru.box);

// ---- trimming long lines
const long = plate('web-ios-identity-1de862', 'v1.0.0-rc.1 · React Native 0');
const drawn = long.ctx.rects.length;
// 18 glyphs at a step of 4 = 71, plus 10 of padding, plus rounding the width up to even
ok('long name truncated to 18 characters', long.box.w === 82, long.box.w);
ok('something is still drawn', drawn > 50, drawn);

console.log(bad ? `\nfailed: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
