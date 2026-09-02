// A small Markdown renderer. Everything is escaped before any tag is built, so a
// file from disk cannot inject markup of its own.
import { highlight, normaliseLang } from './highlight.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

const SAFE_LINK = /^(https?:\/\/|mailto:|#)/i;
const HOLD = '@@mdhold@@';   // placeholder fence, never present in real text

function inline(s) {
  // `code` is pulled out first: nothing inside it should be formatted afterwards
  const code = [];
  let out = s.replace(/`([^`]+)`/g, (_, c) => {
    code.push(`<code>${c}</code>`);
    return `${HOLD}c${code.length - 1}${HOLD}`;
  });

  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, src) =>
      `<span class="mdimg">🖼 ${alt || src.split('/').pop()}</span>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, text, href) =>
      (SAFE_LINK.test(href)
        ? `<a href="${href}" target="_blank" rel="noreferrer">${text}</a>`
        : `<span class="mdlink">${text}</span>`))
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, href) =>
      `${pre}<a href="${href}" target="_blank" rel="noreferrer">${href}</a>`)
    // содержимое не может начинаться или кончаться пробелом, иначе «2 * 3 * 4»
    // превращается в курсив
    .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, '<b>$1</b>')
    .replace(/__(\S(?:[^_]*\S)?)__/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*(\S(?:[^*\n]*\S)?)\*/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_(\S(?:[^_\n]*\S)?)_/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');

  return out.replace(new RegExp(`${HOLD}c(\\d+)${HOLD}`, 'g'), (_, i) => code[Number(i)]);
}

const isBlank = (l) => !l.trim();
const bullet = (l) => /^(\s*)[-*+]\s+(.*)$/.exec(l);
const numbered = (l) => /^(\s*)\d+[.)]\s+(.*)$/.exec(l);
const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableRule = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function renderMarkdown(src) {
  const fences = [];
  let text = String(src).replace(/\r\n?/g, '\n');

  text = text.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang, body) => {
    const code = body.replace(/\n$/, '');
    const kind = normaliseLang(lang);
    // highlight() escapes as it goes, so known languages skip escapeHtml here
    fences.push(`<pre class="mdcode"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}>`
      + `<code>${kind ? highlight(code, kind) : escapeHtml(code)}</code></pre>`);
    return `${HOLD}f${fences.length - 1}${HOLD}`;
  });

  const lines = escapeHtml(text).split('\n');
  const html = [];
  let para = [];

  const flush = () => {
    if (!para.length) return;
    html.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };

  const fenceAt = new RegExp(`^${HOLD}f(\\d+)${HOLD}$`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = fenceAt.exec(line.trim());
    if (fence) { flush(); html.push(fences[Number(fence[1])]); continue; }

    if (isBlank(line)) { flush(); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); html.push('<hr>'); continue; }

    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    if (head) {
      flush();
      const level = head[1].length;
      html.push(`<h${level}>${inline(head[2].trim())}</h${level}>`);
      continue;
    }

    if (/^&gt;\s?/.test(line)) {
      flush();
      const quote = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) { quote.push(lines[i].replace(/^&gt;\s?/, '')); i++; }
      i--;
      html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (isTableRow(line) && isTableRule(lines[i + 1] || '')) {
      flush();
      const header = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && isTableRow(lines[i])) { body.push(cells(lines[i])); i++; }
      i--;
      html.push('<table><thead><tr>'
        + header.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + body.map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
        + '</tbody></table>');
      continue;
    }

    if (bullet(line) || numbered(line)) {
      flush();
      const ordered = !bullet(line);
      const items = [];
      let baseIndent = null;
      while (i < lines.length) {
        const m = bullet(lines[i]) || numbered(lines[i]);
        if (!m) break;
        if (baseIndent === null) baseIndent = m[1].length;
        const body = m[2].replace(/^\[ \]\s*/, '☐ ').replace(/^\[[xX]\]\s*/, '☑ ');
        if (m[1].length > baseIndent + 1 && items.length) items[items.length - 1].kids.push(body);
        else items.push({ body, kids: [] });
        i++;
      }
      i--;
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>` + items.map((it) =>
        `<li>${inline(it.body)}${it.kids.length
          ? `<ul>${it.kids.map((k) => `<li>${inline(k)}</li>`).join('')}</ul>`
          : ''}</li>`).join('') + `</${tag}>`);
      continue;
    }

    para.push(line.trim());
  }

  flush();
  // a fence that sat inline (indented, or with text on the same line) leaves its
  // placeholder inside a paragraph — put the code back instead of printing it
  return html.join('\n').replace(new RegExp(`${HOLD}f(\\d+)${HOLD}`, 'g'), (_, i) => fences[Number(i)] || '');
}
