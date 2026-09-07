// node tools/test-release-dry.mjs — release.mjs looks at its own repository
// rather than at the cwd. Until 4 September 2026 git went wherever it was called
// from while package.json and CHANGELOG were taken relative to the script file:
// from a subdirectory, or from someone else's folder, a release was applied by
// halves. A run from the system temp directory is the most foreign cwd there is:
// no repository and no package.json in it.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', String(got).slice(0, 300)); }
};

// No digit is passed on purpose: the range picks it since 5 September 2026, and
// a hardcoded one turns this stand into an argument about semver instead of
// about the cwd. It was `patch` for a day, and the day the check became
// mechanical the stand went red three times over — the script was refusing a
// digit too low for a range with a feature in it, which is exactly what it is
// supposed to do.
const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/release.mjs'), '--dry'],
  { cwd: os.tmpdir(), encoding: 'utf8' });
// Four answers are correct here, and all four prove the same thing: the script
// looked at THIS repository and not at the temp directory it was called from.
// A section means the range had something to say.
// «нет коммитов» is the answer right after a release.
// «выпускать нечего» is a range of refactors and chores only.
// «тег уже есть» is a feature branch whose main has been released past it: the
// digit the range asks for is a version somebody has already cut.
//
// The first of those used to fail the stand for a reason that had nothing to do
// with its subject — found 5 September 2026, when v0.4.0 was cut and main went
// red on the spot. The last was found the same day, on a branch sitting at
// 0.8.1 while main had reached v0.9.0.
// «одна принятая фича — один минор» is the fifth right answer: a range with
// several features is refused until somebody says --catch-up. Like the others
// it proves the script read THIS repository, which is all this stand is about.
const empty = /no commits|nothing to release|already exists|one minor release/.test(r.stderr + r.stdout);
const spoke = /^## v\d+\.\d+\.\d+/m.test(r.stdout) || empty;
ok('dry run from someone else\'s folder does not crash', r.status === 0 || empty, r.stderr || r.stdout);
ok('and talks about his repository, and not about someone else\'s folder', spoke, r.stdout + r.stderr);
ok('and doesn\'t record anything', /--dry: nothing was written/.test(r.stdout) || empty, r.stdout);

// Catch-up is an explicit release decision, and land is the only supported
// merge path. Losing the flag between those two scripts makes the documented
// recovery command impossible while still looking valid at the CLI boundary.
const land = readFileSync(path.join(ROOT, 'tools/land.mjs'), 'utf8');
ok('land passes an explicit --catch-up to the release script',
  /const catchUp = argv\.includes\('--catch-up'\)/.test(land) &&
  /if \(catchUp\) args\.push\('--catch-up'\)/.test(land), 'flag was lost');

// The modules repository borrows the core release suite. Its tests depend on
// the ordinary two-repository layout, and its GitHub page builder belongs to
// core too. Both paths failed only after a PR had merged, so guard them here.
const release = readFileSync(path.join(ROOT, 'tools/release.mjs'), 'utf8');
ok('a temporary module release gets a clean core host',
  /toolGit\('worktree', 'add'.*hostDir, 'origin\/main'\)/.test(land) &&
  /fs\.symlinkSync\(path\.relative\(moduleDir, source\), target, 'dir'\)/.test(land),
  'the module release worktree is detached from core again');
ok('a second repository builds its release page with the core tool',
  /path\.join\(TOOL_ROOT, 'tools\/gh-release\.mjs'\)/.test(release),
  'gh-release.mjs is being searched for inside the released repository again');

// Cleanup is the tail of a successful release, not of the merge itself. A
// failed release deliberately keeps its recovery tree, and a dry run must not
// delete the branch it is trying to demonstrate.
const releaseCall = land.indexOf('const r = spawnSync(process.execPath, args');
const failureGate = land.indexOf('if (r.status !== 0)', releaseCall);
const sweepCall = land.indexOf('sweep();', failureGate);
const cleanupCall = land.indexOf("'tools/cleanup-merged.mjs'", sweepCall);
ok('land cleans the PR branch only after the release success gate',
  releaseCall >= 0 && failureGate > releaseCall && sweepCall > failureGate && cleanupCall > sweepCall,
  { releaseCall, failureGate, sweepCall, cleanupCall });
ok('dry runs skip branch cleanup',
  /if \(!dry\) \{[\s\S]*?'tools\/cleanup-merged\.mjs'/.test(land.slice(sweepCall)),
  'cleanup is not guarded by !dry');
ok('a live worktree cleanup is queued and retried outside the landing process',
  /'--apply', '--defer'/.test(land) && /'tools\/cleanup-pending\.mjs'/.test(land) &&
    /'--watch', '300'/.test(land),
  'the deferred cleanup has no retry worker');
ok('a later landing retries cleanup markers that outlive the watcher',
  /spawnSync\(process\.execPath, \[pendingCleanup, '--repo', ROOT\]/.test(land),
  'land does not retry the persistent cleanup queue');

// A release cut through `npm run land` runs in a temporary worktree with
// VALEY_REPO pointing at it, so «the repo this script lives in» cannot be a
// path comparison: it answered «someone else's repository» for v0.22.0, v0.23.0
// and v0.24.0, and all three minors went out with no video-script draft. The
// git object store is what a worktree shares and a second repository does not,
// so that is what the guard has to compare.
ok('the video draft survives a release cut in a temporary worktree',
  /--git-common-dir/.test(release) && /const ownRepo = ROOT === TOOL_ROOT \|\|/.test(release),
  'ownRepo is a path comparison again');

// Proof rather than a grep: the guard's own code is run against a real
// worktree of this repository and against the modules repository beside it.
const ownRepoOf = (dir) => {
  const src = readFileSync(path.join(ROOT, 'tools/release.mjs'), 'utf8');
  const from = src.indexOf('const commonDir = (dir) => {');
  const to = src.indexOf('})();', from) + '})();'.length;
  const body = src.slice(from, to);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import { execFileSync } from 'node:child_process';\n" +
    "import { realpathSync } from 'node:fs';\n" +
    "import path from 'node:path';\n" +
    `const TOOL_ROOT = ${JSON.stringify(ROOT)};\n` +
    `const ROOT = ${JSON.stringify(dir)};\n` +
    body + '\nconsole.log(ownRepo);'],
    { encoding: 'utf8' });
  return r.stdout.trim();
};

const tmpTree = path.join(os.tmpdir(), 'valey-release-guard-' + process.pid);
let made = false;
try {
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', tmpTree, 'HEAD'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  made = true;
} catch { /* a shallow or unusual checkout: the grep above still stands */ }
if (made) {
  ok('a temporary worktree of this repository counts as this repository',
    ownRepoOf(tmpTree) === 'true', ownRepoOf(tmpTree));
  try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', tmpTree]); } catch { /* held */ }
}

// The modules repository borrows this suite and has no audience for a video.
// It is only a second repository where the private half is actually deployed:
// in a bare core worktree `modules/` is an ordinary directory of this very
// repository, and asserting «false» there would fail the stand for the right
// answer.
const modules = path.join(ROOT, 'modules');
let separate = false;
try {
  separate = execFileSync('git', ['-C', modules, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === realpathSync(modules);
} catch { /* the private half is not deployed here */ }
if (separate) {
  ok('a second repository inside this tree does not', ownRepoOf(modules) === 'false', ownRepoOf(modules));
} else {
  console.log('skip  | a second repository inside this tree does not (modules/ is not its own repo here)');
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
