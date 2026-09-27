// Agents as inhabitants: they sit, get up, wander to the coffee corner and
// walk over to the board when they finish something.
import { WALL } from './layout.js';
import { t as tr } from './i18n.js';

const SPEED = 0.42;
const rnd = (a, b) => a + Math.random() * (b - a);

function aislesOf(room) {
  const set = new Set(room.desks.map((d) => d.aisle));
  set.add(room.y + room.h - 24);
  return [...set].sort((a, b) => a - b);
}

function nearestAisle(room, y) {
  return aislesOf(room).reduce((best, a) => (Math.abs(a - y) < Math.abs(best - y) ? a : best), aislesOf(room)[0]);
}

const atDesk = (room, p) => room.desks.some((d) => Math.abs(p.x - d.x) < 4 && Math.abs(p.y - d.y) < 4);

// step out sideways first, so nobody walks through their own desk
function sidestep(room, p) {
  const dx = p.x + 46 > room.x + room.w - 16 ? -46 : 46;
  return { x: p.x + dx, y: p.y };
}

function pathTo(room, from, to) {
  const lane = room.x + 20;
  const a1 = nearestAisle(room, from.y);
  const a2 = nearestAisle(room, to.y);
  const path = [];
  if (atDesk(room, from)) { const s = sidestep(room, from); path.push(s, { x: s.x, y: a1 }); }
  else path.push({ x: from.x, y: a1 });
  if (a1 !== a2) path.push({ x: lane, y: a1 }, { x: lane, y: a2 });
  if (atDesk(room, to)) { const s = sidestep(room, to); path.push({ x: s.x, y: a2 }, s, to); }
  else path.push({ x: to.x, y: a2 }, { x: to.x, y: to.y });
  return path;
}

// The route into the corridor and back. A room is a closed corner with one door
// out, so a path is always assembled from three pieces: across the room to the
// door, along the corridor of its own row to the vertical passage, and along that
// to the corridor needed.
const nearestLane = (L, x) => (L.lanes || []).reduce((best, l) => (Math.abs(l - x) < Math.abs(best - x) ? l : best), (L.lanes || [0])[0]);

function pathOut(L, room, from, to) {
  const doorIn = { x: room.doorPoint.x, y: room.y + WALL + 16 };
  const doorOut = { x: room.doorPoint.x, y: room.y - 12 };
  const lane = nearestLane(L, to.x);
  return [
    ...pathTo(room, from, doorIn),
    doorOut,
    { x: doorOut.x, y: room.bandY },
    { x: lane, y: room.bandY },
    { x: lane, y: to.y },
    to,
  ];
}

function pathHome(L, room, from, to) {
  const lane = nearestLane(L, from.x);
  const doorOut = { x: room.doorPoint.x, y: room.y - 12 };
  const doorIn = { x: room.doorPoint.x, y: room.y + WALL + 16 };
  return [
    { x: lane, y: from.y },
    { x: lane, y: room.bandY },
    { x: doorOut.x, y: room.bandY },
    doorOut, doorIn,
    ...pathTo(room, doorIn, to),
  ];
}

// A place in the smoking room is pinned to an agent so that two do not sit on top
// of each other. The sides of the table football go out first, the sofa after:
// two at the table is more interesting than three on the sofa, and it is the first
// thing visible from the corridor. There are exactly two places at the table — a
// third one sits down to smoke rather than waiting his turn.
function loungeSpots(L) {
  return [...(L.kicker ? L.kicker.sides : []), ...L.lounge.seats];
}

function loungeSeat(L, actors, act) {
  const spots = loungeSpots(L);
  const kicks = L.kicker ? L.kicker.sides.length : 0;
  const taken = new Set();
  for (const other of actors.values()) if (other !== act && other.seatIdx != null) taken.add(other.seatIdx);
  let idx = act.seatIdx != null && !taken.has(act.seatIdx) ? act.seatIdx : -1;
  if (idx < 0) {
    idx = spots.findIndex((_, i) => !taken.has(i));
    if (idx < 0) idx = spots.length - 1;
  }
  act.seatIdx = idx;
  act.kicking = idx < kicks;
  return spots[idx];
}

