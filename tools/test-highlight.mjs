// node tools/test-highlight.mjs — the syntax highlighter, without a browser
import { readFileSync } from 'node:fs';
import { highlight, langOf, normaliseLang } from '../web/highlight.js';

const cases = [
  ['js: keywords', 'js', 'const a = 1;', ['<span class="t-keyword">const</span>']],
  ['js: comment', 'js', '// заметка\nlet b', ['<span class="t-comment">// заметка</span>']],
  ['js: block comment', 'js', '/* два\nряда */', ['<span class="t-comment">/* два\nряда */</span>']],
  ['js: string', 'js', "const s = 'привет';", ['<span class="t-string">&#39;привет&#39;</span>'.replace(/&#39;/g, "'")]],
  ['js: number', 'js', 'x = 42.5', ['<span class="t-number">42.5</span>']],
  ['js: function call', 'js', 'drawPerson(ctx)', ['<span class="t-fn">drawPerson</span>']],
  ['js: property', 'js', 'a.map(f)', ['<span class="t-prop">.map</span>']],
  ['js: a keyword inside a comment is not highlighted', 'js', '// const тут текст',
    ['<span class="t-comment">// const тут текст</span>'], ['t-keyword']],
  ['js: a tag inside a string is escaped', 'js', 'const s = "<img onerror=x>"', ['&lt;img'], ['<img']],

  ['css: property', 'css', '.a{color:red}', ['<span class="t-cssprop">color</span>']],
  ['css: selector', 'css', '.rrow{padding:4px}', ['<span class="t-selector">.rrow</span>']],
  ['css: color', 'css', 'b{color:#ffd166}', ['<span class="t-color">#ffd166</span>']],
  ['css: number with a unit', 'css', 'b{padding:4px}', ['<span class="t-number">4px</span>']],
  ['css: at-rule', 'css', '@media (max-width:600px){}', ['<span class="t-atrule">@media</span>']],
  ['css: comment', 'css', '/* пусто */', ['<span class="t-comment">/* пусто */</span>']],

  ['json: key', 'json', '{"mode":"acceptEdits"}', ['<span class="t-cssprop">"mode"</span>']],
  ['json: literal', 'json', '{"on":true}', ['<span class="t-literal">true</span>']],

  ['yaml: key and value', 'yaml', 'name: rocket', ['<span class="t-cssprop">name</span><span class="t-punct">:</span>']],
  ['yaml: a key inside a list item', 'yaml', '  - uses: actions/checkout@v4', ['<span class="t-punct">-</span>', '<span class="t-cssprop">uses</span>']],
  ['yaml: on is a key in a CI file, not a literal', 'yaml', 'on:\n  push:', ['<span class="t-cssprop">on</span>'], ['t-literal']],
  ['yaml: comment', 'yaml', 'retries: 3 # three', ['<span class="t-comment"># three</span>', '<span class="t-number">3</span>']],
  ['yaml: a hash inside a quoted string is not a comment', 'yaml', 'title: "a # b"', ['<span class="t-string">"a # b"</span>'], ['t-comment']],
  ['yaml: a colon in a URL is not a key', 'yaml', 'url: http://a:b/c#frag', ['http://a:b/c#frag'], ['t-cssprop">http', 't-comment']],
  ['yaml: an apostrophe in a word does not open a string', 'yaml', "name: don't stop", ["don't stop"], ['t-string']],
  ['yaml: literals and the null tilde', 'yaml', 'a: yes\nb: ~', ['<span class="t-literal">yes</span>', '<span class="t-literal">~</span>']],
  ['yaml: anchor, alias and tag', 'yaml', 'base: &b\nx: *b\ny: !!str 1', ['<span class="t-atrule">&amp;b</span>', '<span class="t-atrule">*b</span>', '<span class="t-keyword">!!str</span>']],
  ['yaml: a block after run: | is text, keys and comments included', 'yaml', 'run: |\n  echo key: value # not a key\nnext: 1',
    ['<span class="t-string">  echo key: value # not a key</span>', '<span class="t-cssprop">next</span>'], ['t-comment']],
  ['yaml: a folded block ends where the indent does', 'yaml', 'a: >-\n  folded\n\n  more\nb: 2',
    ['<span class="t-string">  folded</span>', '<span class="t-string">  more</span>', '<span class="t-cssprop">b</span>']],
  ['yaml: a tag inside a value is escaped', 'yaml', 'x: "<img onerror=x>"', ['&lt;img'], ['<img']],

  ['html: tag', 'html', '<div class="a">текст</div>', ['<span class="t-tag">div</span>']],
  ['html: attribute', 'html', '<div class="a"></div>', ['<span class="t-attr">class</span>']],
  ['html: attribute value', 'html', '<div class="a"></div>', ['<span class="t-string">"a"</span>']],
  ['html: comment', 'html', '<!-- заметка -->', ['<span class="t-comment">&lt;!-- заметка --&gt;</span>']],
  ['html: doctype', 'html', '<!doctype html>', ['<span class="t-atrule">']],
  ['html: text remains text', 'html', '<p>просто текст</p>', ['просто текст']],
  ['html: nested style is highlighted as CSS', 'html', '<style>.a{color:red}</style>',
    ['<span class="t-cssprop">color</span>']],
  ['html: nested script is highlighted as JavaScript', 'html', '<script>const a = 1;</script>',
    ['<span class="t-keyword">const</span>']],
  ['html: nothing is executed', 'html', '<script>alert(1)</script>', ['&lt;'], ['<script>']],
];

let failed = 0;
for (const [name, lang, src, must = [], mustNot = []] of cases) {
  const out = highlight(src, lang);
  const missing = must.filter((m) => !out.includes(m));
  const leaked = mustNot.filter((m) => out.includes(m));
  if (missing.length || leaked.length) {
    failed++;
    console.log(`FAIL  | ${name}`);
    if (missing.length) console.log('   missing:', JSON.stringify(missing));
    if (leaked.length) console.log('   leaked:', JSON.stringify(leaked));
    console.log('   output:', out.replace(/\n/g, ' ').slice(0, 160));
  } else {
    console.log(`ok    | ${name}`);
  }
}

// the language from the extension and from the fence label in markdown
const byExt = [['a/b.js', 'js'], ['style.css', 'css'], ['data.json', 'json'],
  ['.github/workflows/test.yml', 'yaml'], ['compose.YAML', 'yaml'],
  ['page.html', 'html'], ['page.htm', 'html'], ['photo.png', null]];
for (const [path, want] of byExt) {
  const got = langOf(path);
  if (got !== want) { failed++; console.log(`FAIL  | langOf(${path}) → ${got}, expected ${want}`); }
  else console.log(`ok    | langOf(${path}) → ${got}`);
}
for (const [tag, want] of [['JavaScript', 'js'], ['CSS', 'css'], ['html', 'html'], ['yaml', 'yaml'], ['YML', 'yaml'], ['bash', null]]) {
  const got = normaliseLang(tag);
  if (got !== want) { failed++; console.log(`FAIL  | normaliseLang(${tag}) → ${got}`); }
  else console.log(`ok    | normaliseLang(${tag}) → ${got}`);
}

// on the project's real files: speed, and no text lost
const strip = (html) => html.replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

for (const [file, lang] of [['../web/main.js', 'js'], ['../web/style.css', 'css'], ['../web/index.html', 'html'],
  ['../.github/workflows/test.yml', 'yaml']]) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const t0 = Date.now();
  const out = highlight(src, lang);
  const ms = Date.now() - t0;
  const same = strip(out) === src;
  if (!same) { failed++; console.log(`FAIL  | ${file}: highlighting lost text`); }
  console.log(`${same ? 'ok   ' : 'FAILED'} | ${file}: ${src.length} chars → ${ms} ms, text ${same ? 'intact' : 'damaged'}`);
}

// Every token colour reads on both grounds code is shown on: the viewer panel
// (--wood-dark) and a fence in rendered markdown (#1a120c). On 13 September
// 2026 punctuation was #7a6450 — 2.93:1 on the panel — and inside fences the
// comments and punctuation had darker copies of their own, 3.50 and 4.12:1,
// written for a base text that is no longer dimmer there.
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const x = lum(hex2rgb(a)), y = lum(hex2rgb(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const tokens = readFileSync(new URL('../web/tokens.css', import.meta.url), 'utf8');
const vars = Object.fromEntries([...tokens.matchAll(/(--[\w-]+):(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const sheet = readFileSync(new URL('../web/highlight.css', import.meta.url), 'utf8');
const grounds = { 'the viewer': vars['--wood-dark'], 'a markdown fence': '#1a120c' };
const colours = [...sheet.matchAll(/\.t-([\w-]+)\{color:(#[0-9a-f]{6}|var\((--[\w-]+)\))\}/gi)]
  .map((m) => [m[1], m[3] ? vars[m[3]] : m[2]]);
let dim = 0;
for (const [cls, hex] of colours) {
  for (const [where, bg] of Object.entries(grounds)) {
    const c = contrast(hex, bg);
    if (c < 4.5) { dim++; console.log(`FAIL  | .t-${cls} ${hex} on ${where} is ${c.toFixed(2)}:1`); }
  }
}
if (colours.length < 10) { dim++; console.log(`FAIL  | only ${colours.length} token colours read from highlight.css`); }
if (!/\.md pre\.mdcode\{background:#1a120c/.test(readFileSync(new URL('../web/markdown.css', import.meta.url), 'utf8'))) {
  dim++; console.log('FAIL  | the markdown fence is no longer #1a120c — move the ground above with it');
}
failed += dim;
if (!dim) console.log(`ok    | ${colours.length} token colours read at 4.5:1 on the viewer and in fences`);

console.log(failed ? `\nfailed: ${failed}` : '\nall good');
process.exit(failed ? 1 : 0);
