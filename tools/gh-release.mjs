#!/usr/bin/env node
// Publish a tag as a GitHub release, with the notes it already has.
//
//   node tools/gh-release.mjs            # the newest tag
//   node tools/gh-release.mjs v0.4.0     # a particular one
//   node tools/gh-release.mjs --all      # every tag that has no release yet
//   node tools/gh-release.mjs --dry      # print what would be sent
//   node tools/gh-release.mjs --all --remote public   # the pages of another remote
//   node tools/gh-release.mjs --all --refresh          # rewrite bodies already published
//   node tools/gh-release.mjs v0.41.0 --remote public --since v0.38.0   # one page for three versions
//
// Why this exists. Until 5 September 2026 the project had three tags and zero
// releases on GitHub: the notes were written, assembled from the commits, and
// went nowhere anybody looks. A tag is a pointer for git; a release is the page
// a human opens. Calling the first one "a release" in conversation and never
// making the second is how the word quietly stops meaning anything.
//
// The body is not composed here. It is the version's feature note when it has
// one — notes/vX.Y.Z.md, pictures and all — and otherwise the section of
// CHANGELOG.md for that version, verbatim. Still one text, one source: the note
// embeds that same changelog section word for word under «What changed», so the
// bullet list is never written twice. What the note adds is the half a commit
// subject cannot carry, and until 11 September 2026 none of it reached the page.
//
// The page also carries what install.sh downloads: the tarball of the tag and
// the checksum beside it, built by tools/dist.mjs. valey.dev/dist/ is a redirect
// to these assets, so a release without them is a version the one-liner cannot
// install — the four files are as much a part of the release as the notes.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { releaseBody } from './notes.mjs';
import { carried } from './promote-plan.mjs';

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
// A page published before its note existed — every backfilled release, and
// every release cut before notes reached the page — keeps its old body until
// somebody rewrites it. --refresh does that, and only where the body differs.
const refresh = args.includes('--refresh');
// The remote decides the repository. Since 11 September 2026 this tree has
// two — the private staging `origin` and the public one — and a release page
// belongs to whichever the tag was pushed to. `--remote` names it; the
// repository is read off that remote's URL rather than asked of `gh`, which
// with two remotes would answer for whichever it was told to prefer.
const remoteAt = args.indexOf('--remote');
const remote = remoteAt < 0 ? 'origin' : args[remoteAt + 1];
// A publication carries every version since the last published one (see
// promote-plan.mjs), and its page has to say so: `--since v0.38.0` makes the
// body of v0.41.0 the sections of v0.41.0, v0.40.0 and v0.39.0, newest first.
// The owner asked for exactly that on 12 September 2026 — iterations checked
// at home go out together, with notes for all of them.
const sinceAt = args.indexOf('--since');
const since = sinceAt < 0 ? null : args[sinceAt + 1];
// `remoteAt + 1` is the remote's name, not a tag — but only when --remote was
// given. Without the guard it is index 0, and `gh-release.mjs v0.4.0` threw the
// tag away and published the newest one instead. Nobody noticed because the one
// caller that passes a tag, release.mjs, always passes the newest. The value of
// --since is skipped the same way.
const asked = args.find((a, i) => !a.startsWith('--')
  && !(remoteAt >= 0 && i === remoteAt + 1) && !(sinceAt >= 0 && i === sinceAt + 1));
if (since && args.includes('--all')) die('--since speaks for one publication; it cannot be combined with --all');

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

// The body for one tag: the note if there is one the remote can serve, the
// changelog section otherwise. «Can serve» is the part that bites. The pictures
// are linked at the commit that last touched the note, and a commit the remote
// has never received is a page of broken images — so a note whose commit is
// not on the remote's main yet falls back to the changelog, out loud.
function bodyFor(tag) {
  const file = path.join(ROOT, 'notes', `${tag}.md`);
  if (!existsSync(file)) return { text: notes(tag), from: 'changelog' };
  const sha = git('log', '-1', '--format=%H', '--', `notes/${tag}.md`, `notes/${tag}`);
  const remoteMain = execFileSync('git', ['-C', ROOT, 'ls-remote', remote, 'refs/heads/main'],
    { encoding: 'utf8' }).split(/\s/)[0];
  let served = false;
  try { git('merge-base', '--is-ancestor', sha, remoteMain); served = true; } catch { /* not there, or unknown here */ }
  if (!served) {
    console.log(`${tag}: the note's commit ${sha.slice(0, 7)} is not on ${remote}/main; using the changelog`);
    return { text: notes(tag), from: 'changelog' };
  }
  return { text: releaseBody(readFileSync(file, 'utf8'), { repo, sha }), from: 'note' };
}

