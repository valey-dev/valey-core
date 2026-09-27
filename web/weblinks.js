// The web links an agent gave in its replies, for L in a conversation
// (#reply-weblinks). An agent hands its work over by link — a pull request, a
// Figma frame, a release page, a stand — and until 27 September 2026 the only
// way to open one was the mouse; C could copy it, and only if it was on screen.
//
// Nothing here reaches a server: the links are already in the conversation the
// page holds, and a digit opens one in a new tab of the viewer's own browser.

// `[text](https://…)` — the address may sit in angle brackets. Not `![…](…)`.
const MD_LINK = /(^|[^!])\[([^\]\n]+)\]\(\s*<?(https?:\/\/[^\s)>]+)>?[^)\n]*\)/g;
// A bare address, as the renderer turns one into a link: after a space or «(».
const BARE = /(^|[\s(])(https?:\/\/[^\s<)]+)/g;

// Code is not a link on the page, so it is not one here either: the renderer
// pulls `code` and fences out before it looks for addresses. Nor is a picture —
// one from the web is drawn as a «🖼 caption» line (#reply-image), not a link.
const withoutCode = (s) => s.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
  .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' ');

// What the row shows: the address without its scheme, without a trailing slash.
export const addressOf = (url) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/*
 * Newest reply first, and in reading order inside a reply. One address named
 * twice is one entry; it keeps the words of the first link that had words,
 * because «PR #48 · score words» says more than the address it points at.
 */
export function webLinks(msgs) {
  const byUrl = new Map();
  for (let i = (msgs || []).length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== 'assistant' || !m.text || !m.text.includes('http')) continue;
    const text = withoutCode(m.text);
    const found = [];
    for (const g of text.matchAll(MD_LINK)) found.push({ at: g.index + g[1].length, url: g[3], text: g[2].trim() });
    // A bare address inside a markdown link's parentheses is that link, not another.
    const rest = text.replace(MD_LINK, (all, pre) => pre + ' '.repeat(all.length - pre.length));
    for (const g of rest.matchAll(BARE)) found.push({ at: g.index + g[1].length, url: g[2].replace(/[.,;:!?]+$/, ''), text: '' });
    found.sort((a, b) => a.at - b.at);
    for (const f of found) {
      const seen = byUrl.get(f.url);
      if (seen) { if (!seen.text && f.text) seen.text = f.text; continue; }
      byUrl.set(f.url, { url: f.url, text: f.text, address: addressOf(f.url), ts: m.ts || 0 });
    }
  }
  return [...byUrl.values()];
}
