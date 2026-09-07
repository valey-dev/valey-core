// node tools/test-version.mjs — the version in package.json and the newest tag
// say the same thing.
//
// They are two halves of one fact: the tag answers «which code is vX.Y.Z» and
// package.json answers «which version is this». On 5 September 2026 they drifted
// — tags v0.4.1 and v0.5.0 existed while package.json still said 0.4.0 — and the
// only thing that noticed was the release dry-run stand, which failed by saying
// the tag already existed. That reads as a broken stand rather than as an
// unfinished release, and it cost a session half an hour in the wrong place.
//
// A drift means one of two things, and both are worth stopping for: a tag was
// pushed without the release commit, or the release commit never left the
// machine it was cut on.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + got); }
};

const version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
ok('the version in package.json is read', /^\d+\.\d+\.\d+$/.test(version), version);

// The tag that HEAD can actually see, not the newest one in the repository. A
// branch a release behind main is not broken — it simply has not pulled — and a
// stand that reddens for that teaches people to ignore it. Written the other way
// first, on 6 September 2026, and it failed on the very branch that added it.
let reachable = '';
try { reachable = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'); } catch { /* no tags yet */ }

if (!reachable) {
  // A repository before its first release is not broken, it is young.
console.log('ok    | no tags yet; there is nothing to compare');
} else {
  const newest = reachable.replace(/^v/, '');
  ok('the tag that sees HEAD and package.json say the same thing', newest === version,
    `тег v${newest}, package.json ${version} — либо тег ушёл без релизного коммита, либо коммит не запушен`);
}

// Tags that exist but are not on this branch are worth a word rather than a
// failure: on the morning of 6 September 2026 v0.4.1 and v0.5.0 hung off nothing
// main could see, and the only thing that noticed was an unrelated stand failing
// in a way that read as its own bug.
const all = git('tag', '--list', 'v[0-9]*', '--sort=-v:refname').split('\n').filter(Boolean);
const unreachable = all.filter((t) => {
  try { git('merge-base', '--is-ancestor', t, 'HEAD'); return false; } catch { return true; }
});
if (unreachable.length) {
console.log(`      | note: ${unreachable.length} tag(s) are not visible from this branch — ${unreachable.slice(0, 3).join(', ')}`);
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
