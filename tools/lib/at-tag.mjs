// A version's texts — its changelog section and its feature note — read from
// wherever they are true for that version.
//
// The working tree, when it already contains the tag: a note backfilled after
// the release lives only there, and `--refresh` exists to publish exactly that.
// The tag itself, when the tree stands behind it or beside it. Until v0.58.2
// both were read from the working tree only, and `promote` is run from whatever
// tree is at hand: on 13 September 2026 it published v0.57.0 from a tree that
// had not reached the tag, found «CHANGELOG.md has no section; skipping», and
// the version went public with no page. It was finished by hand after a
// `git switch --detach v0.57.0`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const quiet = (root, ...a) => {
  try {
    return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
};

// Whether the working tree has reached the tag.
export const reached = (root, tag) => quiet(root, 'merge-base', '--is-ancestor', tag, 'HEAD') !== null;

// The file as that version has it, or null.
export function textAt(root, tag, rel) {
  if (reached(root, tag)) {
    const file = path.join(root, rel);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  }
  return quiet(root, 'show', `${tag}:${rel}`);
}

// The commit that last touched these paths, counted from where textAt read
// them: a note's pictures are linked at that commit.
export function lastTouched(root, tag, paths) {
  const from = reached(root, tag) ? 'HEAD' : tag;
  return (quiet(root, 'log', '-1', '--format=%H', from, '--', ...paths) || '').trim();
}

// The section of a changelog for one version: from its heading to the next one,
// without the heading — GitHub prints the version above the body, and
// repeating it puts the same line on the page twice.
export function section(md, tag) {
  if (!md) return null;
  const lines = md.split('\n');
  const from = lines.findIndex((l) => l.startsWith(`## ${tag} `) || l.trim() === `## ${tag}`);
  if (from < 0) return null;
  let to = lines.length;
  for (let i = from + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { to = i; break; }
  }
  return lines.slice(from + 1, to).join('\n').trim();
}

// The heading line of that section, as written.
export const headingOf = (md, tag) => (md || '').split('\n')
  .find((l) => l.startsWith(`## ${tag} `) || l.trim() === `## ${tag}`) || null;
