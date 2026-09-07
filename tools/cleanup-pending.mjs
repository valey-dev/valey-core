#!/usr/bin/env node
// Retry exact branch cleanups deferred by land after their worktrees go idle.
// A marker per branch lives in the shared git dir, so parallel worktrees neither
// overwrite one another nor need a tracked coordination file.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyCleanup, clearPendingCleanup, inspectCleanup, pendingCleanups,
} from './lib/branch-cleanup.mjs';

const TOOL_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const repoAt = argv.indexOf('--repo');
const watchAt = argv.indexOf('--watch');
const repo = repoAt >= 0 ? path.resolve(argv[repoAt + 1]) :
  process.env.VALEY_REPO ? path.resolve(process.env.VALEY_REPO) : TOOL_ROOT;
const watchSeconds = watchAt >= 0 ? Math.max(0, Number(argv[watchAt + 1]) || 0) : 0;
const deadline = Date.now() + watchSeconds * 1000;

const attempt = () => {
  const pending = pendingCleanups(repo);
  let kept = 0;
  for (const branch of pending) {
    try {
      const plan = inspectCleanup({ repo, branch, removeWorktree: true });
      applyCleanup(plan);
      clearPendingCleanup(repo, branch);
      console.log(`${branch}: deferred cleanup complete`);
    } catch (err) {
      kept += 1;
      if (!watchSeconds) console.log(`${branch}: still pending — ${err.message}`);
    }
  }
  return kept;
};

let kept = attempt();
while (kept && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  kept = attempt();
}
if (!watchSeconds) console.log(kept ? `pending: ${kept}` : 'no pending branch cleanups');

