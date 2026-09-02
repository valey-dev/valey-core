// node tools/test-pixfont.mjs — пиксельный шрифт 3×5 и табличка над дверью.
//
// Шрифт заводился ровно ради одного: чтобы номер версии читался верно. Поэтому
// первое, что здесь проверяется, — не «рисуется ли что-нибудь», а что знаки,
// которые легко спутать, действительно разные картинки. 0/O/8 — тот самый
// случай: «v0.1.0» на снимке из офиса читалось как «v8.1.8».
import * as PF from '../web/pixfont.js';
import { drawNameplate } from '../web/office.js';

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('УПАЛ  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};

// ------------------------------------------------------------------- шрифт

const glyph = (c) => PF.FONT[c].join('/');
ok('ноль не равен букве O', glyph('0') !== glyph('O'), [glyph('0'), glyph('O')]);
ok('ноль не равен восьмёрке', glyph('0') !== glyph('8'), [glyph('0'), glyph('8')]);
ok('единица не равна I', glyph('1') !== glyph('I'));
ok('N не равна M', glyph('N') !== glyph('M'));
ok('U не равна V', glyph('U') !== glyph('V'));
ok('S не равна 5', glyph('S') !== glyph('5'));

// Все знаки одного размера — иначе строка поедет на первом же нестандартном
const wrong = Object.entries(PF.FONT).filter(([, g]) =>
  g.length !== PF.GLYPH_H || g.some((row) => row.length !== PF.GLYPH_W || /[^#.]/.test(row)));
ok('каждый знак ровно 3×5 и только из # и .', wrong.length === 0, wrong.map(([c]) => c));

const need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.·/:';
ok('латиница, цифры и знаки версий на месте', PF.canDraw(need), [...need].filter((c) => !PF.canDraw(c)));
ok('строчные приводятся к прописным', PF.canDraw('budget-app'));
ok('кириллицу шрифт не берёт — и говорит об этом', !PF.canDraw('Проект'));
ok('пустая строка рисуема', PF.canDraw(''));

ok('ширина строки по шагу 4 без хвоста', PF.textWidth('AI VALEY') === 31, PF.textWidth('AI VALEY'));
ok('ширина пустой строки нулевая', PF.textWidth('') === 0);
ok('версия и стек умещаются в 63', PF.textWidth('V0.1.0 · NODE') === 51, PF.textWidth('V0.1.0 · NODE'));

// ------------------------------------------------- вторая гарнитура 5×5
//
// Заведена ради подписи на табличке над дверью. Проверяется не «рисуется ли
// что-нибудь», а то, ради чего она вообще есть: что кириллица берётся, что
// узкое лицо от этого не изменилось ни на знак и что пары букв, которые в трёх
// столбцах слипались, здесь разные картинки.

const w = (c) => PF.FONT_WIDE[c].join('/');
ok('И не равна Н — ради этого и заводилось лицо', w('И') !== w('Н'), [w('И'), w('Н')]);
ok('З не равна Э', w('З') !== w('Э'), [w('З'), w('Э')]);
ok('Ц не равна Щ', w('Ц') !== w('Щ'));
ok('Ш не равна Щ', w('Ш') !== w('Щ'));
ok('Ь не равна Ы', w('Ь') !== w('Ы'));
ok('О не равна Ф', w('О') !== w('Ф'));

const wrongWide = Object.entries(PF.FONT_WIDE).filter(([, g]) =>
  g.length !== PF.GLYPH_H || g.some((row) => row.length !== 5 || /[^#.]/.test(row)));
ok('каждый знак широкого лица ровно 5×5 и только из # и .', wrongWide.length === 0, wrongWide.map(([c]) => c));

const alphabet = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
ok('весь алфавит на месте', PF.canDraw(alphabet, PF.WIDE), [...alphabet].filter((c) => !PF.canDraw(c, PF.WIDE)));
ok('Ё и Й складываются в Е и И', PF.canDraw('ЁЖ ЙОД', PF.WIDE));
ok('подпись таблички рисуема', PF.canDraw('офис агентов', PF.WIDE));
ok('латиницы в широком лице только на VALEY', PF.canDraw('VALEY', PF.WIDE) && !PF.canDraw('OFFICE', PF.WIDE));

// Узкое лицо — то же самое, что было. Если эта проверка упала, поехали все
// таблички комнат разом, а заметно это станет только на кадре.
ok('узкое лицо осталось без кириллицы', !PF.canDraw('Проект') && !PF.canDraw('Проект', PF.SMALL));
ok('узкое лицо по умолчанию', PF.textWidth('AI VALEY') === PF.textWidth('AI VALEY', PF.SMALL));
ok('шаг узкого лица прежний', PF.SMALL.ADVANCE === 4 && PF.SMALL.W === 3);

// Геометрия таблички над дверью: поле внутри рамки 100 пикселей шириной, и обе
// строки обязаны в него влезть — в обоих языках.
ok('ОФИС АГЕНТОВ влезает в поле таблички', PF.textWidth('ОФИС АГЕНТОВ', PF.WIDE) === 71, PF.textWidth('ОФИС АГЕНТОВ', PF.WIDE));
ok('AN OFFICE OF AGENTS влезает в поле таблички', PF.textWidth('AN OFFICE OF AGENTS') === 75, PF.textWidth('AN OFFICE OF AGENTS'));
ok('обе подписи уже поля в 100', Math.max(PF.textWidth('ОФИС АГЕНТОВ', PF.WIDE), PF.textWidth('AN OFFICE OF AGENTS')) <= 100);
ok('VALEY в двойном размере уже поля', PF.textWidth('VALEY', PF.WIDE, 2) === 58, PF.textWidth('VALEY', PF.WIDE, 2));

// Масштаб множит и ширину, и высоту, и шаг: если он множит только шрифт,
// строка расползается на буквы.
{
  const hits = [];
  const ctx = { fillStyle: '', fillRect: (x, y, ww, hh) => hits.push({ x, y, w: ww, h: hh }) };
  PF.drawText(ctx, 'ВВ', 0, 0, '#fff', PF.WIDE, 2);
  const right = Math.max(...hits.map((r) => r.x + r.w));
  const low = Math.max(...hits.map((r) => r.y + r.h));
  // «В» заполняет свой последний столбец, поэтому правый край нарисованного
  // совпадает с textWidth ровно: у буквы с пустым последним столбцом он был бы
  // левее, и сравнивать с шириной строки было бы нельзя.
  ok('в двойном размере строка вдвое шире', right === PF.textWidth('ВВ', PF.WIDE, 2), [right, PF.textWidth('ВВ', PF.WIDE, 2)]);
  ok('в двойном размере строка вдвое выше', low === 10, low);
  ok('пиксели кратны масштабу', hits.every((r) => r.h === 2 && r.w % 2 === 0), hits.filter((r) => r.h !== 2 || r.w % 2));
}

// ---- рисование: сколько прямоугольников и где
const fakeCtx = () => {
  const c = { font: '', fillStyle: '', rects: [], texts: [],
    measureText: (s) => ({ width: s.length * (parseInt(c.font, 10) || 7) * 0.6 }),
    fillRect: (x, y, w, h) => c.rects.push({ x, y, w, h, c: c.fillStyle }),
    fillText: (s, x, y) => c.texts.push({ s, x, y, c: c.fillStyle, size: parseInt(c.font, 10) }) };
  return c;
};

const one = fakeCtx();
PF.drawText(one, 'I', 10, 20, '#fff');
// I — это ###, .#., .#., .#., ###: две перекладины по три пикселя и три по одному
ok('буква рисуется прямоугольниками, а не текстом', one.texts.length === 0 && one.rects.length === 5, one.rects.length);
ok('соседние пиксели слиты в один прямоугольник', one.rects.some((r) => r.w === 3), one.rects);
ok('буква стоит там, куда положили', one.rects[0].x === 10 && one.rects[0].y === 20, one.rects[0]);
const box = one.rects.reduce((a, r) => ({
  x0: Math.min(a.x0, r.x), y0: Math.min(a.y0, r.y),
  x1: Math.max(a.x1, r.x + r.w), y1: Math.max(a.y1, r.y + r.h),
}), { x0: 99, y0: 99, x1: 0, y1: 0 });
ok('знак не вылезает за свои 3×5', box.x1 - box.x0 === 3 && box.y1 - box.y0 === 5, box);

const two = fakeCtx();
PF.drawText(two, 'II', 0, 0, '#fff');
ok('второй знак сдвинут на шаг 4', two.rects.some((r) => r.x === 4), two.rects.map((r) => r.x));

const skip = fakeCtx();
PF.drawText(skip, 'Ъ', 0, 0, '#fff');
ok('незнакомый знак просто пропускается, без падения', skip.rects.length === 0);

// ---------------------------------------------------------------- табличка

const plate = (title, sub) => {
  const ctx = fakeCtx();
  const box = drawNameplate(ctx, { title, sub, y: 300 }, { x: 100, w: 36 });
  return { ctx, box };
};
const p1 = plate('budget-app', '');
const p2 = plate('budget-app', 'v3.5.6 · Next 16');

ok('однострочная табличка 9 пикселей', p1.box.h === 9, p1.box);
ok('двустрочная 17', p2.box.h === 17, p2.box);
ok('нижняя кромка не поехала', p1.box.y + p1.box.h === p2.box.y + p2.box.h, [p1.box, p2.box]);
ok('табличка не наползает на проём', p2.box.y + p2.box.h < 300, p2.box);
ok('табличка по центру двери', p2.box.x + p2.box.w / 2 === 118, p2.box);
ok('ширина чётная', p1.box.w % 2 === 0 && p2.box.w % 2 === 0, [p1.box.w, p2.box.w]);
ok('ширина по длинной строке: 16 знаков + поля', p2.box.w === 74, p2.box.w);
ok('короткое имя не ужимает табличку меньше сорока', plate('ai', '').box.w === 40);
ok('обе строки нарисованы пикселями', p2.ctx.texts.length === 0, p2.ctx.texts);
ok('линейка между строками только у двустрочной',
  p2.ctx.rects.some((r) => r.h === 1 && r.c === '#74502f') && !p1.ctx.rects.some((r) => r.c === '#74502f'));

// ---- откат на fillText: кириллическое имя рисовать нечем, но показать надо
const ru = plate('Проект', 'v1.0.0 · Node');
ok('кириллическое имя уходит в fillText', ru.ctx.texts.some((t) => t.s === 'Проект'), ru.ctx.texts.map((t) => t.s));
ok('вторая строка при этом всё равно пиксельная', !ru.ctx.texts.some((t) => t.s.includes('Node')), ru.ctx.texts.map((t) => t.s));
ok('табличка с откатом всё равно по центру двери', ru.box.x + ru.box.w / 2 === 118, ru.box);

// ---- обрезка длинных строк
const long = plate('web-ios-identity-1de862', 'v1.0.0-rc.1 · React Native 0');
const drawn = long.ctx.rects.length;
// 18 знаков по шагу 4 = 71, плюс поля 10, плюс округление ширины до чётной
ok('длинное имя обрезано до 18 знаков', long.box.w === 82, long.box.w);
ok('что-то всё же нарисовано', drawn > 50, drawn);

console.log(bad ? `\nпровалено: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