// Is a side of the table still free — so as not to call a third to play a game for two.
function kickerFree(L, actors) {
  if (!L.kicker) return false;
  const taken = new Set();
  for (const a of actors.values()) if (a.seatIdx != null) taken.add(a.seatIdx);
  return L.kicker.sides.some((_, i) => !taken.has(i));
}

// How many works the agent has put up. A guest never receives the artifacts
// field at all — it is not in SHOWN on the server, and that is a decision, not
// an omission: another agent's board opens by consent. The client has to
// survive its absence, or syncActors throws on a guest's first agent and the
// office shows rooms with no people in them — the plan is built a line before
// the actors are placed. Found on 5 September 2026 during a two-machine test.
const artifactsOf = (a) => (a.artifacts || []).length;

// From the portal to the desk. The portal opens next to the owner, who may be
// in the corridor at the reception, in the agent's own room, or in another
// room entirely: out of that one first, then home the way agents come back
// from the lounge.
function pathFrom(L, from, room, desk) {
  const inside = L.rooms.find((r) => from.x > r.x && from.x < r.x + r.w && from.y > r.y && from.y < r.y + r.h) || null;
  if (inside === room) return pathTo(room, from, desk);
  let start = from, head = [];
  if (inside && inside.doorPoint && inside.bandY != null) {
    const out = { x: inside.doorPoint.x, y: inside.bandY };
    head = pathOut(L, inside, from, out);
    start = out;
  }
  return [...head, ...pathHome(L, room, start, desk)];
}

// `arriving` answers where a new agent just hired from the office steps out
// of its portal (web/office.js, drawPortal), or nothing for everyone else —
// they appear at their desks, as they always have.
export function syncActors(actors, agents, L, arriving = () => null) {
  const live = new Set();
  for (const a of agents) {
    const spot = L.byAgent.get(a.id);
    if (!spot) continue;
    live.add(a.id);
    let act = actors.get(a.id);
    if (!act) {
      act = {
        id: a.id, room: spot.room, seat: spot.desk,
        x: spot.desk.x, y: spot.desk.y, state: 'sit', path: [], until: 0,
        dir: 0, frame: 0, artifacts: artifactsOf(a), showcase: 0, nextIdea: performance.now() + rnd(8000, 60000),
      };
      actors.set(a.id, act);
      const from = arriving(a, spot.room);
      if (from) {
        act.x = from.x; act.y = from.y;
        act.path = pathFrom(L, from, spot.room, spot.desk); act.state = 'walk';
        act.portalAt = performance.now();
      }
    } else if (act.room.key === spot.room.key && act.seat.i === spot.desk.i) {
      // The same desk in the same room — the plan has simply been rebuilt. A
      // comparison by reference counted this as a move and sent the person walking
      // to the "new" desk: on every rebuild the whole floor stood up and went
      // somewhere. We carry him along with the furniture by the same amount the
      // room moved.
      const dx = spot.desk.x - act.seat.x, dy = spot.desk.y - act.seat.y;
      act.room = spot.room; act.seat = spot.desk;
      if (dx || dy) {
        act.x += dx; act.y += dy;
        for (const p of act.path) { p.x += dx; p.y += dy; }
      }
    } else if (act.seat !== spot.desk || act.room !== spot.room) {
      act.room = spot.room; act.seat = spot.desk;
      act.path = pathTo(spot.room, act, spot.desk); act.state = 'walk';
    }
  }
  for (const id of [...actors.keys()]) if (!live.has(id)) actors.delete(id);
}

// at most a fifth of a room is away from their desk at any moment
function strollBudget(actors, room) {
  let walking = 0;
  for (const a of actors.values()) if (a.room === room && a.state !== 'sit') walking++;
  return Math.max(1, Math.ceil(room.desks.length * 0.2)) - walking;
}

