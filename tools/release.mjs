#!/usr/bin/env node
// Cutting a release: bump the version, assemble the changelog section from the
// commits since the previous tag, commit, put the tag on.
//
//   node tools/release.mjs             # the range picks the digit
//   node tools/release.mjs minor       # the same, said out loud and checked
//   node tools/release.mjs patch --dry
//   node tools/release.mjs --ship      # cut, push, and open the release page
//
// The digit is no longer taken on trust — see release-kind.mjs for why and for
// the rules. Pushing stays out of the default run: what has gone to origin
// cannot be rewritten. `--ship` is the opt-in that does the whole tail, and it
// runs the stands first, because that is the last moment the commit is still
// cheap to change.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pickKind, check } from './release-kind.mjs';
import { readFragments, checkNotes, missingShots, assemble } from './notes.mjs';

// The root comes from this file rather than from the cwd: git and the files have
// to look at one repository. Until 4 September 2026 git went to the cwd while
// package.json and CHANGELOG were taken from here: a run from a subdirectory
// rewrote the files and `git add` failed on the pathspec — the version bumped,
// the section written, no commit and no way back.
// The repository being released is not always the one holding this script.
// valey-modules is a second repository living inside this working tree, with its
// own version, its own tags and the same rules, and duplicating four tools into
// it would mean two copies drifting apart. So the root is overridable, and the
// default stays «the repo this file belongs to».
const TOOL_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = process.env.VALEY_REPO
  ? path.resolve(process.env.VALEY_REPO)
  : TOOL_ROOT;

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
// The same, but quietly: before the first tag `git describe` shouts into stderr,
// and that shout is not about an error but about "there are no tags yet".
const gitQuiet = (...a) =>
  execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const die = (m) => { console.error('release: ' + m); process.exit(1); };

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const ship = argv.includes('--ship');
// The public remote's name. One name rather than "every remote but origin":
// a stray remote to somebody's fork must not become a publication by accident.
const PUBLIC = process.env.VALEY_PUBLIC_REMOTE || 'public';
// Cutting several features into one version is admitting a release was skipped.
// It has to be said out loud, in the command, rather than in the changelog after
// the fact — so the guard below refuses and this flag is how you agree.
const catchUp = argv.includes('--catch-up');
// A release with a feature and no feature note is the one this flag lets through.
const noNote = argv.includes('--no-note');
// The digit is optional now. A bare `--ship` must not be read as one, so the
// first argument is taken only when it is not a flag.
const asked = argv.find((a) => !a.startsWith('--')) || null;
if (asked && !['major', 'minor', 'patch'].includes(asked))
  die(`invalid release kind: ${asked}. Expected major, minor, patch, or nothing to infer it from the range`);
if (dry && ship) die('--dry and --ship cannot be used together');

// A dirty tree is somebody else's edits landing in the release commit. Better to stop.
if (!dry && git('status', '--porcelain')) die('the working tree is dirty; commit or stash it first');

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = pkg.version.split('.').map(Number);

// The previous tag can only be missing before the very first release.
// `--match` is mandatory: the repository grows more than versions. The repo-log
// routine hangs `logseq-log/<date>` on the current HEAD, and on 30 August 2026
// `describe` without a filter returned exactly that — the range came out empty,
// and the release failed on "no commits" with twenty-four of them accumulated.
let range = 'HEAD';
try { range = gitQuiet('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*') + '..HEAD'; } catch {}

// The body comes along for `BREAKING CHANGE:`, which is the half of a breaking
// change that does not show in the subject. Records are separated by \x1e and
// fields by \x00 — a body has newlines in it, so a line per commit will not do.
const commits = git('log', range, '--no-merges', '--format=%h%x00%s%x00%b%x1e')
  .split('\x1e').map((r) => r.replace(/^\n/, '')).filter((r) => r.trim())
  .map((r) => { const [hash, subject, body] = r.split('\0'); return { hash, subject, body }; });
if (!commits.length) die(`there are no commits after ${range.split('..')[0]}`);

