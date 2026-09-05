#!/usr/bin/env node
// Cutting a release: bump the version, assemble the changelog section from the
// commits since the previous tag, commit, put the tag on. Pushing is a separate
// step and a manual one: what has gone to origin cannot be rewritten, and that is
// the user's call rather than the script's.
//
//   node tools/release.mjs minor
//   node tools/release.mjs patch --dry
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The root comes from this file rather than from the cwd: git and the files have
// to look at one repository. Until 4 September 2026 git went to the cwd while
// package.json and CHANGELOG were taken from here: a run from a subdirectory
// rewrote the files and `git add` failed on the pathspec — the version bumped,
// the section written, no commit and no way back.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
// The same, but quietly: before the first tag `git describe` shouts into stderr,
// and that shout is not about an error but about "there are no tags yet".
const gitQuiet = (...a) =>
  execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const die = (m) => { console.error('release: ' + m); process.exit(1); };

const kind = process.argv[2];
const dry = process.argv.includes('--dry');
if (!['major', 'minor', 'patch'].includes(kind))
  die('первым аргументом major, minor или patch');

// A dirty tree is somebody else's edits landing in the release commit. Better to stop.
if (!dry && git('status', '--porcelain')) die('дерево грязное, сначала закоммить или спрячь');

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = pkg.version.split('.').map(Number);
const next = kind === 'major' ? `${maj + 1}.0.0`
  : kind === 'minor' ? `${maj}.${min + 1}.0`
  : `${maj}.${min}.${pat + 1}`;
const tag = 'v' + next;

if (git('tag', '-l', tag)) die(`тег ${tag} уже есть`);

// The previous tag can only be missing before the very first release.
// `--match` is mandatory: the repository grows more than versions. The repo-log
// routine hangs `logseq-log/<date>` on the current HEAD, and on 30 August 2026
// `describe` without a filter returned exactly that — the range came out empty,
// and the release failed on "no commits" with twenty-four of them accumulated.
let range = 'HEAD';
try { range = gitQuiet('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*') + '..HEAD'; } catch {}

const commits = git('log', range, '--no-merges', '--format=%h%x00%s')
  .split('\n').filter(Boolean)
  .map((l) => { const [hash, subject] = l.split('\0'); return { hash, subject }; });
if (!commits.length) die(`после ${range.split('..')[0]} нет коммитов`);

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

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const changelogPath = new URL('../CHANGELOG.md', import.meta.url);
const changelog = readFileSync(changelogPath, 'utf8');
const at = changelog.indexOf('\n## ');
if (at < 0) die('в CHANGELOG.md нет ни одного раздела ## — некуда вставлять');
writeFileSync(changelogPath,
  changelog.slice(0, at + 1) + section + changelog.slice(at + 1));

git('add', 'package.json', 'CHANGELOG.md');
git('commit', '-m', `chore(release): ${tag}`);
git('tag', '-a', tag, '-m', tag);
console.log(`\nготово: ${tag} на ${git('rev-parse', '--short', 'HEAD')}`);
console.log(`пуш — отдельно и по твоему решению:\n  git push origin main ${tag}`);

// A minor with no video is a broken rule rather than a detail: that is how
// v0.2.0 went out. So the draft script appears by itself, together with the tag.
// A blank page is the main reason a release gets put off, and removing it is
// cheaper than talking yourself into sitting down later.
if (next.endsWith('.0')) {
  try {
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('script.mjs', import.meta.url)), tag],
      { encoding: 'utf8' });
    console.log('\n' + out.trim());
    console.log(`\nМинорный релиз — значит ролик. Черновик уже лежит, править его\nлегче, чем начинать с нуля. Проход снимается одной командой.`);
  } catch (err) {
    console.log('\nчерновик сценария не собрался: ' + (err.stderr || err.message).toString().trim());
  }
}
