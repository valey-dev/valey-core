// Reading JavaScript without parsing it: where a string ends, where a regular
// expression ends, the source with strings and comments blanked out, and the
// arguments of a call.
//
// Written for the language guard (test-primary-language), which has to find the
// calls a stand prints through and must not take a `console.log` quoted inside a
// fixture for one. It lives here because the second reader arrived the next day:
// the guard over the callbacks a page module is handed (test-ui-api), which must
// not take `api.saveSettings` named in a comment for a call.

// The index of a string's closing quote; `${…}` inside a template is walked
// through, strings within it included.
export function stringEnd(text, i) {
  const q = text[i];
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') { j++; continue; }
    if (q === '`' && text[j] === '$' && text[j + 1] === '{') {
      let depth = 1;
      for (j += 2; j < text.length && depth; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        else if ('"\'`'.includes(text[j])) j = stringEnd(text, j);
      }
      j--;
      continue;
    }
    if (text[j] === q) return j;
  }
  return text.length;
}

// A `/` that opens a regular expression rather than divides: what stands before
// it cannot end a value. The office's stands match markup with patterns full of
// quotes and brackets — /tnode own[^"]*" data-id="(bible|easel)"/ — and read as
// code such a pattern opened a string that never closed, hiding the rest of the
// file.
export function regexAt(text, i) {
  if (text[i] !== '/' || text[i + 1] === '/' || text[i + 1] === '*') return false;
  let j = i - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  return j < 0 || '(,=:[!&|?{};+-*%<>~^'.includes(text[j]) || /\b(?:return|typeof|of|in)$/.test(text.slice(Math.max(0, j - 6), j + 1));
}

export function regexEnd(text, i) {
  let cls = false;
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') { j++; continue; }
    if (c === '\n') return j - 1;
    if (cls) { if (c === ']') cls = false; continue; }
    if (c === '[') cls = true;
    else if (c === '/') return j;
  }
  return text.length;
}

// The text with comments, strings and patterns blanked out, length for length,
// so an index found here points at the same place in the original.
export function code(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('"\'`'.includes(c)) { const end = stringEnd(text, i); out += c + text.slice(i + 1, end).replace(/[^\n]/g, ' ') + (end < text.length ? text[end] : ''); i = end; continue; }
    if (c === '/' && text[i + 1] === '/') { const end = text.indexOf('\n', i); const stop = end < 0 ? text.length : end; out += ' '.repeat(stop - i); i = stop - 1; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); const stop = end < 0 ? text.length : end + 2; out += text.slice(i, stop).replace(/[^\n]/g, ' '); i = stop - 1; continue; }
    if (regexAt(text, i)) { const end = regexEnd(text, i); out += text.slice(i, end + 1).replace(/[^\n]/g, ' '); i = end; continue; }
    out += c;
  }
  return out;
}

// The arguments of the call whose `(` is at `open`, as source text.
export function argsAt(text, open) {
  const args = [];
  let depth = 0, start = open + 1;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if ('"\'`'.includes(c)) { i = stringEnd(text, i); continue; }
    if (regexAt(text, i)) { i = regexEnd(text, i); continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) { args.push(text.slice(start, i)); return args; } depth--; }
    else if (c === ',' && depth === 0) { args.push(text.slice(start, i)); start = i + 1; }
  }
  return args;
}

// The keys of an object literal: the names at its own level, not those of the
// objects nested in it. All three ways of writing one count — `name: value`,
// the shorthand `name,` and the method `name(arg) {…}` — because main.js hands
// its callbacks over in all three, and a reader that knew only the first
// reported two of them as missing.
export function keysOf(source) {
  const text = code(source);
  const keys = [];
  let depth = 0, fresh = false;   // fresh: a key may start here
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{'.includes(c)) { depth++; fresh = c === '{'; continue; }
    if (')]}'.includes(c)) { depth--; fresh = false; continue; }
    if (c === ',') { fresh = true; continue; }
    if (/\s/.test(c)) continue;
    if (depth === 1 && fresh) {
      const m = /^([A-Za-z_$][\w$]*)\s*[:(,}]/.exec(text.slice(i));
      if (m) { keys.push(m[1]); i += m[1].length - 1; }
    }
    fresh = false;
  }
  return keys;
}
