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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pickKind, check } from './release-kind.mjs';

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
// Cutting several features into one version is admitting a release was skipped.
// It has to be said out loud, in the command, rather than in the changelog after
// the fact — so the guard below refuses and this flag is how you agree.
const catchUp = argv.includes('--catch-up');
// The digit is optional now. A bare `--ship` must not be read as one, so the
// first argument is taken only when it is not a flag.
const asked = argv.find((a) => !a.startsWith('--')) || null;
if (asked && !['major', 'minor', 'patch'].includes(asked))
  die(`не разряд: ${asked}. Ожидается major, minor, patch — или ничего, тогда решает диапазон`);
if (dry && ship) die('--dry и --ship вместе не имеют смысла');

// A dirty tree is somebody else's edits landing in the release commit. Better to stop.
if (!dry && git('status', '--porcelain')) die('дерево грязное, сначала закоммить или спрячь');

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
if (!commits.length) die(`после ${range.split('..')[0]} нет коммитов`);

// The range decides; the argument is only allowed to agree with it.
const picked = pickKind(commits, pkg.version);
const verdict = check(asked, picked);
if (!verdict.ok) die(verdict.note);
const kind = asked || picked.kind;
if (!kind) die(`${picked.why}. Если релиз всё же нужен — скажи patch словом`);
// One accepted feature is one minor, so more than one in a range means a release
// was not cut when it was earned. Until 5 September 2026 this only printed a
// warning and cut anyway: v0.10.0 went out carrying five features from two
// different sessions, and the digit said one. A refusal puts the choice back at
// the moment it is being made.
// The dry run refuses too, on purpose: «what would happen» has to include «it
// would not». A guard you only meet on the real run is a guard you meet too late.
if (picked.feats.length > 1 && !catchUp) {
  die(`в диапазоне ${picked.feats.length} фич, а по правилу одна принятая фича — один минор.\n` +
    '  Значит релиз пропущен. Если догоняем осознанно — повтори с --catch-up,\n' +
    '  и это уедет одним минором, как сейчас и происходит.');
}
for (const w of picked.warnings) console.log('ВНИМАНИЕ: ' + w + '\n');
if (verdict.note) console.log('ВНИМАНИЕ: ' + verdict.note + '\n');
if (!asked) console.log(`разряд выбран по диапазону: ${kind} — ${picked.why}\n`);

const next = kind === 'major' ? `${maj + 1}.0.0`
  : kind === 'minor' ? `${maj}.${min + 1}.0`
  : `${maj}.${min}.${pat + 1}`;
const tag = 'v' + next;

if (git('tag', '-l', tag)) die(`тег ${tag} уже есть`);

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
  lines.push('### Ломает', '');
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
console.log(`— ${commits.length} коммитов, из них без раздела ${other.length}`);
if (dry) { console.log('--dry: ничего не записано'); process.exit(0); }

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
    die('релиз режется с того коммита, на котором стоит origin/main.\n' +
      `  здесь HEAD ${head.slice(0, 7)}, а origin/main ${mainAt.slice(0, 7)} — сначала слей и подтяни.`);
  }
} else {
  // No remote at all — a young clone. Then the branch name is the only signal left.
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') die(`origin не настроен, а ветка ${branch} — релиз режется на main`);
}

