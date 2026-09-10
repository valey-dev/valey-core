// Turns the flat agent list into a floor plan: one room per project,
// rooms packed into a grid with corridors between them.
import { hash } from './sprites.js';

export const WALL = 26;          // thickness of a room's top wall
export const DESK_DX = 96;       // desk pitch
export const DESK_DY = 76;
const PAD_X = 32, HEAD = 62, FOOT = 34;
const COLS_IN_ROOM = 3;
const GRID_COLS = 3;
// MARGIN is exported: a module puts a thing of its own into the corridor and has
// to measure from the same edge as the core — a constant copied by hand has
// already taken a thing into a wall once.
const GAP_X = 44, CORRIDOR = 76;
export const MARGIN = 44;

const ROOM_TONES = [
  { floor: ['#b98a5e', '#b4855a', '#bd8f63'], seam: '#a2734a', wall: '#6d5040', trim: '#8a6247' },
  { floor: ['#a8845f', '#a37e59', '#ad8b66'], seam: '#8f6c49', wall: '#5f5646', trim: '#7d7050' },
  { floor: ['#b08a70', '#aa846a', '#b69076'], seam: '#96705a', wall: '#6b4a4a', trim: '#8a5f5a' },
  { floor: ['#a68f66', '#a08960', '#ad966d'], seam: '#8a7550', wall: '#5a5a48', trim: '#79785a' },
  { floor: ['#b2907c', '#ac8a76', '#b89682'], seam: '#977668', wall: '#5a4a5e', trim: '#7a6480' },
];

// The signature of the plan is by name rather than by the number of people in a
// room. Counting heads, one cannot tell "one left, another arrived" from "nothing
// changed", and a newcomer was left without a place because the plan was not
// rebuilt.
// Where `#room=` in the address takes you. It searches the whole floor rather
// than the project rooms alone: the control room, the meeting room and the
// greenhouse are service rooms, absent from projectRooms and from the TAB round
// — and they are exactly the ones the address is for, since walking there costs
// a minute of held keys and a screenshot is needed right there.
//
// On 5 September 2026 that cost four attempts at photographing the personnel
// files: the rulebook promised «including service rooms» while the code searched
// the project ones only and silently dropped the player into the first room it
// found. Nothing said it had missed. The key is now a key — `__security`; the
// title stays for older links that said «marmalade». The leading underscores are
// optional: `#room=security` is the same thing, and it is the first thing anyone
// will type.
export function pickRoom(layout, want) {
  if (!want || !layout) return null;
  const all = layout.rooms || layout.projectRooms || [];
  return all.find((r) => r.key === want)
    || all.find((r) => r.key === '__' + want)
    || all.find((r) => (r.title || '').startsWith(want))
    || null;
}

export function planSignature(agents) {
  // The version and the stack get into the signature because they live on the
  // plaque: raise the version in the manifest and the plan is rebuilt and the
  // plaque catches up. A rebuild moves nothing: the slots are pinned to the
  // projects and the desks to the sessions, and it happens once a release rather
  // than once a tick.
  return agents.map((a) => `${a.project}:${a.id}@${a.seat}`).sort().join('|')
    + '#' + [...new Set(agents.map((a) => `${a.project}:${a.version || ''}:${a.stack || ''}`))].sort().join('|');
}

// A project -> its place in the grid. It lives between rebuilds of the plan: the
// plan is assembled anew on every change to the cast of agents, and the rooms have
// to stand still while that happens.
const SLOTS = new Map();

