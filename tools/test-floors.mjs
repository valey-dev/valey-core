// node tools/test-floors.mjs — этажи и относительные места, без браузера.
//
// Проверяется то, что ломается молча и обнаруживается только чужим коммитом:
// офис прирастает рядами, и от направления роста зависит, переименуются ли
// этажи под ногами и уедет ли сервисный ярус из-под тех, кто на нём стоит.
// Ряды кладутся сверху, ряд 0 остаётся внизу, номер этажа берётся из ряда.
import { buildLayout, anchorOf, applyAnchor } from '../web/layout.js';

const mk = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, project: 'p' + i, name: 'a' + i, status: 'idle',
}));

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

// ------------------------------------------------------------------ этажи
// Номер этажа закреплён за рядом, а ряд — за слотом проекта. Пока проект жив,
// его этаж называется одинаково, сколько бы соседей ни въехало сверху.
const floorOfRoom = (L, key) => {
  const r = L.projectRooms.find((x) => x.key === key);
  const band = L.lift.floors.find((f) => !f.basement && f.rooms.includes(r.title));
  return band ? band.n : null;
};

const seen = new Map();
let stable = true;
const drift = [];
for (const n of [3, 6, 7, 9, 10, 12]) {
  const L = buildLayout(mk(n));
  for (const r of L.projectRooms) {
    const f = floorOfRoom(L, r.key);
    if (seen.has(r.key) && seen.get(r.key) !== f) {
      stable = false;
      drift.push(`${r.key}: ${seen.get(r.key)} → ${f} при ${n} проектах`);
    }
    seen.set(r.key, f);
  }
}
ok('этаж проекта не меняется, когда офис растёт', stable, drift);

const L = buildLayout(mk(10));
const lowest = Math.max(...L.projectRooms.map((r) => r.y));
ok('первые три проекта стоят нижним рядом',
  ['p0', 'p1', 'p2'].every((k) => L.projectRooms.find((r) => r.key === k).y === lowest),
  L.projectRooms.map((r) => [r.key, r.y]));
ok('сервисный ярус ниже всех комнат', L.security.y > lowest, [L.security.y, lowest]);
// Первый этаж — сервисный ярус, а не нижний ряд проектов. Так стало 30 августа
// 2026, когда на ярусе появилась переговорка: подвалом он читался, пока внизу
// была одна пультовая по карточке, куда незачем ехать.
ok('первый этаж — сервисный ярус',
  L.lift.floors.some((f) => f.n === 1 && f.tier && f.rooms.includes('ПЕРЕГОВОРКА')),
  L.lift.floors.map((f) => [f.n, f.rooms]));
ok('нижний ряд проектов — этаж 2',
  L.lift.floors.some((f) => f.n === 2 && f.rooms.includes('p0')),
  L.lift.floors.map((f) => [f.n, f.rooms]));
// Крыша с оранжереей — верхний этаж, и она же самый большой номер. Раньше здесь
// стояла пятёрка числом: с появлением яруса крыши этажей стало на один больше,
// и жёсткая цифра проверяла старый мир, а не правило.
ok('самый верхний этаж — крыша с оранжереей',
  L.lift.floors[0].n === Math.max(...L.lift.floors.map((f) => f.n))
  && L.lift.floors[0].rooms.includes('ОРАНЖЕРЕЯ'),
  L.lift.floors.map((f) => [f.n, f.rooms]));
ok('подвала больше нет', !L.lift.floors.some((f) => f.basement), null);
ok('номера идут подряд без дыр',
  L.lift.floors.map((f) => f.n).sort((a, b) => a - b).every((n, i) => n === i + 1),
  L.lift.floors.map((f) => f.n));
// На ярусе нет проектов, а место, куда формула кладёт стойку, занято
// переговоркой — и на утверждённом кадре 401:2 стойки там нет.
ok('на сервисном ярусе стойки секретаря нет',
  !L.lift.reception.some((r) => r.n === 1), L.lift.reception.map((r) => r.n));

