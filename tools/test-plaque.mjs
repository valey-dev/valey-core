// node tools/test-plaque.mjs — the plaque over the door and the three slots opened outwards.
//
// The plaque is drawn by two: the entrance screen hangs it on the wall, the
// cover generator prints it as a picture. While the module was shared only in
// words, the second copy quietly diverged in colour and in the order of the
// lines — there was nothing to compare against. Here there is: both sides call
// drawPlaque, and the stand looks at what exactly it puts on the canvas.
//
// The second thing is the parameters of drawTitle. The valey.dev holding page in
// a separate repository lives off them: its own line on the plaque, its own view
// behind the glass and the controls switched off. While the scene was drawn one
// for all, changing it would mean a copy — and a copy of the entrance screen is
// exactly the second engine that has already been torn out of the landing.
const fakeNode = (extra = {}) => ({
  dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  querySelectorAll: () => [], querySelector: () => null, ...extra,
});
const overlay = { hidden: true, innerHTML: '', style: {}, querySelectorAll: () => [], querySelector: () => null };
globalThis.document = {
  querySelector: (s) => (s === '#title' ? overlay : null),
  getElementById: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 675 }) }),
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.addEventListener = () => {};

// A recording canvas: it does not draw, it writes down. There is no point
// comparing pixels — what breaks here is not the colour but the call not
// happening at all.
function recorder() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1, fillStyle: '', font: '', textAlign: 'left',
    fillRect(...a) { calls.push({ kind: 'rect', color: this.fillStyle, box: a.map(Math.round) }); },
    fillText(s, x, y) { calls.push({ kind: 'text', color: this.fillStyle, text: s, x: Math.round(x), y: Math.round(y) }); },
    measureText: (s) => ({ width: s.length * 4 }),
    beginPath() {}, ellipse() {}, fill() {}, save() {}, restore() {}, translate() {}, scale() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
}

const { PLAQUE, NAIL_RISE, drawPlaque } = await import('../web/plaque.js');
const { initTitle, drawTitle } = await import('../web/title.js');
const { lookOf } = await import('../web/sprites.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// ------------------------------------------------------- the plaque itself
{
  const ctx = recorder();
  drawPlaque(ctx, PLAQUE, 'OPENING SOON', null);
  const boxes = ctx.calls.filter((c) => c.kind === 'rect');
  const board = boxes.find((c) => c.box[2] === PLAQUE.w && c.box[3] === PLAQUE.h);
  ok('board in place and size', !!board && board.box[0] === PLAQUE.x && board.box[1] === PLAQUE.y, board);
  ok('a frame of warm wood, not a field', board && board.color === '#8a5f3a', board && board.color);
  // The nails stick out above the frame, and that is part of the picture: the
  // cover of the form counts its safe area from them. Moved inside, and the
  // cover gets cropped through the living.
  const nails = boxes.filter((c) => c.box[1] === PLAQUE.y - NAIL_RISE && c.box[2] === 3);
  ok('two nails, both higher than the board', nails.length === 2, nails);
  // The letters are set in pixels: rectangles, not fillText. Five-point type on
  // a 400×225 canvas is drawn in half-tones, and the office blows every half-tone
  // up into a square — on a real frame the caption was unreadable, letter by letter.
  ok('lines are typed in pixels, not font', !ctx.calls.some((c) => c.kind === 'text'), ctx.calls.filter((c) => c.kind === 'text'));
  ok('many small spots are drawn - these are the letters', boxes.length > 60, boxes.length);
}

// A line that is in no face at all falls back: a soapy caption is better than a
// missing one. There are no hieroglyphs in the pixel font and there will not be.
{
  const ctx = recorder();
  let asked = null;
  drawPlaque(ctx, PLAQUE, '事務所', (c, s, x, y) => { asked = { s, x, y }; });
  ok('What the font doesn’t take is given to a backup draftsman', asked && asked.s === '事務所', asked);
}
{
  const ctx = recorder();
  ok('and without a spare it doesn’t fall', (() => { try { drawPlaque(ctx, PLAQUE, '事務所', null); return true; } catch { return false; } })());
}

// ------------------------------------------------------- the slots outwards
const scene = (opts) => {
  initTitle({ agents: [{ id: 'a' }, { id: 'b' }], me: lookOf('valey-test') }, {});
  const ctx = recorder();
  drawTitle(ctx, 400, 225, 1000, opts);
  return ctx;
};

{
  const plain = scene(undefined);
  const quiet = scene({ controls: false });
  // The language switch is the only thing on the entrance screen that can be
  // pressed. On a page nobody walks through, it promises what is not there.
  ok('without controls the scene is poorer', quiet.calls.length < plain.calls.length, [plain.calls.length, quiet.calls.length]);
  ok('and there are no hints in it', !quiet.calls.some((c) => c.kind === 'text' && /ПРОБЕЛ|SPACE/.test(c.text || '')),
    quiet.calls.filter((c) => c.kind === 'text').map((c) => c.text));
}

{
  const own = scene({ sub: 'OPENING SOON' });
  const dflt = scene({});
  // The difference must be in the bottom line of the plaque only: the name above
  // it stays the name of the office on the door rather than turning into a second
  // logo of the page.
  const nameRows = (ctx) => ctx.calls.filter((c) => c.kind === 'rect' && c.box[1] >= PLAQUE.y + 3 && c.box[1] < PLAQUE.y + 13).length;
  ok('the name on the sign is not touched', nameRows(own) === nameRows(dflt), [nameRows(own), nameRows(dflt)]);
  const subRows = (ctx) => ctx.calls.filter((c) => c.kind === 'rect' && c.box[1] >= PLAQUE.y + 15 && c.box[1] < PLAQUE.y + 22).length;
  ok('and the bottom line changes', subRows(own) !== subRows(dflt), [subRows(own), subRows(dflt)]);
}

{
  let got = null;
  const s = scene({ window: (ctx, WIN) => { got = { ...WIN }; ctx.fillStyle = '#123456'; ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h); } });
  ok('someone else\'s draftsman is allowed behind the glass', !!got && got.w === 64 && got.h === 36, got);
  ok('and he draws exactly where the window is', s.calls.some((c) => c.color === '#123456'), null);
  // The frame and the glazing bars stay shared: the window is part of this wall,
  // not a picture swapped out whole.
  ok('frame and binding remain ours',
    s.calls.some((c) => c.kind === 'rect' && c.box[2] === 2 && c.box[3] === 36 && c.color === '#8a6247'), null);
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