// only for them: the others have nothing to hang on it.
export function buildLayout(agents, opts = {}) {
  const groups = new Map();
  for (const a of agents) {
    if (!groups.has(a.project)) groups.set(a.project, []);
    groups.get(a.project).push(a);
  }
  // A slot is pinned to a project for as long as it is alive. The rooms used to be
  // sorted by the number of agents — and the moment somebody finished work the
  // order changed, the rooms swapped places, and the people sitting in them rode
  // off with the furniture to the other end of the floor. A slot that comes free is
  // taken by the next new project; the rest stay where they stood.
  for (const key of [...SLOTS.keys()]) if (!groups.has(key)) SLOTS.delete(key);
  const taken = new Set(SLOTS.values());
  for (const key of [...groups.keys()].filter((k) => !SLOTS.has(k)).sort()) {
    let i = 0; while (taken.has(i)) i++;
    SLOTS.set(key, i); taken.add(i);
  }
  const entries = [...groups.entries()].sort((a, b) => SLOTS.get(a[0]) - SLOTS.get(b[0]));

  // A slot is the cell of the grid, not just a position in a list. Otherwise a
  // project that left "collapsed" the row and dragged everyone to the right of it along.
  const byRow = new Map();
  for (const [project, list] of entries) {
    const slot = SLOTS.get(project);
    const row = Math.floor(slot / GRID_COLS);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push([project, list, slot % GRID_COLS]);
  }

  const rooms = [], bands = [];
  // The rows of projects begin LOWER by the height of the conservatory and its
  // landing: the roof is the top tier, mirroring the service one below. The world
  // grew upwards by GREEN_H + CORRIDOR because of it, and that is the only thing the
  // conservatory pays for its sky.
  let gridRow = [], rowY = MARGIN + CORRIDOR + GREEN_H + CORRIDOR, rowH = 0;
  const roofY = MARGIN + CORRIDOR;

  const flushRow = (row) => {
    for (const r of gridRow) { r.y = rowY; r.bandY = rowY - CORRIDOR / 2; }
    // A strip remembers its row rather than its place from the top: the place
    // changes the moment a row appears above it, while the number of a row is pinned
    // to a project by its slot and lives as long as the project does. The floor
    // number is taken from it.
    bands.push({ y: rowY - CORRIDOR, h: CORRIDOR, row });
    rowY += rowH + CORRIDOR;
    gridRow = []; rowH = 0;
  };

  // The rows are laid from the larger number to the smaller, so row 0 ends up at the
  // bottom, above the service tier, and a new row grows on top — like a storey on a
  // house. It used to be the other way round, and that broke both things at once:
  // numbering from the bottom up was impossible (every third agent renamed all the
  // floors), and the service bottom rode down away from every new row.
  for (const row of [...byRow.keys()].sort((a, b) => b - a)) {
  for (const [project, list, col] of byRow.get(row)) {
    // A place in a room comes from the server and lives on disk. The array is
    // sparse: a hole is the desk of somebody who left, it stands with a dark monitor
    // and waits for a newcomer instead of dragging everyone who sat further along.
    const ids = [];
    list.forEach((a, idx) => { ids[Number.isInteger(a.seat) ? a.seat : idx] = a.id; });
    const deskRows = Math.max(1, Math.ceil(ids.length / COLS_IN_ROOM));
    const w = PAD_X * 2 + (COLS_IN_ROOM - 1) * DESK_DX + 72;
    const h = HEAD + deskRows * DESK_DY + FOOT;
    const x = MARGIN + col * (w + GAP_X);
    const tone = ROOM_TONES[hash(project) % ROOM_TONES.length];
    // The second line of the plaque. The halves are independent: a version found
    // without a stack means the version alone. Nothing found means there is no line,
    // and the plaque stays one-line, as it was.
    const info = list.find((a) => a.version || a.stack) || {};
    const sub = [info.version, info.stack].filter(Boolean).join(' · ');
    // The repository is a property of the project, not of a session: one agent who
    // knows about it is enough.
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
    // The microwave is to the left of the coffee machine, in the same kitchen
    // corner. Everyone has one: fish can be heated in any room, and that is the whole
    // point.
    // On a shelf rather than on the floor: a person 24 tall covers everything
    // standing at his level — and what has to be looked at here is precisely the window.
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
    // The ficus is grown by the git-tree module — the thing belongs to it, not to
    // the office: walking up to it means looking at the history of the project, and
    // without the module there is nothing to look at. The core keeps only `r.repo`
    // (is there a repository) and the ability to draw a tub if somebody put one
    // there; a room without the module is left with an ordinary flower. The place is
    // the left corner under the window: there are no desks and no coffee machine
    // there, and nobody passes it on the way to their seat.
    // The easel is by the top wall to the right of the door: between the wall and the
    // first row of desks there are 52 pixels of empty floor, and it is the only strip
    // in the room where it blocks nobody's way to their seat. The coffee machine is on
    // the right, the ficus bottom left — it does not argue with those either.
  }

  const w = MARGIN * 2 + GRID_COLS * (rooms[0]?.w || 320) + (GRID_COLS - 1) * GAP_X;
  // a separate room at the bottom, outside the grid of projects: the control room with the cameras
  const security = buildSecurity(w, rowY);
  const meeting = buildMeeting(w, rowY);
  const greenhouse = buildGreenhouse(w, roofY);
  // The rooms of modules. We ask here rather than after the assembly: below, the
  // height of the world is counted and the lift is put together, and a room added
  // later would end up outside the floor and without a stop. The `layout` point will
  // not do for this — it is called on a finished plan and can hang things on it, not
  // rooms. A module gets an anchor (the bottom room of the tier and the width of the
  // floor) and returns a finished room — the core has nothing to compute its geometry
  // with, it does not know about it.
  const extra = (typeof opts.rooms === 'function'
    ? [].concat(opts.rooms({ w, security, meeting, rowY, below: security.y + security.h + CORRIDOR }) || [])
    : []).filter(Boolean);
  const h = Math.max(security.y + security.h, ...extra.map((r) => r.y + r.h)) + MARGIN;
  // The vertical passages between the columns of rooms and along the outer walls.
  // The rooms in every row stand on one grid, so such a passage is free from top to
  // bottom — one can go down it from any corridor into any other.
  const roomW = rooms[0]?.w || 320;
  const lanes = [MARGIN / 2 + 4];
  for (let c = 0; c < GRID_COLS - 1; c++) lanes.push(MARGIN + c * (roomW + GAP_X) + roomW + GAP_X / 2);
  lanes.push(w - MARGIN / 2 - 4);

  // The smoking room is shared by the whole office, so its place is on the service
  // tier, to the left of the control room: on frame 401:2 a dotted 360×138 at
  // x = MARGIN is set aside for it, as much as the other two rooms of the tier take.
  // It has no walls and no door — the dotted line says "here", not "a room like
  // this", and inventing its innards in code is not allowed.
  //
  // It used to stand in the bottom corridor, in the one wide strip that nothing
  // occupied. The tier took that strip, and the smoking room would have ended up on
  // its threshold. Walking to it became longer — an agent whose limit has run out
  // goes down to the first floor — and that is exactly what the smoking room was
  // meant to be.
  const loungeX = MARGIN + 154, loungeY = rowY + 84;
  const lounge = {
    x: loungeX, y: loungeY,
    seats: [
      { x: loungeX - 16, y: loungeY - 1 },
      { x: loungeX + 1, y: loungeY - 1 },
      { x: loungeX + 18, y: loungeY - 1 },
      // there are three places on the sofa, the rest smoke standing next to it
      { x: loungeX + 48, y: loungeY + 2 },
      { x: loungeX + 70, y: loungeY + 2 },
    ],
  };

  // Table football is to the left of the sofa, in the same smoking room. It is the
  // only thing on the floor people step up to in twos: it has two sides, and they can
  // be taken by two agents, by an agent and a person, or by a person alone — then he
  // plays against himself, which is how it goes at a real table.
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
    // the right end of the corridor is now the lift hall — the water cooler and the
    // bench are moved further left, or they stand exactly on the reception desk
    props.push({ kind: i === 0 ? 'cooler' : 'bench', x: MARGIN + 300, y: my + 8 });
    if (i === 0) {
      props.push({ kind: 'bench', x: MARGIN + 150, y: my + 12 });
      // the little language-switch figure: at the entrance, on the walkway, so as to
      // catch the eye before a person goes deeper into the floor
      props.push({ kind: 'lang', x: MARGIN + 118, y: my + 4 });
    }
  });

  props.push({ kind: 'lounge', x: lounge.x, y: lounge.y + 5 });
  props.push({ kind: 'ashtray', x: lounge.x + 36, y: lounge.y + 6 });
  // The bear skin lies in front of the sofa, where a rug belongs: the sofa is the
  // fireplace this office does not have.
  props.push({ kind: 'bearrug', x: lounge.x, y: lounge.y + 22 });
  props.push({ kind: 'kicker', x: kicker.x, y: kicker.y });

  // The landing in front of the conservatory is an ordinary corridor, only the top
  // one, and it has to be laid by hand: flushRow lays a strip above its row, and
  // above the roof there is no row. After props — so that the water cooler, the bench
  // and the corridor ficus do not arrive here: the only furniture on the landing is
  // the lift doors.
  // unshift, not push: the strip is laid FIRST, because the floors in the lift are
  // counted in the order of the strips, and the roof has to end up at the top of the
  // list. With push it stood second to last, between the second floor and the first.
  const topRow = bands.reduce((m, b) => Math.max(m, b.row), 0) + 1;
  bands.unshift({ y: MARGIN, h: CORRIDOR, row: topRow, roof: true });
  const lift = buildLift(w, bands, [...rooms, greenhouse], security, meeting, extra);
  // rooms lie in drawing order — top to bottom, as they were laid. Outwards the
  // project rooms are given in the order of the slots: the first slot is the left room
  // of the bottom row, that is, the first thing somebody entering sees. The default
  // spawn stands on it too, and after the rows were turned around it would have ridden
  // off under the very roof without this sorting.
  const bySlot = [...rooms].sort((a, b) => (SLOTS.get(a.key) ?? 0) - (SLOTS.get(b.key) ?? 0));
  const worldW = Math.max(w + LIFT_W, 640);
  return {
    // The service rooms come after the project ones: the order in the array is the
    // drawing order, and the bottom tier lies below every row with nothing to cover it.
    // projectRooms is for everything that counts projects: the floor plaques, the title
    // screen, the spawn, the cameras. Telling a "room" from a "project" is needed
    // exactly there.
    rooms: [...rooms, security, meeting, greenhouse, ...extra], projectRooms: bySlot, security, meeting, greenhouse,
    byAgent, bands, props, lanes, lounge, kicker, lift,
    wallArt: hangCorridorPictures(worldW),
    w: worldW, h: Math.max(h, 480),
  };
}

