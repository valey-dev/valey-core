// Files dropped onto a task for an agent. The browser hands over bytes, not a
// path — it never knows one — so the office writes them down and gives the
// agent the path instead.
//
// They land beside the office's settings, in ~/.config/valey/inbox, and not in
// the project: a file dropped into a repository is a file somebody commits by
// accident. Claude Code reads it from there without asking for permission —
// «@<path>» in the text is expanded by the CLI itself, checked on 2.1.263 with
// every tool disabled, in `-p` and in stream-json, for text and for an image.
// Frame: WIP «Files dropped into a task #drop-files», v1.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PATHS } from './settings.js';

// 16 MB — the same ceiling the office already has for a posted frame. Five
// files per task: what a person drags in one go, and a limit that keeps a
// stray folder-drop from filling the disk.
export const MAX_BYTES = 16 * 1024 * 1024;
export const MAX_FILES = 5;
// The agent reads the file when the task arrives; after that nobody does.
export const KEEP_DAYS = 14;

export const inboxDir = () => process.env.VALEY_INBOX || path.join(path.dirname(PATHS.file), 'inbox');

// The name is what a person sees in the chip and what stands in the path, so
// it keeps its letters — Cyrillic included — and loses what would break the
// mention: a space ends «@<path>» for the CLI, a slash would climb out of the
// folder, quotes and @ confuse the line it is pasted into.
export function safeName(raw) {
  const base = String(raw || '').split(/[\\/]/).pop().trim();
  const cleaned = base.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._-]/gu, '').replace(/^[.-]+/, '');
  const name = cleaned.slice(0, 60);
  return name || 'file';
}

const two = (n) => String(n).padStart(2, '0');

// One folder per day: it keeps the sweep cheap and makes the path readable in
// the transcript — a person reading the task sees when the file came in.
export async function saveFile(buf, rawName, { now = new Date() } = {}) {
  if (!buf || !buf.length) { const e = new Error('the file is empty'); e.key = 'inbox.empty'; throw e; }
  if (buf.length > MAX_BYTES) { const e = new Error('the file is larger than 16 MB'); e.key = 'inbox.tooBig'; throw e; }
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const dir = path.join(inboxDir(), day);
  await fsp.mkdir(dir, { recursive: true });
  const stamp = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  const name = safeName(rawName);
  const file = path.join(dir, `${stamp}-${Math.random().toString(36).slice(2, 6)}-${name}`);
  await fsp.writeFile(file, buf);
  return { path: file, name, size: buf.length };
}

// What goes into the text of the task. One mention per line: the CLI reads
// «@<path>» to the first space, and the paths here have none by construction.
export function withMentions(text, files = []) {
  const paths = (files || []).map((f) => (f && f.path ? String(f.path) : '')).filter(Boolean).slice(0, MAX_FILES);
  if (!paths.length) return text;
  const lines = paths.map((p) => `@${p}`).join('\n');
  // No words, no empty first line: the task is the files.
  return text ? `${text}\n\n${lines}` : lines;
}

// A file only has to outlive the task it came with. The sweep runs at startup
// rather than on a timer: an office that is not running is not filling up.
export async function prune({ now = Date.now(), keepDays = KEEP_DAYS } = {}) {
  const root = inboxDir();
  let days = [];
  try { days = await fsp.readdir(root, { withFileTypes: true }); } catch { return { files: 0, days: 0 }; }
  let files = 0;
  let dropped = 0;
  for (const d of days) {
    if (!d.isDirectory()) continue;
    const dir = path.join(root, d.name);
    let left = 0;
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      let st;
      try { st = await fsp.stat(p); } catch { continue; }
      if (now - st.mtimeMs > keepDays * 86400_000) { await fsp.rm(p, { force: true }); files++; }
      else left++;
    }
    if (!left) { await fsp.rmdir(dir).catch(() => {}); dropped++; }
  }
  return { files, days: dropped };
}