// The body of a publication that carries several versions: each one's own body
// under its changelog heading, newest first. One version is its body as before,
// so a page that carries a single release reads exactly as it always did.
function bodyOver(tag) {
  const span = carried(tags, since, tag).reverse();
  if (span.length < 2) return bodyFor(tag);
  const md = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').split('\n');
  const parts = [];
  for (const t of span) {
    const { text } = bodyFor(t);
    if (!text) continue;
    const head = md.find((l) => l.startsWith(`## ${t} `) || l.trim() === `## ${t}`);
    parts.push(head || `## ${t}`, '', text.trim(), '');
  }
  return { text: parts.join('\n').trim(), from: `${span.length} versions since ${since}` };
}

function currentBody(tag) {
  try {
    return execFileSync('gh', ['release', 'view', tag, '-R', repo, '--json', 'body', '-q', '.body'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
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
// Only the office has an installer. dist.mjs builds from the repository it lives
// in — the core — whatever it is called for, so on a Modules release it went
// looking for a core tag of the same name. The core has an old v0.8.0 and
// v0.9.0, and those Modules pages quietly carried the office tarballs of a
// month ago; v0.9.1 has no namesake and the page failed. The office is known by
// its server, which the Modules do not have.
const carries = existsSync(path.join(ROOT, 'server/index.js'));
function assets(tag) {
  if (!carries) return { dir: null, files: [] };
  const out = mkdtempSync(path.join(tmpdir(), 'valey-dist-'));
  execFileSync(process.execPath, [path.join(TOOLS, 'dist.mjs'), tag, '--out', out],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'ignore', 'inherit'] });
  return { dir: out, files: readdirSync(out).sort().map((f) => path.join(out, f)) };
}

// The repository is read off the remote rather than hardcoded, so a release
// lands where the tag was pushed.
let repo;
try {
  const url = git('remote', 'get-url', remote);
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!m) die(`remote ${remote} is not on GitHub: ${url}`);
  repo = m[1];
} catch (e) {
  die(`no remote called ${remote}: ${e.message.split('\n')[0]}`);
}

const wanted = all ? tags : [asked || tags[tags.length - 1]];
let made = 0, skipped = 0;

for (const tag of wanted) {
  if (!tags.includes(tag)) die(`tag ${tag} does not exist in the repository`);

  // A release for a tag nobody else can fetch would point at nothing. The tag has
  // to be on the remote first — that is a separate, deliberate step.
  const onRemote = execFileSync('git', ['-C', ROOT, 'ls-remote', '--tags', remote, `refs/tags/${tag}`],
    { encoding: 'utf8' }).trim();
  if (!onRemote) { console.log(`${tag}: tag is absent from ${remote}; push it before creating a release`); skipped++; continue; }

  const { text: body, from } = since ? bodyOver(tag) : bodyFor(tag);
  if (!body) { console.log(`${tag}: CHANGELOG.md has no section; skipping`); skipped++; continue; }

  const have = published(tag);
  // --refresh touches bodies and nothing else: it neither creates a page nor
  // uploads the files a page is missing. Those are the ordinary run's job, and a
  // flag meant to fix prose should not start building tarballs of old tags.
  if (refresh && !have) { console.log(`${tag}: no release page to refresh`); skipped++; continue; }
  // A page without files is finished when there is nothing to attach.
  if (have && (have.assets > 0 || refresh || !carries)) {
    if (!refresh) { console.log(`${tag}: release already exists`); skipped++; continue; }
    // Compared after trimming: GitHub hands the body back without the final
    // newline, and a refresh that rewrites every page to add one is noise.
    if ((currentBody(tag) || '').trim() === body.trim()) { console.log(`${tag}: body already current`); skipped++; continue; }
    if (dry) { console.log(`\n=== ${tag} → ${repo}: body would be rewritten from the ${from}\n${body}`); made++; continue; }
    execFileSync('gh', ['release', 'edit', tag, '-R', repo, '--notes', body],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    console.log(`${tag}: body rewritten from the ${from}`);
    made++;
    continue;
  }

  if (dry) {
    const names = assets(tag);
    console.log(`\n=== ${tag} → ${repo}${have ? ' (page exists, assets missing)' : ''}, body from the ${from}\n${body}\n`);
    console.log(names.files.map((f) => '  + ' + path.basename(f)).join('\n') || '  (no installer files: not the office)');
    if (names.dir) rmSync(names.dir, { recursive: true, force: true });
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
      console.log(`${tag}: published with ${built.files.length} assets, body from the ${from}`);
    }
  } finally {
    if (built.dir) rmSync(built.dir, { recursive: true, force: true });
  }
  made++;
}

console.log(`\n${dry ? 'dry run: ' : ''}${refresh ? 'written' : 'created'} ${made}, skipped ${skipped}`);
