// node tools/test-main-push.mjs — main accepts a tagged release tip and refuses
// an ordinary commit, a missing tag, a rewrite, deletion, and a first push.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOOL = path.join(ROOT, 'tools/check-main-push.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-main-push-'));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + String(got)); }
};
const run = (cmd, args, input = '') => spawnSync(cmd, args, { cwd: tmp, input, encoding: 'utf8' });
const git = (...args) => {
  const r = run('git', args);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
};
const gate = (line) => run(process.execPath, [TOOL], line);
const zeros = '0'.repeat(40);

try {
  git('init', '-b', 'main');
  git('config', 'user.name', 'Push Stand');
  git('config', 'user.email', 'push@example.invalid');
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"version":"0.1.0"}\n');
  git('add', 'package.json'); git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');

  fs.writeFileSync(path.join(tmp, 'ordinary.txt'), 'not released\n');
  git('add', 'ordinary.txt'); git('commit', '-m', 'fix: ordinary change');
  const ordinary = git('rev-parse', 'HEAD');
  let r = gate(`refs/heads/main ${ordinary} refs/heads/main ${base}\n`);
  ok('an ordinary main tip is refused', r.status === 1 && /release commit/.test(r.stderr), r.stderr);

  fs.writeFileSync(path.join(tmp, 'package.json'), '{"version":"0.1.1"}\n');
  git('add', 'package.json'); git('commit', '-m', 'chore(release): v0.1.1');
  const release = git('rev-parse', 'HEAD');
  r = gate(`refs/heads/main ${release} refs/heads/main ${base}\n`);
  ok('a release commit without its tag is refused', r.status === 1 && /tag v0.1.1/.test(r.stderr), r.stderr);
  git('tag', '-a', 'v0.1.1', '-m', 'v0.1.1');
  r = gate(`refs/heads/main ${release} refs/heads/main ${base}\n`);
  ok('a tagged release tip is accepted', r.status === 0, r.stderr);

  r = gate(`refs/heads/topic ${release} refs/heads/topic ${zeros}\n`);
  ok('feature-branch pushes are outside this gate', r.status === 0, r.stderr);
  r = gate(`refs/heads/main ${zeros} refs/heads/main ${release}\n`);
  ok('main deletion is refused', r.status === 1 && /deleting main/.test(r.stderr), r.stderr);
  r = gate(`refs/heads/main ${release} refs/heads/main ${zeros}\n`);
  ok('the first main push is left to the owner', r.status === 1 && /first push/.test(r.stderr), r.stderr);
  const divergent = git('commit-tree', `${base}^{tree}`, '-p', base, '-m', 'divergent remote');
  r = gate(`refs/heads/main ${release} refs/heads/main ${divergent}\n`);
  ok('a main rewrite is refused', r.status === 1 && /not a fast-forward/.test(r.stderr), r.stderr);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
