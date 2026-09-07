#!/usr/bin/env node
// Who am I in the office — for signing a Brief, a frame or a report.
//
//   node tools/whoami.mjs           # prints «Серёжа · a381d812»
//   node tools/whoami.mjs --line    # a line ready to paste into a Brief
//   node tools/whoami.mjs --json
//   node tools/whoami.mjs --port 5189
//
// Why the id and not just the name. A name is not a pure function of the
// session: `assignNames` picks it from a hash of the session id, but skips to
// the next free one when a neighbour already holds it, remembers the choice on
// disk, re-homes agents that were numbered when the pool ran dry, and reads the
// whole thing from a pack the office can switch. So the same session is «Тася»
// today and something else in a file opened next month, and two agents a week
// apart share a name honestly.
//
// The session id does not move. Eight hex characters of it are enough to tell
// any two agents of this office apart, and short enough to sit in a Figma
// caption. So a signature is the name for a human and the id for certainty:
// «Тася · 43235d0a». Drop the name and nobody recognises the author; drop the
// id and in a month nobody can prove which agent that was.
//
// The office is asked rather than the disk, because the name lives in the
// office's settings and nowhere else. If it is not running there is no name to
// find, and saying so is better than inventing one.
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
};
const PORT = arg('port', process.env.VALEY_PORT || '5177');
const BASE = `http://127.0.0.1:${PORT}`;
const asJson = process.argv.includes('--json');
const asLine = process.argv.includes('--line');

// The working directory is the key: one agent, one worktree — that is the rule
// this project already lives by, so cwd identifies the session without asking
// the session anything about itself.
const here = process.cwd();

let agents = [];
try {
  const r = await fetch(BASE + '/api/state');
  if (r.ok) agents = (await r.json()).agents || [];
} catch { /* the office is not running — handled below */ }

if (!agents.length) {
  console.error(`whoami: the office on ${PORT} is not responding; the name lives there and must not be invented`);
  process.exit(1);
}

// An exact directory first; a parent second, for a run from a subdirectory.
const mine = agents.find((a) => a.cwd === here)
  || agents.find((a) => a.cwd && here.startsWith(a.cwd + '/'));

if (!mine) {
  console.error(`whoami: the office has no agent whose working directory is ${here}`);
  console.error('   The session may have just started and not reached the snapshot yet.');
  process.exit(1);
}

const short = String(mine.id).replace(/-/g, '').slice(0, 8);
const sign = `${mine.name} · ${short}`;

if (asJson) {
  console.log(JSON.stringify({ name: mine.name, id: mine.id, short, branch: mine.branch || null, cwd: mine.cwd }, null, 2));
} else if (asLine) {
  // The date is written out in full, as everywhere else in a Brief: «05.09» in a
  // file that lives for months is a riddle about the year.
  const d = new Date();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const when = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  console.log(`${sign} · ${when}${mine.branch ? ' · ' + mine.branch : ''}`);
} else {
  console.log(sign);
}
