// Whether a directory holds a repository. That is all the core knows about
// git: the history panel left for modules/gittree/ on 3 September 2026, and
// one question stayed here — the answer decides whether a tree grows in the
// room, and what the version stack in stack.js shows.
//
// `git` is exported on purpose: the module needs the same runner with the
// same timeouts, and a helper copied by hand drifts from the original in
// silence.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const git = (dir, args, opts = {}) => run('git', args, {
  cwd: dir,
  timeout: opts.timeout || 5000,
  maxBuffer: opts.maxBuffer || 8 * 1024 * 1024,
});

// Its own question, because more than the panel depends on the answer.
export async function hasRepo(dir) {
  if (!dir) return false;
  try {
    await git(dir, ['rev-parse', '--git-dir'], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
