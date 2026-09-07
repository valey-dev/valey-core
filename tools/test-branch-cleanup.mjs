// node tools/test-branch-cleanup.mjs — merged branches are removed precisely,
// while unmerged, dirty, protected, and currently used worktrees survive.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOOL = path.join(ROOT, 'tools/cleanup-merged.mjs');
const AUDIT = path.join(ROOT, 'tools/audit-merged-branches.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-branch-cleanup-'));
const remote = path.join(tmp, 'remote.git');
const repo = path.join(tmp, 'repo');
const tree = path.join(tmp, 'tree');
const dirtyTree = path.join(tmp, 'dirty-tree');
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + String(got)); }
};
const run = (cmd, args, cwd = repo) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
const git = (...args) => {
  const r = run('git', args);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
};
const cleanup = (branch, ...args) => run(process.execPath,
  [TOOL, branch, '--repo', repo, ...args], tmp);
const audit = () => run(process.execPath, [AUDIT, '--repo', repo], tmp);
const has = (ref) => run('git', ['show-ref', '--verify', '--quiet', ref]).status === 0;

try {
  run('git', ['init', '--bare', remote], tmp);
  run('git', ['init', '-b', 'main', repo], tmp);
  git('config', 'user.name', 'Branch Stand');
  git('config', 'user.email', 'branch@example.invalid');
  fs.writeFileSync(path.join(repo, 'file.txt'), 'base\n');
  git('add', 'file.txt'); git('commit', '-m', 'base');
  git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');

  git('switch', '-c', 'feature/merged');
  fs.appendFileSync(path.join(repo, 'file.txt'), 'merged\n');
  git('commit', '-am', 'feat: merged'); git('push', '-u', 'origin', 'feature/merged');
  git('switch', 'main'); git('merge', '--no-ff', 'feature/merged', '-m', 'merge feature'); git('push');

  let r = cleanup('feature/merged');
  let a = audit();
  ok('the audit reports a merged remote branch', a.status === 1 && /feature\/merged/.test(a.stderr), a.stderr);
  ok('dry-run succeeds', r.status === 0, r.stderr);
  ok('dry-run keeps the local branch', has('refs/heads/feature/merged'));
  ok('dry-run keeps the remote branch', has('refs/remotes/origin/feature/merged'));
  r = cleanup('feature/merged', '--apply');
  ok('apply succeeds for an ordinary merged branch', r.status === 0, r.stderr);
  ok('the local branch is deleted', !has('refs/heads/feature/merged'));
  ok('the remote branch is deleted', !has('refs/remotes/origin/feature/merged'));
  a = audit();
  ok('the audit turns green after cleanup', a.status === 0, a.stderr);

  git('switch', '-c', 'feature/unmerged');
  fs.appendFileSync(path.join(repo, 'file.txt'), 'unmerged\n');
  git('commit', '-am', 'feat: unmerged'); git('switch', 'main');
  r = cleanup('feature/unmerged', '--apply');
  ok('an unmerged branch is refused', r.status === 1 && /not fully merged/.test(r.stderr), r.stderr);
  ok('the refused branch remains', has('refs/heads/feature/unmerged'));

  r = cleanup('main', '--apply');
  ok('main is protected', r.status === 1 && /protected branch/.test(r.stderr), r.stderr);

  git('branch', 'feature/tree');
  git('worktree', 'add', tree, 'feature/tree');
  r = cleanup('feature/tree', '--apply');
  ok('a checked-out worktree is kept by default', r.status === 3 && /worktree/.test(r.stdout), r.stdout + r.stderr);
  ok('the worktree still exists', fs.existsSync(tree));
  r = cleanup('feature/tree', '--apply', '--remove-worktree');
  ok('an explicitly requested clean worktree is removed', r.status === 0, r.stderr);
  ok('its branch is removed too', !has('refs/heads/feature/tree'));

  git('branch', 'feature/dirty');
  git('worktree', 'add', dirtyTree, 'feature/dirty');
  fs.writeFileSync(path.join(dirtyTree, 'untracked.txt'), 'keep me\n');
  r = cleanup('feature/dirty', '--apply', '--remove-worktree');
  ok('a dirty worktree is refused', r.status === 1 && /dirty/.test(r.stderr), r.stderr);
  ok('dirty worktree contents survive', fs.existsSync(path.join(dirtyTree, 'untracked.txt')));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