// Вошедший начинает снизу, у лифта, а не под крышей: комнаты наружу отдаются в
// порядке слотов, а не в порядке отрисовки.
ok('вход по умолчанию — в комнату первого слота',
  L.projectRooms[0].key === 'p0' && L.projectRooms[0].y === lowest,
  [L.projectRooms[0].key, L.projectRooms[0].y]);
ok('кабина стоит на этаже 1, то есть у входа',
  L.lift.floors.find((f) => f.n === 1) !== undefined, null);

// -------------------------------------------------- относительные места
// План пересобирается целиком, комнаты встают на новые места. Человек при этом
// никуда не шёл, и остаться он должен там же, где стоял, — в своей комнате.
const before = buildLayout(mk(6));
const room = before.projectRooms.find((r) => r.key === 'p0');
const p = { x: room.x + 40, y: room.y + 90 };
const a = anchorOf(before, p);
const after = buildLayout(mk(7));
const moved = { ...p };
applyAnchor(after, moved, a);
const room2 = after.projectRooms.find((r) => r.key === 'p0');
ok('якорь удержал человека в своей комнате',
  moved.x === room2.x + 40 && moved.y === room2.y + 90,
  [moved, { x: room2.x, y: room2.y }]);
ok('и без якоря он бы уехал', p.y !== moved.y, [p.y, moved.y]);

// В коридоре человек не стоит ни в одной комнате, но коридор едет вместе со
// своим рядом — держаться за ближайшую комнату там как раз то, что нужно.
const hall = { x: room.x + 20, y: room.y - 40 };
const ha = anchorOf(before, hall);
ok('в коридоре якорь цепляется за соседнюю комнату', ha && ha.key === 'p0', ha);

// Тот самый случай, ради которого якорь считает коридор частью своего этажа.
// В проекте верхнего ряда появляется четвёртый агент, ряд становится выше, и
// нижние ряды съезжают не на ту же величину, что и он. Человек стоит в коридоре
// НИЖНЕГО ряда: если бы он цеплялся за ближайшую по прямой комнату сверху, его
// вынесло бы из своего коридора.
{
  const many = (extra) => [
    ...mk(6),
    ...Array.from({ length: extra }, (_, i) => ({
      id: 'x' + i, project: 'p3', name: 'x' + i, status: 'idle',
    })),
  ];
  const was = buildLayout(many(0));
  const r0 = was.projectRooms.find((r) => r.key === 'p0');
  const stood = { x: r0.x + 20, y: r0.y - 40 };          // коридор своего этажа
  const an = anchorOf(was, stood);
  const now = buildLayout(many(3));                       // ряд сверху подрос
  const w0 = now.projectRooms.find((r) => r.key === 'p0');
  const w3 = now.projectRooms.find((r) => r.key === 'p3');
  ok('подросший ряд сверху сдвигает нижний иначе, чем себя',
    (w3.y - was.projectRooms.find((r) => r.key === 'p3').y) !== (w0.y - r0.y),
    [w3.y, w0.y]);
  const p2 = { ...stood };
  applyAnchor(now, p2, an);
  ok('человек остался в коридоре своего этажа',
    an.key === 'p0' && p2.y === w0.y - 40, [an.key, p2.y, w0.y]);
}

// Пультовая — тоже комната, и якорь в ней держит так же.
const sec = { x: before.security.x + 30, y: before.security.y + 60 };
const sa = anchorOf(before, sec);
const secMoved = { ...sec };
applyAnchor(after, secMoved, sa);
ok('на сервисном ярусе якорь держит тоже',
  sa.key === '__security' && secMoved.y === after.security.y + 60,
  [sa, secMoved.y, after.security.y]);

// Проект закончился, пока план пересобирался: оставить на месте лучше, чем
// швырнуть в угол этажа по несуществующему ключу.
const gone = { x: 1, y: 2 };
ok('исчезнувший проект оставляет человека на месте',
  applyAnchor(after, gone, { key: 'нет такого', dx: 0, dy: 0 }) === false
  && gone.x === 1 && gone.y === 2, gone);
ok('пустой якорь никого не двигает',
  applyAnchor(after, gone, null) === false && gone.x === 1, gone);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
