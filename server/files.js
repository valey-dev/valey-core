// What to answer with when the office serves a file: the type from the
// extension, and the headers that let what an agent wrote be shown but not
// run.
import path from 'node:path';
import fsp from 'node:fs/promises';

// The largest file /api/file hands out. Anything bigger is refused with 413.
export const MAX_VIEW = 8 * 1024 * 1024;

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

export const fileType = (p) => MIME[path.extname(p).toLowerCase()] || 'text/plain; charset=utf-8';

// A page and an SVG run scripts if you open them by address. /api/file lives
// on the same origin as the office, and the office keeps the owner token in
// localStorage — so html an agent wrote (or was talked into writing), opened
// by following a link, reads that token. The viewer inside the page does not
// do this: it fetches the text and puts it into a sandboxed srcdoc, and fetch
// ignores attachment. The header cuts off the direct navigation and nothing
// else. nosniff goes on everything: the browser must not guess the type of a
// file whose extension it does not know.
const ACTIVE = new Set(['.html', '.htm', '.xhtml', '.svg']);

export function fileHeaders(p) {
  const h = { 'x-content-type-options': 'nosniff' };
  if (ACTIVE.has(path.extname(p).toLowerCase())) h['content-disposition'] = 'attachment';
  return h;
}

// Whether a file named in a transcript can still be opened: it is there, it is a
// file, and it is not too big to serve. A transcript remembers every path an agent
// ever touched, and the disk does not — a screenshot taken into /tmp is cleaned
// away, a draft is deleted, a branch is switched. Until 13 September 2026 the board
// and the agent's file list showed all of them, and what was gone came out as a ✕
// where the thumbnail should be and a «gone» when opened: rows that promise a file
// and cannot give it. Asked once per path per ten seconds — the snapshot runs every
// tick, and sixteen stats per agent per tick is disk work for no news.
const looked = new Map();
const LOOK_MS = 10_000;

export async function viewable(p, now = Date.now()) {
  const hit = looked.get(p);
  if (hit && now - hit.at < LOOK_MS) return hit.ok;
  let ok = false;
  try {
    const st = await fsp.stat(p);
    ok = st.isFile() && st.size <= MAX_VIEW;
  } catch { ok = false; }
  if (looked.size > 4000) looked.clear();
  looked.set(p, { at: now, ok });
  return ok;
}

// The first `n` of `list` that can still be opened, in the list's order. The
// cut comes after the check, so a gone file does not take a place that a present
// one would have filled.
export async function present(list, n, now = Date.now()) {
  const out = [];
  for (const f of list) {
    if (out.length >= n) break;
    if (await viewable(f.path, now)) out.push(f);
  }
  return out;
}
