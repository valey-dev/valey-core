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
import { parseFragment, readFragments, renderNote, checkNotes, missingShots, unpictured, assemble, shotSource, beforeSource, findBefore, cmpTag, releaseBody } from './notes.mjs';

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

// --- the before half -----------------------------------------------------
// The tag rides in the file name rather than in a sidecar: a picture that has
// lost track of which version it shows asserts nothing in particular.
const withBefore = renderNote('v0.26.0', '9 September 2026',
  [{ ...f, shots: [{ id: 'standup', before: { tag: 'v0.12.0', file: 'standup.before-v0.12.0.png' } }] }],
  section);
ok('the pair is captioned with the tag it was replayed on',
  withBefore.includes('*Before, v0.12.0*') && withBefore.includes('*After, v0.26.0*'), withBefore);
ok('and before comes first, which is the whole sentence',
  withBefore.indexOf('*Before') < withBefore.indexOf('](v0.26.0/arrows-standup.png)'), withBefore);
ok('the old frame keeps its tag in the released name',
  withBefore.includes('![The arrows stop at the ends, before](v0.26.0/arrows-standup.before-v0.12.0.png)'), withBefore);
ok('versions sort by number, not as text', cmpTag('v0.9.0', 'v0.12.0') < 0, cmpTag('v0.9.0', 'v0.12.0'));

// --- the note as a release page -------------------------------------------
// Until 11 September 2026 the page got the changelog section alone, and every
// frame stayed in notes/ where nobody opening a release would meet it.
const page = releaseBody(withBefore, { repo: 'valey-dev/valey-core', sha: 'abc123' });
ok('the version heading goes — GitHub prints it above the body already',
  !page.startsWith('# ') && page.startsWith('## The arrows stop at the ends'), page.slice(0, 60));
ok('pictures become absolute and pinned to the commit, not to a branch',
  page.includes('](https://github.com/valey-dev/valey-core/raw/abc123/notes/v0.26.0/arrows-standup.png)')
  && page.includes('](https://github.com/valey-dev/valey-core/raw/abc123/notes/v0.26.0/arrows-standup.before-v0.12.0.png)'), page);
ok('no relative picture survives', !/!\[[^\]]*\]\((?!https:)/.test(page), page);
ok('the changelog section rides along unchanged', page.includes('- **office:** the arrows stop (abc1234)'), page);
ok('a picture that is already absolute is left alone',
  releaseBody('# v1\n\n![x](https://example.com/a.png)\n', { repo: 'r/r', sha: 's' }).includes('](https://example.com/a.png)'));

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

  // A before frame is optional by design, and it is found on disk rather than
  // declared: whether a comparison is worth making is a judgement.
  ok('no before frame is not a problem', findBefore(root, 'arrows', 'standup') === null);
  writeFileSync(path.join(root, beforeSource('arrows', 'standup', 'v0.12.0')), 'png');
  writeFileSync(path.join(root, beforeSource('arrows', 'standup', 'v0.9.0')), 'png');
  const found = findBefore(root, 'arrows', 'standup');
  ok('replayed on several tags, the newest wins', found.tag === 'v0.12.0', found);
  const again = readFragments(root);
  ok('and the fragment picks it up without declaring it',
    again[0].shots[0].before.tag === 'v0.12.0' && !again[0].shots[1].before, again[0].shots);

  const file = assemble(root, 'v0.24.0', '8 September 2026', again, section);
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
  ok('the before frame moved under the version too, tag and all',
    existsSync(path.join(root, 'notes/v0.24.0/arrows-standup.before-v0.12.0.png')));
  const side = JSON.parse(readFileSync(path.join(root, 'notes/v0.24.0/shots.json'), 'utf8'));
  ok('the recipes were kept next to them',
    side.tag === 'v0.24.0' && side.shots.length === 2 && side.shots[0].keys === 'Enter,wait:2500', side);
  ok('and the recipe records which tag the before half came from',
    side.shots[0].before.tag === 'v0.12.0'
    && side.shots[0].before.file === 'arrows-standup.before-v0.12.0.png', side.shots[0]);
}

// ---------------------------------------------------------- a picture is owed
// 13 September 2026: 13 of the 17 feature notes since v0.32.0 had no picture,
// six of them for things plainly on the screen. A note now carries a shot or
// says why it has none; the release refuses one with neither.
{
  const bare = { slug: 'bare', ...parseFragment('---\ntitle: A thing\n---\n\nIt does a thing.\n', 'bare.md') };
  const why = { slug: 'why', ...parseFragment('---\ntitle: A tool\nnopicture: a terminal tool, nothing in the office changes\n---\n\nIt prints.\n', 'why.md') };
  const shot = { slug: 'shot', ...parseFragment('---\ntitle: A room\nshots:\n  - id: room\n    url: "#room=standup"\n---\n\nIt shows.\n', 'shot.md') };
  ok('the reason for no picture is read', why.nopicture === 'a terminal tool, nothing in the office changes', why.nopicture);
  ok('a note with neither a shot nor a reason is owed a picture', JSON.stringify(unpictured([bare, why, shot])) === '["bare"]', unpictured([bare, why, shot]));
  ok('a shot and a reason together are a contradiction, not a choice',
    /both/.test(fails(() => parseFragment('---\ntitle: x\nnopicture: no\nshots:\n  - id: a\n---\n\nbody\n', 'x.md'))));
  const md = renderNote('v0.99.0', '13 September 2026', [why], '## v0.99.0\n\n- **tools:** a thing\n');
  ok('the reason stays in the file as a comment, off the page', md.includes('<!-- no picture: a terminal tool, nothing in the office changes -->'), md);
  ok('a double dash cannot close the comment early',
    !renderNote('v0.99.0', 'd', [{ ...why, nopicture: 'a -- b' }], '## v\n').includes('a -- b'));
  const setup = parseFragment('---\ntitle: The pager\nshots:\n  - id: card\n    setup: "fetch(\x27/api/permit\x27)"\n    keys: "Enter"\n---\n\nIt asks.\n', 'p.md');
  ok('a recipe may prepare the page before its keys', setup.shots[0].setup === "fetch('/api/permit')", setup.shots[0]);
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall green');
process.exit(bad ? 1 : 0);
