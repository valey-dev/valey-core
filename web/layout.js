// Turns the flat agent list into a floor plan: one room per project,
// rooms packed into a grid with corridors between them.
import { hash } from './sprites.js';

export const WALL = 26;          // thickness of a room's top wall
export const DESK_DX = 96;       // desk pitch
export const DESK_DY = 76;
const PAD_X = 32, HEAD = 62, FOOT = 34;
const COLS_IN_ROOM = 3;
const GRID_COLS = 3;
// MARGIN экспортируется: модуль ставит свой предмет в коридор и должен мерить
// от того же края, что и ядро, — скопированная руками константа уже однажды
// увела предмет в стену.
const GAP_X = 44, CORRIDOR = 76;
export const MARGIN = 44;

const ROOM_TONES = [
  { floor: ['#b98a5e', '#b4855a', '#bd8f63'], seam: '#a2734a', wall: '#6d5040', trim: '#8a6247' },
  { floor: ['#a8845f', '#a37e59', '#ad8b66'], seam: '#8f6c49', wall: '#5f5646', trim: '#7d7050' },
  { floor: ['#b08a70', '#aa846a', '#b69076'], seam: '#96705a', wall: '#6b4a4a', trim: '#8a5f5a' },
  { floor: ['#a68f66', '#a08960', '#ad966d'], seam: '#8a7550', wall: '#5a5a48', trim: '#79785a' },
  { floor: ['#b2907c', '#ac8a76', '#b89682'], seam: '#977668', wall: '#5a4a5e', trim: '#7a6480' },
];

// Подпись плана — поимённая, а не по числу людей в комнате. Считая головы,
// нельзя отличить «один ушёл, другой пришёл» от «ничего не поменялось», и
// новичок оставался без места, потому что план не пересобирали.
export function planSignature(agents) {
  // Версия и стек попадают в подпись, потому что живут на табличке: подняли
  // версию в манифесте — план пересоберётся и табличка догонит. Пересборка
  // ничего не двигает: слоты закреплены за проектами, а столы — за сессиями,
  // и происходит она раз в релиз, а не раз в тик.
  return agents.map((a) => `${a.project}:${a.id}@${a.seat}`).sort().join('|')
    + '#' + [...new Set(agents.map((a) => `${a.project}:${a.version || ''}:${a.stack || ''}`))].sort().join('|');
}

// Проект -> его место в сетке. Живёт между пересборками плана: план собирается
// заново на каждое изменение состава агентов, а комнаты при этом стоять должны.
const SLOTS = new Map();

