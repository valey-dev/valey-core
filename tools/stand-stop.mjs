#!/usr/bin/env node
// node tools/stand-stop.mjs <port> [<port>…] — put out YOUR stand and only yours.
//
//   node tools/stand-stop.mjs 5218          # put it out
//   node tools/stand-stop.mjs 5218 --dry    # only say whose it is
//   node tools/stand-stop.mjs --mine        # list your own and put them all out
//
// It exists for one line of the rulebook: «clean up after yourself by the pid of
// your own process, not by name». On 29 August 2026 a stand was put out with
// `pkill -f "node server/index.js" -n`, where the «only the newest» flag reads
// like a safeguard and is not one: the pattern matches somebody else's office
// too, and which of them started later is a matter of chance. The process on
// 5177 went, and the owner's office was down for a minute. The second trap cost
// a scare on 30 August: `lsof -ti :<port>` answers with the listener AND with
// everyone connected to it, so `xargs kill` over that list would have closed two
// browsers along with the server.
//
// Both are closed here in code rather than in someone's attention:
//   1. only the listening process is taken (-sTCP:LISTEN);
//   2. its working directory is read, and if it is not the tree this was called
//      from, the answer is a refusal naming the owner rather than a kill.
//
// That is what makes it safe to allow whole: «Bash(node tools/stand-stop.mjs *)»
// cannot put out somebody else's office, unlike «Bash(kill *)», where the only
// guard left is care.
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const mine = argv.includes('--mine');
const ports = argv.filter((a) => /^\d+$/.test(a)).map(Number);

const HERE = process.cwd();
const sh = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
};

// Who listens on the port. Listens, precisely: browsers connected to it stay out.
const listenerOf = (port) => {
  const out = sh('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
  return out ? Number(out.split('\n')[0]) : null;
};

// The process's working directory — your own office is recognisable by it at once.
const cwdOf = (pid) => {
  const out = sh('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const line = out.split('\n').find((l) => l.startsWith('n'));
  return line ? line.slice(1) : '';
};

const cmdOf = (pid) => sh('ps', ['-o', 'command=', '-p', String(pid)]);

// Your stands: the offices of this tree. Ports are not guessed but asked of the
// system — a stand may have been raised on any of them.
function myStands() {
  const out = sh('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']);
  const found = new Map();
  let pid = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid) {
      const port = Number((line.match(/:(\d+)$/) || [])[1]);
      if (port && cwdOf(pid) === HERE) found.set(port, pid);
    }
  }
  return [...found.entries()].map(([port, p]) => ({ port, pid: p }));
}

const targets = mine ? myStands() : ports.map((port) => ({ port, pid: listenerOf(port) }));
if (!targets.length) {
  console.log(mine ? 'no stands of this tree found' : 'nothing to stop: name a port or --mine');
  process.exit(0);
}

let stopped = 0, refused = 0;
for (const { port, pid } of targets) {
  if (!pid) { console.log(`${port}: nobody is listening`); continue; }
  const cwd = cwdOf(pid);
  const cmd = cmdOf(pid);
  if (cwd !== HERE) {
    refused += 1;
    console.log(`${port}: NOT OURS — pid ${pid} runs in ${cwd || '?'}, and we are in ${HERE}`);
    console.log('     left running. If it is in the way, that is a word with whoever started it.');
    continue;
  }
  if (!/node\b/.test(cmd)) {
    refused += 1;
    console.log(`${port}: pid ${pid} is not an office but «${cmd.slice(0, 60)}». Left running.`);
    continue;
  }
  if (dry) { console.log(`${port}: ours (pid ${pid}) — would stop it`); continue; }
  try {
    process.kill(pid, 'SIGTERM');
    stopped += 1;
    console.log(`${port}: stopped (pid ${pid})`);
  } catch (err) {
    console.log(`${port}: could not — ${err.message}`);
  }
}

if (refused) console.log(`\nleft running, not ours: ${refused}`);
if (!dry && stopped) console.log(`stopped, ours: ${stopped}`);
