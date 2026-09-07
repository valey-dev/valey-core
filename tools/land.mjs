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

const ROOT = process.env.VALEY_REPO
  ? path.resolve(process.env.VALEY_REPO)
  : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const die = (m) => { console.error('land: ' + m); process.exit(1); };
const run = (cmd, args, cwd = ROOT) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} — не вышло`);
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
  catch { die('не понял, какой PR: ветка без него, а номером не сказали'); }
}
const info = JSON.parse(gh('pr', 'view', String(pr), '--json', 'number,title,state,mergeable,headRefName'));
if (info.state !== 'OPEN') die(`PR #${info.number} уже ${info.state}`);
console.log(`PR #${info.number} — ${info.title}`);
console.log(`ветка ${info.headRefName}, mergeable: ${info.mergeable}`);

// -------------------------------------------------------------- the stands
// Before the merge rather than after: a local branch is free to fix, a merged one
// is not. The release script runs them again before it pushes, and that is not a
// duplicate — between the two there is a merge.
console.log('\nстенды:');
run(process.execPath, [path.join(ROOT, 'tools/run-tests.mjs')]);

if (dry) {
  console.log('\n--dry: до мержа и не дальше. Дальше было бы: слить PR, нарезать релиз во временном дереве, запушить, собрать страницу.');
}

// ---------------------------------------------------------------- the merge
if (!dry) {
  console.log('\nмерж:');
  run('gh', ['pr', 'merge', String(pr), '--merge']);
}

// -------------------------------------------------------------- the release
// A temporary worktree on a temporary branch at origin/main: release.mjs asks
// that HEAD be the commit main stands on, and does not care what the branch is
// called any more.
git('fetch', 'origin', '--tags', '--quiet');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-land-'));
const tmpBranch = `land/${Date.now()}`;
// A dry run cuts from the head of the pull request rather than from main: main
// does not have these commits yet, so a dry release there would always answer
// «no commits since the tag» and show nothing. The head is what main is about to
// become, which is exactly what the run is meant to show.
const base = dry ? `origin/${info.headRefName}` : 'origin/main';
console.log(`\nрелиз во временном дереве ${dir} (с ${base}):`);
git('worktree', 'add', '--quiet', '-b', tmpBranch, dir, base);
// The tidying is called by hand rather than left to `finally`: die() ends the
// process with process.exit, and that skips finally entirely. The first failing
// dry run on 6 September 2026 left its worktree and branch behind for exactly
// that reason, and a temporary tree nobody removes is one more thing holding a
// branch nobody expected.
const sweep = () => {
  try { git('worktree', 'remove', '--force', dir); } catch { /* already gone, or held */ }
  try { git('branch', '-D', tmpBranch); } catch { /* the branch may not be there */ }
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
  if (dry) { sweep(); die('сухой прогон релиза не прошёл'); }
  // A real run that got as far as failing keeps its tree: the merge has already
  // happened, the release has not, and finishing it needs somewhere to stand.
  die(`PR слит, но релиз не нарезан. Дерево ${dir} осталось — доделать там же:\n  node tools/release.mjs --ship`);
}
sweep();
console.log(dry
  ? '\n--dry: ничего не слито и не выпущено. Выше — раздел, который уехал бы, и стенды, которые за него отвечают.'
  : '\nготово: PR слит, версия нарезана и опубликована.');