// только у них: у остальных нечего на него вешать.
export function buildLayout(agents) {
  const groups = new Map();
  for (const a of agents) {
    if (!groups.has(a.project)) groups.set(a.project, []);
    groups.get(a.project).push(a);
  }
  // Слот закрепляется за проектом на всё время, пока он жив. Раньше комнаты
  // сортировались по числу агентов — и стоило кому-то закончить работу, как
  // порядок менялся, комнаты менялись местами, а сидящие в них люди уезжали
  // вместе с мебелью на другой конец этажа. Освободившийся слот занимает
  // следующий новый проект; остальные остаются там, где стояли.
  for (const key of [...SLOTS.keys()]) if (!groups.has(key)) SLOTS.delete(key);
  const taken = new Set(SLOTS.values());
  for (const key of [...groups.keys()].filter((k) => !SLOTS.has(k)).sort()) {
    let i = 0; while (taken.has(i)) i++;
    SLOTS.set(key, i); taken.add(i);
  }
  const entries = [...groups.entries()].sort((a, b) => SLOTS.get(a[0]) - SLOTS.get(b[0]));

  // Слот — это и есть клетка сетки, а не просто порядок в списке. Иначе ушедший
  // проект «схлопывал» ряд и утаскивал за собой всех, кто стоял правее.
  const byRow = new Map();
  for (const [project, list] of entries) {
    const slot = SLOTS.get(project);
    const row = Math.floor(slot / GRID_COLS);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push([project, list, slot % GRID_COLS]);
  }

  const rooms = [], bands = [];
  // Ряды проектов начинаются НИЖЕ на высоту оранжереи и её площадки: крыша —
  // это верхний ярус, зеркальный служебному снизу. Мир от этого вырос вверх
  // на GREEN_H + CORRIDOR, и это единственное, чем оранжерея платит за небо.
  let gridRow = [], rowY = MARGIN + CORRIDOR + GREEN_H + CORRIDOR, rowH = 0;
  const roofY = MARGIN + CORRIDOR;

  const flushRow = (row) => {
    for (const r of gridRow) { r.y = rowY; r.bandY = rowY - CORRIDOR / 2; }
    // Полоса помнит свой ряд, а не своё место сверху: место меняется, стоит
    // появиться ряду выше, а номер ряда закреплён за проектом слотом и живёт,
    // пока живёт проект. Из него и берётся номер этажа.
    bands.push({ y: rowY - CORRIDOR, h: CORRIDOR, row });
    rowY += rowH + CORRIDOR;
    gridRow = []; rowH = 0;
  };

  // Ряды кладутся с большего номера к меньшему, поэтому ряд 0 оказывается внизу,
  // над сервисным ярусом, а новый ряд прирастает сверху — как этаж у дома.
  // Раньше было наоборот, и это ломало обе вещи разом: нумеровать снизу вверх
  // было нельзя (каждый третий агент переименовывал все этажи), а сервисный низ
  // уезжал вниз от каждого нового ряда.
  for (const row of [...byRow.keys()].sort((a, b) => b - a)) {
  for (const [project, list, col] of byRow.get(row)) {
    // Место в комнате приходит с сервера и живёт на диске. Массив разреженный:
    // дырка — это стол ушедшего, он стоит с потухшим монитором и ждёт новичка,
    // вместо того чтобы утащить за собой всех, кто сидел дальше.
    const ids = [];
    list.forEach((a, idx) => { ids[Number.isInteger(a.seat) ? a.seat : idx] = a.id; });
    const deskRows = Math.max(1, Math.ceil(ids.length / COLS_IN_ROOM));
    const w = PAD_X * 2 + (COLS_IN_ROOM - 1) * DESK_DX + 72;
    const h = HEAD + deskRows * DESK_DY + FOOT;
    const x = MARGIN + col * (w + GAP_X);
    const tone = ROOM_TONES[hash(project) % ROOM_TONES.length];
    // Вторая строка таблички. Половинки независимы: нашлась версия без стека —
    // будет только версия. Не нашлось ничего — строки нет, и табличка остаётся
    // однострочной, как была.
    const info = list.find((a) => a.version || a.stack) || {};
    const sub = [info.version, info.stack].filter(Boolean).join(' · ');
    // Репозиторий — свойство проекта, а не сессии: хватает одного агента,
    // который про него знает.
    const repo = list.some((a) => a.repo);

    const room = {
      key: project, title: project, sub, repo, x, y: 0, w, h, tone, deskRows,
      door: { x: x + 34, w: 36 },
      back: null,   // second way in, filled once the room knows its final y
      board: { x: x + w - 122, y: 12, w: 100, h: 42 },
      coffee: { x: x + w - 34, y: 0 },
      desks: [],
      agents: ids,
    };
    rooms.push(room);
    gridRow.push(room);
    rowH = Math.max(rowH, h);
  }
  flushRow(row);
  }

  // now that every room has its final y, place desks, board and props inside
  for (const r of rooms) {
    r.back = backDoor(r);
    r.board.y += r.y;
    r.coffee.y = r.y + r.h - 44;
    // Микроволновка — слева от кофемашины, в том же кухонном углу. Стоит у
    // всех: греть рыбу можно в любой комнате, и в этом вся суть.
    // На полке, а не на полу: человек ростом 24 закрывает собой всё, что
    // стоит на его уровне, — а смотреть тут надо именно в окошко.
    r.micro = { x: r.coffee.x - 44, y: r.coffee.y - 18 };
    for (let i = 0; i < r.agents.length; i++) {
      const cx = i % COLS_IN_ROOM, cy = Math.floor(i / COLS_IN_ROOM);
      r.desks.push({
        x: r.x + PAD_X + 36 + cx * DESK_DX,
        y: r.y + HEAD + 16 + cy * DESK_DY,
        aisle: r.y + HEAD + 16 + cy * DESK_DY + 40,
        i,
      });
    }
    r.aisleY = r.y + r.h - FOOT + 6;
    r.doorPoint = { x: r.door.x + r.door.w / 2, y: r.y + WALL + 16 };
    r.art = hangPictures(r);
    // Фикус растёт там, где есть репозиторий: подойти к нему — посмотреть
    // историю проекта, и предмет отвечает на вопрос ещё до нажатия. Комната без
    // гита остаётся с обычным цветком. Стоит в левом углу под окном: там нет ни
    // столов, ни кофемашины, и мимо него никто не ходит к своему месту.
    if (r.repo) r.ficus = { x: r.x + 26, y: r.y + r.h - 16 };
    // Мольберт — у верхней стены правее двери: между стеной и первым рядом
    // столов 52 пикселя пустого пола, и это единственная полоса в комнате, где
    // он никому не перекрывает дорогу к своему месту. Кофемашина справа,
    // фикус слева внизу — с ними он тоже не спорит.
  }

  const w = MARGIN * 2 + GRID_COLS * (rooms[0]?.w || 320) + (GRID_COLS - 1) * GAP_X;
  // отдельная комната внизу, вне сетки проектов: пультовая с камерами
  const security = buildSecurity(w, rowY);
  const meeting = buildMeeting(w, rowY);
  const greenhouse = buildGreenhouse(w, roofY);
  const h = security.y + security.h + MARGIN;
  // Вертикальные проходы между колоннами комнат и вдоль внешних стен. Комнаты во
  // всех рядах стоят по одной сетке, поэтому такой проход свободен сверху донизу —
  // по нему можно спуститься из любого коридора в любой другой.
  const roomW = rooms[0]?.w || 320;
  const lanes = [MARGIN / 2 + 4];
  for (let c = 0; c < GRID_COLS - 1; c++) lanes.push(MARGIN + c * (roomW + GAP_X) + roomW + GAP_X / 2);
  lanes.push(w - MARGIN / 2 - 4);

  // Курилка — общая на весь офис, поэтому её место на сервисном ярусе, слева от
  // пультовой: на кадре 401:2 под неё пунктиром отведено 360×138 при x = MARGIN,
  // столько же, сколько занимают две другие комнаты яруса. Стен и двери у неё
  // нет — пунктир говорит «здесь», а не «вот такая комната», и выдумывать её
  // внутренность в коде нельзя.
  //
  // Раньше она стояла в нижнем коридоре, в единственной широкой полосе, которую
  // ничто не занимало. Полосу занял ярус, и курилка оказалась бы у него на
  // пороге. Ходить к ней стало дальше — агент с кончившимся лимитом спускается
  // на первый этаж, — и это ровно то, чем курилка и была задумана.
  const loungeX = MARGIN + 154, loungeY = rowY + 84;
  const lounge = {
    x: loungeX, y: loungeY,
    seats: [
      { x: loungeX - 16, y: loungeY - 1 },
      { x: loungeX + 1, y: loungeY - 1 },
      { x: loungeX + 18, y: loungeY - 1 },
      // мест на диване три, остальные курят стоя рядом
      { x: loungeX + 48, y: loungeY + 2 },
      { x: loungeX + 70, y: loungeY + 2 },
    ],
  };

  // Настольный футбол — слева от дивана, в той же курилке. Он единственный
  // предмет на этаже, к которому встают вдвоём: у него две стороны, и занять
  // их могут двое агентов, агент с человеком или человек один — тогда играет
  // сам с собой, как оно в жизни у стола и бывает.
  const kicker = {
    x: MARGIN + 72, y: loungeY + 4,
    sides: [
      { x: MARGIN + 72 - 30, y: loungeY + 6 },
      { x: MARGIN + 72 + 30, y: loungeY + 6 },
    ],
  };

  const byAgent = new Map();
  for (const r of rooms) r.agents.forEach((id, i) => byAgent.set(id, { room: r, desk: r.desks[i] }));

  // corridor furniture: a cooler by the first band, plants and a bench further down
  const props = [];
  bands.forEach((b, i) => {
    const my = b.y + b.h / 2 + 8;
    props.push({ kind: 'plant', x: MARGIN - 18, y: my + 10 });
    // правый конец коридора теперь лифтовый холл — кулер и скамейку уводим
    // левее, иначе они встают ровно на стойку секретаря
    props.push({ kind: i === 0 ? 'cooler' : 'bench', x: MARGIN + 300, y: my + 8 });
    if (i === 0) {
      props.push({ kind: 'bench', x: MARGIN + 150, y: my + 12 });
      // человечек-переключатель языка: у входа, на дорожке, чтобы попасться
      // на глаза раньше, чем человек уйдёт вглубь этажа
      props.push({ kind: 'lang', x: MARGIN + 118, y: my + 4 });
    }
  });

  props.push({ kind: 'lounge', x: lounge.x, y: lounge.y + 5 });
  props.push({ kind: 'ashtray', x: lounge.x + 36, y: lounge.y + 6 });
  props.push({ kind: 'kicker', x: kicker.x, y: kicker.y });

  // Площадка перед оранжереей — обычный коридор, только верхний, и класть его
  // приходится руками: flushRow кладёт полосу над своим рядом, а над крышей
  // ряда нет. После props — чтобы кулер, скамейка и фикус коридора сюда не
  // приехали: на площадке из мебели только двери лифта.
  // unshift, а не push: полоса кладётся ПЕРВОЙ, потому что этажи в лифте
  // считаются по порядку полос, и крыша обязана оказаться сверху списка. При
  // push она вставала предпоследней, между вторым этажом и первым.
  const topRow = bands.reduce((m, b) => Math.max(m, b.row), 0) + 1;
  bands.unshift({ y: MARGIN, h: CORRIDOR, row: topRow, roof: true });
  const lift = buildLift(w, bands, [...rooms, greenhouse], security, meeting);
  // rooms лежат в порядке отрисовки — сверху вниз, как их клали. Наружу проектные
  // комнаты отдаются в порядке слотов: первый слот — это левая комната нижнего
  // ряда, то есть первое, что видит вошедший. На ней же стоит спавн по умолчанию,
  // и после разворота рядов без этой сортировки он уехал бы под самую крышу.
  const bySlot = [...rooms].sort((a, b) => (SLOTS.get(a.key) ?? 0) - (SLOTS.get(b.key) ?? 0));
  const worldW = Math.max(w + LIFT_W, 640);
  return {
    // Сервисные комнаты идут после проектных: порядок в массиве — это порядок
    // отрисовки, а нижний ярус лежит ниже всех рядов и перекрывать его нечем.
    // projectRooms — для всего, что считает проекты: таблички этажей, титульный
    // экран, спавн, камеры. Отличать «комнату» от «проекта» приходится ровно там.
    rooms: [...rooms, security, meeting, greenhouse], projectRooms: bySlot, security, meeting, greenhouse,
    byAgent, bands, props, lanes, lounge, kicker, lift,
    wallArt: hangCorridorPictures(worldW),
    w: worldW, h: Math.max(h, 480),
  };
}

