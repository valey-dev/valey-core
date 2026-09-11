// Desk trinkets: an agent who has been in the office a long time and has talked
// a lot gets small things on the desk — a duck on the monitor, a cactus, a cup.
// Frame «Приколюхи на столах ветеранов · Ready for Dev», approved 11 September
// 2026. Nothing announces them: no toast, no counter, the desk just becomes
// somebody's.
//
// This file is shared by the server and the canvas. The server counts the tier
// (it alone reads the transcript) and hands out one digit; the canvas turns the
// digit and the agent's id into things. Keeping both halves here means the
// thresholds exist in exactly one place.
import { hash } from './sprites.js';

const DAY = 24 * 60 * 60 * 1000;

// Both axes are required at every rung: [days of conversation, replies]. One
// without the other is not a veteran — a chat left open for a week and never
// used, or yesterday's chatterbox, both keep the mug. The rungs are absolute
// rather than "top of the floor", so an earned thing never moves to somebody
// else's desk because a neighbour overtook. Calibrated on 10 September 2026
// against a live floor of 18 agents: median 16 replies, top tenth 175, the most
// talkative 674 — the first rung is meant for a few, not for half the room.
export const TIERS = [[1, 100], [3, 300], [7, 800]];

// The age of the conversation, not of the process: `bornAt` is the first reply
// in the transcript. startedAt comes from ~/.claude/sessions/<pid>.json and
// resets on every restart of the app, which would strip every veteran at once.
export function trinketTier(bornAt, replies, now) {
  if (!bornAt || !Number.isFinite(replies) || !Number.isFinite(now)) return 0;
  const days = (now - bornAt) / DAY;
  let tier = 0;
  for (const [d, r] of TIERS) {
    if (days < d || replies < r) break;
    tier++;
  }
  return tier;
}

// Three slots, filled in this order: the monitor first — the most visible place
// goes to the first thing earned — then the left end, then the right. Each slot
// has its own pool: on the monitor stands what reads as a figurine, at the ends
// what stands on a desk. The cup lives only on the right, so only the third
// rung can bring it.
const SLOTS = ['monitor', 'left', 'right'];
export const POOL = {
  monitor: ['duck', 'bobble', 'globe'],
  left: ['cactus', 'lava', 'sticky', 'flag', 'photo'],
  right: ['trophy', 'cans'],
};

// The set is the agent's own and never changes, like the looks in lookOf: the
// same id always draws the same things. Each slot hashes separately so two
// veterans with the same monitor duck still differ at the ends.
export function trinketsOf(id, tier) {
  const out = [];
  const n = Math.max(0, Math.min(tier | 0, SLOTS.length));
  for (let i = 0; i < n; i++) {
    const slot = SLOTS[i];
    const pool = POOL[slot];
    out.push({ slot, name: pool[hash(`trinket:${slot}:${id}`) % pool.length] });
  }
  return out;
}

// Pixel maps, one letter a pixel, the bottom row on the baseline. The same maps
// the frame was drawn from, so the office and the mock-up cannot drift apart.
const PAL = {
  Y: '#f2c94c', O: '#e07b39', k: '#2b2118', H: '#3a2a20', S: '#e8ad7e', B: '#4a7fa8',
  W: '#bfe3f0', w: '#ffffff', b: '#6b4a2e', G: '#4a7a3c', g: '#9fe0a8', P: '#a35c3c',
  C: '#5a5a66', L: '#6b3a5a', o: '#ff9f5a', y: '#ffd166', p: '#ff9f8f', R: '#c24b3f',
  q: '#8a6247', A: '#e0b040', a: '#ffe08a', F: '#6b4a2e', c: '#d98a3c', K: '#2b2b33',
  E: '#3f6a48',
};
export const SPRITES = {
  duck: ['..YY.', '.YYkO', 'YYYY.', '.YYY.'],
  bobble: ['HHH', 'SSS', '.B.', 'BBB'],
  globe: ['.WW.', 'WwWw', 'WWwW', 'bbbb'],
  cactus: ['.G.', 'GG.', '.GG', '.G.', 'PPP', 'PPP'],
  lava: ['.C.', 'LoL', 'LLL', 'oLo', 'LLL', 'CCC'],
  sticky: ['.yyy', 'pppp', 'ggg.', 'yyyy'],
  flag: ['qRR', 'qRR', 'q..', 'q..', 'q..', 'bb.'],
  photo: ['FFFFF', 'FcFcF', 'FkckF', 'FcccF', 'FFFFF'],
  trophy: ['AAAAA', '.AaA.', '..A..', '.bbb.', '.bbb.'],
  cans: ['.R.E.', '.R.E.', 'E.K.E', 'E.K.E'],
};

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

function drawSprite(ctx, name, left, baseY) {
  const rows = SPRITES[name];
  if (!rows) return;
  const top = baseY - rows.length + 1;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = PAL[row[i]];
      if (c) px(ctx, left + i, top + j, 1, 1, c);
    }
  });
}

// Where each slot stands on a desk anchored at (x, y) — the geometry of drawDesk
// in office.js: the monitor spans x+2..x+18 with its top at y-9, the desk top
// is at y+2, the paper sits at the left end and the mug at the right.
export function drawTrinkets(ctx, x, y, list) {
  for (const { slot, name } of list) {
    const w = SPRITES[name] ? SPRITES[name][0].length : 0;
    if (slot === 'monitor') drawSprite(ctx, name, x + 10 - Math.floor(w / 2), y - 10);
    else if (slot === 'left') drawSprite(ctx, name, x - 22, y + 1);
    else if (slot === 'right') drawSprite(ctx, name, x + 19, y + 1);
  }
}