// The range decides; the argument is only allowed to agree with it.
const picked = pickKind(commits, pkg.version);
const verdict = check(asked, picked);
if (!verdict.ok) die(verdict.note);
const kind = asked || picked.kind;
if (!kind) die(`${picked.why}. If a release is still required, explicitly request patch`);
// One accepted feature is one minor, so more than one in a range means a release
// was not cut when it was earned. Until 5 September 2026 this only printed a
// warning and cut anyway: v0.10.0 went out carrying five features from two
// different sessions, and the digit said one. A refusal puts the choice back at
// the moment it is being made.
// The dry run refuses too, on purpose: «what would happen» has to include «it
// would not». A guard you only meet on the real run is a guard you meet too late.
if (picked.feats.length > 1 && !catchUp) {
  die(`the range contains ${picked.feats.length} features, while one accepted feature should produce one minor release.\n` +
    '  A release was therefore missed. To catch up deliberately, repeat with --catch-up;\n' +
    '  they will ship together in one minor release.');
}
for (const w of picked.warnings) console.log('WARNING: ' + w + '\n');
if (verdict.note) console.log('WARNING: ' + verdict.note + '\n');
if (!asked) console.log(`release kind inferred from range: ${kind} — ${picked.why}\n`);

const next = kind === 'major' ? `${maj + 1}.0.0`
  : kind === 'minor' ? `${maj}.${min + 1}.0`
  : `${maj}.${min}.${pat + 1}`;
const tag = 'v' + next;

if (git('tag', '-l', tag)) die(`tag ${tag} already exists`);

const TYPES = [
  // The headings are English from 2 September 2026: the entries themselves are
  // commit subjects, and those are English from 29 August, so a Russian heading
  // over an English list read as half a translation. Sections above that date
  // stay Russian — the same split as in the history, and for the same reason.
  ['feat', 'Added'], ['fix', 'Fixed'], ['perf', 'Faster'],
];
const RE = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;
const groups = new Map(TYPES.map(([t]) => [t, []]));
const other = [];
for (const c of commits) {
  const m = RE.exec(c.subject);
  // Anything that did not parse, or is not one of the three visible types, goes
  // into Other. Losing a commit in silence is not on: the section would then lie
  // about the size of the release.
  if (m && groups.has(m[1])) groups.get(m[1]).push({ ...c, scope: m[2], text: m[3] });
  else other.push(c);
}

// English, like the headings above and for the same reason: the date sits on
// the same line as the tag, over a list of English subjects, and v0.2.0 — the
// section this file already carried — reads «30 August 2026». The switch of
// 2 September 2026 changed the headings and missed this line; found on 5
// September while cutting v0.3.0, before the tag left the machine.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const d = new Date(git('log', '-1', '--format=%cI'));
const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const lines = [`## ${tag} — ${date}`, ''];
// On a zero major the number cannot say "this breaks things" — semver spends the
// whole 0.x on being allowed to break — so the text has to, and it goes first.
// Russian on purpose: it is a warning to the person updating, not a changelog
// entry, and it must not read as one more line in the list.
if (picked.needsBreakingBlock) {
  lines.push('### Breaking changes', '');
  for (const c of picked.breaking)
    lines.push(`- ${c.scope ? `**${c.scope}:** ` : ''}${c.text}${c.hash ? ` (${c.hash})` : ''}`);
  lines.push('');
}
for (const [type, title] of TYPES) {
  const items = groups.get(type);
  if (!items.length) continue;
  lines.push(`### ${title}`, '');
  for (const it of items)
    lines.push(`- ${it.scope ? `**${it.scope}:** ` : ''}${it.text} (${it.hash})`);
  lines.push('');
}
if (other.length) {
  lines.push('### Other', '');
  for (const c of other) lines.push(`- ${c.subject} (${c.hash})`);
  lines.push('');
}
const section = lines.join('\n');

console.log(section);
console.log(`— ${commits.length} commits, ${other.length} without a section`);

// The feature note. It is assembled out of fragments written in the feature
// branches, so nothing is composed here — this is only the moment they are
// collected under a version. The guard refuses on the dry run too: a check you
// only meet on the real run is a check you meet too late.
let fragments = [];
try { fragments = readFragments(ROOT); } catch (err) { die(err.message); }
const notes = checkNotes(ROOT, { kind, feats: picked.feats, fragments, allow: noNote });
if (!notes.ok) die(notes.note);
if (notes.bare) console.log('WARNING: cut without a feature note, on --no-note\n');
// A declared picture that was never rendered would go into the note as a broken
// image, and nobody opens their own note again after the release.
const noShots = missingShots(ROOT, fragments);
if (noShots.length)
  die(`the note declares pictures that have not been rendered: ${noShots.join(', ')}.\n` +
    '  They are taken in the feature branch, against a demo office:\n' +
    '    node tools/notes-shots.mjs');
if (fragments.length)
  console.log(`\nfeature note ${tag}.md, from ${fragments.length} fragment${fragments.length > 1 ? 's' : ''}: ` +
    fragments.map((f) => f.slug).join(', '));

if (dry) { console.log('--dry: nothing was written'); process.exit(0); }

