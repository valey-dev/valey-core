// Comments, told apart from the code around them.
//
// The rule "code comments are in English" needs a machine that can answer "is
// this Cyrillic in a comment, or in a line the office says out loud?". A grep
// cannot: `console.log('Гоша освободилась')` and `// Гоша освободилась` look
// the same to it, and the first one is meant to stay.
//
// So: strings and template literals are skipped, and what is left of a `//` or
// `/* */` is a comment. Regular expressions are deliberately not parsed —
// `/'/ ` opens a fake string that closes at the end of the line, which can hide
// a comment but can never invent one. This machine errs towards missing a
// violation, never towards a false one.

/** Every comment in the source, as { line, text }. */
export function comments(src) {
  const out = [];
  const s = String(src);
  let i = 0, line = 1;
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
