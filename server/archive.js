// Updating an office that came as an archive rather than as a checkout.
//
// `install.sh` puts a tarball in a folder, and that office has no git: the
// version row could only say «update through install.sh». But install.sh moves
// the directory out from under a running server — the pages come from the new
// folder while the server is still the old one, and it stays that way until a
// Ctrl-C, which is a restart and loses the guests. So the office updates
// itself: it does what install.sh does, and then hands over to the new worker
// through server/swap.js, the way the git office already does.
//
// Reaching outside happens only when the owner presses the button, like the
// git check — and to two places, both named in the panel: valey.dev for the
// bytes, and the release the site redirects to for the version.
//
// Frames: [WIP section #archive-update](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=2265-6324)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PATHS } from './settings.js';

const run = promisify(execFile);
const SITE = process.env.VALEY_DIST || 'https://valey.dev/dist';
// The release pages the site redirects to. Asked only when the manifest is
// missing — an office installed before manifests existed still has to be able
// to see that a newer one is out.
const RELEASES = process.env.VALEY_RELEASES || 'https://api.github.com/repos/valey-dev/valey-core/releases/latest';
const NET_MS = 20_000;

// Where install.sh says this office lives, and that it came as an archive. The
// file sits beside settings.json: it describes this machine's installation, not
// the office's own state, and it must survive the folder being replaced.
export const INSTALL_FILE = path.join(PATHS.dir, 'install.json');

export function installed() {
  try { return JSON.parse(fs.readFileSync(INSTALL_FILE, 'utf8')); } catch { return null; }
}

// An office is «from the archive» when it is not a checkout. The note in
// install.json is what install.sh leaves behind, but it cannot be the answer on
// its own: a folder can be moved, and two offices on one machine share the
// file. The directory itself decides.
export function fromArchive(root) {
  return !fs.existsSync(path.join(root, '.git'));
}

const net = async (url, opts = {}) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NET_MS);
  try { return await fetch(url, { ...opts, signal: ac.signal, redirect: 'follow' }); }
  finally { clearTimeout(timer); }
};

// What the newest published office is. The manifest is ours and says
// everything in one small file; the release API is the fallback for versions
// published before the manifest existed, and it is read for the same three
// numbers rather than trusted with anything else.
export async function latest() {
  try {
    const r = await net(`${SITE}/latest/valey-latest.json`);
    if (r.ok) {
      const m = await r.json();
      if (m && typeof m.version === 'string') {
        return { version: m.version.replace(/^v/, ''), feats: Number(m.feats) || 0, fixes: Number(m.fixes) || 0 };
      }
    }
  } catch { /* no manifest, or no network — the release page is asked next */ }
  const r = await net(RELEASES, { headers: { accept: 'application/vnd.github+json' } });
  if (!r.ok) return { error: { reason: 'offline', detail: `${r.status}` } };
  const j = await r.json();
  const version = String(j.tag_name || '').replace(/^v/, '');
  if (!version) return { error: { reason: 'offline', detail: 'the release has no tag' } };
  return { version, ...countNotes(String(j.body || ''), version) };
}

// How many features and how many fixes the changelog of that version holds.
// Counted off its own section only: a release page carries every version since
// the last public one, and counting all of them would promise more than the
// button brings.
export function countNotes(body, version) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && l.includes(version));
  if (start < 0) return { feats: 0, fixes: 0 };
  let where = null, feats = 0, fixes = 0;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (/^###\s+(Added|Добавлено)/.test(line)) { where = 'feats'; continue; }
    if (/^###\s+(Fixed|Починено)/.test(line)) { where = 'fixes'; continue; }
    if (/^###\s/.test(line)) { where = null; continue; }
    if (!/^-\s/.test(line)) continue;
    if (where === 'feats') feats += 1;
    if (where === 'fixes') fixes += 1;
  }
  return { feats, fixes };
}

const versionOf = (dir) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; } catch { return null; }
};

// «Newer» is decided on the numbers, not on the strings: 0.9.0 and 0.10.0 sort
// the wrong way round as text, and that is the pair that appears in every
// office that has been running for a month.
export function newer(a, b) {
  const nums = (v) => String(v).split('.').map((n) => Number(n) || 0);
  const [x, y] = [nums(a), nums(b)];
  for (let i = 0; i < 3; i += 1) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}

