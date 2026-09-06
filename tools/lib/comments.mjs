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
  // The last token character before the cursor: it is what tells `/` the regex
  // from `/` the division, and nothing else in this file needs it.
  let prev = null;
  const at = (n) => s[i + n];
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') { line += 1; i += 1; continue; }
    // a string: to the closing quote, escapes honoured, single line
    if (c === '"' || c === "'") {
      i += 1;
      while (i < s.length && s[i] !== c && s[i] !== '\n') i += (s[i] === '\\' ? 2 : 1);
      i += 1;
      continue;
    }
    // a template literal: to the closing backtick, across lines; `${}` inside
    // is not looked into, which is why a comment in an interpolation is missed
    if (c === '`') {
      i += 1;
      while (i < s.length && s[i] !== '`') {
        if (s[i] === '\n') line += 1;
        i += (s[i] === '\\' ? 2 : 1);
      }
      i += 1;
      continue;
    }
    // a regular expression: only where one can legally start — after an
    // operator, a bracket or nothing at all. `a / b` and `x[i] / 2` are
    // divisions and stay ordinary characters.
    if (c === '/' && at(1) !== '/' && at(1) !== '*' && REGEX_OK.has(prev)) {
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
      prev = '/';
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
    if (c !== ' ' && c !== '\t') prev = c;
    i += 1;
  }
  return out;
}

// Quoted Russian inside an English comment stays: «Гоша освободилась» is the
// evidence for the rule above it, and translated it stops being evidence. So
// the quotes are cut out before the question is asked.
const QUOTED = /«[^»]*»|"[^"]*"|'[^']*'|`[^`]*`|„[^“]*“/g;
const CYRILLIC = /[а-яА-ЯёЁ]/;

/** The comment lines of a file that carry Russian outside quotes. */
export function russianComments(src) {
  const hits = [];
  for (const c of comments(src)) {
    c.text.split('\n').forEach((raw, n) => {
      if (CYRILLIC.test(raw.replace(QUOTED, ''))) hits.push({ line: c.line + n, text: raw.trim() });
    });
  }
  return hits;
}
