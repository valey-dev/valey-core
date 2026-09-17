// node tools/test-update-archive.mjs — «check» and «update» for an office that
// came as an archive.
//
// This one replaces the folder the office runs from, so a mistake here is a
// lost office rather than a failed request. Everything is local: valey.dev is
// a server on a loopback port for the length of the run, and the archives are
// built here — a stand that reached the real site would fail on a bad day and
// pass on a compromised one.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-update-arch-'));
const pkg = (v) => JSON.stringify({ name: 'valey', version: v }) + '\n';
const g = (cwd, ...args) => execFileSync('git', args, {
  cwd, encoding: 'utf8',
  env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
}).trim();

// The published office: a folder tarred the way tools/dist.mjs tars it.
const published = path.join(tmp, 'published');
fs.mkdirSync(path.join(published, 'valey-v0.58.0/server'), { recursive: true });
fs.writeFileSync(path.join(published, 'valey-v0.58.0/package.json'), pkg('0.58.0'));
fs.writeFileSync(path.join(published, 'valey-v0.58.0/server/index.js'), '// the new office\n');
execFileSync('tar', ['-czf', path.join(published, 'valey-v0.58.0.tar.gz'), '-C', published, 'valey-v0.58.0']);
const tgz = fs.readFileSync(path.join(published, 'valey-v0.58.0.tar.gz'));
const sum = createHash('sha256').update(tgz).digest('hex');

