// node tools/test-deliver.mjs — finding the CLI and stopping a run that hangs.
//
// Two things found on 13 September 2026, both in server/deliver.js. The lookup
// raised its «checked» flag before the shell answered, so a second caller in
// those seconds — the tick and a task sent at the same moment — was told the CLI
// was not installed; reproduced on this machine with one Promise.all. And a run
// that ignored SIGTERM held its agent «busy» until the server restarted.
//
// The CLI here is a script of the stand's own: the real one is not asked
// and nothing reaches a live chat.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findCli, forgetCli } from '../server/deliver.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 300) : JSON.stringify(got)); }
};
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-deliver-'));

// --- one lookup at a time ------------------------------------------------
let asked = 0;
const slow = async () => { asked++; await nap(50); return { checked: true, path: '/fake/claude', error: null, errorKey: null, at: Date.now() }; };
forgetCli();
const [a, b] = await Promise.all([findCli(slow), findCli(slow)]);
ok('a second caller during the lookup gets the answer, not «not installed»', a.path === '/fake/claude' && b.path === '/fake/claude', b);
ok('and the shell is asked once for both', asked === 1, asked);
ok('a found CLI is kept', (await findCli(slow)).path === '/fake/claude' && asked === 1, asked);

// forgetCli halfway through a lookup: the old answer must not land on top
forgetCli();
let late = null;
const stale = findCli(async () => { await nap(80); return { checked: true, path: '/old/claude', error: null, errorKey: null, at: Date.now() }; });
forgetCli();
const fresh = await findCli(slow);
late = await stale;
ok('a lookup dropped by forgetCli answers only those who waited for it', late.path === '/old/claude' && fresh.path === '/fake/claude', { late, fresh });
ok('and does not overwrite the newer answer', (await findCli(slow)).path === '/fake/claude');

// --- a miss is not forever ------------------------------------------------
const miss = async () => { asked++; return { checked: true, path: null, error: 'claude was not found in PATH', errorKey: 'err.noCli', at: Date.now() }; };
forgetCli(); asked = 0;
await findCli(miss);
await findCli(miss);
ok('a miss is kept for a while', asked === 1, asked);
const realNow = Date.now;
Date.now = () => realNow() + 61_000;
try {
  const again = await findCli(slow);
  ok('and asked again after a minute — the CLI may have been installed meanwhile', again.path === '/fake/claude' && asked === 2, { asked, again });
} finally { Date.now = realNow; }

forgetCli();
await fsp.rm(dir, { recursive: true, force: true });

if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');
process.exit(0);
