// node tools/test-release-ci-step.mjs — the «release dry run» step of CI, run as
// CI runs it: its script is taken out of .github/workflows/test.yml and handed to
// bash, against throwaway repositories.
//
// The step asks release.mjs for a dry run and has to tell «nothing to cut» from a
// real failure. Until 15 September 2026 it did not: on the release commit —
// always the last one on main — the range is empty, release.mjs refuses, and
// main went red after every release with every test green. The PR board showed
// the office broken for it. The refusal itself stays: land --dry needs it.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', String(got).slice(0, 400)); }
};

// The step's script, exactly as the workflow holds it.
const yml = readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
const at = yml.indexOf('- name: release dry run');
const block = at < 0 ? null : yml.slice(at).match(/run: \|\n((?:[ ]{10}.*\n)+)/);
ok('the workflow has the step, with a script', !!block, 'no step');
const script = block ? block[1].replace(/^ {10}/gm, '') : 'exit 1';

// A repository with nothing but a package.json and some commits; the release
// tools are the real ones, pointed at it through VALEY_REPO.
function repo(version, commits, tag) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'valey-ci-step-'));
  const g = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=stand', '-c', 'user.email=stand@example.invalid', ...a], { stdio: 'pipe' });
  g('init', '-q');
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'stand', version }, null, 2) + '\n');
  g('add', '.');
  g('commit', '-q', '-m', tag ? `chore(release): ${tag}` : 'chore: start');
  if (tag) g('tag', tag);
  for (const m of commits) g('commit', '-q', '--allow-empty', '-m', m);
  return dir;
}
function step(dir) {
  // `node tools/release.mjs` is relative in the step: run it from the core, with
  // the repository under test named by VALEY_REPO.
  const r = spawnSync('bash', ['-e', '-c', script], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, VALEY_REPO: dir } });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

let r = step(repo('1.2.3', [], 'v1.2.3'));
ok('the release commit itself: nothing to cut, and that is green', r.code === 0 && /no commits after v1\.2\.3/.test(r.out), r.out);
r = step(repo('1.2.3', ['docs(readme): a word'], 'v1.2.3'));
ok('docs only after the tag: nothing to release, still green', r.code === 0 && /nothing to release/.test(r.out), r.out);
r = step(repo('nope', ['fix(x): y'], 'v1.2.3'));
ok('an unreadable version is red, and says why', r.code !== 0 && /is not X\.Y\.Z/.test(r.out), r.out);
r = step(repo('1.2.3', ['feat(a): one', 'feat(b): two'], 'v1.2.3'));
ok('two features without a release between them are red', r.code !== 0 && /one minor release/.test(r.out), r.out);

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
