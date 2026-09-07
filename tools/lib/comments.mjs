// Comments, told apart from the code around them.
//
// The rule "code comments are in English" needs a machine that can answer "is
// this Cyrillic in a comment, or in a line the office says out loud?". A grep
// cannot: `console.log('Гоша освободилась')` and `// Гоша освободилась` look
// the same to it, and the first one is meant to stay.
//
// So: strings, template literals and regular expressions are skipped, and what
// is left of a `//` or `/* */` is a comment. This machine errs towards missing a
// violation, never towards a false one.
//
// Regular expressions were the one thing left unparsed, and on 6 September 2026
// that turned out to cost the whole file. web/ui.js holds
// `.replace(/[*#`]/g, '')`: an unparsed backtick inside a regex opened a
// template literal that ran on for two thousand lines, and the machine saw 21
// comments in a file that has hundreds. It reported "translated" about a file it
// had never read. A regex is told from a division the way every tokeniser does
// it — by the last token before the slash — and getting that wrong costs at most
// one skipped line, never an invented hit.

// Where a slash may start a regular expression: after an operator, a comma, an
// opening bracket, a keyword's brace — or at the very start of the file.
const REGEX_OK = new Set([null, '\n', '(', ',', '=', ':', '[', '!', '&', '|',
  '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', 'n' /* return */]);

/** Every comment in the source, as { line, text }. */
export function comments(src) {
  const out = [];
  const s = String(src);
  let i = 0, line = 1;
  // Template expressions are code nested inside template text and may contain
  // more templates in turn. Keeping that nesting explicit prevents an inner
  // backtick from masquerading as the outer template's closing delimiter.
  const stack = [{ type: 'code', depth: null, prev: null }];
  const at = (n) => s[i + n];
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') { line += 1; i += 1; continue; }
    const frame = stack[stack.length - 1];
    if (frame.type === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i += 1; continue; }
      if (c === '$' && at(1) === '{') {
        stack.push({ type: 'code', depth: 1, prev: null });
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    // a string: to the closing quote, escapes honoured, single line
    if (c === '"' || c === "'") {
      i += 1;
      while (i < s.length && s[i] !== c && s[i] !== '\n') i += (s[i] === '\\' ? 2 : 1);
      i += 1;
      frame.prev = 'x';
      continue;
    }
    // Template text is skipped, while its `${...}` expressions return to code.
    if (c === '`') {
      frame.prev = 'x';
      stack.push({ type: 'template' });
      i += 1;
      continue;
    }
    // a regular expression: only where one can legally start — after an
    // operator, a bracket or nothing at all. `a / b` and `x[i] / 2` are
    // divisions and stay ordinary characters.
    if (c === '/' && at(1) !== '/' && at(1) !== '*' && REGEX_OK.has(frame.prev)) {
      i += 1;
      let cls = false;
      while (i < s.length && s[i] !== '\n') {
        const r = s[i];
        if (r === '\\') { i += 2; continue; }
        if (r === '[') cls = true;
        else if (r === ']') cls = false;
        else if (r === '/' && !cls) { i += 1; break; }
        i += 1;
      }
      frame.prev = '/';
      continue;
    }
    if (c === '/' && at(1) === '/') {
      const start = i;
      while (i < s.length && s[i] !== '\n') i += 1;
      out.push({ line, text: s.slice(start, i) });
      continue;
    }
    if (c === '/' && at(1) === '*') {
      const start = i, from = line;
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') line += 1; i += 1; }
      i += 2;
      out.push({ line: from, text: s.slice(start, i) });
      continue;
    }
    if (frame.depth !== null) {
      if (c === '{') frame.depth += 1;
      if (c === '}') {
        frame.depth -= 1;
        if (frame.depth === 0) { stack.pop(); i += 1; continue; }
      }
    }
    if (c !== ' ' && c !== '\t') frame.prev = c;
    i += 1;
  }
  return out;
}

/** Hash comments in YAML, Python, shell files and .gitignore. */
export function hashComments(src) {
  const out = [];
  String(src).split('\n').forEach((raw, i) => {
    let quote = null;
    for (let at = 0; at < raw.length; at += 1) {
      const c = raw[at];
      if (quote) {
        if (c === '\\') at += 1;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '#') { out.push({ line: i + 1, text: raw.slice(at) }); break; }
    }
  });
  return out;
}

/** HTML/XML comments, with their starting line. */
export function markupComments(src) {
  const out = [];
  const s = String(src);
  const re = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(s))) {
    out.push({ line: s.slice(0, m.index).split('\n').length, text: m[0] });
  }
  return out;
}

/** Comments inside fenced source examples, plus HTML comments in Markdown. */
export function markdownComments(src) {
  const out = markupComments(src);
  const s = String(src);
  const re = /```([^\n]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(s))) {
    const lang = m[1].trim().toLowerCase();
    const syntax = /^(?:ya?ml|py(?:thon)?|sh|bash|zsh)$/.test(lang) ? 'hash'
      : /^(?:html|xml|svg)$/.test(lang) ? 'html'
      : /^(?:js|javascript|mjs|css)$/.test(lang) ? 'slash' : null;
    if (!syntax) continue;
    const base = s.slice(0, m.index).split('\n').length;
    const nested = syntax === 'hash' ? hashComments(m[2])
      : syntax === 'html' ? [...markupComments(m[2]), ...comments(m[2])]
      : comments(m[2]);
    for (const c of nested) out.push({ line: base + c.line, text: c.text });
  }
  return out;
}

// Quoted Russian inside an English comment stays: «Гоша освободилась» is the
// evidence for the rule above it, and translated it stops being evidence. So
// the quotes are cut out before the question is asked.
const QUOTED = /«[^»]*»|"[^"]*"|'[^']*'|`[^`]*`|„[^“]*“/g;
const CYRILLIC = /[а-яА-ЯёЁ]/;

/** The comment lines of a file that carry Russian outside quotes. */
export function russianComments(src, syntax = 'slash') {
  const hits = [];
  const found = syntax === 'hash' ? hashComments(src)
    : syntax === 'markup' ? markupComments(src)
    : syntax === 'markdown' ? markdownComments(src)
    : syntax === 'html' ? [...markupComments(src), ...comments(src)]
    : comments(src);
  for (const c of found) {
    // Remove quotations before splitting into lines so a quoted example may
    // span lines without turning its second line into a false violation.
    const unquoted = c.text.replace(QUOTED, (q) => q.replace(/[^\n]/g, ' '));
    const raw = c.text.split('\n');
    unquoted.split('\n').forEach((line, n) => {
      if (CYRILLIC.test(line)) hits.push({ line: c.line + n, text: raw[n].trim() });
    });
  }
  return hits;
}