// valey.dev, for this run only. `serve` decides what each request gets, so a
// case can break one file without rebuilding the site.
let serve = () => null;
const site = http.createServer((req, res) => {
  const body = serve(req.url);
  if (body === null) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200);
  res.end(body);
});
await new Promise((done) => site.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${site.address().port}`;
const wholeSite = (url) => {
  if (url === '/latest/valey-latest.json') return JSON.stringify({ version: '0.58.0', feats: 2, fixes: 5 });
  if (url === '/0.58.0/valey-v0.58.0.tar.gz') return tgz;
  if (url === '/0.58.0/valey-v0.58.0.tar.gz.sha256') return `${sum}  valey-v0.58.0.tar.gz\n`;
  return null;
};
serve = wholeSite;

// The office reads the site out of the environment, and the module reads the
// environment once, when it is imported — so the import comes after.
process.env.VALEY_DIST = base;
process.env.VALEY_RELEASES = `${base}/no-release`;
const { checkUpdate, pullUpdate } = await import('../server/update.js');
const { newer, countNotes, olderCopies } = await import('../server/archive.js');

// ---------------------------------------------------------------- the office
const office = path.join(tmp, 'valey');
const build = () => {
  fs.rmSync(office, { recursive: true, force: true });
  // The copies a previous case left behind go too, or «nothing was moved
  // aside» would pass on somebody else's folder.
  for (const f of fs.readdirSync(tmp)) if (f.startsWith('valey.v')) fs.rmSync(path.join(tmp, f), { recursive: true, force: true });
  fs.mkdirSync(path.join(office, 'modules/paid'), { recursive: true });
  fs.writeFileSync(path.join(office, 'package.json'), pkg('0.55.0'));
  fs.writeFileSync(path.join(office, 'modules/paid/module.json'), '{"id":"paid"}\n');
};
build();

// ------------------------------------------------------------------ the units
ok('0.10.0 is newer than 0.9.0, as numbers and not as text', newer('0.10.0', '0.9.0') && !newer('0.9.0', '0.10.0'));
ok('the same version is not newer than itself', !newer('0.58.0', '0.58.0'));
const notes = countNotes(['## v0.58.0 — 13 September 2026', '', '### Added', '- one', '- two', '', '### Fixed', '- a', '- b', '- c',
  '', '## v0.57.0 — 12 September 2026', '### Added', '- not counted'].join('\n'), '0.58.0');
ok('the changelog is counted for that version only', notes.feats === 2 && notes.fixes === 3, notes);

// ----------------------------------------------------------------- the check
let r = await checkUpdate(office);
ok('check names the published version and what is in it', r.available === '0.58.0' && r.feats === 2 && r.fixes === 5, r);
ok('and says the office came from an archive', r.source === 'archive' && r.shelf === 'none', r);
ok('check moves nothing', fs.readFileSync(path.join(office, 'package.json'), 'utf8').includes('0.55.0'));

// ---------------------------------------------------------------- the update
let steps = [];
r = await pullUpdate(office, { step: (k) => steps.push(k) });
ok('the office is replaced with the published one', r.ok && r.from === '0.55.0' && r.to === '0.58.0', r);
ok('the archive and its checksum are reported as they land', steps.join(',') === 'archive,sum', steps);
ok('the new office is what runs now', fs.existsSync(path.join(office, 'server/index.js')));
ok('the previous office is kept beside it, for an undo by moving a folder', fs.existsSync(path.join(tmp, 'valey.v0.55.0/package.json')));
ok('a paid module the archive does not carry comes across', fs.existsSync(path.join(office, 'modules/paid/module.json')));
r = await checkUpdate(office);
ok('and check then says there is nothing newer', r.upToDate === true && !r.available, r);

// One copy is kept: the next update makes its own and the older one goes.
fs.mkdirSync(path.join(tmp, 'valey.v0.40.0'), { recursive: true });
ok('an older copy is named for deletion by the next update', olderCopies(office, '0.58.0').some((p) => p.endsWith('valey.v0.40.0')), olderCopies(office, '0.58.0'));

// -------------------------------------------------------------- the refusals
// The one refusal a checkout does not have: bytes that are not what was
// published. Nothing may be unpacked, and the office must be untouched.
build();
serve = (url) => (url.endsWith('.sha256') ? `${'0'.repeat(64)}  valey-v0.58.0.tar.gz\n` : wholeSite(url));
r = await pullUpdate(office);
ok('an archive whose checksum does not match is refused', !r.ok && r.reason === 'badSum', r);
ok('and the office stays exactly where it was', fs.readFileSync(path.join(office, 'package.json'), 'utf8').includes('0.55.0'));
ok('with nothing moved aside', !fs.existsSync(path.join(tmp, 'valey.v0.55.0')));

serve = (url) => (url.endsWith('.sha256') ? null : wholeSite(url));
r = await pullUpdate(office);
ok('an archive published without a checksum is refused too', !r.ok && r.reason === 'noSum', r);
ok('and again the office is untouched', fs.readFileSync(path.join(office, 'package.json'), 'utf8').includes('0.55.0'));

serve = () => null;
r = await checkUpdate(office);
ok('a site that answers nothing is offline, not a broken office', r.error && r.error.reason === 'offline', r);

// ------------------------------------------------------------------ the shelf
// The modules of the Office are a checkout of valey-office beside the core.
// Reachable and behind: the row promises both halves.
serve = wholeSite;
build();
const shelfOrigin = path.join(tmp, 'shelf.git');
g(tmp, 'init', '-q', '--bare', '-b', 'main', 'shelf.git');
const author = path.join(tmp, 'shelf-author');
g(tmp, 'clone', '-q', shelfOrigin, 'shelf-author');
fs.writeFileSync(path.join(author, 'module.json'), '{"id":"easel"}\n');
g(author, 'add', '-A'); g(author, 'commit', '-q', '-m', 'the shelf'); g(author, 'push', '-q', 'origin', 'main');
fs.rmSync(path.join(office, 'modules'), { recursive: true, force: true });
g(office, 'clone', '-q', shelfOrigin, 'modules');
fs.writeFileSync(path.join(author, 'easel.js'), '// newer\n');
g(author, 'add', '-A'); g(author, 'commit', '-q', '-m', 'a newer shelf'); g(author, 'push', '-q', 'origin', 'main');

r = await checkUpdate(office);
ok('with a shelf that answers, the row is told both halves move', r.shelf === 'ok' && r.behind.modules === 1, r);
steps = [];
r = await pullUpdate(office, { step: (k) => steps.push(k) });
ok('the core and the shelf both moved', r.ok && r.to === '0.58.0' && fs.existsSync(path.join(office, 'modules/easel.js')), r);
ok('and the shelf is reported after the archive', steps.join(',') === 'archive,sum,modules', steps);

// A shelf nobody can reach any more — the subscription ended. The core is not
// held back by it, and the row says so instead of refusing.
build();
fs.rmSync(path.join(office, 'modules'), { recursive: true, force: true });
g(office, 'clone', '-q', shelfOrigin, 'modules');
g(path.join(office, 'modules'), 'remote', 'set-url', 'origin', path.join(tmp, 'gone.git'));
r = await checkUpdate(office);
ok('a shelf that cannot be reached is closed, not a failure', r.shelf === 'closed' && r.available === '0.58.0', r);
r = await pullUpdate(office);
ok('and the core updates alone', r.ok && r.to === '0.58.0' && r.shelf === 'closed', r);

// ------------------------------------------------------------- the manifest
// The file the check reads is the file the release writes. Without this the two
// halves could drift apart silently: a manifest renamed here would only be
// noticed by an office out in the world, pressing a button that says «offline».
const tag = execFileSync('git', ['tag', '-l', 'v*'], { cwd: path.dirname(import.meta.dirname), encoding: 'utf8' })
  .split('\n').filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
if (!tag) {
  console.log('skip  | the manifest: this checkout has no v* tag to build one from');
} else {
  const out = path.join(tmp, 'dist');
  execFileSync(process.execPath, [path.join(import.meta.dirname, 'dist.mjs'), tag, '--out', out], { stdio: 'ignore' });
  const m = JSON.parse(fs.readFileSync(path.join(out, 'valey-latest.json'), 'utf8'));
  ok('the release writes the manifest the check asks for', m.version === tag.replace(/^v/, '') && typeof m.sha256 === 'string' && Number.isFinite(m.feats) && Number.isFinite(m.fixes), m);
  // And it is read as such: served in place of the stand's own, it drives the row.
  serve = (url) => (url === '/latest/valey-latest.json' ? JSON.stringify(m) : wholeSite(url));
  build();
  const seen = await checkUpdate(office);
  ok('and an office reads that manifest as the published version', seen.available === m.version, seen);
}

site.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
