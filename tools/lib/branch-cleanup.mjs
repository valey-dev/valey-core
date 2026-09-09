import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { retryFetch } from './git-retry.mjs';

const command = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  return { status: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error || null };
};

const git = (repo, args, { allowFailure = false } = {}) => {
  const r = command('git', ['-C', repo, ...args]);
  if (!allowFailure && r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return r;
};

const refExists = (repo, ref) =>
  git(repo, ['show-ref', '--verify', '--quiet', ref], { allowFailure: true }).status === 0;

const isAncestor = (repo, ref, mainRef) =>
  git(repo, ['merge-base', '--is-ancestor', ref, mainRef], { allowFailure: true }).status === 0;

export function worktrees(repo) {
  const records = [];
  let current = null;
  for (const line of git(repo, ['worktree', 'list', '--porcelain']).stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) records.push(current);
      current = { path: line.slice(9), branch: null, locked: false };
    } else if (current && line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    } else if (current && line.startsWith('locked')) {
      current.locked = true;
    }
  }
  if (current) records.push(current);
  return records;
}

const processesIn = (dir) => {
  const r = command('lsof', ['-a', '-d', 'cwd', '+D', dir, '-Fp']);
  if (r.error && r.error.code === 'ENOENT') return null;
  if (r.status !== 0 && !r.stderr && !r.stdout) return [];
  if (r.status !== 0 && /not found|No such file/i.test(r.stderr)) return null;
  return [...new Set(r.stdout.split('\n')
    .filter((line) => /^p\d+$/.test(line)).map((line) => Number(line.slice(1))))];
};

const protectedBranch = (branch, mainRef) => {
  const mainName = String(mainRef).replace(/^refs\/remotes\//, '').replace(/^origin\//, '');
  return branch === 'main' || branch === 'master' || branch === mainName ||
    branch.startsWith('release/') || branch.startsWith('hotfix/');
};

const pendingDir = (repo) => {
  const raw = git(repo, ['rev-parse', '--git-common-dir']).stdout.trim();
  const common = path.isAbsolute(raw) ? raw : path.resolve(repo, raw);
  return path.join(common, 'valey-cleanup-pending');
};

export function deferCleanup(repo, branch) {
  const dir = pendingDir(path.resolve(repo));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, encodeURIComponent(branch)), branch + '\n');
}

export function pendingCleanups(repo) {
  const dir = pendingDir(path.resolve(repo));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => {
    try { return fs.readFileSync(path.join(dir, name), 'utf8').trim(); } catch { return ''; }
  }).filter(Boolean).sort();
}

export function clearPendingCleanup(repo, branch) {
  const dir = pendingDir(path.resolve(repo));
  try { fs.unlinkSync(path.join(dir, encodeURIComponent(branch))); } catch {}
  try { fs.rmdirSync(dir); } catch {}
}

export function inspectCleanup({ repo, branch, mainRef = 'origin/main', removeWorktree = false }) {
  const root = path.resolve(repo);
  if (git(root, ['remote', 'get-url', 'origin'], { allowFailure: true }).status === 0) {
    // This very fetch is the other half of the collision described in
    // git-retry.mjs: it runs every two seconds while a deferred cleanup waits.
    retryFetch(() => git(root, ['fetch', 'origin', '--prune', '--quiet']));
  }
  const valid = git(root, ['check-ref-format', '--branch', branch], { allowFailure: true });
  if (valid.status !== 0) throw new Error(`invalid branch name: ${branch}`);
  if (protectedBranch(branch, mainRef)) throw new Error(`protected branch cannot be cleaned: ${branch}`);
  if (!refExists(root, `refs/remotes/${mainRef}`) && !refExists(root, `refs/heads/${mainRef}`) &&
      git(root, ['rev-parse', '--verify', '--quiet', mainRef], { allowFailure: true }).status !== 0) {
    throw new Error(`main reference does not exist: ${mainRef}`);
  }

  const localRef = `refs/heads/${branch}`;
  const remoteRef = `refs/remotes/origin/${branch}`;
  const local = refExists(root, localRef);
  const remote = refExists(root, remoteRef);
  if (!local && !remote) return { repo: root, branch, mainRef, state: 'already-clean', actions: [] };

  if (local && !isAncestor(root, localRef, mainRef)) {
    throw new Error(`local branch is not fully merged into ${mainRef}: ${branch}`);
  }
  if (remote && !isAncestor(root, remoteRef, mainRef)) {
    throw new Error(`remote branch is not fully merged into ${mainRef}: origin/${branch}`);
  }

  const tree = worktrees(root).find((item) => item.branch === branch) || null;
  const actions = [];
  if (tree) {
    if (!removeWorktree) {
      return { repo: root, branch, mainRef, state: 'worktree-kept', tree, actions: [] };
    }
    if (tree.locked) throw new Error(`worktree is locked: ${tree.path}`);
    if (path.resolve(tree.path) === path.resolve(process.cwd())) {
      throw new Error(`refusing to remove the current working directory: ${tree.path}`);
    }
    const dirty = git(tree.path, ['status', '--porcelain']).stdout.trim();
    if (dirty) throw new Error(`worktree is dirty: ${tree.path}`);
    const pids = processesIn(tree.path);
    if (pids === null) throw new Error(`cannot verify processes in worktree because lsof is unavailable: ${tree.path}`);
    if (pids.length) throw new Error(`worktree is in use by process(es) ${pids.join(', ')}: ${tree.path}`);
    actions.push({ type: 'remove-worktree', path: tree.path });
  }
  if (local) actions.push({ type: 'delete-local', branch });
  if (remote) actions.push({ type: 'delete-remote', branch });
  return { repo: root, branch, mainRef, state: 'ready', tree, actions };
}

export function applyCleanup(plan) {
  if (plan.state === 'already-clean' || plan.state === 'worktree-kept') return plan;
  for (const action of plan.actions) {
    if (action.type === 'remove-worktree') git(plan.repo, ['worktree', 'remove', action.path]);
    else if (action.type === 'delete-local') git(plan.repo, ['branch', '-d', action.branch]);
    else if (action.type === 'delete-remote') git(plan.repo, ['push', 'origin', '--delete', action.branch]);
  }
  return { ...plan, state: 'cleaned' };
}

export function mergedRemoteBranches(repo, mainRef = 'origin/main') {
  const root = path.resolve(repo);
  const r = git(root, ['for-each-ref', `--merged=${mainRef}`, '--format=%(refname)', 'refs/remotes/origin']);
  return r.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
    .filter((ref) => ref !== 'refs/remotes/origin/HEAD' && ref !== `refs/remotes/${mainRef}`)
    .map((ref) => ref.replace(/^refs\/remotes\/origin\//, ''))
    .filter((branch) => !protectedBranch(branch, mainRef))
    .sort();
}
