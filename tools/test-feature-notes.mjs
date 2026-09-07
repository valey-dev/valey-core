// node tools/test-feature-notes.mjs — the feature-note fragments and their
// assembly into one note per release.
//
// The rule this defends: a note is written in the branch that builds the feature
// and collected at release time, so the changelog stays the only source of the
// bullet list and the note is the only place with prose. Two things break
// quietly and are therefore checked here — a misspelled front-matter field,
// which is invisible in the rendered note, and a release cut with a feature and
// no note at all, which is how the whole habit dies after two versions.
//
// The pieces live in notes.mjs so this stand can load them: importing
// release.mjs would cut a release.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFragment, readFragments, renderNote, checkNotes, assemble } from './notes.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', String(got).slice(0, 300)); }
};
const fails = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

// --- the front matter ----------------------------------------------------
const good = `---
title: The arrows stop at the ends
scope: office
keys:
  - "\`→\` — the next card, and it stops at the last one"
  - "\`←\` — back"
---

Holding the arrow used to run off the end and wrap around.

Now it stops.
`;
const f = parseFragment(good, 'arrows.md');
ok('the title is read', f.title === 'The arrows stop at the ends', f);
ok('the scope is read', f.scope === 'office', f);
ok('both keys arrived, unquoted', f.keys.length === 2 && f.keys[1] === '`←` — back', f.keys);
ok('the body is everything under the front matter', /^Holding/.test(f.body) && /Now it stops\.$/.test(f.body), f.body);

ok('a misspelled field is a failure, not a field ignored',
  /unknown field `keyz`/.test(fails(() => parseFragment('---\ntitle: x\nkeyz:\n  - a\n---\n\nbody\n', 'x.md'))),
  fails(() => parseFragment('---\ntitle: x\nkeyz:\n  - a\n---\n\nbody\n', 'x.md')));
ok('a fragment without a title is a failure',
  /`title:` is required/.test(fails(() => parseFragment('---\nscope: office\n---\n\nbody\n', 'x.md'))));
ok('a fragment without a body is a failure',
  /no text/.test(fails(() => parseFragment('---\ntitle: x\n---\n', 'x.md'))));
ok('a file with no front matter is a failure',
  /no front matter/.test(fails(() => parseFragment('just text\n', 'x.md'))));
ok('a list item with no field above it is a failure',
  /list item/.test(fails(() => parseFragment('---\n  - a\n---\n\nbody\n', 'x.md'))));

// --- the rendered note ---------------------------------------------------
const section = '## v0.24.0 — 8 September 2026\n\n### Added\n\n- **office:** the arrows stop (abc1234)\n';
const note = renderNote('v0.24.0', '8 September 2026', [f], section);
ok('the note opens with the version and the date', note.startsWith('# v0.24.0 — 8 September 2026'), note.slice(0, 60));
ok('the prose is in it', note.includes('Holding the arrow'), note);
ok('the keys are a list under a heading', /\*\*Keys\*\*\n\n- `→`/.test(note), note);
// The changelog is embedded rather than rewritten: the moment this file starts
// composing its own bullets, there are two sources for one fact.
ok('the changelog section is embedded verbatim', note.includes('- **office:** the arrows stop (abc1234)'), note);
ok('and demoted to a heading inside the note, not a second top-level one',
  note.includes('### What changed') && !note.includes('## v0.24.0 — 8'), note);

// --- the guard -----------------------------------------------------------
const feats = [{ hash: 'abc1234', subject: 'feat(office): the arrows stop' }];
ROOTS: {
  const root = mkdtempSync(path.join(tmpdir(), 'valey-notes-'));
  // A repository that never opted in releases exactly as it did before.
  ok('without a notes/ folder the guard stands aside',
    checkNotes(root, { kind: 'minor', feats, fragments: [], allow: false }).ok === true);

  mkdirSync(path.join(root, 'notes/unreleased'), { recursive: true });
  ok('a minor with a feature and no fragment is refused',
    checkNotes(root, { kind: 'minor', feats, fragments: [], allow: false }).ok === false);
  ok('and the refusal says how to write one',
    /--new/.test(checkNotes(root, { kind: 'minor', feats, fragments: [], allow: false }).note || ''));
  ok('--no-note lets it through, and says it went bare',
    checkNotes(root, { kind: 'minor', feats, fragments: [], allow: true }).bare === true);
  ok('a patch with no features owes nothing',
    checkNotes(root, { kind: 'patch', feats: [], fragments: [], allow: false }).ok === true);
  ok('a fragment satisfies it',
    checkNotes(root, { kind: 'minor', feats, fragments: [f], allow: false }).ok === true);

  // --- assembly ----------------------------------------------------------
  writeFileSync(path.join(root, 'notes/unreleased/arrows.md'), good);
  const read = readFragments(root);
  ok('the fragment is found and carries its slug', read.length === 1 && read[0].slug === 'arrows', read);

  const file = assemble(root, 'v0.24.0', '8 September 2026', read, section);
  ok('the note landed under its version', file === 'notes/v0.24.0.md' && existsSync(path.join(root, file)), file);
  ok('with the prose in it', readFileSync(path.join(root, file), 'utf8').includes('Holding the arrow'));
  // A fragment left behind would be collected again by the next release, and the
  // same feature would appear in two notes.
  ok('and the fragment is gone', !existsSync(path.join(root, 'notes/unreleased/arrows.md')));
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall green');
process.exit(bad ? 1 : 0);
