// node tools/test-update-git.mjs — what «check» and «update» do to the checkout.
//
// The office pulls its own code forward from the button, so a mistake here moves
// somebody's working tree. The repositories are the stand's own: an origin, the
// office cloned from it with Modules nested inside as a repository of their own,
// and an author who pushes. The rule most worth guarding is «both or neither»:
// a core pulled forward over Modules that refused would run new code against
// old modules.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkUpdate, pullUpdate } from '../server/update.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-update-git-'));
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const write = (dir, file, text) => fs.writeFileSync(path.join(dir, file), text);
const commit = (dir, msg) => { g(dir, 'add', '-A'); g(dir, 'commit', '-q', '-m', msg); };
const pkg = (v) => JSON.stringify({ name: 'valey', version: v }) + '\n';

// origins and the author's clones
for (const name of ['core', 'mods']) g(tmp, 'init', '-q', '--bare', '-b', 'main', `${name}.git`);
const author = path.join(tmp, 'author'), authorMods = path.join(tmp, 'author-mods');
g(tmp, 'clone', '-q', path.join(tmp, 'core.git'), author);
write(author, 'package.json', pkg('0.52.3')); write(author, '.gitignore', '/modules/\n'); commit(author, 'chore(release): v0.52.3'); g(author, 'push', '-q', 'origin', 'HEAD:main');
g(tmp, 'clone', '-q', path.join(tmp, 'mods.git'), authorMods);
write(authorMods, 'package.json', pkg('0.15.2')); commit(authorMods, 'chore(release): v0.15.2'); g(authorMods, 'push', '-q', 'origin', 'HEAD:main');

// the office: the core, with Modules cloned into modules/
const office = path.join(tmp, 'office');
g(tmp, 'clone', '-q', path.join(tmp, 'core.git'), office);
g(office, 'clone', '-q', path.join(tmp, 'mods.git'), 'modules');
write(office, 'BACKLOG.md', 'untracked, like the real one\n');

let r = await checkUpdate(office);
ok('nothing upstream: up to date at the current version', r.upToDate === true && r.current === '0.52.3' && r.available === null, r);

// the author ships two features and a fix, and the Modules move too
write(author, 'a.js', '1'); commit(author, 'feat(office): a');
write(author, 'b.js', '1'); commit(author, 'fix(deliver): b');
write(author, 'c.js', '1'); commit(author, 'feat(radio): c');
write(author, 'package.json', pkg('0.54.0')); commit(author, 'chore(release): v0.54.0');
g(author, 'push', '-q', 'origin', 'HEAD:main');
write(authorMods, 'm.js', '1'); commit(authorMods, 'fix(feed): m'); g(authorMods, 'push', '-q', 'origin', 'HEAD:main');

r = await checkUpdate(office);
ok('check names the version upstream', r.available === '0.54.0' && r.current === '0.52.3', r);
ok('and counts features and fixes the way the changelog does', r.feats === 2 && r.fixes === 1, r);
ok('and sees both repositories behind', r.behind.core === 4 && r.behind.modules === 1 && r.upToDate === false, r.behind);
ok('check moves nothing', JSON.parse(fs.readFileSync(path.join(office, 'package.json'), 'utf8')).version === '0.52.3');

// Modules with a tracked change: neither repository moves
const coreHead = g(office, 'rev-parse', 'HEAD');
write(path.join(office, 'modules'), 'package.json', pkg('0.15.2-local'));
r = await pullUpdate(office);
ok('a tracked change in Modules refuses the update and names it', !r.ok && r.repo === 'modules' && r.reason === 'dirty' && /package\.json/.test(r.detail), r);
ok('and the core was not pulled either — both or neither', g(office, 'rev-parse', 'HEAD') === coreHead);
g(path.join(office, 'modules'), 'checkout', '-q', '--', 'package.json');

// a local commit in the core: it cannot be fast-forwarded
// only this file: `add -A` would sweep the untracked backlog into the commit
write(office, 'local.js', '1'); g(office, 'add', 'local.js'); g(office, 'commit', '-q', '-m', 'wip: local');
r = await pullUpdate(office);
ok('a core that went its own way is refused as diverged', !r.ok && r.repo === 'core' && r.reason === 'diverged', r);
g(office, 'reset', '-q', '--hard', 'HEAD~1');

// the real thing
const steps = [];
r = await pullUpdate(office, { step: (k) => steps.push(k) });
ok('a clean office is pulled forward', r.ok && r.from === '0.52.3' && r.to === '0.54.0', r);
ok('core first, then Modules, each reported', steps.join(',') === 'core,modules', steps);
ok('both repositories now match upstream', g(office, 'rev-parse', 'HEAD') === g(office, 'rev-parse', '@{u}') && g(path.join(office, 'modules'), 'rev-parse', 'HEAD') === g(path.join(office, 'modules'), 'rev-parse', '@{u}'));
ok('the untracked backlog is left where it was', fs.existsSync(path.join(office, 'BACKLOG.md')));
r = await checkUpdate(office);
ok('and check then says up to date', r.upToDate === true, r);

// an office folder with no git at all — installed from an archive
const plain = path.join(tmp, 'plain'); fs.mkdirSync(plain); write(plain, 'package.json', pkg('0.52.3'));
r = await checkUpdate(plain);
ok('an office that is not a git checkout says so instead of failing', r.error && r.error.reason === 'notGit', r);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
