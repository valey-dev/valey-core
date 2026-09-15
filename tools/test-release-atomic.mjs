// node tools/test-release-atomic.mjs — a release that loses the race for main
// pushes nothing, and takes its tag back.
//
// release.mjs pushes main and the tag in one command. Without --atomic the two
// land independently, and a main refused as non-fast-forward still lets the tag
// through: v0.18.0 on 6 September 2026, and again v0.58.3 on 15 September, when
// two landings ran at once and the flag added after the first time had been
// dropped by a rewrite of the tail. The stand plays that race for real — a
// neighbour moves main while this release is cut — and runs release.mjs --ship
// against it, so the flag cannot go quietly again: without it the tag reaches
// the origin and the stand fails.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + JSON.stringify(got)); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-release-atomic-'));
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (dir, file, text) => fs.writeFileSync(path.join(dir, file), text);

try {
  // the origin, and the office's clone with one release behind it
  g(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  const office = path.join(tmp, 'office');
  g(tmp, 'clone', '-q', path.join(tmp, 'origin.git'), office);
  write(office, 'package.json', JSON.stringify({ name: 'demo', version: '0.1.0' }, null, 2) + '\n');
  write(office, 'CHANGELOG.md', '# Changelog\n\n## v0.1.0 — 1 September 2026\n\n- first\n');
  g(office, 'add', '-A'); g(office, 'commit', '-q', '-m', 'chore(release): v0.1.0');
  g(office, 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0');
  g(office, 'push', '-q', 'origin', 'HEAD:main', 'v0.1.0');

  // this landing merges: its fix is on main, and the tree stands on that main
  write(office, 'b.js', '1\n'); g(office, 'add', '-A'); g(office, 'commit', '-q', '-m', 'fix(release): b');
  g(office, 'push', '-q', 'origin', 'HEAD:main');

  // and while it runs its stands, the neighbour's landing merges on top
  const neighbour = path.join(tmp, 'neighbour');
  g(tmp, 'clone', '-q', path.join(tmp, 'origin.git'), neighbour);
  write(neighbour, 'a.js', '1\n'); g(neighbour, 'add', '-A'); g(neighbour, 'commit', '-q', '-m', 'fix(office): a');
  g(neighbour, 'push', '-q', 'origin', 'HEAD:main');
  const theirs = g(neighbour, 'rev-parse', 'HEAD');

  // this release is cut on the main it saw, which is no longer main
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'release.mjs'), '--ship'],
    { cwd: office, encoding: 'utf8', env: { ...env, VALEY_REPO: office } });
  const said = (r.stdout || '') + (r.stderr || '');

  ok('the release cut v0.1.1 before it tried to push', /v0\.1\.1/.test(said), said.slice(-400));
  ok('the refused push fails the release', r.status !== 0, r.status);
  ok('the tag did not reach the origin', !g(tmp, 'ls-remote', '--tags', path.join(tmp, 'origin.git'), 'v0.1.1'));
  ok('the origin main is still the neighbour\'s', g(path.join(tmp, 'origin.git'), 'rev-parse', 'main') === theirs);
  ok('the local tag is taken back, so the rerun can count again', !g(office, 'tag', '-l', 'v0.1.1'));
  ok('and it says that nothing was pushed', /nothing was pushed/.test(said), said.slice(-400));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// The public push cannot be played here — promote.mjs talks to GitHub — so its
// line is read instead: main and the tag go out together or not at all.
const promote = fs.readFileSync(path.join(TOOLS, 'promote.mjs'), 'utf8');
ok('promote pushes public main and the tag atomically', /run\(ROOT, 'push', '--atomic', PUBLIC,/.test(promote));

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
