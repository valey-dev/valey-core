#!/usr/bin/env node
// Feature notes: one file per feature, written in the branch that builds it,
// collected into one note per release.
//
//   node tools/notes.mjs                     # what is waiting for the next release
//   node tools/notes.mjs --new arrows-stop   # a fragment template, so the page is not blank
//   node tools/notes.mjs v0.23.0             # the note of one release
//   node tools/notes.mjs v0.10.0..v0.23.0    # every note over a span, oldest first
//
// Why fragments and not a note written at release time: a note assembled while
// cutting the release is written by whoever no longer remembers the feature, out
// of the commit subjects — that is, out of the same source as the changelog. It
// would be a second copy of the same text, longer, and the two would disagree on
// their second edit. A fragment is written while the stand is still up.
//
// So the changelog keeps coming from the commits and is embedded here verbatim:
// one fact, one source. What the fragment adds is the half no commit subject can
// carry — what was awkward before, which keys do it now, what was deliberately
// left out.
//
// The note is public-facing, and it is English for the same reason the changelog
// and the README are: it is read by whoever has not met this office yet.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, rmSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOTES_DIR = 'notes';
export const UNRELEASED = 'notes/unreleased';
// A picture is rendered in the feature branch, next to its fragment, and moves
// under the version at release time. Two fragments may well both call a shot
// `floor`, so the slug goes into the released name and nothing overwrites
// anything.
export const shotSource = (slug, id) => path.join(UNRELEASED, slug, `${id}.png`);
export const shotName = (slug, id) => `${slug}-${id}.png`;
// The «before» frame is the same recipe replayed on an older tag, and the tag it
// was replayed on is part of what the picture means: «this is what that looked
// like» is a claim about a version. It rides in the file name rather than in a
// sidecar — a sidecar can be lost, renamed or forgotten in a move, and then the
// picture is left asserting something about no version in particular.
const BEFORE = /^(.+)\.before-(v\d+\.\d+\.\d+)\.png$/;
export const beforeSource = (slug, id, tag) => path.join(UNRELEASED, slug, `${id}.before-${tag}.png`);
export const beforeName = (slug, id, tag) => `${slug}-${id}.before-${tag}.png`;

// What was rendered for this shot, if anything: the newest tag wins when a
// recipe has been replayed on several.
export function findBefore(root, slug, id) {
  const dir = path.join(root, UNRELEASED, slug);
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir)
    .map((f) => BEFORE.exec(f)).filter((m) => m && m[1] === id)
    .sort((a, b) => cmpTag(a[2], b[2])).pop();
  return hit ? { tag: hit[2], file: hit[0] } : null;
}

export const cmpTag = (a, b) => {
  const [x, y] = [a, b].map((v) => VER.exec(v).slice(1).map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
const VER = /^v(\d+)\.(\d+)\.(\d+)$/;

// The fields a fragment may carry. An unknown one is an error rather than a
// field quietly ignored: a misspelled `keys:` is invisible in the rendered note,
// and the whole point of the front matter is that it is machine-readable.
const FIELDS = new Set(['title', 'scope', 'keys', 'shots']);
const LISTS = new Set(['keys', 'shots']);
// `shots` is a list of recipes rather than of strings: an id to name the file by,
// and how to get the office to the right place. The recipe, not the picture, is
// what a fragment carries — a recipe can be replayed on an older tag, and that is
// where a real before-and-after comes from. A picture can only be looked at.
const MAPS = new Set(['shots']);
const SHOT_FIELDS = new Set(['id', 'url', 'keys', 'viewport']);

// A three-line parser instead of a YAML dependency. The project has none, and a
// front matter of three keys is not a reason for the first one.
export function parseFragment(text, name) {
  const fail = (m) => { throw new Error(`${name}: ${m}`); };
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) fail('no front matter; the file must start with a --- block');
  const front = {};
  let list = null;
  let item = null;
  for (const raw of m[1].split('\n')) {
    if (!raw.trim()) continue;
    const dash = /^\s+-\s+(.*)$/.exec(raw);
    if (dash) {
      if (!list) fail(`a list item with no field above it: ${raw.trim()}`);
      if (!MAPS.has(list)) { front[list].push(unquote(dash[1])); item = null; continue; }
      item = {};
      front[list].push(item);
      // A recipe opens on its own dash line and continues on the indented lines
      // below it, so `- id: x` has to be read as both at once.
      const first = /^([a-z]+):\s*(.*)$/.exec(dash[1]);
      if (!first) fail(`a shot starts with \`id:\`, not: ${dash[1]}`);
      shotField(item, first[1], first[2], fail);
      continue;
    }
    const kv = /^(\s*)([a-z]+):\s*(.*)$/.exec(raw);
    if (!kv) fail(`cannot read the line: ${raw.trim()}`);
    const [, indent, key, value] = kv;
    if (indent && item) { shotField(item, key, value, fail); continue; }
    if (!FIELDS.has(key)) fail(`unknown field \`${key}\`; expected ${[...FIELDS].join(', ')}`);
    item = null;
    if (LISTS.has(key)) { front[key] = []; list = key; if (value.trim()) fail(`\`${key}\` is a list; put the items on the lines below`); }
    else { front[key] = unquote(value); list = null; }
  }
  const body = m[2].trim();
  if (!front.title) fail('`title:` is required');
  if (!body) fail('the fragment has no text under the front matter');
  const shots = front.shots || [];
  const seen = new Set();
  for (const sh of shots) {
    if (!sh.id) fail('every shot needs an `id:` — it names the file');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(sh.id)) fail(`\`${sh.id}\` is not a usable file name; use letters, digits and dashes`);
    if (seen.has(sh.id)) fail(`two shots share the id \`${sh.id}\`; one would overwrite the other`);
    seen.add(sh.id);
  }
  return { title: front.title, scope: front.scope || '', keys: front.keys || [], shots, body };
}

