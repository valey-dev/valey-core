// node tools/test-release-page-tag.mjs — a release page reads its version's
// texts as that version has them, whatever tree it is run from.
//
// `promote` is run from whatever tree is at hand, and on 13 September 2026 that
// tree had not reached the tag it published: gh-release read the working
// tree's CHANGELOG.md, found no section for v0.57.0, and the version went
// public with no page. The stand builds a repository with two releases and
// asks from three places: behind the newer tag, on it, and ahead of it with a
// note backfilled after the release.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { textAt, lastTouched, section, headingOf } from './lib/at-tag.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-page-tag-'));
const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

g('init', '-q', '-b', 'main');
write('CHANGELOG.md', '# Changelog\n\n## v0.1.0 — 1 September 2026\n\n- first\n');
g('add', '-A'); g('commit', '-q', '-m', 'chore(release): v0.1.0'); g('tag', 'v0.1.0');
write('CHANGELOG.md', '# Changelog\n\n## v0.2.0 — 2 September 2026\n\n- second\n\n## v0.1.0 — 1 September 2026\n\n- first\n');
write('notes/v0.2.0.md', '# v0.2.0\n\nas released\n');
g('add', '-A'); g('commit', '-q', '-m', 'chore(release): v0.2.0'); g('tag', 'v0.2.0');
const released = g('rev-parse', 'HEAD');
// a note rewritten after the release, as every backfilled picture is
write('notes/v0.2.0.md', '# v0.2.0\n\nbackfilled\n');
g('add', '-A'); g('commit', '-q', '-m', 'docs(notes): v0.2.0 gets its picture');
const backfill = g('rev-parse', 'HEAD');

// behind the tag — the tree promote was run from on 13 September 2026
g('switch', '-q', '--detach', 'v0.1.0');
let md = textAt(dir, 'v0.2.0', 'CHANGELOG.md');
ok('behind the tag, the changelog section comes from the tag', section(md, 'v0.2.0') === '- second', md);
ok('and its heading too', headingOf(md, 'v0.2.0') === '## v0.2.0 — 2 September 2026', headingOf(md, 'v0.2.0'));
ok('the note is found at the tag although the tree has none', /as released/.test(textAt(dir, 'v0.2.0', 'notes/v0.2.0.md') || ''));
ok('and its pictures are pinned to the release commit', lastTouched(dir, 'v0.2.0', ['notes/v0.2.0.md', 'notes/v0.2.0']) === released);
ok('the working tree is left where it stood', !fs.existsSync(path.join(dir, 'notes/v0.2.0.md')));

// on the tag
g('switch', '-q', '--detach', 'v0.2.0');
ok('on the tag, the same section', section(textAt(dir, 'v0.2.0', 'CHANGELOG.md'), 'v0.2.0') === '- second');

// ahead of it, with the note backfilled: the tree knows more than the tag
g('switch', '-q', 'main');
ok('ahead of the tag, the backfilled note wins', /backfilled/.test(textAt(dir, 'v0.2.0', 'notes/v0.2.0.md') || ''));
ok('and is pinned to the backfill commit', lastTouched(dir, 'v0.2.0', ['notes/v0.2.0.md', 'notes/v0.2.0']) === backfill);

// what is nowhere stays nowhere
ok('a version with no section has none, from any tree', section(textAt(dir, 'v0.1.0', 'CHANGELOG.md'), 'v0.3.0') === null);
ok('a note that never existed is null, not an error', textAt(dir, 'v0.1.0', 'notes/v0.1.0.md') === null);

fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
