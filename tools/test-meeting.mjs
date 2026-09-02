// node tools/test-meeting.mjs — переговорка на сервисном ярусе.
// Сверяет код с утверждённым планом 400:2 в числах: план нарисован ×3, поэтому
// всё, что видно на кадре, делится на три и должно совпасть здесь. Отдельно
// проверяется проходимость: стена, нарисованная не там, где её видит blocked(),
// выглядит правильно и не пускает — это ровно тот отказ, который глазами не
// ловится.
import { buildLayout, blocked, roomAt, WALL } from '../web/layout.js';

const mk = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'a' + i, project: 'p' + i, name: 'a' + i, status: 'idle',
}));

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

const L = buildLayout(mk(6));
const m = L.meeting, s = L.security;

// ------------------------------------------------------------- геометрия
ok('комната 360×138, как на плане', m.w === 360 && m.h === 138, { w: m.w, h: m.h });
ok('стена в 26 пикселей — та же, что у всех', WALL === 26, WALL);
ok('дверь на x+34 шириной 36, как у проектных комнат',
  m.door.x - m.x === 34 && m.door.w === 36, { dx: m.door.x - m.x, w: m.door.w });
ok('стол 180×44 посередине', m.table.w === 180 && m.table.h === 44, m.table);
ok('стол стоит на WALL+34 от верха комнаты',
  m.table.y - m.y === WALL + 34, m.table.y - m.y);
ok('шесть стульев', m.seats.length === 6, m.seats.length);
ok('семь стеклянных секций', m.glass.length === 7, m.glass.length);
ok('стекло не заходит на дверь',
  m.glass.every((g) => g.x + g.w <= m.door.x || g.x >= m.door.x + m.door.w),
  m.glass.map((g) => [g.x - m.x, g.w]));

// ------------------------------------------------------------- где стоит
ok('на одном ярусе с пультовой', m.y === s.y && m.h === s.h, { m: m.y, s: s.y });
ok('правее пультовой и не наезжает на неё', m.x >= s.x + s.w, { m: m.x, s: s.x + s.w });
ok('не вылезает за этаж', m.x + m.w <= L.w, { r: m.x + m.w, w: L.w });
ok('не заходит под шахту лифта', m.x + m.w < L.lift.x, { r: m.x + m.w, lift: L.lift.x });
// Крайний правый проход — единственный способ попасть с яруса к лифту в обход
// комнаты. L.w тут не годится: это ширина мира вместе с шахтой, и точка в ней
// упирается в лифт, а не в переговорку.
const lane = L.lanes[L.lanes.length - 1];
ok('крайний проход остался правее комнаты', lane > m.x + m.w, { lane, r: m.x + m.w });
ok('и по нему можно пройти', !blocked(L, lane, m.y + m.h / 2), { lane });

// ------------------------------------------------------------- сервисная
ok('лежит в rooms', L.rooms.includes(m), L.rooms.length);
ok('но не в projectRooms', !L.projectRooms.includes(m), L.projectRooms.length);
ok('и не занимает слот проекта', L.projectRooms.length === 6, L.projectRooms.length);
ok('в кабине лифта ярус показывает обе комнаты',
  L.lift.floors.some((f) => f.tier && f.rooms.length === 2 && f.rooms.includes(m.title)),
  L.lift.floors.filter((f) => f.tier).map((f) => f.rooms));
ok('и это первый этаж, а не подвал',
  L.lift.floors.some((f) => f.tier && f.n === 1), L.lift.floors.map((f) => f.n));

// ------------------------------------------------------------- проходимость
const inside = { x: m.x + m.w / 2, y: m.y + m.h - 20 };
ok('внутри комнаты — это она и есть', roomAt(L, inside.x, inside.y) === m,
  roomAt(L, inside.x, inside.y) && roomAt(L, inside.x, inside.y).title);
ok('через дверной проём проходят',
  !blocked(L, m.door.x + m.door.w / 2, m.y + WALL - 2), null);
ok('сквозь стену рядом с дверью — нет',
  blocked(L, m.door.x - 8, m.y + WALL - 2), null);
ok('левая стена не пускает', blocked(L, m.x + 3, m.y + m.h / 2), null);
ok('правая стена не пускает', blocked(L, m.x + m.w - 3, m.y + m.h / 2), null);
ok('нижняя стена не пускает', blocked(L, m.x + m.w / 2, m.y + m.h - 4), null);
ok('стол — мебель, сквозь него нельзя',
  blocked(L, m.table.x + m.table.w / 2, m.table.y + m.table.h / 2), null);
ok('а стулья сквозные, иначе к столу не подойти',
  m.seats.every((q) => !blocked(L, q.x + 10, q.y + 7)),
  m.seats.filter((q) => blocked(L, q.x + 10, q.y + 7)).length);
ok('перед столом есть где стоять', !blocked(L, m.spot.x, m.spot.y), m.spot);
ok('считывателя у двери нет — сюда можно всем', m.reader === undefined, m.reader);

// ------------------------------------------------------------- курилка
// Пунктир на кадре 401:2 отводит ей 360×138 при x = MARGIN, слева от пультовой.
// Стен там нет: проверяется место, а не комната.
const lo = L.lounge;
const spot = { x: 44, y: m.y, w: 360, h: 138 };
const inSpot = (q) => q.x >= spot.x && q.x <= spot.x + spot.w && q.y >= spot.y && q.y <= spot.y + spot.h;
ok('курилка стоит на сервисном ярусе', lo.y >= m.y && lo.y <= m.y + m.h, { lo: lo.y, tier: m.y });
ok('и внутри отведённого пунктиром места', inSpot(lo), lo);
ok('все места на диване тоже внутри', lo.seats.every(inSpot), lo.seats.filter((q) => !inSpot(q)));
ok('курилка не наезжает на пультовую', lo.x + 80 < s.x, { lo: lo.x, s: s.x });
ok('крайний левый проход к ней свободен',
  !blocked(L, L.lanes[0], lo.y), { lane: L.lanes[0] });
ok('и от прохода до дивана можно дойти по прямой',
  !blocked(L, (L.lanes[0] + lo.x) / 2 - 60, lo.y), null);

// ---------------------------------------------------- ярус растёт вместе с офисом
const sizes = [1, 3, 7, 9].map((n) => {
  const X = buildLayout(mk(n));
  return { n, dy: X.meeting.y - X.security.y, dx: X.meeting.x - X.security.x };
});
ok('переговорка держится пультовой при любом размере офиса',
  sizes.every((z) => z.dy === sizes[0].dy && z.dx === sizes[0].dx), sizes);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
