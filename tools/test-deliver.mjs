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
import { findCli, forgetCli, deliver, isBusy } from '../server/deliver.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 300) : JSON.stringify(got)); }
};
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-deliver-'));
// Node rather than sh: /bin/sh on macOS is bash, and `trap '' TERM; exec sleep`
// hands sleep a TERM it no longer ignores — the first version of this stand
// passed with the SIGKILL taken out, because its CLI died on the SIGTERM.
const script = async (name, body) => {
  const p = path.join(dir, name);
  await fsp.writeFile(p, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  return p;
};
// The timeout must outlast node's start-up, or the fake dies of SIGTERM before
// it has learned to ignore it — at 150 ms that is what happened.
const SLOW = { timeout: 1500, grace: 200 };
const STUBBORN = "process.on('SIGTERM', () => {}); setTimeout(() => {}, 20000);";

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

// --- the run itself -------------------------------------------------------
const agent = (id) => ({ id, name: id, cwd: dir });
const run = async (bin, id, opts) => {
  forgetCli();
  process.env.CLAUDE_BIN = bin;
  const task = { text: 'hello' };
  const t0 = Date.now();
  await deliver(task, agent(id), 'default', opts);
  return { task, ms: Date.now() - t0 };
};

const fine = await run(await script('fine', "console.log('done: ' + process.argv.slice(2).join(' '));"), 'fine');
ok('an ordinary run is delivered with its reply', fine.task.state === 'delivered' && /--resume fine -p hello/.test(fine.task.reply), fine.task);

const stubborn = await run(await script('stubborn', STUBBORN), 'stubborn', SLOW);
ok('a run that ignores SIGTERM is killed after the grace', stubborn.task.state === 'failed' && stubborn.ms < 8000, stubborn);
ok('its failure says it was stopped, not «exited with code null»', stubborn.task.errorKey === 'err.timedOut' && !/null/.test(stubborn.task.error), stubborn.task);
ok('and the agent is free again', !isBusy('stubborn'));

// a child of the run keeps stdout open after the run itself is killed
const orphan = await run(await script('orphan',
  `require('node:child_process').spawn('sleep', ['20'], { stdio: 'inherit' }); ${STUBBORN}`), 'orphan', SLOW);
ok('a run whose child holds the pipes still finishes', orphan.task.state === 'failed' && orphan.ms < 8000, orphan);
ok('and frees its agent', !isBusy('orphan'));

delete process.env.CLAUDE_BIN;
forgetCli();
await fsp.rm(dir, { recursive: true, force: true });

if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');
// the orphaned sleep from the last case holds nothing of ours, but it is a child
process.exit(0);