// ------------------------------------------------------------------- the lift
// The shaft stands in a strip of its own on the right, past the last column of rooms.
// It must not be put into a passage: the passages are the only way an agent has to go
// down from row to row, and a solid column in the middle of one would lock half the
// floor in.
const LIFT_W = 60;
export const LIFT_DOOR_H = 34;

function buildLift(w, bands, rooms, security, meeting, extra = []) {
  const x = w + 10;
  const byRow = new Map();
  for (const r of rooms) {
    if (!byRow.has(r.y)) byRow.set(r.y, []);
    byRow.get(r.y).push(r.title);
  }
  // A floor is a corridor: the doors of the rooms of its row open onto it. The
  // number is counted from the bottom, as in a house, and taken from the row rather
  // than from a place in a list: a place shifts when a new row grows on top, while a
  // row keeps its number. Otherwise the corridor you are standing in would be renamed
  // under you.
  const floors = bands.map((b) => ({
    n: b.row + 2,
    y: b.y + b.h / 2 + 8,
    rooms: byRow.get(b.y + b.h) || [],
  }));
  // the control room lies below the last row and in spirit is a basement
  // The service tier is the first floor, not a basement. It read as a basement while
  // there was only the control room down there, entered by card: there is no reason to
  // ride there. With the meeting room, which anyone can enter, that stopped being
  // true, and the project corridors moved up by one — floor 2 and onwards. The rooms
  // are listed left to right, as they stand.
  floors.push({
    n: 1, y: security.y - 30, tier: true,
    rooms: [security, meeting].filter(Boolean).sort((a, b) => a.x - b.x).map((r) => r.title),
  });

  // The floor of a module's room is below the service tier and numbered 0 rather
  // than minus one: as a basement it would read as a place there is no reason to go
  // to. A zero also does not shift the numbers of the inhabited floors — they are
  // counted from the row of rooms, while the control-room tier is nailed to one by a
  // separate line above.
  for (const r of extra) {
    floors.push({ n: 0, y: r.y - 30, tier: true, rooms: [r.title] });
  }

  // The reception desk is on every inhabited floor, to the left of the shaft: step
  // out of the cabin and it is in front of you. There is none in the basement: the
  // control room receives no guests.
  // The reception desk stands where there are projects: it counts them on its plaque.
  // On the service tier there are none, and the place the formula below puts it in is
  // taken by the meeting room — and on the approved frame of the tier (401:2) there is
  // no desk at all.
  const reception = floors.filter((f) => !f.tier).map((f) => ({
    n: f.n, rooms: f.rooms,
    x: x - 100, y: f.y - 26, w: 60, h: 12,
    // where the receptionist himself stands and where people talk to him from — on this side of the desk
    who: { x: x - 70, y: f.y - 28 },
    spot: { x: x - 70, y: f.y - 4 },
  }));
  return { x, w: 40, floors, reception };
}

