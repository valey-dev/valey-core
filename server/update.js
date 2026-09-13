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
  const out = [{ key: 'core', dir: root }];
  const mods = path.join(root, 'modules');
  if (fs.existsSync(mods)) {
    const top = await tryGit(mods, ['rev-parse', '--show-toplevel']);
    if (top && fs.realpathSync(top) === fs.realpathSync(mods)) out.push({ key: 'modules', dir: mods });
  }
  return out;
}

const versionAt = async (dir, rev) => {
  const raw = await tryGit(dir, ['show', `${rev}:package.json`]);
  try { return JSON.parse(raw).version || null; } catch { return null; }
};

// Why a repository cannot move forward, or null. Tracked changes only: an
// untracked file — the core's own BACKLOG.md lives that way — is not in the
// way of a fast-forward.
async function refusal(dir) {
  if (!(await tryGit(dir, ['rev-parse', '--git-dir']))) return { reason: 'notGit' };
  if (!(await tryGit(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']))) return { reason: 'noUpstream' };
  // Not through git(): porcelain lines begin with a space (« M file»), and the
  // trim there ate it — the first name came out as «ackage.json».
  let dirty = '';
  try { dirty = (await run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: dir, timeout: 15_000 })).stdout; } catch { /* checked above that this is a repository */ }
  const lines = dirty.split('\n').filter(Boolean);
  if (lines.length) return { reason: 'dirty', detail: lines.slice(0, 3).map((l) => l.slice(3)).join(', ') };
  const ahead = await tryGit(dir, ['merge-base', '--is-ancestor', 'HEAD', '@{u}']);
  if (ahead === null) return { reason: 'diverged' };
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

// Pull both forward, or neither. `step` hears each repository as it lands so
// the office can show the steps in order.
export async function pullUpdate(root, { step = () => {} } = {}) {
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
