#!/usr/bin/env node
// Rendering the pictures a feature note declares.
//
//   node tools/notes-shots.mjs                    # every fragment waiting for the release
//   node tools/notes-shots.mjs arrows-stop        # one of them
//   node tools/notes-shots.mjs --keep             # leave the demo office up to look at
//   node tools/notes-shots.mjs --before           # the same recipes on the last release
//   node tools/notes-shots.mjs --before v0.20.0   # or on a particular one
//
// ------------------------------------------------------------------ before
//
// `--before` is why a fragment carries a recipe rather than a picture. The same
// recipe is replayed against a worktree of an older tag — old server, old office,
// same walk — and the frame lands beside the new one as the «before» half of the
// pair. It is not declared in the front matter: whether a comparison is worth
// making is a judgement, not a property of the feature.
//
// What no script can check is whether the old office understood the recipe. A
// room added by this feature does not exist on the old tag, a key does nothing
// there, and the walk quietly ends up somewhere else — the frame comes back
// looking plausible and showing the wrong place. So the run says it out loud:
// a «before» frame has to be looked at before it is committed.
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
// The office is raised with PICTURE_ENV from tools/lib/office.mjs: whatever
// speaks to the owner — the yellow stand plaque, the release-video nudge — has
// no business in a picture that ships with the release.
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFragments, shotSource, beforeSource, cmpTag, UNRELEASED } from './notes.mjs';
import { startOffice, fakeClaudeDir, waitForAgent, PICTURE_ENV } from './lib/office.mjs';

const ROOT = process.env.VALEY_REPO
  ? path.resolve(process.env.VALEY_REPO)
  : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const die = (m) => { console.error('notes-shots: ' + m); process.exit(1); };

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const at = argv.indexOf('--before');
// `at + 1` is the tag that belongs to --before, not a slug. Without the `at >= 0`
// guard it is index 0 whenever the flag is absent, which swallowed the slug.
const only = argv.find((a, i) => !a.startsWith('--') && !(at >= 0 && i === at + 1)) || '';
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();

// The tag to replay on: the one given, or the newest release there is.
let before = null;
if (at >= 0) {
  const tags = git('tag', '-l', 'v[0-9]*').split('\n').filter(Boolean).sort(cmpTag);
  if (!tags.length) die('this repository has no releases to replay against');
  before = argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : tags[tags.length - 1];
  if (!tags.includes(before)) die(`there is no tag ${before}`);
}

let fragments;
try { fragments = readFragments(ROOT); } catch (err) { die(err.message); }
if (only) fragments = fragments.filter((f) => f.slug === only);
const wanted = fragments.filter((f) => (f.shots || []).length);
if (!wanted.length) die(only ? `${only} declares no shots` : 'no fragment waiting for the release declares a shot');

// The cast. Invented people, invented projects, invented branches — and more than
// one, because an office with one person in it looks broken rather than quiet.
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
  // Three more in rocket-shop, since 13 September 2026: the standup gives a project
  // the whole width, and with one person a project nothing in the picture showed
  // it — a row of three and one below does.
  { slot: 'd', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000d', cwd: '/Users/kolya/Projects/rocket-shop',
    branch: 'feature/checkout-address', asked: 'Check the delivery address before payment',
    said: 'The address form checks the postcode before it lets you pay.',
    file: '/Users/kolya/Projects/rocket-shop/src/checkout.js' },
  { slot: 'e', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000e', cwd: '/Users/kolya/Projects/rocket-shop',
    branch: 'feature/lazy-photos', asked: 'Load product photos as the page scrolls',
    said: 'Photos load as you scroll; the first screen is 40% lighter.',
    file: '/Users/kolya/Projects/rocket-shop/src/gallery.js' },
  { slot: 'f', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000f', cwd: '/Users/kolya/Projects/rocket-shop',
    branch: 'fix/stock-after-refund', asked: 'Stock goes negative after a refund',
    said: 'A refund puts the item back once now, not twice.',
    file: '/Users/kolya/Projects/rocket-shop/src/stock.js' },
];

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-notes-shots-'));
let claudeDir = null;
const cast = new Map();
for (const who of CAST) { const made = await fakeClaudeDir(tmp, who); cast.set(who.slot, made); claudeDir = made.dir; }

