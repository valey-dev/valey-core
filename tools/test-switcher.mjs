// node tools/test-switcher.mjs — the switcher person's props on a recording
// canvas: a cigarette and a cup of coffee.
//
// Why: a cigarette is only visible on a frame, and a frame does not show all of
// it. On 1 September 2026 the mirrored side (the person looks left) could be
// captured in the office and the straight one could not: in the corridor the
// switcher stands on bands[0], that is on the top row, while entry puts you on
// the bottom one, and walking the camera there by keys did not work. The
// dir === 0 branch went unchecked by eye entirely — this stand closes it with
// numbers.
//
// The canvas records rather than stands in: fillRect accumulates into a list,
// and by it one can see where every pixel landed. The geometry is checked
// relative to the centre, not the colour: colour is taste, while a cigarette
// sticking out of the back of a head is a mistake.

const rects = [];
const ctx = {
  fillStyle: '#000', globalAlpha: 1, font: '',
  fillRect(x, y, w, h) { rects.push({ x, y, w, h, c: this.fillStyle, a: this.globalAlpha }); },
  beginPath() {}, ellipse() {}, fill() {}, fillText() {},
  measureText: (s) => ({ width: String(s).length * 4 }),
};

const { drawPerson } = await import('../web/sprites.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', String(got)); }
};

const X = 100, Y = 100;
const RU = { skin: '#f4c9a0', hair: '#3a2a20', shirt: '#38302a', pants: '#3f4a63', boots: '#2a2118', style: 0, head: 'none', glasses: false, face: 'beard', tall: 0, hands: 'none', cig: true };
const US = { ...RU, cig: false, hands: 'cup', tall: 1 };

const draw = (look, opts) => { rects.length = 0; drawPerson(ctx, X, Y, look, opts); return rects.slice(); };
const has = (list, c) => list.filter((r) => r.c === c);
const ember = (list) => has(list, '#ff8a3c')[0];
const stick = (list) => has(list, '#efe7d8')[0];
const smoke = (list) => has(list, '#d8d2c4');
const steam = (list) => has(list, '#e4dfd4');

// The head takes x-4..x+3. The cigarette must stick OUT of it, and on the side
// the person is looking at.
{
  const r = draw(RU, { dir: 0, ms: 0 });
  ok('dir 0 · cigarette available', !!stick(r));
  ok('dir 0 · sticks out to the right of the head', ember(r) && ember(r).x - X === 5, ember(r) && ember(r).x - X);
  ok('dir 0 · starts at the corner of the mouth', stick(r) && stick(r).x - X === 2 && stick(r).w === 3, stick(r) && [stick(r).x - X, stick(r).w]);
}
{
  const r = draw(RU, { dir: 1, ms: 0 });
  ok('dir 1 same side as dir 0', ember(r) && ember(r).x - X === 5, ember(r) && ember(r).x - X);
}
{
  const r = draw(RU, { dir: -1, ms: 0 });
  ok('dir -1 · the ember went to the left', ember(r) && ember(r).x - X === -6, ember(r) && ember(r).x - X);
  ok('dir -1 · whole cigarette to the left of the head', stick(r) && stick(r).x - X === -5, stick(r) && stick(r).x - X);
}

// The smoke: three dots that rise over time and fade. Movement is checked rather
// than a particular height — otherwise the test breaks on any change of speed.
{
  const first = draw(RU, { dir: 0, ms: 0 });
  const a = smoke(first), tip = ember(first).y;
  const b = smoke(draw(RU, { dir: 0, ms: 450 }));
  ok('smoke three dots', a.length === 3, a.length);
  ok('smoke · all translucent', a.length === 3 && a.every((r) => r.a > 0 && r.a < 1), a.map((r) => r.a));
  ok('smoke rose in 450 ms', Math.min(...b.map((r) => r.y)) < Math.min(...a.map((r) => r.y)));
  ok('smoke does not fall below the coal', a.every((r) => r.y <= tip), [a.map((r) => r.y), tip]);
}

// Transparency is restored: the smoke is drawn through globalAlpha, and if it is
// not put back everything drawn after the person comes out semi-transparent.
{
  ctx.globalAlpha = 1;
  draw(RU, { dir: 0, ms: 300 });
  ok('smoke globalAlpha is back', ctx.globalAlpha === 1, ctx.globalAlpha);
}

// The cup: a lid on top, the cardboard sleeve below it, and no handle — a handle
// belongs to a mug, and confusing them gives one object another's silhouette.
{
  const r = draw(US, { dir: 0, ms: 0 });
  const lid = has(r, '#8a6247')[0], body = has(r, '#f0ece0')[0], band = has(r, '#b8845a')[0];
  ok('glass · has a lid, body and cardboard', !!lid && !!body && !!band);
  ok('glass · lid over body', lid && body && lid.y < body.y, lid && body && [lid.y, body.y]);
  ok('glass · cardboard inside the body', band && body && band.y > body.y && band.y < body.y + body.h, band && body && [band.y, body.y, body.h]);
  ok('glass three pixels wide', body && body.w === 3, body && body.w);
  ok('glass · no cigarette', !stick(r));

  // The steam. The column matters no less than the height: the body ends at x+4,
  // the arm at x+6, and steam to the left of x+7 would run over the light shirt,
  // where it is invisible.
  const st = steam(r);
  ok('steam · two jets', st.length === 2, st.length);
  ok('steam · past the body', st.every((q) => q.x - X >= 7), st.map((q) => q.x - X));
  ok('steam above the lid', lid && st.every((q) => q.y < lid.y), [st.map((q) => q.y), lid && lid.y]);
  ok('steam · translucent', st.every((q) => q.a > 0 && q.a < 1), st.map((q) => q.a));
  const st2 = steam(draw(US, { dir: 0, ms: 600 }));
  ok('steam rose in 600 ms', Math.min(...st2.map((q) => q.y)) < Math.min(...st.map((q) => q.y)));
}

// The steam and the smoke have different periods, or the two wisps would pulse in
// time with each other. In the flesh they never meet (there is one switcher on
// screen), but a period is the sort of thing easily collapsed into one number at
// the next edit.
{
  const cupAt = (ms) => Math.min(...steam(draw(US, { dir: 0, ms })).map((q) => q.y));
  const cigAt = (ms) => Math.min(...smoke(draw(RU, { dir: 0, ms })).map((q) => q.y));
  const same = [0, 200, 400, 600, 800, 1000].every((ms) => cupAt(ms) - cupAt(0) === cigAt(ms) - cigAt(0));
  ok('steam and smoke go wrong', !same);
}

// Nobody but the switchers has any of this: an empty look must draw neither a
// cigarette nor a cup.
{
  const r = draw({ ...RU, cig: false, hands: 'none' }, { dir: 0, ms: 0 });
  ok('no flags · no cigarettes, no smoke, no steam', !stick(r) && smoke(r).length === 0 && steam(r).length === 0);
}

console.log(bad ? `\nупало: ${bad}` : '\nall passed');
process.exit(bad ? 1 : 0);
