#!/usr/bin/env node
// Safely remove one branch after it has landed in main.
//
//   node tools/cleanup-merged.mjs feature/name
//   node tools/cleanup-merged.mjs feature/name --apply
//   node tools/cleanup-merged.mjs feature/name --apply --remove-worktree
//
// Dry-run is the default. The tool never scans for candidates: the caller gives
// it the exact PR head, and every ref must already be an ancestor of origin/main.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCleanup, deferCleanup, inspectCleanup } from './lib/branch-cleanup.mjs';

const TOOL_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const defer = argv.includes('--defer');
const removeWorktree = argv.includes('--remove-worktree');
const mainAt = argv.indexOf('--main');
const repoAt = argv.indexOf('--repo');
const mainRef = mainAt >= 0 ? argv[mainAt + 1] : 'origin/main';
const repo = repoAt >= 0 ? path.resolve(argv[repoAt + 1]) :
  process.env.VALEY_REPO ? path.resolve(process.env.VALEY_REPO) : TOOL_ROOT;
const values = argv.filter((arg, index) => !arg.startsWith('--') &&
  !(mainAt >= 0 && index === mainAt + 1) && !(repoAt >= 0 && index === repoAt + 1));
const branch = values[0];

if (!branch) {
  console.error('cleanup: provide the exact merged branch name');
  process.exit(2);
}

try {
  const plan = inspectCleanup({ repo, branch, mainRef, removeWorktree });
  if (plan.state === 'already-clean') {
    console.log(`${branch}: already clean`);
    process.exit(0);
  }
  if (plan.state === 'worktree-kept') {
    if (apply && defer) deferCleanup(repo, branch);
    console.log(`${branch}: merged, but kept because it is checked out at ${plan.tree.path}`);
    console.log(defer ? 'cleanup was queued for a safe retry after the worktree becomes idle' :
      'run again from another worktree with --apply --remove-worktree after it is idle');
    process.exit(3);
  }
  for (const action of plan.actions) {
    if (action.type === 'remove-worktree') console.log(`would remove worktree ${action.path}`);
    if (action.type === 'delete-local') console.log(`would delete local branch ${action.branch}`);
    if (action.type === 'delete-remote') console.log(`would delete remote branch origin/${action.branch}`);
  }
  if (!apply) {
    console.log('dry run: pass --apply to perform these actions');
    process.exit(0);
  }
  applyCleanup(plan);
  console.log(`${branch}: cleanup complete`);
} catch (err) {
  console.error(`cleanup: ${err.message}`);
  process.exit(1);
}