// ------------------------------------------------------------------- лифт
// Шахта стоит в своей полосе справа, за последней колонкой комнат. В проход её
// ставить нельзя: проходы — единственный способ агента спуститься из ряда в ряд,
// и сплошной столб посреди одного из них запер бы половину этажа.
const LIFT_W = 60;
export const LIFT_DOOR_H = 34;

function buildLift(w, bands, rooms, security, meeting) {
  const x = w + 10;
  const byRow = new Map();
  for (const r of rooms) {
    if (!byRow.has(r.y)) byRow.set(r.y, []);
    byRow.get(r.y).push(r.title);
  }
  // Этаж — это коридор: с него открываются двери комнат своего ряда. Номер
  // считается от низа, как в доме, и берётся из ряда, а не из места в списке:
  // место сдвигается, когда сверху прирастает новый ряд, а ряд свой номер
  // держит. Иначе коридор, в котором ты стоишь, переименовывался бы под тобой.
  const floors = bands.map((b) => ({
    n: b.row + 2,
    y: b.y + b.h / 2 + 8,
    rooms: byRow.get(b.y + b.h) || [],
  }));
  // пультовая лежит ниже последнего ряда и по духу — подвал
  // Сервисный ярус — первый этаж, а не подвал. Подвалом он читался, пока внизу
  // была одна пультовая по карточке: туда незачем ехать. С переговоркой, куда
  // можно всем, это перестало быть правдой, и коридоры проектов съехали на
  // единицу вверх — этаж 2 и дальше. Комнаты перечисляются слева направо, как
  // они стоят.
  floors.push({
    n: 1, y: security.y - 30, tier: true,
    rooms: [security, meeting].filter(Boolean).sort((a, b) => a.x - b.x).map((r) => r.title),
  });

  // Стойка секретаря — на каждом жилом этаже, слева от шахты: вышел из кабины,
  // она перед тобой. В подвале её нет: пультовая гостей не принимает.
  // Стойка секретаря стоит там, где есть проекты: она считает их на табличке.
  // На сервисном ярусе их нет, а место, куда её кладёт формула ниже, занято
  // переговоркой — и на утверждённом кадре яруса (401:2) никакой стойки нет.
  const reception = floors.filter((f) => !f.tier).map((f) => ({
    n: f.n, rooms: f.rooms,
    x: x - 100, y: f.y - 26, w: 60, h: 12,
    // где стоит сам секретарь и откуда с ним говорят — по эту сторону стойки
    who: { x: x - 70, y: f.y - 28 },
    spot: { x: x - 70, y: f.y - 4 },
  }));
  return { x, w: 40, floors, reception };
}