export function blockedByLift(lift, x, y) {
  if (!lift) return false;
  if (x > lift.x - 4 && x < lift.x + lift.w + 4 && y > 24 && y < 1e5) return true;
  // the desk is furniture like any other, people do not walk through it
  for (const r of lift.reception || []) {
    if (x > r.x - 4 && x < r.x + r.w + 4 && y > r.y - 12 && y < r.y + r.h + 4) return true;
  }
  return false;
}

// --------------------------------------------------------------- the meeting room
// The second room of the service tier. It differs from the control room in exactly what
// it was started for: there is no reader by the door — anyone can come here. The wall to
// the corridor is glass, because entering is what switches the microphone on: whether to
// enter has to be decided from outside, and through glass one can see whether a
// conversation is going on.
//
// The numbers are taken off the approved plan 400:2 (it is drawn ×3): a room of 360×138,
// a wall of 26 = WALL, a door at x+34 and 36 wide — the same as the project rooms have,
// a table of 180×44 in the middle, six chairs of 20×14.
const MEET_W = 360, MEET_H = 138;

function buildMeeting(floorW, y) {
  // On the right, by the lift strip. By the brief a guest appears at the lift, and the
  // meeting room has to be the first thing he sees rather than the end of a walk across
  // the whole floor.
  const x = Math.round(floorW - MARGIN - MEET_W);
  const door = { x: x + 34, w: 36 };
  const room = {
    key: '__meeting', title: 'MEETING ROOM', meeting: true,
    service: true, draw: 'meeting', lit: false,
    x, y, w: MEET_W, h: MEET_H, door,
    table: { x: x + 90, y: y + WALL + 34, w: 180, h: 44 },
    // The chairs do not block the floor: between the top row and the table there are
    // two pixels, and if they counted as furniture too, the table could not be
    // approached at all. The table is furniture, a chair is a drawing.
    seats: [110, 170, 230].flatMap((dx) => [
      { x: x + dx, y: y + 44, back: 'top' },
      { x: x + dx, y: y + 106, back: 'bottom' },
    ]),
    // The glass sections: a narrow one to the left of the door, then six of 41 every 6.
    glass: [{ x: x + 6, w: 22 }].concat([0, 1, 2, 3, 4, 5].map((i) => ({ x: x + 76 + i * 47, w: 41 }))),
    agents: [], desks: [], art: [], back: null, coffee: null,
  };
  room.blocks = [{ ...room.table }];
  room.doorPoint = { x: door.x + door.w / 2, y: y + WALL + 16 };
  // Where people stand to talk: the middle of the room by the table, below it.
  room.spot = { x: x + MEET_W / 2, y: y + MEET_H - 22 };
  return room;
}

