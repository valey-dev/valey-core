// node tools/test-primary-language.mjs — English is the distribution default.
//
// Russian remains a supported locale, so a repository-wide Cyrillic grep would
// reject the feature it is meant to protect. This stand guards the seams where
// locale data used to leak into defaults, fallbacks, logs, and utility pages.
import fs from 'node:fs';
import { effectivePack, namePool } from '../server/agents.js';
import { geocode } from '../server/weather.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + JSON.stringify(got)); }
};

globalThis.document = { documentElement: {}, title: '' };
const i18n = await import('../web/i18n.js');
ok('Node-side imports start in English', i18n.lang() === 'en', i18n.lang());
ok('the default document title is English', i18n.t('doc.title') === 'Valey — the office', i18n.t('doc.title'));
ok('the default name pack is English', effectivePack({}) === 'en', effectivePack({}));
ok('the default name pool uses Latin script', namePool().every((n) => /^\p{Script=Latin}/u.test(n)));

const fetched = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  return { ok: true, json: async () => ({ results: [] }) };
};
try {
  await geocode('Yerevan');
  await geocode('Ереван', 'ru');
} finally {
  globalThis.fetch = realFetch;
}
ok('geocoding defaults to English', fetched[0]?.includes('language=en'), fetched[0]);
ok('Russian geocoding remains available explicitly', fetched[1]?.includes('language=ru'), fetched[1]);