export function blockedByLift(lift, x, y) {
  if (!lift) return false;
  if (x > lift.x - 4 && x < lift.x + lift.w + 4 && y > 24 && y < 1e5) return true;
  // стойка — такая же мебель, сквозь неё не ходят
  for (const r of lift.reception || []) {
    if (x > r.x - 4 && x < r.x + r.w + 4 && y > r.y - 12 && y < r.y + r.h + 4) return true;
  }
  return false;
}

// --------------------------------------------------------------- переговорка
// Вторая комната сервисного яруса. От пультовой отличается ровно тем, ради чего
// затевалась: считывателя у двери нет — сюда можно всем. Стена к коридору
// стеклянная, потому что вход и есть включение микрофона: решать, входить ли,
// надо снаружи, а сквозь стекло видно, идёт ли разговор.
//
// Числа сняты с утверждённого плана 400:2 (он нарисован ×3): комната 360×138,
// стена 26 = WALL, дверь на x+34 шириной 36 — та же, что у проектных комнат,
// стол 180×44 посередине, шесть стульев 20×14.
const MEET_W = 360, MEET_H = 138;

function buildMeeting(floorW, y) {
  // Справа, у лифтовой полосы. По брифу гость появляется у лифта, и переговорка
  // должна быть первым, что он видит, а не концом прохода через весь этаж.
  const x = Math.round(floorW - MARGIN - MEET_W);
  const door = { x: x + 34, w: 36 };
  const room = {
    key: '__meeting', title: 'ПЕРЕГОВОРКА', meeting: true,
    service: true, draw: 'meeting', lit: false,
    x, y, w: MEET_W, h: MEET_H, door,
    table: { x: x + 90, y: y + WALL + 34, w: 180, h: 44 },
    // Стулья не перегораживают пол: между верхним рядом и столом два пикселя,
    // и если считать мебелью и их, к столу не подойти вовсе. Стол — мебель,
    // стул — рисунок.
    seats: [110, 170, 230].flatMap((dx) => [
      { x: x + dx, y: y + 44, back: 'top' },
      { x: x + dx, y: y + 106, back: 'bottom' },
    ]),
    // Стеклянные секции: узкая слева от двери, дальше шесть по 41 через 6.
    glass: [{ x: x + 6, w: 22 }].concat([0, 1, 2, 3, 4, 5].map((i) => ({ x: x + 76 + i * 47, w: 41 }))),
    agents: [], desks: [], art: [], back: null, coffee: null,
  };
  room.blocks = [{ ...room.table }];
  room.doorPoint = { x: door.x + door.w / 2, y: y + WALL + 16 };
  // Куда встают, чтобы говорить: середина комнаты у стола, ниже него.
  room.spot = { x: x + MEET_W / 2, y: y + MEET_H - 22 };
  return room;
}

