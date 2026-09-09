#!/usr/bin/env node
// Rendering the pictures a feature note declares.
//
//   node tools/notes-shots.mjs              # every fragment waiting for the release
//   node tools/notes-shots.mjs arrows-stop  # one of them
//   node tools/notes-shots.mjs --keep       # leave the demo office up to look at
//
// The pictures are taken in the feature branch, next to the fragment, and not
// at release time. Two reasons. The office being photographed has to be the one
// carrying the feature, and by release time the branch is merged and gone; and
// a release that needs Chrome is a release that cannot be cut on a machine
// without one.
//
// -------------------------------------------------------------- the office
//
// The floor is invented at the source, not scrubbed afterwards. These frames go
// into a public repository, and a photograph of a real office is a photograph of
// real project names and real branch names — that is exactly how real data
// reaches a public page. `fakeClaudeDir` exists for this and is what the stands
// use, so the demo cast is the same one they check against.
//
// The office is raised without VALEY_STAND: the yellow plaque is for whoever is
// testing, and it has no business in a picture that ships with the release.
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFragments, shotSource, UNRELEASED } from './notes.mjs';
import { startOffice, fakeClaudeDir, waitForAgent } from './lib/office.mjs';

const ROOT = process.env.VALEY_REPO
  ? path.resolve(process.env.VALEY_REPO)
  : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const die = (m) => { console.error('notes-shots: ' + m); process.exit(1); };

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const only = argv.find((a) => !a.startsWith('--')) || '';

let fragments;
try { fragments = readFragments(ROOT); } catch (err) { die(err.message); }
if (only) fragments = fragments.filter((f) => f.slug === only);
const wanted = fragments.filter((f) => (f.shots || []).length);
if (!wanted.length) die(only ? `${only} declares no shots` : 'no fragment waiting for the release declares a shot');

// The cast. Invented people, invented projects, invented branches — and three of
// them, because an office with one person in it looks broken rather than quiet.
const CAST = [
  { slot: 'a', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000a', cwd: '/Users/kolya/Projects/rocket-shop',
    branch: 'feature/cart-discount', asked: 'Calculate the discount in the cart',
    said: 'Done: the cart calculates the discount and its test is green.',
    file: '/Users/kolya/Projects/rocket-shop/src/cart.js' },
  { slot: 'b', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000b', cwd: '/Users/kolya/Projects/tide-charts',
    branch: 'fix/timezone-drift', asked: 'The chart is an hour off after the clocks change',
    said: 'Found it: the chart was drawn in local time and the data comes in UTC.',
    file: '/Users/kolya/Projects/tide-charts/src/chart.js' },
  { slot: 'c', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000c', cwd: '/Users/kolya/Projects/paper-radio',
    branch: 'feature/sleep-timer', asked: 'Add a sleep timer',
    said: 'The timer is in. It fades the volume out over the last minute.',
    file: '/Users/kolya/Projects/paper-radio/src/timer.js' },
];

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-notes-shots-'));
let claudeDir = null;
for (const who of CAST) claudeDir = (await fakeClaudeDir(tmp, who)).dir;

const office = await startOffice({ claudeDir, root: ROOT });
console.log(`demo office on ${office.base}`);
try {
  await waitForAgent(async () => (await fetch(office.base + '/api/state')).json());
} catch (err) {
  if (!keep) await office.stop();
  die('the invented agents never appeared on the floor: ' + err.message);
}

const shotTool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shot.mjs');
let taken = 0;
for (const f of wanted) {
  mkdirSync(path.join(ROOT, UNRELEASED, f.slug), { recursive: true });
  for (const sh of f.shots) {
    const out = path.join(ROOT, shotSource(f.slug, sh.id));
    const args = ['--url', office.base + '/' + (sh.url || ''), '--out', out];
    if (sh.keys) args.push('--keys', sh.keys);
    if (sh.viewport) args.push('--viewport', sh.viewport);
    const r = spawnSync(process.execPath, [shotTool, ...args], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
      if (!keep) await office.stop();
      die(`${f.slug}/${sh.id} was not taken`);
    }
    console.log(`  ${shotSource(f.slug, sh.id)}`);
    taken += 1;
  }
}

if (keep) {
  console.log(`\n--keep: the demo office stays up on ${office.base}`);
  console.log('stop it with ctrl-c');
  await new Promise(() => {});
}
await office.stop();
await fsp.rm(tmp, { recursive: true, force: true });
console.log(`\n${taken} picture${taken > 1 ? 's' : ''} rendered`);
