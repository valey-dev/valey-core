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
//
// The page also carries what install.sh downloads: the tarball of the tag and
// the checksum beside it, built by tools/dist.mjs. valey.dev/dist/ is a redirect
// to these assets, so a release without them is a version the one-liner cannot
// install — the four files are as much a part of the release as the notes.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The root comes from this file rather than from the cwd, for the reason
// release.mjs carries in its own header: git and the files have to look at one
// repository.
const ROOT = process.env.VALEY_REPO
  ? path.resolve(process.env.VALEY_REPO)
  : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
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
if (!tags.length) die('the repository has no v* tags');

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

// What is already published, and with how many files. `gh` answers with an
// error when the release is not there, and that is not a failure — it is the
// normal case for a fresh tag. A page that exists but carries no assets is the
// state every release was in before 11 September 2026, and it is caught up
// here rather than by hand.
function published(tag) {
  try {
    const out = execFileSync('gh', ['release', 'view', tag, '-R', repo, '--json', 'assets', '-q', '.assets | length'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { assets: Number(out.trim()) };
  } catch { return null; }
}

// The four files install.sh asks for, built into a folder that goes away with
// the run. dist.mjs is asked rather than imported: it is a command, and it
// prints where the bytes came from.
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
function assets(tag) {
  const out = mkdtempSync(path.join(tmpdir(), 'valey-dist-'));
  execFileSync(process.execPath, [path.join(TOOLS, 'dist.mjs'), tag, '--out', out],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'ignore', 'inherit'] });
  return { dir: out, files: readdirSync(out).sort().map((f) => path.join(out, f)) };
}

// The repository is asked of git rather than hardcoded: this tree has two remotes
// in its future — the private staging one and the public one — and a release must
// land where the tag was pushed.
let repo;
try {
  repo = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {
  die('gh did not respond: it is missing, unauthorized, or this is not a GitHub repository');
}

const wanted = all ? tags : [asked || tags[tags.length - 1]];
let made = 0, skipped = 0;

for (const tag of wanted) {
  if (!tags.includes(tag)) die(`tag ${tag} does not exist in the repository`);

  // A release for a tag nobody else can fetch would point at nothing. The tag has
  // to be on the remote first — that is a separate, deliberate step.
  const onRemote = execFileSync('git', ['-C', ROOT, 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`],
    { encoding: 'utf8' }).trim();
  if (!onRemote) { console.log(`${tag}: tag is absent from origin; push it before creating a release`); skipped++; continue; }

  const body = notes(tag);
  if (!body) { console.log(`${tag}: CHANGELOG.md has no section; skipping`); skipped++; continue; }

  const have = published(tag);
  if (have && have.assets > 0) { console.log(`${tag}: release already exists`); skipped++; continue; }

  if (dry) {
    const names = assets(tag);
    console.log(`\n=== ${tag} → ${repo}${have ? ' (page exists, assets missing)' : ''}\n${body}\n`);
    console.log(names.files.map((f) => '  + ' + path.basename(f)).join('\n'));
    rmSync(names.dir, { recursive: true, force: true });
    made++;
    continue;
  }

  const built = assets(tag);
  try {
    if (have) {
      execFileSync('gh', ['release', 'upload', tag, '-R', repo, ...built.files],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
      console.log(`${tag}: page existed without files; ${built.files.length} assets added`);
    } else {
      execFileSync('gh', ['release', 'create', tag, '-R', repo, '--title', tag, '--notes', body, ...built.files],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
      console.log(`${tag}: published with ${built.files.length} assets`);
    }
  } finally {
    rmSync(built.dir, { recursive: true, force: true });
  }
  made++;
}

console.log(`\n${dry ? 'dry run: ' : ''}created ${made}, skipped ${skipped}`);