// ------------------------------------------------------------------ security
// Пультовая: одна на этаж, внизу, вход по карточке. Внутри — стойка с мониторами,
// по которым видно любой офис целиком.
const SEC_W = 300, SEC_H = 138;

function buildSecurity(floorW, y) {
  const x = Math.round(floorW / 2 - SEC_W / 2);
  const door = { x: x + Math.round(SEC_W / 2) - 18, w: 36 };
  const sec = {
    key: '__security', title: 'SECURITY', security: true,
    // Сервисная комната: стоит на нижнем ярусе всегда, слота в сетке проектов не
    // занимает и в списке «сколько проектов на этаже» не участвует. Всё
    // остальное — стены, дверь, пол под ногами — общее с проектными комнатами,
    // поэтому она лежит в rooms, а не отдельным полем рядом с ним.
    service: true, draw: 'security', lit: false,
    x, y, w: SEC_W, h: SEC_H, door,
    // считыватель справа от двери, на самой стене
    reader: { x: door.x + door.w + 9, y: y + 6 },
    // стойка с мониторами у дальней стены, к ней и подходят
    console: { x: x + SEC_W / 2, y: y + WALL + 44, w: 132, h: 22 },
    // киноплакат — слева от двери, на самой стене: единственный кусок стены,
    // который не занят ни считывателем, ни вывеской
    poster: { x: x + 61, y: y + 3, w: 14, h: 20 },
    // пустые поля общих проходов: столов, кофемашины и второй двери здесь нет
    agents: [], desks: [], art: [], back: null, coffee: null,
  };
  // Стойка перегораживает пол так же, как стол в проектной комнате. Раньше это
  // знала отдельная blockedBySecurity; теперь это прямоугольник в данных, и
  // следующая сервисная комната опишет свою мебель тем же списком.
  // Запас в 4 пикселя по бокам добавляет сама blocked(), поэтому здесь голая
  // стойка: с ним прямоугольник разъехался бы с прежним на 8 пикселей, и мимо
  // стойки стало бы чуть теснее ходить, чем вчера.
  // Мебель пультовой списком: здесь только стойка. Предметы модулей
  // дописываются в этот же список из точки layout — прямоугольником в данных,
  // а не особым случаем в движке.
  sec.blocks = [
    {
      x: sec.console.x - sec.console.w / 2, y: sec.console.y - 16,
      w: sec.console.w, h: sec.console.h + 16,
    },
  ];
  sec.doorPoint = { x: door.x + door.w / 2, y: y + WALL + 16 };
  sec.consolePoint = { x: sec.console.x, y: sec.console.y + 26 };
  return sec;
}