const read = (file) => fs.readFileSync(file, 'utf8');
ok('translation fallback no longer points to Russian', !read('web/i18n.js').includes('(DICT.ru && DICT.ru[key])'));
ok('the character switcher fallback is English', !read('web/office.js').includes('|| SWITCHER.ru'));
ok('bilingual labels fall back to English', !read('web/ui.js').includes('|| v.ru'));
ok('geocoding has no hard-coded Russian query', !read('server/weather.js').includes('language=ru'));
ok('service-room titles are English', !/(?:ПЕРЕГОВОРКА|ОРАНЖЕРЕЯ)/.test(read('web/layout.js')));
ok('weather source identifiers are language-neutral', !/source: ['"](?:выдумана|настоящая)['"]/.test(read('web/weather.js')));
ok('drink completion messages use the translation dictionary', !/(?:Стакан воды|Кофе налит)/.test(read('web/main.js')));

const operatorFiles = [
  'server/index.js', 'server/modules.js', 'server/settings.js', 'server/weather.js',
  'tools/gh-release.mjs', 'tools/land.mjs', 'tools/lib/dom.mjs', 'tools/lib/office.mjs',
  'tools/make-favicon.py', 'tools/permit-demo.mjs', 'tools/permit.mjs',
  'tools/release-kind.mjs', 'tools/release.mjs', 'tools/run-tests.mjs',
  'tools/script.mjs', 'tools/shot.mjs', 'tools/stand-stop.mjs', 'web/sheet.html',
];
const cyrillic = /[А-Яа-яЁё]/;
const untranslated = operatorFiles.filter((file) => cyrillic.test(read(file)));
ok('operator surfaces and the state sheet are English', untranslated.length === 0, untranslated);
const browserOperatorFiles = ['web/keymap.js', 'web/modules.js', 'web/places.js', 'web/stand.js'];
const untranslatedBrowserMessages = browserOperatorFiles.flatMap((file) => read(file).split('\n')
  .map((line, index) => ({ file, line, index: index + 1 }))
  .filter(({ line }) => cyrillic.test(line) && /(?:console\.|throw new Error|\bline\(|textContent|\.title\s*=)/.test(line))
  .map(({ file, index }) => `${file}:${index}`));
ok('browser diagnostics and stand controls are English', untranslatedBrowserMessages.length === 0, untranslatedBrowserMessages);

// Russian fixtures prove that the optional locale still works; reporter labels
// are contributor-facing UI and must not silently drift back to Russian. This
// intentionally inspects only the first literal argument of the shared test
// helpers, leaving fixture strings and expected localized output untouched.
const testFiles = [
  ...fs.readdirSync('tools').filter((name) => /^test-.*\.mjs$/.test(name)).map((name) => `tools/${name}`),
  ...['modules/plan', 'modules/radio', 'modules/newsstand', 'modules/polaroid'].filter((dir) => fs.existsSync(dir)).flatMap((dir) =>
    fs.readdirSync(dir).filter((name) => /^test-.*\.mjs$/.test(name)).map((name) => `${dir}/${name}`)),
];

// What a stand prints, found by the call it is printed through. Until
// 15 September 2026 only the first argument of the reporters was read, so the
// failure tails — `check('G processed', …, 'не обработана')`, every assert's
// message, «УПАЛО» in a summary — went on printing Russian under an English
// label, about 350 lines of them, and the rule stood green. Only literal text
// counts: `${…}` inside a template is data, and so is anything that is not a
// literal at all — a variable, a call, a regular expression matching the
// installer's Russian output.
const MESSAGE_AT = {
  // an assert's message: after the value, or after actual and expected
  '': [1], ok: [1], equal: [2], notEqual: [2], strictEqual: [2], notStrictEqual: [2],
  deepEqual: [2], deepStrictEqual: [2], notDeepEqual: [2], notDeepStrictEqual: [2],
  match: [2], doesNotMatch: [2], throws: [1, 2], rejects: [1, 2], doesNotThrow: [1, 2], fail: [0],
};
// the stands' own reporters: the label, and a literal detail after the verdict
// (a variable there is the value got, which is data)
const REPORTER = [0, 2];
// The index of a string's closing quote; `${…}` inside a template is walked
// through, strings within it included.
function stringEnd(text, i) {
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
// it cannot end a value. The stands match markup with patterns full of quotes
// and brackets — /tnode own[^"]*" data-id="(bible|easel)"/ — and read as code
// such a pattern opened a string that never closed, hiding the rest of the file.
function regexAt(text, i) {
  if (text[i] !== '/' || text[i + 1] === '/' || text[i + 1] === '*') return false;
  let j = i - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  return j < 0 || '(,=:[!&|?{};+-*%<>~^'.includes(text[j]) || /\b(?:return|typeof|of|in)$/.test(text.slice(Math.max(0, j - 6), j + 1));
}
function regexEnd(text, i) {
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
// The arguments of the call whose `(` is at `open`, as source text.
function argsAt(text, open) {
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
// The literal text an argument prints: its strings and templates at the top
// level — a sum, or both arms of `bad ? `${bad} failed` : 'all passed'` — with
// `${…}` left out. A string inside a nested call is that call's data, and an
// argument with no literal of its own is null.
function literal(arg) {
  const parts = [];
  let depth = 0;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if ('"\'`'.includes(c)) {
      const end = stringEnd(arg, i);
      if (depth === 0) parts.push(arg.slice(i + 1, end).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ''));
      i = end;
    } else if (regexAt(arg, i)) i = regexEnd(arg, i);
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
  }
  return parts.length ? parts.join(' ') : null;
}
// The text with comments and strings blanked out, length for length: a call is
// looked for here, so `console.log('…')` quoted inside a fixture, or a reporter
// named in a comment, is not taken for one.
function code(text) {
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
function printed(file) {
  const text = read(file);
  const found = [];
  const calls = /\b(?:assert(?:\.(\w+))?|(ok|check|bad|say|survives)|(console\.(?:log|error|warn)|throw new Error|process\.(?:stdout|stderr)\.write|die))\s*\(/g;
  for (const m of code(text).matchAll(calls)) {
    const args = argsAt(text, m.index + m[0].length - 1);
    const at = m[3] ? args.map((_, i) => i) : m[2] ? REPORTER : (MESSAGE_AT[m[1] || ''] || []);
    for (const i of at) {
      const lit = args[i] === undefined ? null : literal(args[i]);
      if (lit && cyrillic.test(lit)) found.push(`${file}:${text.slice(0, m.index).split('\n').length}`);
    }
  }
  return found;
}
const untranslatedOutput = [...new Set(testFiles.flatMap(printed))];
ok('what the stands print is English — labels, failure details, assert messages, summaries', untranslatedOutput.length === 0, untranslatedOutput);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