// ------------------------------------------------------------------ security
// The control room: one per floor, at the bottom, entered by card. Inside is a desk with
// monitors that show any office whole.
const SEC_W = 300, SEC_H = 138;

function buildSecurity(floorW, y) {
  const x = Math.round(floorW / 2 - SEC_W / 2);
  const door = { x: x + Math.round(SEC_W / 2) - 18, w: 36 };
  const sec = {
    key: '__security', title: 'SECURITY', security: true,
    // A service room: it always stands on the bottom tier, takes no slot in the grid
    // of projects and does not take part in the "how many projects on this floor"
    // count. Everything else — the walls, the door, the floor underfoot — is shared
    // with the project rooms, which is why it lies in rooms rather than in a separate
    // field next to it.
    service: true, draw: 'security', lit: false,
    x, y, w: SEC_W, h: SEC_H, door,
    // the reader to the right of the door, on the wall itself
    reader: { x: door.x + door.w + 9, y: y + 6 },
    // the desk with the monitors by the far wall, and that is what people walk up to
    console: { x: x + SEC_W / 2, y: y + WALL + 44, w: 132, h: 22 },
    // the film poster — to the left of the door, on the wall itself: the only piece of
    // wall taken by neither the reader nor the sign
    poster: { x: x + 61, y: y + 3, w: 14, h: 20 },
    // the empty fields of the shared passages: there are no desks, no coffee machine and no second door here
    agents: [], desks: [], art: [], back: null, coffee: null,
  };
  // The desk blocks the floor the same way a table does in a project room. A separate
  // blockedBySecurity used to know that; now it is a rectangle in the data, and the next
  // service room will describe its furniture with the same list.
  // The margin of 4 pixels on the sides is added by blocked() itself, so here it is the
  // bare desk: with the margin the rectangle would diverge from the old one by 8 pixels,
  // and walking past the desk would become slightly tighter than it was yesterday.
  // The furniture of the control room as a list: here it is only the desk. The things of
  // modules are appended to this same list from the layout point — as a rectangle in the
  // data, not as a special case in the engine.
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


// ---------------------------------------------------------------- the conservatory
// The third room without a project — and the only one that stands ON TOP. There is one
// reason and it is the whole point: the conservatory has a glass wall, and behind the
// glass is the same real sky as in the corridor windows — drawSky with the weather and
// the time of day. From below that does not work: there are three more floors above the
// room there. The service tier is taken up entirely as well — the smoking room, the
// control room and the meeting room stand shoulder to shoulder.
//
// The numbers are taken off the approved frame 734:2 (drawn ×3): a room of 420×150, a
// wall of 26 = WALL, a door in the centre 44 wide, shelving at y+60, the tap on the
// right, the bench and the tubs on the floor. The furniture by the bottom wall is
// raised: the last 10 px of the room are wall, and a tub there would end up inside it.
const GREEN_W = 420, GREEN_H = 150;

function buildGreenhouse(floorW, y) {
  const x = Math.round(floorW / 2 - GREEN_W / 2);
  const door = { x: x + 188, w: 44 };
  const room = {
    key: '__greenhouse', title: 'GREENHOUSE', greenhouse: true,
    service: true, draw: 'greenhouse', lit: false,
    x, y, w: GREEN_W, h: GREEN_H, door,
    agents: [], desks: [], art: [], back: null, coffee: null,
  };
  // Seven pots: four on the shelving, three as tubs on the floor. The number is pinned
  // to the place, because it is also the key in the settings: recount the order, and the
  // one watered will not be the one that was watered.
  room.pots = [
    { i: 0, kind: 'flower', x: x + 46, y: y + 60, shelf: true },
    { i: 1, kind: 'cactus', x: x + 78, y: y + 60, shelf: true },
    { i: 2, kind: 'flower', x: x + 110, y: y + 60, shelf: true },
    { i: 3, kind: 'ivy', x: x + 142, y: y + 60, shelf: true },
    { i: 4, kind: 'palm', x: x + 128, y: y + 124 },
    { i: 5, kind: 'ficus', x: x + 172, y: y + 136 },
    { i: 6, kind: 'ficus', x: x + 236, y: y + 112 },
  ];
  // A pot is approached from below — including the one on the shelving: watering goes
  // top down, standing in front of it rather than beside it.
  for (const p of room.pots) p.spot = { x: p.x, y: p.y + (p.shelf ? 30 : 16) };
  room.tap = { x: x + 376, y: y + 50, spot: { x: x + 372, y: y + 104 } };
  room.hook = { x: x + 332, y: y + 56, spot: { x: x + 332, y: y + 100 } };
  room.bench = {
    x: x + 268, y: y + 124, w: 46,
    seats: [{ x: x + 280, y: y + 128 }, { x: x + 302, y: y + 128 }],
  };
  // Furniture takes up the floor exactly where it is drawn. The tubs are furniture too:
  // people no longer walk through the ficus in a project room, and the logic here is the
  // same.
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
  // a long floor without a single easter egg is dull — we hang at least one
  if (!out.length) {
    const span = widestGap(piers);
    if (span) out.push(centred(span, 7, 'hall-0', { egg: true }));
  }
  return out;
}

function hangPictures(r) {
  const span = widestGap([
    [r.x + 12, r.door.x - 5],                      // the niche to the left of the door
    [r.door.x + r.door.w + 5, r.board.x - 6],      // the pier up to the board
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

// ------------------------------------------------------- relative places
// Who stands where, in the terms of the plan rather than in world pixels. It is needed
// because the plan is rebuilt on every change to the cast of agents, and the rows grow
// from the top: let somebody else's project begin, and the whole floor slides down by
// the height of a row. Absolute x/y after that point into the neighbouring room, though
// the person has not taken a step — and during a conversation in the meeting room that
// is the floor going out from under his feet.
//
// The anchor is the nearest room and an offset from its corner. The nearest, not the one
// you are standing inside: in a corridor you stand inside none, but the corridor rides
// along with its row, and holding on to a neighbouring room there is exactly right.
//
// A room is counted together with the corridor above it: that is its floor, its door
// opens onto it. Without that a person in a corridor held on to the row AHEAD — by
// straight distance the room above turns out to be a few pixels nearer than the one this
// corridor leads to. While the rows are of one height the difference is invisible: when a
// row is inserted everything slides by the same amount. It comes out when a fourth agent
// appears in a project, the row becomes taller than the others, and the rows below shift
// by a different amount.
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

// The room could also have disappeared — the project ended while the plan was being
// rebuilt. Then we touch nothing: staying in the old place is better than riding off into
// a corner of the floor.
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
    // A thing has the right to name its own dimensions — otherwise a module cannot put
    // anything of its own into the corridor: the table knows only the kinds listed here,
    // and it has nowhere to learn about foreign ones.
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
    // the tub takes up the floor, the crown hangs above head height and is in nobody's way
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