// The stands run before anything is written, not after: this is the last moment
// the release commit is still cheap to change. `--ship` pushes, and a pushed
// commit is not free to rewrite.
if (ship) {
  console.log('\nстенды перед пушем:');
  // A repository without a runner is not a repository without checks — it is one
  // whose checks are called otherwise. Saying so beats pretending they ran.
  const runner = path.join(ROOT, 'tools/run-tests.mjs');
  if (!existsSync(runner)) {
    console.log('  стендов у этого репозитория нет — прогонять нечего');
  } else {
  const t = spawnSync(process.execPath, [runner],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const tail = (t.stdout || '').trim().split('\n').slice(-3).join('\n');
  if (t.status !== 0) die('стенды не прошли — релиз не режется:\n' + tail);
  console.log(tail + '\n');
  }
}

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const changelogPath = path.join(ROOT, 'CHANGELOG.md');
const changelog = readFileSync(changelogPath, 'utf8');
const at = changelog.indexOf('\n## ');
if (at < 0) die('в CHANGELOG.md нет ни одного раздела ## — некуда вставлять');
writeFileSync(changelogPath,
  changelog.slice(0, at + 1) + section + changelog.slice(at + 1));

git('add', 'package.json', 'CHANGELOG.md');
git('commit', '-m', `chore(release): ${tag}`);
git('tag', '-a', tag, '-m', tag);
console.log(`\nготово: ${tag} на ${git('rev-parse', '--short', 'HEAD')}`);
// The push and the release page are two steps and both are named here. Until
// 5 September 2026 only the first one was: the project had three tags and no
// releases on GitHub, and everybody kept calling the tags releases. The notes
// existed the whole time — they just never left the repository.
if (!ship) {
  console.log(`пуш — отдельно:\n  git push origin HEAD:main ${tag}`);
  console.log(`и следом страница релиза из этой же секции:\n  node tools/gh-release.mjs ${tag}`);
  console.log(`или всё сразу в следующий раз:\n  npm run ship`);
}

// A minor with no video is a broken rule rather than a detail: that is how
// v0.2.0 went out. So the draft script appears by itself, together with the tag.
// A blank page is the main reason a release gets put off, and removing it is
// cheaper than talking yourself into sitting down later.
// The video is the office's own rule: a minor of the office is shown to people.
// The modules repository is released by the same tooling and has no video and no
// audience for one, so the draft belongs to the repo this script lives in.
const ownRepo = ROOT === TOOL_ROOT;
if (next.endsWith('.0') && ownRepo) {
  try {
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('script.mjs', import.meta.url)), tag],
      { encoding: 'utf8' });
    console.log('\n' + out.trim());
    console.log(`\nМинорный релиз — значит ролик. Черновик уже лежит, править его\nлегче, чем начинать с нуля. Проход снимается одной командой.`);
  } catch (err) {
    console.log('\nчерновик сценария не собрался: ' + (err.stderr || err.message).toString().trim());
  }
}

// The tail, in one go. Both of these steps were printed as advice for a while,
// and both got skipped: on 5 September 2026 the project had five tags and zero
// release pages, and later the same day three accepted features and no release
// at all. Advice that has to be followed every single time is not advice, it is
// a step somebody forgot to write down.
//
// This is safe to do without asking for one specific reason: `origin` is a
// PRIVATE staging repository. Nobody outside reads it, and the project's rules
// grant that push. Pointed at a public remote, this flag would be an act of
// publishing and would belong to a person, not to a script.
if (ship) {
  const remote = (() => { try { return git('remote', 'get-url', 'origin'); } catch { return ''; } })();
  if (!remote) die(`тег ${tag} на месте, но origin не настроен — пушить некуда`);
  console.log(`\nпуш в origin (${remote}):`);
  git('push', 'origin', 'HEAD:main', tag);
  console.log(`  main и ${tag} уехали`);

  console.log('\nстраница релиза:');
  // The released repository can borrow this release suite without carrying a
  // duplicate tools/ directory. The page builder therefore lives beside this
  // script, just like release-kind.mjs and the video-script helper above.
  const r = spawnSync(process.execPath, [path.join(TOOL_ROOT, 'tools/gh-release.mjs'), tag],
    { cwd: ROOT, stdio: 'inherit' });
  // The tag is already pushed by now, so a failure here is not fatal to the
  // release — it is one command away from being finished, and saying which one
  // beats a stack trace.
  if (r.status !== 0) {
    console.log(`\nстраница не собралась. Тег ${tag} уже в origin, доделать:\n` +
      `  VALEY_REPO=${ROOT} node ${path.join(TOOL_ROOT, 'tools/gh-release.mjs')} ${tag}`);
    process.exit(1);
  }
}
