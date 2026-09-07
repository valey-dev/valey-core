#!/usr/bin/env node
// CI backstop for merge paths that did not run the normal branch cleanup.
// It reports only: deletion stays with GitHub's merge setting and land.mjs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergedRemoteBranches } from './lib/branch-cleanup.mjs';

const TOOL_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const mainAt = argv.indexOf('--main');
const repoAt = argv.indexOf('--repo');
const mainRef = mainAt >= 0 ? argv[mainAt + 1] : 'origin/main';
const repo = repoAt >= 0 ? path.resolve(argv[repoAt + 1]) :
  process.env.VALEY_REPO ? path.resolve(process.env.VALEY_REPO) : TOOL_ROOT;

try {
  const branches = mergedRemoteBranches(repo, mainRef);
  if (!branches.length) {
    console.log(`branch hygiene: no merged remote branches remain behind ${mainRef}`);
    process.exit(0);
  }
  console.error(`branch hygiene: ${branches.length} merged remote branch(es) still exist:`);
  for (const branch of branches) console.error(`  origin/${branch}`);
  console.error('the merge path skipped GitHub auto-delete or the post-release cleanup');
  process.exit(1);
} catch (err) {
  console.error(`branch hygiene: ${err.message}`);
  process.exit(2);
}