// ---------------------------------------------------------------- оранжерея
// Третья комната без проекта — и единственная, которая стоит НАВЕРХУ. Причина
// одна и она же весь смысл: у оранжереи стеклянная стена, а за стеклом то же
// настоящее небо, что в окнах коридора, — drawSky с погодой и временем суток.
// Снизу это не работает: там над комнатой ещё три этажа. Служебный ярус к тому
// же занят целиком — курилка, пультовая и переговорка стоят вплотную.
//
// Числа сняты с утверждённого кадра 734:2 (нарисован ×3): комната 420×150,
// стена 26 = WALL, дверь по центру шириной 44, стеллаж на y+60, кран справа,
// скамейка и кадки на полу. Мебель у нижней стены поднята: последние 10 px
// комнаты — стена, и кадка там оказалась бы внутри неё.
const GREEN_W = 420, GREEN_H = 150;

function buildGreenhouse(floorW, y) {
  const x = Math.round(floorW / 2 - GREEN_W / 2);
  const door = { x: x + 188, w: 44 };
  const room = {
    key: '__greenhouse', title: 'ОРАНЖЕРЕЯ', greenhouse: true,
    service: true, draw: 'greenhouse', lit: false,
    x, y, w: GREEN_W, h: GREEN_H, door,
    agents: [], desks: [], art: [], back: null, coffee: null,
  };
  // Семь горшков: четыре на стеллаже, три кадками на полу. Номер закреплён за
  // местом, потому что он же ключ в настройках: пересчитай порядок — и политым
  // окажется не тот, кого полили.
  room.pots = [
    { i: 0, kind: 'flower', x: x + 46, y: y + 60, shelf: true },
    { i: 1, kind: 'cactus', x: x + 78, y: y + 60, shelf: true },
    { i: 2, kind: 'flower', x: x + 110, y: y + 60, shelf: true },
    { i: 3, kind: 'ivy', x: x + 142, y: y + 60, shelf: true },
    { i: 4, kind: 'palm', x: x + 128, y: y + 124 },
    { i: 5, kind: 'ficus', x: x + 172, y: y + 136 },
    { i: 6, kind: 'ficus', x: x + 236, y: y + 112 },
  ];
  // Подходят к горшку снизу — и к тому, что на стеллаже, тоже: поливают сверху
  // вниз, стоя перед ним, а не сбоку.
  for (const p of room.pots) p.spot = { x: p.x, y: p.y + (p.shelf ? 30 : 16) };
  room.tap = { x: x + 376, y: y + 50, spot: { x: x + 372, y: y + 104 } };
  room.hook = { x: x + 332, y: y + 56, spot: { x: x + 332, y: y + 100 } };
  room.bench = {
    x: x + 268, y: y + 124, w: 46,
    seats: [{ x: x + 280, y: y + 128 }, { x: x + 302, y: y + 128 }],
  };
  // Мебель занимает пол ровно там, где нарисована. Кадки — тоже мебель: сквозь
  // фикус в комнате проекта уже не ходят, и здесь та же логика.
  room.blocks = [
    { x: x + 28, y: y + 56, w: 172, h: 26 },
    { x: x + 36, y: y + 100, w: 62, h: 24 },
    { x: x + 348, y: y + 62, w: 58, h: 36 },
    { x: x + 268, y: y + 110, w: 46, h: 26 },
    { x: x + 123, y: y + 116, w: 10, h: 10 },
    { x: x + 167, y: y + 128, w: 10, h: 10 },
    { x: x + 231, y: y + 104, w: 10, h: 10 },
  ];
  room.doorPoint = { x: door.x + door.w / 2, y: y + WALL + 16 };
  return room;
}

