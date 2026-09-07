// node tools/test-markdown.mjs — the renderer, without a browser
import { renderMarkdown } from '../web/markdown.js';

const cases = [
  ['headings', '# Один\n## Два', ['<h1>Один</h1>', '<h2>Два</h2>']],
  ['paragraph', 'просто текст\nна двух строках', ['<p>просто текст на двух строках</p>']],
  ['bold and italic', 'это **важно** и *слегка*', ['<b>важно</b>', '<i>слегка</i>']],
  ['strikethrough', 'было ~~плохо~~', ['<s>плохо</s>']],
  ['inline code', 'зови `npm start` так', ['<code>npm start</code>']],
  // with highlighting the text is split into spans, but the escaping stays mandatory
  ['code block', '```js\nconst a = 1 < 2;\n```',
    ['<pre class="mdcode" data-lang="js">', '<span class="t-keyword">const</span>', '&lt;'], ['<script']],
  ['code block without a language', '```\nпросто текст < тут\n```',
    ['<pre class="mdcode"><code>просто текст &lt; тут</code></pre>']],
  // The copy button: it lives in the wrapper next to <pre> rather than inside
  // it — inside it would slide sideways along with a long line.
  ['a code block has a copy button', '```bash\ngit push\n```',
    ['<div class="mdblock">', '<button class="mdcopy" type="button" data-copy>', '</pre><button']],
  ['code appears exactly once in the markup', '```\nsecret-command\n```',
    ['secret-command'], ['secret-command</button>']],
  // On 4 September inline code had no button on purpose — «selecting it with
  // the mouse is faster there». On the 5th it turned out selection was off
  // entirely (user-select:none on body), and the decision flipped: paths and
  // commands in backticks are what gets copied most.
  ['inline code has its own copy button', 'зови `npm start` так',
    ['<span class="mdcopyable">', 'class="mdcopy-in"', '<code>npm start</code>']],
  ['the empty button gets its icon from CSS', 'зови `npm start` так',
    ['tabindex="-1"></button>'], ['копировать</button>', '⧉']],
  ['a link has a button that copies its URL', '[текст](https://example.com/x)',
    ['class="mdcopyable"', 'data-copy="https://example.com/x"', '>текст</a>']],
  ['a bare URL needs no second copy of its text',
    'смотри https://valey.dev вот', ['class="mdcopy-in" type="button" tabindex="-1">'], ['data-copy=']],
  ['unordered list', '- раз\n- два', ['<ul><li>раз</li><li>два</li></ul>']],
  ['ordered list', '1. раз\n2. два', ['<ol><li>раз</li><li>два</li></ol>']],
  ['nested list', '- раз\n  - вложено', ['<li>раз<ul><li>вложено</li></ul></li>']],
  ['checkboxes', '- [ ] не готово\n- [x] готово', ['☐ не готово', '☑ готово']],
  ['blockquote', '> так сказал агент', ['<blockquote>так сказал агент</blockquote>']],
  ['separator', 'до\n\n---\n\nпосле', ['<hr>']],
  ['table', '| Экран | Ширина |\n|---|---|\n| Вход | 1280 |',
    ['<table>', '<th>Экран</th>', '<td>Вход</td>']],
  ['link', '[доска](https://example.com/a)', ['<a href="https://example.com/a"']],
  ['bare URL', 'смотри https://example.com/x дальше', ['<a href="https://example.com/x"']],
  ['a local link is not clickable', '[файл](../secret.md)', ['<span class="mdlink">файл</span>']],
  ['an image is rendered as a marker', '![схема](a/b.png)', ['<span class="mdimg">']],
  ['HTML is escaped', 'опасно <script>alert(1)</script>', ['&lt;script&gt;'], ['<script>']],
  ['HTML inside code is escaped', '`<b>не жирный</b>`', ['&lt;b&gt;не жирный&lt;/b&gt;'], ['<b>не жирный</b>']],
  ['quotes inside an attribute', '[x](https://e.com/"onload="alert(1))', [], ['onload="alert']],
  ['an asterisk in text does not break parsing', '2 * 3 * 4', ['2 * 3 * 4']],
];

let failed = 0;
for (const [name, src, must = [], mustNot = []] of cases) {
  const html = renderMarkdown(src);
  const missing = must.filter((m) => !html.includes(m));
  const leaked = mustNot.filter((m) => html.includes(m));
  if (missing.length || leaked.length) {
    failed++;
    console.log(`FAIL  | ${name}`);
    if (missing.length) console.log('   missing:', JSON.stringify(missing));
    if (leaked.length) console.log('   leaked:', JSON.stringify(leaked));
    console.log('   output:', html.replace(/\n/g, ' ').slice(0, 160));
  } else {
    console.log(`ok    | ${name}`);
  }
}

// on a real file of the project
const real = await import('node:fs').then((fs) => fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8'));
const out = renderMarkdown(real);
console.log('\nREADME.md:', real.length, 'characters →', out.length, 'HTML characters');
console.log('  headings:', (out.match(/<h[1-6]>/g) || []).length,
  '| tables:', (out.match(/<table>/g) || []).length,
  '| code blocks:', (out.match(/<pre class="mdcode"/g) || []).length,
  '| lists:', (out.match(/<ul>|<ol>/g) || []).length);
if (/<script|onerror=|onload=/i.test(out)) { console.log('  UNSAFE: output contains executable markup'); failed++; }

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
