#!/usr/bin/env node
// Publish a tag as a GitHub release, with the notes it already has.
//
//   node tools/gh-release.mjs            # the newest tag
//   node tools/gh-release.mjs v0.4.0     # a particular one
//   node tools/gh-release.mjs --all      # every tag that has no release yet
//   node tools/gh-release.mjs --dry      # print what would be sent
//
// Why this exists. Until 5 September 2026 the project had three tags and zero
// releases on GitHub: the notes were written, assembled from the commits, and
// went nowhere anybody looks. A tag is a pointer for git; a release is the page
// a human opens. Calling the first one "a release" in conversation and never
// making the second is how the word quietly stops meaning anything.
//
// The body is not composed here. It is the section of CHANGELOG.md for that
// version, verbatim — one text, one source. A release whose notes were written
// separately drifts from the changelog on the second edit, and then nobody knows
// which of the two is the truth.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The root comes from this file rather than from the cwd, for the reason
// release.mjs carries in its own header: git and the files have to look at one
// repository.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const die = (m) => { console.error('gh-release: ' + m); process.exit(1); };

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const all = args.includes('--all');
const asked = args.find((a) => !a.startsWith('--'));

// Sorted by version rather than by date: a tag put on an older commit later
// would otherwise claim to be the newest.
const tags = git('tag', '-l', 'v*').split('\n').filter(Boolean)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!tags.length) die('в репозитории нет тегов v*');

// The section of CHANGELOG.md for one version: from its heading to the next one.
// Missing is a hard stop rather than an empty release — an empty release page is
// worse than none, because it looks finished.
function notes(tag) {
  const md = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const lines = md.split('\n');
  const from = lines.findIndex((l) => l.startsWith(`## ${tag} `) || l.trim() === `## ${tag}`);
  if (from < 0) return null;
  let to = lines.length;
  for (let i = from + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { to = i; break; }
  }
  // The heading itself is dropped: GitHub prints the version above the body, and
  // repeating it puts the same line on the page twice.
  return lines.slice(from + 1, to).join('\n').trim();
}

// What is already published. `gh` answers with an error when the release is not
// there, and that is not a failure — it is the normal case for a fresh tag.
function published(tag) {
  try {
    execFileSync('gh', ['release', 'view', tag, '-R', repo, '--json', 'tagName'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch { return false; }
}

// The repository is asked of git rather than hardcoded: this tree has two remotes
// in its future — the private staging one and the public one — and a release must
// land where the tag was pushed.
let repo;
try {
  repo = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {
  die('gh не отвечает: не установлен, не авторизован или это не репозиторий GitHub');
}

const wanted = all ? tags : [asked || tags[tags.length - 1]];
let made = 0, skipped = 0;

for (const tag of wanted) {
  if (!tags.includes(tag)) die(`тега ${tag} в репозитории нет`);

  // A release for a tag nobody else can fetch would point at nothing. The tag has
  // to be on the remote first — that is a separate, deliberate step.
  const onRemote = execFileSync('git', ['-C', ROOT, 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`],
    { encoding: 'utf8' }).trim();
  if (!onRemote) { console.log(`${tag}: тега нет на origin — сначала push, потом релиз`); skipped++; continue; }

  const body = notes(tag);
  if (!body) { console.log(`${tag}: в CHANGELOG.md нет секции — пропускаю`); skipped++; continue; }

  if (published(tag)) { console.log(`${tag}: релиз уже есть`); skipped++; continue; }

  if (dry) {
    console.log(`\n=== ${tag} → ${repo}\n${body}\n`);
    made++;
    continue;
  }

  execFileSync('gh', ['release', 'create', tag, '-R', repo, '--title', tag, '--notes', body],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  console.log(`${tag}: опубликован`);
  made++;
}

console.log(`\n${dry ? 'сухой прогон: ' : ''}готово ${made}, пропущено ${skipped}`);
