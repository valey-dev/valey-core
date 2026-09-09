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
import { parseFragment, readFragments, renderNote, checkNotes, missingShots, assemble, shotSource } from './notes.mjs';

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
shots:
  - id: standup
    url: "#room=standup"
    keys: "Enter,wait:2500"
  - id: floor
---

Holding the arrow used to run off the end and wrap around.

Now it stops.
`;
const f = { slug: 'arrows', ...parseFragment(good, 'arrows.md') };
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

// --- the shot recipes ----------------------------------------------------
// The recipe, not the picture, is what the fragment carries: a recipe replays on
// an older tag, which is the whole reason a before-and-after is possible at all.
ok('both recipes arrived', f.shots.length === 2, f.shots);
ok('a recipe reads its indented lines', f.shots[0].url === '#room=standup' && f.shots[0].keys === 'Enter,wait:2500', f.shots[0]);
ok('a recipe may be an id and nothing else', f.shots[1].id === 'floor' && !f.shots[1].keys, f.shots[1]);
ok('an id that cannot be a file name is a failure',
  /not a usable file name/.test(fails(() => parseFragment('---\ntitle: x\nshots:\n  - id: ../etc\n---\n\nbody\n', 'x.md'))));
// Two shots called the same thing would land on one file, and the second would
// silently be the only one left.
ok('two recipes with one id is a failure',
  /share the id/.test(fails(() => parseFragment('---\ntitle: x\nshots:\n  - id: a\n  - id: a\n---\n\nbody\n', 'x.md'))));
ok('a misspelled shot field is a failure too',
  /unknown shot field `keyz`/.test(fails(() => parseFragment('---\ntitle: x\nshots:\n  - id: a\n    keyz: b\n---\n\nbody\n', 'x.md'))));
ok('an ordinary field after a recipe is still an ordinary field',
  parseFragment('---\nshots:\n  - id: a\ntitle: x\n---\n\nbody\n', 'x.md').title === 'x');

// --- the rendered note ---------------------------------------------------
const section = '## v0.24.0 — 8 September 2026\n\n### Added\n\n- **office:** the arrows stop (abc1234)\n';
const note = renderNote('v0.24.0', '8 September 2026', [f], section);
ok('the note opens with the version and the date', note.startsWith('# v0.24.0 — 8 September 2026'), note.slice(0, 60));
ok('the prose is in it', note.includes('Holding the arrow'), note);
ok('the keys are a list under a heading', /\*\*Keys\*\*\n\n- `→`/.test(note), note);
ok('the pictures are in the note, named by version, slug and id',
  note.includes('![The arrows stop at the ends](v0.24.0/arrows-standup.png)')
  && note.includes('(v0.24.0/arrows-floor.png)'), note);
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

  // --- the pictures ------------------------------------------------------
  ok('a declared picture that was never rendered is named',
    missingShots(root, read).join(',') === 'arrows/standup,arrows/floor', missingShots(root, read));
  mkdirSync(path.join(root, 'notes/unreleased/arrows'), { recursive: true });
  for (const id of ['standup', 'floor']) writeFileSync(path.join(root, shotSource('arrows', id)), 'png');
  ok('and once rendered, nothing is missing', missingShots(root, read).length === 0, missingShots(root, read));

  const file = assemble(root, 'v0.24.0', '8 September 2026', read, section);
  ok('the note landed under its version', file === 'notes/v0.24.0.md' && existsSync(path.join(root, file)), file);
  ok('with the prose in it', readFileSync(path.join(root, file), 'utf8').includes('Holding the arrow'));
  // A fragment left behind would be collected again by the next release, and the
  // same feature would appear in two notes.
  ok('and the fragment is gone', !existsSync(path.join(root, 'notes/unreleased/arrows.md')));
  ok('the pictures moved under the version',
    existsSync(path.join(root, 'notes/v0.24.0/arrows-standup.png'))
    && existsSync(path.join(root, 'notes/v0.24.0/arrows-floor.png')));
  ok('and left nothing behind to be collected twice',
    !existsSync(path.join(root, 'notes/unreleased/arrows')));
  // The recipes travel with the pictures: a frame whose recipe was thrown away
  // can never be taken again, on this tag or an older one.
  const side = JSON.parse(readFileSync(path.join(root, 'notes/v0.24.0/shots.json'), 'utf8'));
  ok('the recipes were kept next to them',
    side.tag === 'v0.24.0' && side.shots.length === 2 && side.shots[0].keys === 'Enter,wait:2500', side);
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall green');
process.exit(bad ? 1 : 0);
