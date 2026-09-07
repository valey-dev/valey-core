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
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOTES_DIR = 'notes';
export const UNRELEASED = 'notes/unreleased';
const VER = /^v(\d+)\.(\d+)\.(\d+)$/;

// The fields a fragment may carry. An unknown one is an error rather than a
// field quietly ignored: a misspelled `keys:` is invisible in the rendered note,
// and the whole point of the front matter is that it is machine-readable.
const FIELDS = new Set(['title', 'scope', 'keys']);
const LISTS = new Set(['keys']);

// A three-line parser instead of a YAML dependency. The project has none, and a
// front matter of three keys is not a reason for the first one.
export function parseFragment(text, name) {
  const fail = (m) => { throw new Error(`${name}: ${m}`); };
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) fail('no front matter; the file must start with a --- block');
  const front = {};
  let list = null;
  for (const raw of m[1].split('\n')) {
    if (!raw.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item) {
      if (!list) fail(`a list item with no field above it: ${raw.trim()}`);
      front[list].push(unquote(item[1]));
      continue;
    }
    const kv = /^([a-z]+):\s*(.*)$/.exec(raw);
    if (!kv) fail(`cannot read the line: ${raw.trim()}`);
    const [, key, value] = kv;
    if (!FIELDS.has(key)) fail(`unknown field \`${key}\`; expected ${[...FIELDS].join(', ')}`);
    if (LISTS.has(key)) { front[key] = []; list = key; if (value.trim()) fail(`\`${key}\` is a list; put the items on the lines below`); }
    else { front[key] = unquote(value); list = null; }
  }
  const body = m[2].trim();
  if (!front.title) fail('`title:` is required');
  if (!body) fail('the fragment has no text under the front matter');
  return { title: front.title, scope: front.scope || '', keys: front.keys || [], body };
}

const unquote = (s) => s.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

export function readFragments(root) {
  const dir = path.join(root, UNRELEASED);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
    .map((f) => ({ file: path.join(UNRELEASED, f), slug: f.replace(/\.md$/, ''),
      ...parseFragment(readFileSync(path.join(dir, f), 'utf8'), f) }));
}

export function renderNote(tag, date, fragments, section) {
  const out = [`# ${tag} — ${date}`, ''];
  for (const f of fragments) {
    out.push(`## ${f.title}`, '');
    if (f.scope) out.push(`*${f.scope}*`, '');
    out.push(f.body, '');
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
    `this release carries ${feats.length || 'a feature'} and no feature note.\n` +
    `  A note is written in the branch that builds the feature, not here:\n` +
    `    node tools/notes.mjs --new <slug>\n` +
    '  A release that genuinely needs none goes out with --no-note.' };
}

export function assemble(root, tag, date, fragments, section) {
  const file = path.join(NOTES_DIR, `${tag}.md`);
  writeFileSync(path.join(root, file), renderNote(tag, date, fragments, section));
  for (const f of fragments) unlinkSync(path.join(root, f.file));
  return file;
}

const TEMPLATE = (slug) => `---
title: ${slug.replace(/-/g, ' ')}
scope: office
keys:
  - "\`→\` — what it does now"
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
