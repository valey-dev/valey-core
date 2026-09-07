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
  ['page.html', 'html'], ['page.htm', 'html'], ['photo.png', null]];
for (const [path, want] of byExt) {
  const got = langOf(path);
  if (got !== want) { failed++; console.log(`FAIL  | langOf(${path}) → ${got}, expected ${want}`); }
  else console.log(`ok    | langOf(${path}) → ${got}`);
}
for (const [tag, want] of [['JavaScript', 'js'], ['CSS', 'css'], ['html', 'html'], ['bash', null]]) {
  const got = normaliseLang(tag);
  if (got !== want) { failed++; console.log(`FAIL  | normaliseLang(${tag}) → ${got}`); }
  else console.log(`ok    | normaliseLang(${tag}) → ${got}`);
}

// on the project's real files: speed, and no text lost
const strip = (html) => html.replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

for (const [file, lang] of [['../web/main.js', 'js'], ['../web/style.css', 'css'], ['../web/index.html', 'html']]) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const t0 = Date.now();
  const out = highlight(src, lang);
  const ms = Date.now() - t0;
  const same = strip(out) === src;
  if (!same) { failed++; console.log(`FAIL  | ${file}: highlighting lost text`); }
  console.log(`${same ? 'ok   ' : 'FAILED'} | ${file}: ${src.length} chars → ${ms} ms, text ${same ? 'intact' : 'damaged'}`);
}

console.log(failed ? `\nfailed: ${failed}` : '\nall good');
process.exit(failed ? 1 : 0);
