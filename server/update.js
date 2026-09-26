// Updating the office from its repository: what is new, and pulling it in.
//
// Nothing here runs by itself. The office promises to reach outside only for
// the weather, and only behind its switch, so a `git fetch` happens when the
// owner presses «check» or «update» — never on a timer. Decided 13 September
// 2026; a background check can come later as a setting, off by default.
//
// Two repositories, one decision. The core and, when it is a checkout of its
// own, `modules/` are both checked before either moves: a core pulled forward
// over Modules that refused would run new code against old modules, which is
// the mismatch the release rules already forbid on the shelf. So every reason
// to refuse is found first, and only then does anything change.
//
// Frames: [WIP section #office-update](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=2169-6969)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fromArchive, checkArchive, pullArchive } from './archive.js';

const run = promisify(execFile);
const FETCH_MS = 60_000;

async function git(cwd, args, timeout = 15_000) {
  const { stdout } = await run('git', args, { cwd, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return stdout.trim();
}
const tryGit = async (cwd, args, timeout) => { try { return await git(cwd, args, timeout); } catch { return null; } };

// The repositories to update: the core always, Modules when `modules/` is the
// top of a repository of its own rather than a folder inside the core.
export async function repos(root) {
  const out = [{ key: 'core', dir: root, from: fromArchive(root) ? 'archive' : 'git' }];
  const mods = path.join(root, 'modules');
  if (fs.existsSync(mods)) {
    const top = await tryGit(mods, ['rev-parse', '--show-toplevel']);
    // realpath, because the shelf and a worktree module are reached through a
    // symlink: `modules` itself is then a link to the checkout git names.
    if (top && fs.realpathSync(top) === fs.realpathSync(mods)) out.push({ key: 'modules', dir: mods, from: 'git' });
  }
  return out;
}

const versionAt = async (dir, rev) => {
  const raw = await tryGit(dir, ['show', `${rev}:package.json`]);
  try { return JSON.parse(raw).version || null; } catch { return null; }
};

// Why a repository cannot move forward, or null. A local change is in the way
// only where the update writes: that is where `git merge --ff-only` itself
// refuses, and anywhere else it carries the change across untouched. Until
// v0.58.1 any tracked change refused — and the Modules' BACKLOG.md, tracked
// and edited by every session, held the office on 15 September 2026 while
// none of the seven commits waiting touched it. Untracked files count too,
// where the update adds a file by that name: the merge would stop on them
// after the core had already moved, which is the «both or neither» broken.
async function refusal(dir) {
  if (!(await tryGit(dir, ['rev-parse', '--git-dir']))) return { reason: 'notGit' };
  if (!(await tryGit(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']))) return { reason: 'noUpstream' };
  const ahead = await tryGit(dir, ['merge-base', '--is-ancestor', 'HEAD', '@{u}']);
  if (ahead === null) {
    // Commits of its own with nothing incoming: the merge has nothing to do
    // here and `--ff-only` answers «Already up to date». On 26 September 2026 a
    // session's unpushed commit to the Modules' backlog read as diverged and
    // held the core with it, though not one commit was coming into the Modules.
    const onlyOurs = await tryGit(dir, ['merge-base', '--is-ancestor', '@{u}', 'HEAD']);
    return onlyOurs === null ? { reason: 'diverged' } : null;
  }
  const touched = new Set(((await tryGit(dir, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '@{u}'])) || '').split('\0').filter(Boolean));
  // Not through git(): porcelain lines begin with a space (« M file»), and the
  // trim there ate it — the first name came out as «ackage.json».
  let dirty = '';
  try { dirty = (await run('git', ['status', '--porcelain', '-z', '--no-renames', '--untracked-files=all'], { cwd: dir, timeout: 15_000 })).stdout; } catch { /* checked above that this is a repository */ }
  const hit = dirty.split('\0').filter(Boolean).map((l) => l.slice(3)).filter((f) => touched.has(f));
  if (hit.length) return { reason: 'dirty', detail: hit.slice(0, 3).join(', ') };
  return null;
}

async function fetchAll(list) {
  for (const r of list) {
    try { await git(r.dir, ['fetch', '--quiet'], FETCH_MS); } catch (e) {
      return { reason: 'fetch', repo: r.key, detail: String(e.stderr || e.message || '').trim().split('\n')[0] };
    }
  }
  return null;
}

// What pressing «check» answers: the version now, the version upstream, and
// what lies between, counted the way the changelog counts it.
export async function checkUpdate(root) {
  if (fromArchive(root)) return checkFromArchive(root);
  const list = await repos(root);
  const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  for (const r of list) {
    if (!(await tryGit(r.dir, ['rev-parse', '--git-dir']))) return { current, error: { reason: 'notGit', repo: r.key } };
  }
  const failed = await fetchAll(list);
  if (failed) return { current, error: failed };
  const out = { current, available: null, feats: 0, fixes: 0, behind: {} };
  for (const r of list) {
    const n = await tryGit(r.dir, ['rev-list', '--count', 'HEAD..@{u}']);
    if (n === null) return { current, error: { reason: 'noUpstream', repo: r.key } };
    out.behind[r.key] = Number(n);
    if (r.key === 'core' && Number(n) > 0) {
      out.available = await versionAt(r.dir, '@{u}');
      const subjects = (await tryGit(r.dir, ['log', '--no-merges', '--format=%s', 'HEAD..@{u}'])) || '';
      for (const s of subjects.split('\n')) {
        if (/^feat(\(|:)/.test(s)) out.feats += 1;
        else if (/^fix(\(|:)/.test(s)) out.fixes += 1;
      }
    }
  }
  out.upToDate = Object.values(out.behind).every((n) => n === 0);
  return out;
}

// The shelf: `modules/` as a checkout of valey-office, which the buyer of the
// Office installed with their read access from Polar. Asked apart from the
// core, because losing it is ordinary — a subscription ends — and the core has
// no business standing still for that. Returns 'none' when there is no shelf,
// 'closed' when it cannot be reached or is not ours to move, 'ok' otherwise,
// and a refusal object when it is ours and in the way.
async function askShelf(root) {
  const shelf = (await repos(root)).find((r) => r.key === 'modules');
  if (!shelf) return { shelf: 'none' };
  if (await fetchAll([shelf])) return { shelf: 'closed' };
  const why = await refusal(shelf.dir);
  if (why && (why.reason === 'dirty' || why.reason === 'diverged')) return { shelf: 'busy', why };
  if (why) return { shelf: 'closed' };
  const n = await tryGit(shelf.dir, ['rev-list', '--count', 'HEAD..@{u}']);
  return { shelf: 'ok', behind: Number(n) || 0, dir: shelf.dir };
}

// An office installed from an archive. The core comes from valey.dev; the
// modules of the Office, when they are a checkout of the shelf, come from git
// beside it. Both are asked before either is told to move.
async function checkFromArchive(root) {
  const a = await checkArchive(root);
  if (a.error) return { current: a.current, source: 'archive', shelf: 'none', error: a.error };
  const s = await askShelf(root);
  const behind = { core: a.available ? 1 : 0 };
  if (s.shelf === 'ok') behind.modules = s.behind;
  return {
    current: a.current,
    source: 'archive',
    shelf: s.shelf === 'busy' ? 'ok' : s.shelf,
    available: a.available,
    feats: a.feats,
    fixes: a.fixes,
    behind,
    upToDate: !a.available && !(s.shelf === 'ok' && s.behind > 0),
  };
}

// Pull both forward, or neither. `step` hears each repository as it lands so
// the office can show the steps in order.
export async function pullUpdate(root, { step = () => {} } = {}) {
  if (fromArchive(root)) return pullFromArchive(root, { step });
  const list = await repos(root);
  const from = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const failed = await fetchAll(list);
  if (failed) return { ok: false, from, ...failed };
  for (const r of list) {
    const why = await refusal(r.dir);
    if (why) return { ok: false, from, repo: r.key, ...why };
  }
  for (const r of list) {
    try { await git(r.dir, ['merge', '--ff-only', '--quiet', '@{u}'], 60_000); } catch (e) {
      // The checks above said this cannot happen; if it does, say what git said.
      return { ok: false, from, repo: r.key, reason: 'merge', detail: String(e.stderr || e.message || '').trim().split('\n')[0] };
    }
    step(r.key);
  }
  const to = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  return { ok: true, from, to };
}

// The archive half of «both or neither». The shelf is checked before a byte is
// downloaded, so a shelf with work in progress stops the update while the
// office is still untouched; a shelf that simply cannot be reached — the
// subscription ended — lets the core go on alone, and the row says why.
async function pullFromArchive(root, { step = () => {} } = {}) {
  const from = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const s = await askShelf(root);
  if (s.shelf === 'busy') return { ok: false, from, repo: 'modules', ...s.why };
  const r = await pullArchive(root, { step });
  if (!r.ok) return r;
  if (s.shelf === 'ok' && s.behind > 0) {
    // The shelf is pulled after the folders have been swapped: until then the
    // checkout the office will actually run sits in the old directory.
    const dir = path.join(root, 'modules');
    try {
      await git(dir, ['merge', '--ff-only', '--quiet', '@{u}'], 60_000);
      step('modules');
    } catch (e) {
      // The core is already replaced, so this cannot be undone into a refusal:
      // the office says which half moved and leaves the shelf where it was.
      return { ok: true, from: r.from, to: r.to, shelf: 'failed', detail: String(e.stderr || e.message || '').trim().split('\n')[0] };
    }
  }
  return { ...r, shelf: s.shelf };
}