// A line into a cast member's transcript, stamped now — the office follows the
// file and picks it up on its next tick.
const append = (who, o) => fsp.appendFile(who.transcript, JSON.stringify({ timestamp: new Date().toISOString(), ...o }) + '\n');
const statusOf = async (id) => ((await (await fetch(office.base + '/api/state')).json()).agents || []).find((a) => a.id === id)?.status;

// `interrupt: <slot>` — see SHOT_FIELDS in notes.mjs. On a --before run the old
// office may not know the state it is being shown, so it is waited for only on
// this one: there the frame is the «before» half and shows whatever the old
// office made of the same transcript.
async function interrupt(slot) {
  const who = cast.get(slot);
  if (!who) die(`interrupt: there is no cast member ${slot}; the cast is ${[...cast.keys()].join(', ')}`);
  await append(who, { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } });
  for (let i = 0; i < 40; i++) {
    if (before || (await statusOf(who.sessionId)) === 'stopped') return who;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (before) return who;
  die(`interrupt: ${slot} never read as stopped — the office did not pick the line up`);
}
async function resume(who) {
  await append(who, { type: 'user', message: { role: 'user', content: 'continue' } });
  await append(who, { type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', stop_reason: 'end_turn', content: [{ type: 'text', text: who.said }] } });
}

// The old office is a detached worktree of the tag — its own server, its own
// web/. It goes outside the checkout: a worktree under it gets walked by every
// file watcher in the project.
let worktree = null;
if (before) {
  worktree = await fsp.mkdtemp(path.join(os.tmpdir(), `valey-${before}-`));
  git('worktree', 'add', '-q', '--detach', worktree, before);
  console.log(`replaying on ${before}, in a worktree of it`);
}

// These frames go to a public repository, so the office is raised with
// PICTURE_ENV: no stand plaque from the caller's shell, no release-video nudge
// on the entrance. Both have been photographed into a note once (10 and 12
// September 2026). A --before run raises an older server, and one cut before
// 12 September 2026 does not know VALEY_NUDGE — an entrance frame from it is
// looked at for the nudge like any «before» frame is looked at for the place.
const office = await startOffice({ claudeDir, root: worktree || ROOT, env: PICTURE_ENV });
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
    const rel = before ? beforeSource(f.slug, sh.id, before) : shotSource(f.slug, sh.id);
    const out = path.join(ROOT, rel);
    const args = ['--url', office.base + '/' + (sh.url || ''), '--out', out];
    if (sh.keys) args.push('--keys', sh.keys);
    if (sh.viewport) args.push('--viewport', sh.viewport);
    if (sh.touch) args.push('--touch');
    if (sh.setup) args.push('--setup', sh.setup);
    const cut = sh.interrupt ? await interrupt(sh.interrupt) : null;
    const r = spawnSync(process.execPath, [shotTool, ...args], { cwd: ROOT, stdio: 'inherit' });
    if (cut) await resume(cut);
    if (r.status !== 0) {
      if (!keep) await office.stop();
      die(`${f.slug}/${sh.id} was not taken`);
    }
    console.log(`  ${rel}`);
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
if (worktree) {
  git('worktree', 'remove', '--force', worktree);
  await fsp.rm(worktree, { recursive: true, force: true });
}
console.log(`\n${taken} picture${taken > 1 ? 's' : ''} rendered`);
if (before)
  console.log(`\nLook at them before committing. ${before} never heard of this feature,\n` +
    'so a recipe that walks into a room it does not have ends up somewhere else\n' +
    'and comes back looking perfectly plausible.');