// A release is a tag on `main` — nothing merges there that has not been accepted,
// so there is no other branch a version can honestly come from. Cutting one on a
// feature branch produces a tag that disappears the moment the branch is deleted.
// What matters is the commit, not the name of the branch pointing at it. The old
// check demanded the branch be called `main`, and `main` can be checked out in
// exactly one worktree — so whoever wanted to release had to walk into somebody
// else's tree, and on 5 September 2026 that is what happened. Now any tree works
// as long as its HEAD is the commit `main` is on: a temporary worktree, a fresh
// clone, main itself.
const head = git('rev-parse', 'HEAD');
const mainAt = (() => { try { return gitQuiet('rev-parse', 'origin/main'); } catch { return ''; } })();
if (mainAt) {
  if (head !== mainAt) {
    die('a release must be cut from the commit pointed to by origin/main.\n' +
      `  HEAD is ${head.slice(0, 7)}, while origin/main is ${mainAt.slice(0, 7)}; merge and pull first.`);
  }
} else {
  // No remote at all — a young clone. Then the branch name is the only signal left.
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') die(`origin is not configured and the current branch is ${branch}; releases are cut on main`);
}

// The stands run before anything is written, not after: this is the last moment
// the release commit is still cheap to change. `--ship` pushes, and a pushed
// commit is not free to rewrite.
if (ship) {
  console.log('\ntests before push:');
  // A repository without a runner is not a repository without checks — it is one
  // whose checks are called otherwise. Saying so beats pretending they ran.
  const runner = path.join(ROOT, 'tools/run-tests.mjs');
  if (!existsSync(runner)) {
    console.log('  this repository has no tests to run');
  } else {
  const t = spawnSync(process.execPath, [runner],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const tail = (t.stdout || '').trim().split('\n').slice(-3).join('\n');
  if (t.status !== 0) die('tests failed; the release will not be cut:\n' + tail);
  console.log(tail + '\n');
  }
}

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const changelogPath = path.join(ROOT, 'CHANGELOG.md');
const changelog = readFileSync(changelogPath, 'utf8');
const at = changelog.indexOf('\n## ');
if (at < 0) die('CHANGELOG.md has no ## section to insert into');
writeFileSync(changelogPath,
  changelog.slice(0, at + 1) + section + changelog.slice(at + 1));

const added = ['package.json', 'CHANGELOG.md'];
if (fragments.length) { assemble(ROOT, tag, date, fragments, section); added.push('notes'); }

git('add', ...added);
git('commit', '-m', `chore(release): ${tag}`);
git('tag', '-a', tag, '-m', tag);
console.log(`\ndone: ${tag} at ${git('rev-parse', '--short', 'HEAD')}`);
// The push and the release page are two steps and both are named here. Until
// 5 September 2026 only the first one was: the project had three tags and no
// releases on GitHub, and everybody kept calling the tags releases. The notes
// existed the whole time — they just never left the repository.
if (!ship) {
  console.log(`push separately:\n  git push origin HEAD:main ${tag}`);
  console.log(`then create the release page from the same section:\n  node tools/gh-release.mjs ${tag}`);
  console.log(`or do both next time:\n  npm run ship`);
}

// A minor with no video is a broken rule rather than a detail: that is how
// v0.2.0 went out. So the draft script appears by itself, together with the tag.
// A blank page is the main reason a release gets put off, and removing it is
// cheaper than talking yourself into sitting down later.
// The video is the office's own rule: a minor of the office is shown to people.
// The modules repository is released by the same tooling and has no video and no
// audience for one, so the draft belongs to the repo this script lives in.
//
// «The same repo» is not «the same path». Since land.mjs cuts every release in a
// temporary worktree with VALEY_REPO pointing at it, a path comparison answered
// «someone else's repository» for every landed release: v0.22.0, v0.23.0 and
// v0.24.0 all went out without a draft, and ~/.config/valey/scripts stopped at
// v0.21.0. What actually separates the two cases is the git object store, which
// a worktree shares with its checkout and a second repository does not.
const commonDir = (dir) => {
  try {
    const out = execFileSync('git', ['-C', dir, 'rev-parse', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    // `--git-common-dir` answers relative to the cwd of the git call, not to -C,
    // so it is resolved against the same directory git was pointed at.
    return realpathSync(path.resolve(dir, out));
  } catch { return null; }
};
const ownRepo = ROOT === TOOL_ROOT || (() => {
  const a = commonDir(ROOT), b = commonDir(TOOL_ROOT);
  return a !== null && a === b;
})();
if (next.endsWith('.0') && ownRepo) {
  try {
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('script.mjs', import.meta.url)), tag],
      { encoding: 'utf8' });
    console.log('\n' + out.trim());
    console.log(`\nA minor release calls for a video. A draft is ready; editing it is\neasier than starting from scratch. The walkthrough records with one command.`);
  } catch (err) {
    console.log('\nscript draft generation failed: ' + (err.stderr || err.message).toString().trim());
  }
}