export function tickActors(actors, agents, L, dt, now, emit) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  for (const act of actors.values()) {
    const a = byId.get(act.id);
    if (!a) continue;
    const room = act.room;

    // finished something new -> take it to the board
    if (artifactsOf(a) > act.artifacts) {
      act.artifacts = artifactsOf(a);
      const b = room.board;
      act.path = pathTo(room, act, { x: b.x + b.w / 2, y: room.y + WALL + 20 });
      act.state = 'walk'; act.until = now + 22000; act.showcase = now + 22000;
      emit({ kind: 'news', agent: a, text: tr('news.pinned', { name: a.name, a: a.gender === 'f' ? 'а' : '' }) });
    }

    // The limit has run out — there is nothing to work with, and the agent leaves
    // for the smoking room. He will come back to the desk by himself as soon as the
    // access appears: the state is led by the snapshot, not by a timer.
    // There are two reasons for leaving: the limit ran out — there is nothing to
    // work with — or he was simply called to the table. The second lives in the
    // wantPlay flag, and the clock of the game is started not here but on arrival:
    // the smoking room is across the whole floor, and a timer started in the room
    // ran out before the agent got there — he would turn around at the very table
    // and walk back, never having played.
    if (act.wantPlay && act.playUntil && now > act.playUntil) {
      act.wantPlay = false; act.playUntil = 0;
    }
    const wantLounge = (!!a.limited || !!act.wantPlay) && !!L.lounge;
    if (wantLounge !== !!act.lounge && !act.path.length) {
      act.lounge = wantLounge;
      if (wantLounge) {
        act.path = pathOut(L, room, act, loungeSeat(L, actors, act));
      } else {
        act.path = pathHome(L, room, act, act.seat);
        act.seatIdx = null; act.kicking = false; act.playUntil = 0; act.wantPlay = false;
      }
      act.state = 'walk';
      act.until = 0; act.showcase = 0;
    }

    if (act.path.length) {
      const p = act.path[0];
      const dx = p.x - act.x, dy = p.y - act.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.2) { act.x = p.x; act.y = p.y; act.path.shift(); }
      else {
        const step = Math.min(d, SPEED * dt);
        act.x += (dx / d) * step; act.y += (dy / d) * step;
        act.dir = Math.abs(dx) > 0.3 ? Math.sign(dx) : act.dir;
        act.state = 'walk';
      }
      if (!act.path.length) {
        const home = Math.abs(act.x - act.seat.x) < 2 && Math.abs(act.y - act.seat.y) < 2;
        // At the table people stand rather than sit, and look at it rather than at the wall
        if (act.lounge && act.kicking) {
          act.state = 'stand';
          act.dir = L.kicker.x > act.x ? 1 : -1;
        } else act.state = home || act.lounge ? 'sit' : 'stand';
        // Came to play — the clock of the game started here. It is set for the one
        // who did not get a side as well: otherwise he would stay smoking on the
        // sofa forever.
        if (act.lounge && act.wantPlay && !act.playUntil) act.playUntil = now + rnd(25000, 60000);
        if (!act.until && !act.lounge) act.until = now + rnd(3000, 9000);
      }
      continue;
    }

    // on the sofa nobody is in a hurry: until the limit comes back, he sits
    if (act.lounge) continue;

    // standing around -> head home when the timer runs out
    if (act.state === 'stand') {
      if (now > act.until) { act.path = pathTo(room, act, act.seat); act.until = 0; act.showcase = 0; }
      continue;
    }

    // sitting: working agents stay put, the rest wander off now and then
    if (now < act.nextIdea) continue;
    act.nextIdea = now + rnd(25000, 70000);
    if (a.status === 'working') continue;
    if (Math.random() > (a.status === 'awaiting' ? 0.28 : 0.1)) continue;
    if (strollBudget(actors, room) <= 0) continue;

    // Someone resting — the one with nothing to do right now — sometimes goes not
    // to the coffee machine but down, to the smoking room, to the table. He leaves
    // only if a side of the table is free: a game for two, not a queue of four.
    if (L.kicker && a.status === 'idle' && kickerFree(L, actors) && Math.random() < 0.45) {
      act.wantPlay = true; act.playUntil = 0;
      continue;
    }

    const roll = Math.random();
    let target;
    if (roll < 0.4) target = { x: room.coffee.x - 22, y: room.coffee.y - 6 };
    else if (roll < 0.6) target = { x: room.board.x + room.board.w / 2, y: room.y + WALL + 20 };
    else {
      const mate = room.desks[Math.floor(Math.random() * room.desks.length)];
      target = { x: mate.x - 26, y: mate.y + 26 };
    }
    act.path = pathTo(room, act, target);
    act.state = 'walk';
    act.until = now + rnd(6000, 16000);
  }
}
