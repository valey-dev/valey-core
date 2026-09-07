#!/usr/bin/env node
// node tools/land.mjs [<pr>] — merge and release in one command.
//
//   npm run land            # the pull request of the current branch
//   npm run land -- 12      # a particular one
//   npm run land -- --dry   # everything up to the merge, and nothing after it
//   npm run land -- 12 --catch-up  # knowingly release several missed features together
//
// Merging and releasing used to be two decisions, and the gap between them is
// where versions went missing: on 5 September 2026 v0.10.0 went out carrying five
// features from two sessions, because four merges had happened with no release
// after them. The rule of this project is one accepted feature, one minor — so
// the merge is what earns the version, and the two belong in one command.
//
// The release is cut in a TEMPORARY worktree at origin/main, never in the tree
// this was called from. Two reasons, and both were paid for: `main` can be
// checked out in only one place, so a release used to mean walking into somebody
// else's tree; and whoever runs this is usually standing on the branch that is
// being merged, which stops being the place to cut from the moment it lands.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = process.env.VALEY_REPO
  ? path.resolve(process.env.VALEY_REPO)
  : TOOL_ROOT;
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const toolGit = (...a) => execFileSync('git', ['-C', TOOL_ROOT, ...a], { encoding: 'utf8' }).trim();
const die = (m) => { console.error('land: ' + m); process.exit(1); };
const run = (cmd, args, cwd = ROOT) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} failed`);
};

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const catchUp = argv.includes('--catch-up');
const kind = argv.find((a) => ['patch', 'minor', 'major'].includes(a)) || null;
const rest = argv.filter((a) => !a.startsWith('--') && a !== kind);
let pr = rest[0] || null;

// ---------------------------------------------------------------- the request
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();
if (!pr) {
  try { pr = JSON.parse(gh('pr', 'view', '--json', 'number')).number; }
  catch { die('could not determine the PR: this branch has none and no number was provided'); }
}
const info = JSON.parse(gh('pr', 'view', String(pr), '--json', 'number,title,state,mergeable,headRefName'));
if (info.state !== 'OPEN') die(`PR #${info.number} is already ${info.state}`);
console.log(`PR #${info.number} — ${info.title}`);
console.log(`branch ${info.headRefName}, mergeable: ${info.mergeable}`);

// -------------------------------------------------------------- the stands
// Before the merge rather than after: a local branch is free to fix, a merged one
// is not. The release script runs them again before it pushes, and that is not a
// duplicate — between the two there is a merge.
console.log('\ntests:');
run(process.execPath, [path.join(ROOT, 'tools/run-tests.mjs')]);

if (dry) {
  console.log('\n--dry: stopping before merge. Next would be: merge the PR, cut a release in a temporary tree, push, and create the release page.');
}

// ---------------------------------------------------------------- the merge
if (!dry) {
  console.log('\nmerge:');
  run('gh', ['pr', 'merge', String(pr), '--merge']);
}

// -------------------------------------------------------------- the release
// A temporary worktree on a temporary branch at origin/main: release.mjs asks
// that HEAD be the commit main stands on, and does not care what the branch is
// called any more.
git('fetch', 'origin', '--tags', '--quiet');
// A secondary repository is normally mounted next to the core files: its tests
// import ../../web and its server-side stands expect the modules to be visible
// at <core>/modules. A top-level /tmp worktree satisfies neither contract. Give
// it a clean core host, keep the private checkout beside modules/, and link its
// manifests into the host exactly as a normal two-repository checkout does.
const secondary = path.resolve(ROOT) !== path.resolve(TOOL_ROOT);
let hostDir = null;
let dir;
if (secondary) {
  toolGit('fetch', 'origin', '--tags', '--quiet');
  hostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-land-core-'));
  toolGit('worktree', 'add', '--quiet', '--detach', hostDir, 'origin/main');
  dir = path.join(hostDir, 'private-mods');
} else {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-land-'));
}
const tmpBranch = `land/${Date.now()}`;
// A dry run cuts from the head of the pull request rather than from main: main
// does not have these commits yet, so a dry release there would always answer
// «no commits since the tag» and show nothing. The head is what main is about to
// become, which is exactly what the run is meant to show.
const base = dry ? `origin/${info.headRefName}` : 'origin/main';
console.log(`\nrelease in temporary tree ${dir} (from ${base}):`);
git('worktree', 'add', '--quiet', '-b', tmpBranch, dir, base);
if (secondary) {
  const moduleDir = path.join(hostDir, 'modules');
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = path.join(dir, entry.name);
    if (!fs.existsSync(path.join(source, 'module.json'))) continue;
    const target = path.join(moduleDir, entry.name);
    // A free module can deliberately occupy the same id in core. The clean
    // host wins in that case; every paid-only module is linked beside it.
    if (fs.existsSync(target)) continue;
    fs.symlinkSync(path.relative(moduleDir, source), target, 'dir');
  }
}
// The tidying is called by hand rather than left to `finally`: die() ends the
// process with process.exit, and that skips finally entirely. The first failing
// dry run on 6 September 2026 left its worktree and branch behind for exactly
// that reason, and a temporary tree nobody removes is one more thing holding a
// branch nobody expected.
const sweep = () => {
  try { git('worktree', 'remove', '--force', dir); } catch { /* already gone, or held */ }
  try { git('branch', '-D', tmpBranch); } catch { /* the branch may not be there */ }
  if (hostDir) {
    try { toolGit('worktree', 'remove', '--force', hostDir); } catch { /* kept if still held */ }
  }
};

// The release tool is the one standing next to this file, not a copy inside the
// temporary worktree: a second repository released by these tools has its own
// stands and its own changelog but no copy of the tooling, and pointing
// VALEY_REPO at the worktree is the whole reason four files were not duplicated.
const args = [fileURLToPath(new URL('release.mjs', import.meta.url))];
if (kind) args.push(kind);
if (catchUp) args.push('--catch-up');
if (dry) args.push('--dry'); else args.push('--ship');
const r = spawnSync(process.execPath, args,
  { cwd: dir, stdio: 'inherit', env: { ...process.env, VALEY_REPO: dir } });
if (r.status !== 0) {
  if (dry) { sweep(); die('release dry run failed'); }
  // A real run that got as far as failing keeps its tree: the merge has already
  // happened, the release has not, and finishing it needs somewhere to stand.
  die(`PR was merged, but the release was not cut. Tree ${dir} remains; finish there:\n` +
    `  VALEY_REPO=${dir} node ${path.join(TOOL_ROOT, 'tools/release.mjs')} --ship`);
}
sweep();

// GitHub removes the remote PR branch at merge time. The local ref belongs to
// this clone, so the server cannot clean it: do that only after the release has
// succeeded and main contains the exact PR head. A branch still checked out in
// a live worktree is deliberately deferred; removing a directory from under the
// shell or agent that called land would turn successful delivery into damage.
if (!dry) {
  console.log('\nbranch cleanup:');
  const cleanup = spawnSync(process.execPath,
    [path.join(TOOL_ROOT, 'tools/cleanup-merged.mjs'), info.headRefName,
      '--repo', ROOT, '--apply'],
    { cwd: os.tmpdir(), stdio: 'inherit' });
  if (cleanup.status !== 0 && cleanup.status !== 3) {
    die(`release was published, but branch cleanup failed for ${info.headRefName}`);
  }
}
console.log(dry
  ? '\n--dry: nothing was merged or released. Above is the section that would ship and the tests covering it.'
  : '\ndone: PR merged, version cut, and release published.');