// The tail, in one go. Both of these steps were printed as advice for a while,
// and both got skipped: on 5 September 2026 the project had five tags and zero
// release pages, and later the same day three accepted features and no release
// at all. Advice that has to be followed every single time is not advice, it is
// a step somebody forgot to write down.
//
// Pushing `origin` without asking is safe because it is a PRIVATE staging
// repository: nobody outside reads it, and the project's rules grant the push.
//
// The public repository — the remote called `public`, valey-dev/valey-core since
// 11 September 2026 — is pushed by the same tail, and that is deliberate. What
// reaches it is exactly one thing: a release the owner accepted by merging.
// The merge is the act of publishing; this only carries it. On opening day the
// public side was caught up by hand after every release, by three sessions in
// parallel, and valey.dev/dist/latest — a redirect to the newest public page —
// lagged behind each one until somebody noticed. A remote that is not there
// (a fork, a clone without the public half) is skipped and said so.
if (ship) {
  const remote = (() => { try { return git('remote', 'get-url', 'origin'); } catch { return ''; } })();
  if (!remote) die(`tag ${tag} exists locally, but origin is not configured; there is nowhere to push`);
  console.log(`\npushing to origin (${remote}):`);
  git('push', 'origin', 'HEAD:main', tag);
  console.log(`  main and ${tag} pushed`);

  // The released repository can borrow this release suite without carrying a
  // duplicate tools/ directory. The page builder therefore lives beside this
  // script, just like release-kind.mjs and the video-script helper above.
  const page = (where) => spawnSync(process.execPath,
    [path.join(TOOL_ROOT, 'tools/gh-release.mjs'), tag, '--remote', where], { cwd: ROOT, stdio: 'inherit' });
  // The tag is already pushed by now, so a failure here is not fatal to the
  // release — it is one command away from being finished, and saying which one
  // beats a stack trace.
  const finish = (where) => `  VALEY_REPO=${ROOT} node ${path.join(TOOL_ROOT, 'tools/gh-release.mjs')} ${tag} --remote ${where}`;

  console.log('\nrelease page:');
  if (page('origin').status !== 0) {
    console.log(`\nrelease page creation failed. Tag ${tag} is already on origin; finish with:\n${finish('origin')}`);
    process.exit(1);
  }

  // The repository being released may have a shop to feed: the Modules keep
  // tools/publish.mjs, which cuts the buyers' archive from the tag and puts it
  // on the buyers' repository with a release page. It is run here, not
  // remembered: on 11 September 2026 the shop stood at v0.6.2 while the Modules
  // were at v0.7.1 — two releases with the fixes for the feed and the voice
  // never reached a buyer, and nothing in the tail said so. The same reasoning
  // as the public remote: the merge is the owner's word, the tail carries it.
  const shop = path.join(ROOT, 'tools/publish.mjs');
  if (existsSync(shop)) {
    console.log('\nshop:');
    const r = spawnSync(process.execPath, [shop, tag], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
      console.log(`\nshop publication failed. Tag ${tag} is already on origin; finish with:\n  node ${shop} ${tag}`);
      process.exit(1);
    }
  }

  const pub = (() => { try { return git('remote', 'get-url', PUBLIC); } catch { return ''; } })();
  if (!pub) {
    console.log(`\nno remote called ${PUBLIC}; the public repository is not updated from here`);
  } else {
    console.log(`\npushing to ${PUBLIC} (${pub}):`);
    try {
      git('push', PUBLIC, 'HEAD:main', tag);
      console.log(`  main and ${tag} pushed`);
    } catch (err) {
      console.log(`\npush to ${PUBLIC} failed: ${String(err.message || err).trim().split('\n')[0]}\n` +
        `origin already has the release; finish with:\n` +
        `  git push ${PUBLIC} ${tag}^{commit}:refs/heads/main ${tag}\n${finish(PUBLIC)}`);
      process.exit(1);
    }
    console.log('\npublic release page:');
    if (page(PUBLIC).status !== 0) {
      console.log(`\npublic release page creation failed. Tag ${tag} is already on ${PUBLIC}; finish with:\n${finish(PUBLIC)}`);
      process.exit(1);
    }
  }
}
