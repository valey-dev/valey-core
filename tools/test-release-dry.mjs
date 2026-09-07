// node tools/test-release-dry.mjs — release.mjs looks at its own repository
// rather than at the cwd. Until 4 September 2026 git went wherever it was called
// from while package.json and CHANGELOG were taken relative to the script file:
// from a subdirectory, or from someone else's folder, a release was applied by
// halves. A run from the system temp directory is the most foreign cwd there is:
// no repository and no package.json in it.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