// One picture per room — this is an office, not a gallery. It hangs in the middle
// of the widest stretch of wall the door and the board leave free.
const ART_H = 15;          // frame height inside a 26px wall
const ART_MIN = 18;
const ART_MAX = 34;

function widestGap(spans) {
  let best = null;
  for (const [a, b] of spans) {
    if (b - a < ART_MIN) continue;
    if (!best || b - a > best[1] - best[0]) best = [a, b];
  }
  return best;
}

function centred(span, y, seed, extra = {}) {
  const [a, b] = span;
  const w = Math.min(ART_MAX, b - a);
  return { x: Math.round(a + (b - a - w) / 2), y, w, h: ART_H, seed, ...extra };
}

// The outer corridor wall: windows every WINDOW_STEP, pictures in the piers
// between them. office.js draws the windows from the same numbers.
export const WINDOW_START = 56;
export const WINDOW_STEP = 208;
export const WINDOW_W = 70;      // including the frame, starting at wx - 4

// In the corridors pictures are rare on purpose: roughly every third pier gets
// one, and those ones are the jokes.
function hangCorridorPictures(worldW) {
  const piers = [];
  let prevEnd = 16;
  for (let wx = WINDOW_START; wx < worldW - 80; wx += WINDOW_STEP) {
    piers.push([prevEnd, wx - 10]);
    prevEnd = wx - 4 + WINDOW_W + 6;
  }
  piers.push([prevEnd, worldW - 16]);

  const out = [];
  piers.forEach((span, i) => {
    if (span[1] - span[0] < ART_MIN) return;
    if (hash(`pier${i}`) % 3 !== 0) return;
    out.push(centred(span, 7, `hall-${i}`, { egg: true }));
  });
  // на длинном этаже без единой пасхалки скучно — вешаем хотя бы одну
  if (!out.length) {
    const span = widestGap(piers);
    if (span) out.push(centred(span, 7, 'hall-0', { egg: true }));
  }
  return out;
}

function hangPictures(r) {
  const span = widestGap([
    [r.x + 12, r.door.x - 5],                      // ниша слева от двери
    [r.door.x + r.door.w + 5, r.board.x - 6],      // простенок до доски
  ]);
  if (!span) return [];
  return [centred(span, r.y + 4, r.key, { theme: r.title })];
}

// A second doorway so rooms are not dead ends: the side is picked from the project
// name, the opening sits off-centre and keeps clear of the coffee corner.
const DOOR_W = 36;

function backDoor(r) {
  const h = hash('back' + r.key);
  const sides = ['bottom', 'left', 'right'];
  const side = sides[h % sides.length];
  const drift = ((h >>> 4) % 5) - 2;          // -2..2, so openings are not all alike

  if (side === 'bottom') {
    // stay away from the coffee corner on the right and the plant on the left
    const span = r.w - 120;
    const x = r.x + 52 + Math.max(0, Math.min(span, (span / 2) + drift * 14));
    return { side, x, y: r.y + r.h - 10, w: DOOR_W, h: 10 };
  }
  const span = r.h - WALL - FOOT - 40;
  const y = r.y + WALL + 24 + Math.max(0, Math.min(span, (span / 2) + drift * 12));
  return {
    side, w: 8, h: DOOR_W, y,
    x: side === 'left' ? r.x : r.x + r.w - 8,
  };
}

const inBack = (r, x, y) => {
  const b = r.back;
  if (!b) return false;
  if (b.side === 'bottom') return x > b.x + 3 && x < b.x + b.w - 3 && y > b.y - 2;
  // the height alone is not enough: without this the opposite wall would have an
  // invisible hole at exactly the same height
  const onItsWall = b.side === 'left' ? x < r.x + 12 : x > r.x + r.w - 12;
  return onItsWall && y > b.y + 3 && y < b.y + b.h - 3;
};

