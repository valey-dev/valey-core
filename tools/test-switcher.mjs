// node tools/test-switcher.mjs — предметы человечка-переключателя на записывающем
// холсте: сигарета и стакан кофе.
//
// Зачем: сигарету видно только на кадре, а кадром её видно не всю. 1 сентября
// 2026 зеркальную сторону (человек смотрит влево) удалось снять в офисе, а
// прямую — нет: в коридоре переключатель стоит на bands[0], то есть на верхнем
// ряду, а со входа попадаешь на нижний, и увести туда снималку клавишами не
// вышло. Ветка dir === 0 осталась непроверенной глазами вовсе — этот стенд
// закрывает её числами.
//
// Холст записывающий, а не подставной: fillRect складывается в список, и по
// нему видно, куда лёг каждый пиксель. Проверяется геометрия относительно
// центра, а не цвет: цвет — вкус, а вот сигарета, вылезшая из затылка, — ошибка.

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
  else { bad += 1; console.log('УПАЛ  |', name, '→', String(got)); }
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

// Голова занимает x-4..x+3. Сигарета обязана торчать НАРУЖУ от неё и с той
// стороны, куда человек смотрит.
{
  const r = draw(RU, { dir: 0, ms: 0 });
  ok('dir 0 · сигарета есть', !!stick(r));
  ok('dir 0 · торчит вправо от головы', ember(r) && ember(r).x - X === 5, ember(r) && ember(r).x - X);
  ok('dir 0 · начинается у угла рта', stick(r) && stick(r).x - X === 2 && stick(r).w === 3, stick(r) && [stick(r).x - X, stick(r).w]);
}
{
  const r = draw(RU, { dir: 1, ms: 0 });
  ok('dir 1 · та же сторона, что и при dir 0', ember(r) && ember(r).x - X === 5, ember(r) && ember(r).x - X);
}
{
  const r = draw(RU, { dir: -1, ms: 0 });
  ok('dir -1 · уголёк ушёл влево', ember(r) && ember(r).x - X === -6, ember(r) && ember(r).x - X);
  ok('dir -1 · сигарета целиком левее головы', stick(r) && stick(r).x - X === -5, stick(r) && stick(r).x - X);
}

// Дым: три точки, поднимаются со временем и гаснут. Проверяется движение, а не
// конкретная высота — иначе тест ломается от любой правки скорости.
{
  const first = draw(RU, { dir: 0, ms: 0 });
  const a = smoke(first), tip = ember(first).y;
  const b = smoke(draw(RU, { dir: 0, ms: 450 }));
  ok('дым · три точки', a.length === 3, a.length);
  ok('дым · все полупрозрачные', a.length === 3 && a.every((r) => r.a > 0 && r.a < 1), a.map((r) => r.a));
  ok('дым · за 450 мс поднялся', Math.min(...b.map((r) => r.y)) < Math.min(...a.map((r) => r.y)));
  ok('дым · не опускается ниже уголька', a.every((r) => r.y <= tip), [a.map((r) => r.y), tip]);
}

// Прозрачность восстанавливается: дым рисуется через globalAlpha, и если её не
// вернуть, всё нарисованное после человека поедет полупрозрачным.
{
  ctx.globalAlpha = 1;
  draw(RU, { dir: 0, ms: 300 });
  ok('дым · globalAlpha возвращена', ctx.globalAlpha === 1, ctx.globalAlpha);
}

// Стакан: крышка сверху, картонка ниже неё, ручки нет — ручка есть у кружки, и
// перепутать их значит выдать одному предмету чужой силуэт.
{
  const r = draw(US, { dir: 0, ms: 0 });
  const lid = has(r, '#8a6247')[0], body = has(r, '#f0ece0')[0], band = has(r, '#b8845a')[0];
  ok('стакан · есть крышка, тулово и картонка', !!lid && !!body && !!band);
  ok('стакан · крышка над туловом', lid && body && lid.y < body.y, lid && body && [lid.y, body.y]);
  ok('стакан · картонка внутри тулова', band && body && band.y > body.y && band.y < body.y + body.h, band && body && [band.y, body.y, body.h]);
  ok('стакан · шириной в три пикселя', body && body.w === 3, body && body.w);
  ok('стакан · без сигареты', !stick(r));

  // Пар. Столбец важен не меньше высоты: туловище кончается на x+4, рука на
  // x+6, и пар левее x+7 пошёл бы по светлой рубашке, где его не видно.
  const st = steam(r);
  ok('пар · две струйки', st.length === 2, st.length);
  ok('пар · мимо туловища', st.every((q) => q.x - X >= 7), st.map((q) => q.x - X));
  ok('пар · выше крышки', lid && st.every((q) => q.y < lid.y), [st.map((q) => q.y), lid && lid.y]);
  ok('пар · полупрозрачный', st.every((q) => q.a > 0 && q.a < 1), st.map((q) => q.a));
  const st2 = steam(draw(US, { dir: 0, ms: 600 }));
  ok('пар · за 600 мс поднялся', Math.min(...st2.map((q) => q.y)) < Math.min(...st.map((q) => q.y)));
}

// Пар и дым — разные периоды, иначе две струйки пульсировали бы в такт. Живьём
// рядом они не встречаются (переключатель на экране один), но период — это то,
// что легко случайно свести в одно число при следующей правке.
{
  const cupAt = (ms) => Math.min(...steam(draw(US, { dir: 0, ms })).map((q) => q.y));
  const cigAt = (ms) => Math.min(...smoke(draw(RU, { dir: 0, ms })).map((q) => q.y));
  const same = [0, 200, 400, 600, 800, 1000].every((ms) => cupAt(ms) - cupAt(0) === cigAt(ms) - cigAt(0));
  ok('пар и дым идут не в такт', !same);
}

// Ни у кого, кроме переключателей, этого нет: пустой look не должен рисовать ни
// сигареты, ни стакана.
{
  const r = draw({ ...RU, cig: false, hands: 'none' }, { dir: 0, ms: 0 });
  ok('без флагов · ни сигареты, ни дыма, ни пара', !stick(r) && smoke(r).length === 0 && steam(r).length === 0);
}

console.log(bad ? `\nупало: ${bad}` : '\nвсё прошло');
process.exit(bad ? 1 : 0);
