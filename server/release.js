// The nudge about the release video: a minor went out and there is no video.
// It is computed from the repository and the draft file — this state is never
// set by hand, or it would lie exactly when it is supposed to push.
//
// Frame: WIP — the release-video nudge, approved 1 September 2026.
import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DAY = 86400000;

// The pure part on its own: it decides whether to show the card, and a stand
// can check it without git and without a filesystem.
export function nudgeFrom(info, now = Date.now()) {
  if (!info || !info.tag) return null;
  // The checklist is fully closed — the work is done, nothing to nudge about.
  if (info.draft && info.draft.exists && info.draft.open === 0) return null;
  const days = info.taggedAt ? Math.max(0, Math.floor((now - info.taggedAt) / DAY)) : null;
  return {
    tag: info.tag,
    days,
    draft: `media/${info.tag}.md`,
    // There may be no draft: the release is older than the generator, or the
    // file was deleted. Not a reason to stay quiet — the opposite, it is one
    // more step to the video.
    hasDraft: !!(info.draft && info.draft.exists),
    open: info.draft && info.draft.exists ? info.draft.open : null,
  };
}

// Parsing the checklist: only task-list items count, not every bracket in the
// text — a script is full of those.
export function parseChecklist(md) {
  // Any number of spaces can sit between the bullet and the bracket, and the
  // bullet is sometimes `*`: that is legal markdown, and a person edits the
  // draft. A strict pattern silently lost an item and pretended there was less
  // work.
  const open = (md.match(/^[ \t]*[-*][ \t]+\[ \][ \t]+/gm) || []).length;
  const done = (md.match(/^[ \t]*[-*][ \t]+\[[xX]\][ \t]+/gm) || []).length;
  return { open, done, total: open + done };
}

let cache = { at: 0, value: null };
const TTL = 60000;

export async function releaseNudge(root, now = Date.now()) {
  if (now - cache.at < TTL) return cache.value;
  let info = null;
  try {
    // Versions only: the repository grows other tags too, and the nearest one
    // is easily a journal tag.
    const { stdout } = await run('git', ['tag', '-l', 'v[0-9]*.[0-9]*.0', '--sort=-creatordate'], { cwd: root });
    const tag = stdout.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    if (tag) {
      const { stdout: at } = await run('git', ['log', '-1', '--format=%cI', tag], { cwd: root });
      info = { tag, taggedAt: Date.parse(at.trim()) || null, draft: null };
      const file = path.join(root, 'media', `${tag}.md`);
      try {
        const md = await fsp.readFile(file, 'utf8');
        info.draft = { exists: true, ...parseChecklist(md) };
      } catch { info.draft = { exists: false, open: null, done: null, total: 0 }; }
    }
  } catch { /* not a repository, or git is unavailable — stay quiet, this is not the office failing */ }
  cache = { at: now, value: nudgeFrom(info, now) };
  return cache.value;
}