// ------------------------------------------------------- относительные места
// Кто где стоит, в терминах плана, а не мировых пикселей. Нужно затем, что план
// пересобирается на каждое изменение состава агентов, а ряды прирастают сверху:
// стоит чужому проекту начаться, и весь этаж съезжает вниз на высоту ряда.
// Абсолютные x/y после такого показывают в соседнюю комнату, хотя человек не
// сделал ни шага, — а во время разговора в переговорке это пол, уходящий
// из-под ног.
//
// Якорь — ближайшая комната и смещение от её угла. Ближайшая, а не та, внутри
// которой стоишь: в коридоре не стоишь ни в одной, но коридор едет вместе со
// своим рядом, и держаться за соседнюю комнату там ровно то, что нужно.
//
// Комната считается вместе с коридором над ней: это её этаж, с него открывается
// её дверь. Без этого человек в коридоре цеплялся за ряд НАПЕРЁД — по прямому
// расстоянию комната сверху оказывается ближе на несколько пикселей, чем та,
// к которой этот коридор ведёт. Пока ряды одной высоты, разницы не видно: при
// врезке ряда всё съезжает на одинаковую величину. Она вылезает, когда в
// проекте появляется четвёртый агент, ряд становится выше остальных, и нижние
// ряды сдвигаются не на столько же.
export function anchorOf(L, p) {
  if (!L || !p || !L.rooms) return null;
  let best = null, bestD = Infinity;
  for (const r of L.rooms) {
    const top = r.y - CORRIDOR;
    const cx = Math.max(r.x, Math.min(r.x + r.w, p.x));
    const cy = Math.max(top, Math.min(r.y + r.h, p.y));
    const d = Math.hypot(cx - p.x, cy - p.y);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best ? { key: best.key, dx: p.x - best.x, dy: p.y - best.y } : null;
}

// Комната могла и исчезнуть — проект закончился, пока план пересобирался. Тогда
// не трогаем ничего: остаться на старом месте лучше, чем уехать в угол этажа.
export function applyAnchor(L, p, a) {
  if (!L || !p || !a) return false;
  const r = L.rooms.find((x) => x.key === a.key);
  if (!r) return false;
  p.x = r.x + a.dx; p.y = r.y + a.dy;
  return true;
}

export function blocked(L, x, y) {
  if (x < 14 || x > L.w - 14 || y < 24 || y > L.h - 14) return true;
  if (blockedByLift(L.lift, x, y)) return true;
  for (const p of L.props || []) {
    // Предмет вправе назвать свои размеры сам — иначе модуль не может
    // поставить в коридор ничего своего: таблица знает только те виды, что
    // перечислены здесь, а про чужие ей взяться неоткуда.
    const w = p.w ?? ({ bench: 34, lounge: 54, ashtray: 10, lang: 14, kicker: 44 }[p.kind] || 16);
    const h = p.h ?? ({ plant: 14, lounge: 22, ashtray: 18, lang: 24, kicker: 22 }[p.kind] || 26);
    if (x > p.x - w / 2 - 4 && x < p.x + w / 2 + 4 && y > p.y - h && y < p.y + 4) return true;
  }
  for (const r of L.rooms) {
    if (x < r.x - 3 || x > r.x + r.w + 3 || y < r.y - 3 || y > r.y + r.h + 3) continue;
    const inDoor = x > r.door.x + 3 && x < r.door.x + r.door.w - 3;
    if (y < r.y + WALL) { if (!inDoor) return true; continue; }
    const back = inBack(r, x, y);
    if (x < r.x + 8 || x > r.x + r.w - 8) { if (!back) return true; continue; }
    if (y > r.y + r.h - 10) { if (!back) return true; continue; }
    for (const d of r.desks) {
      if (x > d.x - 28 && x < d.x + 28 && y > d.y - 6 && y < d.y + 20) return true;
    }
    // кадка занимает пол, крона висит выше головы и не мешает
    if (r.ficus && x > r.ficus.x - 12 && x < r.ficus.x + 12 && y > r.ficus.y - 14 && y < r.ficus.y + 4) return true;
    if (r.coffee && x > r.coffee.x - 16 && x < r.coffee.x + 14 && y > r.coffee.y - 34 && y < r.coffee.y + 4) return true;
    if (r.micro && x > r.micro.x - 17 && x < r.micro.x + 17 && y > r.micro.y - 22 && y < r.micro.y + 4) return true;
    for (const b of r.blocks || []) {
      if (x > b.x - 4 && x < b.x + b.w + 4 && y > b.y && y < b.y + b.h) return true;
    }
  }
  return false;
}

export function roomAt(L, x, y) {
  return L.rooms.find((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) || null;
}
