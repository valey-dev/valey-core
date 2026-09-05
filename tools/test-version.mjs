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
  else { bad += 1; console.log('УПАЛ  |', name, got === undefined ? '' : '→ ' + got); }
};

const version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
ok('версия в package.json читается', /^\d+\.\d+\.\d+$/.test(version), version);

// Sorted by version rather than by date: tags are cut from different trees, and
// the order they were written in says nothing about which is the newest release.
const tags = git('tag', '--list', 'v[0-9]*', '--sort=-v:refname').split('\n').filter(Boolean);
if (!tags.length) {
  // A repository before its first release is not broken, it is young.
  console.log('ok    | тегов ещё нет — сравнивать не с чем');
} else {
  const newest = tags[0].replace(/^v/, '');
  ok('старший тег и package.json говорят одно и то же', newest === version,
    `тег v${newest}, package.json ${version} — либо тег ушёл без релизного коммита, либо коммит не запушен`);
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