// Pressing «check» on an archive office.
export async function checkArchive(root) {
  const current = versionOf(root);
  const l = await latest().catch((e) => ({ error: { reason: 'offline', detail: String(e.message || e).slice(0, 200) } }));
  if (l.error) return { current, error: l.error };
  if (!newer(l.version, current)) return { current, upToDate: true, available: null, feats: 0, fixes: 0 };
  return { current, upToDate: false, available: l.version, feats: l.feats, fixes: l.fixes };
}

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });

// Download, verify, unpack, and put the new folder where the old one stood.
//
// Nothing is written into the office's own directory until the checksum has
// matched: an archive that fails the sum is deleted with the temporary folder,
// and the office is exactly as it was. That is the one refusal a git office
// does not have.
export async function pullArchive(root, { step = () => {} } = {}) {
  const from = versionOf(root);
  const l = await latest().catch((e) => ({ error: { reason: 'offline', detail: String(e.message || e).slice(0, 200) } }));
  if (l.error) return { ok: false, from, ...l.error };
  const to = l.version;
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-upd-'));
  try {
    const base = `${SITE}/${to}/valey-v${to}.tar.gz`;
    const tgz = path.join(tmp, 'valey.tar.gz');
    const got = await net(base);
    if (!got.ok) return { ok: false, from, reason: 'offline', detail: `${got.status} ${base}` };
    await fsp.writeFile(tgz, Buffer.from(await got.arrayBuffer()));
    const sum = await net(`${base}.sha256`);
    if (!sum.ok) return { ok: false, from, reason: 'noSum', detail: `${sum.status}` };
    step('archive');

    const want = (await sum.text()).trim().split(/\s+/)[0];
    const have = createHash('sha256').update(await fsp.readFile(tgz)).digest('hex');
    if (!want || want !== have) return { ok: false, from, reason: 'badSum', detail: `${have.slice(0, 16)}… ≠ ${want.slice(0, 16)}…` };
    step('sum');

    // Unpacked beside the download, so a broken archive never touches the place
    // the office is running from.
    const fresh = path.join(tmp, 'new');
    await fsp.mkdir(fresh, { recursive: true });
    await run('tar', ['-xzf', tgz, '-C', fresh, '--strip-components=1'], { timeout: 120_000 });
    if (!versionOf(fresh)) return { ok: false, from, reason: 'badArchive', detail: 'no package.json in the archive' };

    // The previous office is moved aside rather than deleted: an update that
    // turns out wrong is undone by moving a folder back. One copy is kept —
    // older ones go when the next update makes its own.
    const aside = `${root}.v${from}`;
    rm(aside);
    await fsp.rename(root, aside);
    try {
      await fsp.rename(fresh, root);
    } catch (e) {
      // Nothing of the office is lost: the old folder goes straight back.
      await fsp.rename(aside, root).catch(() => {});
      return { ok: false, from, reason: 'move', detail: String(e.message || e).slice(0, 200) };
    }
    for (const old of olderCopies(root, from)) rm(old);

    // Modules the archive does not carry are the owner's — the paid ones, and
    // the shelf checkout. They come across, as install.sh brings them across.
    const carried = await carryModules(path.join(aside, 'modules'), path.join(root, 'modules'));
    return { ok: true, from, to: versionOf(root) || to, aside, carried };
  } catch (e) {
    return { ok: false, from, reason: 'archive', detail: String(e.message || e).slice(0, 200) };
  } finally {
    rm(tmp);
  }
}

// The copies of this office kept beside it, except the one just made.
export function olderCopies(root, keepVersion) {
  const dir = path.dirname(root), name = `${path.basename(root)}.v`;
  let list = [];
  try { list = fs.readdirSync(dir); } catch { return []; }
  return list
    .filter((f) => f.startsWith(name) && f !== `${name}${keepVersion}`)
    .map((f) => path.join(dir, f));
}

async function carryModules(from, to) {
  let names = [];
  try { names = await fsp.readdir(from); } catch { return []; }
  await fsp.mkdir(to, { recursive: true });
  const carried = [];
  for (const name of names) {
    const src = path.join(from, name), dst = path.join(to, name);
    // A module the archive brought itself is not replaced by the old copy: the
    // free ones ship inside it and have to move forward with the core.
    if (fs.existsSync(dst)) continue;
    try {
      // The shelf and a worktree module are symlinks and are copied as the
      // links they are: the checkout they point at is where `git pull` runs.
      await fsp.cp(src, dst, { recursive: true, verbatimSymlinks: true });
      carried.push(name);
    } catch { /* one module that cannot be copied is not a failed update */ }
  }
  return carried;
}