function shotField(shot, key, value, fail) {
  if (!SHOT_FIELDS.has(key)) fail(`unknown shot field \`${key}\`; expected ${[...SHOT_FIELDS].join(', ')}`);
  shot[key] = unquote(value);
}

const unquote = (s) => s.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

export function readFragments(root) {
  const dir = path.join(root, UNRELEASED);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const frag = { file: path.join(UNRELEASED, f), slug,
        ...parseFragment(readFileSync(path.join(dir, f), 'utf8'), f) };
      // A «before» frame is never declared in the front matter: it is not part of
      // what the feature is, it is a picture that either got taken or did not.
      for (const sh of frag.shots) {
        const b = findBefore(root, slug, sh.id);
        if (b) sh.before = b;
      }
      return frag;
    });
}

export function renderNote(tag, date, fragments, section) {
  const out = [`# ${tag} — ${date}`, ''];
  for (const f of fragments) {
    out.push(`## ${f.title}`, '');
    if (f.scope) out.push(`*${f.scope}*`, '');
    out.push(f.body, '');
    for (const sh of f.shots || []) {
      // Before first: it is the sentence «it used to look like this», and it
      // only reads that way when the reader meets it before the answer.
      if (sh.before) {
        out.push(`*Before, ${sh.before.tag}*`, '');
        out.push(`![${f.title}, before](${tag}/${beforeName(f.slug, sh.id, sh.before.tag)})`, '');
        out.push(`*After, ${tag}*`, '');
      }
      out.push(`![${f.title}](${tag}/${shotName(f.slug, sh.id)})`, '');
    }
    if (f.keys.length) {
      out.push('**Keys**', '');
      for (const k of f.keys) out.push(`- ${k}`);
      out.push('');
    }
  }
  // The changelog section verbatim, under the prose: the bullet list stays
  // generated from the commits, and this file never becomes a second source for it.
  out.push(section.replace(/^## .*\n/, '### What changed\n').trim(), '');
  return out.join('\n');
}

// The guard. A repository without a `notes/` folder has not opted in, and the
// release goes on as it did — the modules repository borrows this suite and has
// no audience for notes.
export function checkNotes(root, { kind, feats, fragments, allow }) {
  if (!existsSync(path.join(root, NOTES_DIR))) return { ok: true, skip: true };
  if (fragments.length) return { ok: true };
  const owed = kind === 'minor' || kind === 'major' || feats.length > 0;
  if (!owed || allow) return { ok: true, bare: owed };
  return { ok: false, note:
    `this release carries ${feats.length ? `${feats.length} feature${feats.length > 1 ? 's' : ''}` : 'a feature'} and no feature note.\n` +
    `  A note is written in the branch that builds the feature, not here:\n` +
    `    node tools/notes.mjs --new <slug>\n` +
    '  A release that genuinely needs none goes out with --no-note.' };
}

// A fragment that declares a shot and has no picture next to it would render an
// empty image in the note, and nobody looks at their own note again after the
// release. So it is checked before the tag rather than after.
export function missingShots(root, fragments) {
  const out = [];
  for (const f of fragments)
    for (const sh of f.shots || [])
      if (!existsSync(path.join(root, shotSource(f.slug, sh.id)))) out.push(`${f.slug}/${sh.id}`);
  return out;
}

export function assemble(root, tag, date, fragments, section) {
  const file = path.join(NOTES_DIR, `${tag}.md`);
  writeFileSync(path.join(root, file), renderNote(tag, date, fragments, section));

  // The pictures move under the version, and the recipes move with them. The
  // recipe is the half that keeps working: replayed on an older tag it is what
  // makes a before-and-after possible, and a picture whose recipe was thrown
  // away can never be taken again.
  const shots = [];
  for (const f of fragments) {
    for (const sh of f.shots || []) {
      mkdirSync(path.join(root, NOTES_DIR, tag), { recursive: true });
      renameSync(path.join(root, shotSource(f.slug, sh.id)),
        path.join(root, NOTES_DIR, tag, shotName(f.slug, sh.id)));
      if (sh.before)
        renameSync(path.join(root, UNRELEASED, f.slug, sh.before.file),
          path.join(root, NOTES_DIR, tag, beforeName(f.slug, sh.id, sh.before.tag)));
      shots.push({ file: shotName(f.slug, sh.id), slug: f.slug, ...sh,
        ...(sh.before ? { before: { tag: sh.before.tag, file: beforeName(f.slug, sh.id, sh.before.tag) } } : {}) });
    }
    if ((f.shots || []).length) rmSync(path.join(root, UNRELEASED, f.slug), { recursive: true, force: true });
    unlinkSync(path.join(root, f.file));
  }
  if (shots.length)
    writeFileSync(path.join(root, NOTES_DIR, tag, 'shots.json'), JSON.stringify({ tag, shots }, null, 2) + '\n');
  return file;
}

const TEMPLATE = (slug) => `---
title: ${slug.replace(/-/g, ' ')}
scope: office
keys:
  - "\`→\` — what it does now"
shots:
  - id: ${slug}
    url: "#room=standup"
    keys: "Enter,wait:2500"
---

What was awkward before, in a sentence or two.

What it does now, and what was deliberately left out.
`;

// Everything below runs only when this file is called, not when it is imported:
// release.mjs imports the pieces above and must not cut anything by doing so.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = process.env.VALEY_REPO
    ? path.resolve(process.env.VALEY_REPO)
    : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const die = (m) => { console.error('notes: ' + m); process.exit(1); };
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--new');

  if (at >= 0) {
    const slug = argv[at + 1];
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) die('--new needs a slug like `arrows-stop`');
    const dir = path.join(ROOT, UNRELEASED);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, slug + '.md');
    // Never overwritten, for the same reason a video draft is not: an edited
    // fragment is worth more than a fresh one.
    if (existsSync(file)) die(`${path.join(UNRELEASED, slug)}.md already exists`);
    writeFileSync(file, TEMPLATE(slug));
    console.log(path.join(UNRELEASED, slug + '.md'));
  } else if (argv[0] && !argv[0].startsWith('--')) {
    const [a, b] = argv[0].includes('..') ? argv[0].split('..') : [argv[0], argv[0]];
    if (!VER.test(a) || !VER.test(b)) die(`not a version or a version range: ${argv[0]}`);
    const key = (v) => VER.exec(v).slice(1).map(Number);
    const le = (x, y) => { const [p, q] = [key(x), key(y)]; return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; };
    const dir = path.join(ROOT, NOTES_DIR);
    const have = (existsSync(dir) ? readdirSync(dir) : [])
      .filter((f) => VER.test(f.replace(/\.md$/, ''))).map((f) => f.replace(/\.md$/, ''))
      .filter((v) => le(v, a) >= 0 && le(v, b) <= 0).sort(le);
    if (!have.length) die(`no notes in ${a}..${b}`);
    console.log(have.map((v) => readFileSync(path.join(dir, v + '.md'), 'utf8').trim()).join('\n\n---\n\n'));
  } else {
    let frs;
    try { frs = readFragments(ROOT); } catch (e) { die(e.message); }
    if (!frs.length) { console.log('no feature notes are waiting for the next release'); process.exit(0); }
    console.log(`${frs.length} feature note${frs.length > 1 ? 's' : ''} waiting for the next release:`);
    for (const f of frs) console.log(`  ${f.slug} — ${f.title}${f.scope ? ` (${f.scope})` : ''}`);
  }
}
