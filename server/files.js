// What to answer with when the office serves a file: the type from the
// extension, and the headers that let what an agent wrote be shown but not
// run.
import path from 'node:path';

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
