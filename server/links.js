/*
 * Files an agent names in its replies (#reply-links).
 *
 * Claude Code writes a file as a markdown link — `[ui.js:1860](web/ui.js:1860)`
 * — because its system prompt asks for exactly that, and the office used to
 * draw those as a dotted line that went nowhere. Measured over this machine's
 * transcripts, 25–27 September 2026: 476 such links in replies, 454 relative,
 * 148 with a line, 331 pointing at a file that was on disk.
 *
 * The rules decide what /api/file may hand out, so they are narrow and they
 * are the owner's (27 September 2026): a link in the agent's own reply, never
 * in a prompt; resolved against the agent's folder and staying inside it; and
 * never through a dot folder under it — `.env`, `.git`, `.claude`. A guest still
 * needs the conversation open, as for every other file of an agent.
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// `[text](href)` but not `![caption](src)` — pictures are #reply-image's.
// The href may come in angle brackets, which is how markdown carries a space.
const LINK_RE = /(^|[^!])\[([^\]\n]*)\]\(\s*(?:<([^>)\n]*)>|([^)\s]+))[^)\n]*\)/g;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
// F lists nine — one per digit — but every openable file comes to the page, so a
// link to an older one still opens from the text.
export const LIST_MAX = 9;
const SENT_MAX = 60;

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/*
 * Where a link points, or null when it is not a file at all. `line` is the
 * first line of `:1860`, `:1860-1872` or `#L1860`. `reason` is why the office
 * will not open it: 'outside' the agent's folder or 'hidden' under a dot folder.
 */
export function linkTarget(href, cwd) {
  let h = String(href || '').trim();
  if (!h || h.startsWith('#') || SCHEME_RE.test(h)) return null;
  h = decode(h);
  let line = null;
  const hash = h.match(/#L(\d+)(?:-L?\d+)?$/);
  if (hash) { line = Number(hash[1]); h = h.slice(0, hash.index); }
  const colon = !hash && h.match(/:(\d+)(?:-\d+)?$/);
  if (colon && colon.index > 0) { line = Number(colon[1]); h = h.slice(0, colon.index); }
  if (!h) return null;
  const home = os.homedir();
  const abs = h.startsWith('~/') ? path.join(home, h.slice(2))
    : path.isAbsolute(h) ? path.normalize(h)
    : cwd ? path.resolve(cwd, h) : null;
  if (!abs) return null;
  const rel = cwd ? path.relative(cwd, abs) : '';
  let reason = null;
  if (!cwd || !rel || rel.startsWith('..') || path.isAbsolute(rel)) reason = 'outside';
  else if (rel.split(path.sep).some((seg) => seg.startsWith('.'))) reason = 'hidden';
  return { path: abs, rel, line, reason };
}

/*
 * Every file link in the agent's replies, newest reply first and in reading
 * order inside a reply. The same file named twice is one entry that remembers
 * every href it was written as, so each of them can carry its number.
 */
export function namedLinks(msgs, cwd) {
  const byPath = new Map();
  for (let i = (msgs || []).length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== 'assistant' || !m.text || !m.text.includes('](')) continue;
    for (const g of m.text.matchAll(LINK_RE)) {
      const href = g[3] !== undefined ? g[3] : g[4];
      const t = linkTarget(href, cwd);
      if (!t) continue;
      const seen = byPath.get(t.path);
      if (seen) { if (!seen.hrefs.includes(href)) seen.hrefs.push(href); if (seen.line == null) seen.line = t.line; continue; }
      byPath.set(t.path, { ...t, name: path.basename(t.path), ts: m.ts || 0, hrefs: [href] });
    }
  }
  return [...byPath.values()];
}

// The paths /api/file may hand out for this conversation. No disk here: the
// read itself answers 404 for a file that is gone.
export function namedPaths(msgs, cwd) {
  return new Set(namedLinks(msgs, cwd).filter((l) => !l.reason).map((l) => l.path));
}

/*
 * The files the conversation can open, newest first, and a count of the links
 * that will not open, by reason. F shows the first LIST_MAX of them.
 */
export async function fileList(msgs, cwd, maxBytes = Infinity) {
  const refused = { outside: 0, hidden: 0, gone: 0 };
  const files = [];
  for (const l of namedLinks(msgs, cwd)) {
    if (l.reason) { refused[l.reason]++; continue; }
    let st = null;
    try { st = await fsp.stat(l.path); } catch { /* gone */ }
    if (!st || !st.isFile() || st.size > maxBytes) { refused.gone++; continue; }
    if (files.length >= SENT_MAX) break;
    const dir = path.dirname(l.rel);
    files.push({ path: l.path, name: l.name, dir: dir === '.' ? '' : dir + '/', line: l.line, ts: l.ts, hrefs: l.hrefs });
  }
  return { files, refused };
}
