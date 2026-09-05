// node tools/test-markdown.mjs — the renderer, without a browser
import { renderMarkdown } from '../web/markdown.js';

const cases = [
  ['заголовки', '# Один\n## Два', ['<h1>Один</h1>', '<h2>Два</h2>']],
  ['абзац', 'просто текст\nна двух строках', ['<p>просто текст на двух строках</p>']],
  ['жирный и курсив', 'это **важно** и *слегка*', ['<b>важно</b>', '<i>слегка</i>']],
  ['зачёркнутый', 'было ~~плохо~~', ['<s>плохо</s>']],
  ['инлайн-код', 'зови `npm start` так', ['<code>npm start</code>']],
  // with highlighting the text is split into spans, but the escaping stays mandatory
  ['блок кода', '```js\nconst a = 1 < 2;\n```',
    ['<pre class="mdcode" data-lang="js">', '<span class="t-keyword">const</span>', '&lt;'], ['<script']],
  ['блок кода без языка', '```\nпросто текст < тут\n```',
    ['<pre class="mdcode"><code>просто текст &lt; тут</code></pre>']],
  // The copy button: it lives in the wrapper next to <pre> rather than inside
  // it — inside it would slide sideways along with a long line.
  ['кнопка копирования у блока', '```bash\ngit push\n```',
    ['<div class="mdblock">', '<button class="mdcopy" type="button" data-copy>', '</pre><button']],
  ['текста кода в разметке ровно одна копия', '```\nsecret-command\n```',
    ['secret-command'], ['secret-command</button>']],
  ['у инлайн-кода кнопки нет', 'зови `npm start` так', ['<code>npm start</code>'], ['mdcopy']],
  ['маркированный список', '- раз\n- два', ['<ul><li>раз</li><li>два</li></ul>']],
  ['нумерованный список', '1. раз\n2. два', ['<ol><li>раз</li><li>два</li></ol>']],
  ['вложенный список', '- раз\n  - вложено', ['<li>раз<ul><li>вложено</li></ul></li>']],
  ['чекбоксы', '- [ ] не готово\n- [x] готово', ['☐ не готово', '☑ готово']],
  ['цитата', '> так сказал агент', ['<blockquote>так сказал агент</blockquote>']],
  ['разделитель', 'до\n\n---\n\nпосле', ['<hr>']],
  ['таблица', '| Экран | Ширина |\n|---|---|\n| Вход | 1280 |',
    ['<table>', '<th>Экран</th>', '<td>Вход</td>']],
  ['ссылка', '[доска](https://example.com/a)', ['<a href="https://example.com/a"']],
  ['голая ссылка', 'смотри https://example.com/x дальше', ['<a href="https://example.com/x"']],
  ['локальная ссылка не кликается', '[файл](../secret.md)', ['<span class="mdlink">файл</span>']],
  ['картинка как метка', '![схема](a/b.png)', ['<span class="mdimg">']],
  ['html экранируется', 'опасно <script>alert(1)</script>', ['&lt;script&gt;'], ['<script>']],
  ['html в коде экранируется', '`<b>не жирный</b>`', ['&lt;b&gt;не жирный&lt;/b&gt;'], ['<b>не жирный</b>']],
  ['кавычки в атрибуте', '[x](https://e.com/"onload="alert(1))', [], ['onload="alert']],
  ['звёздочка в тексте не ломает', '2 * 3 * 4', ['2 * 3 * 4']],
];

let failed = 0;
for (const [name, src, must = [], mustNot = []] of cases) {
  const html = renderMarkdown(src);
  const missing = must.filter((m) => !html.includes(m));
  const leaked = mustNot.filter((m) => html.includes(m));
  if (missing.length || leaked.length) {
    failed++;
    console.log(`ПЛОХО | ${name}`);
    if (missing.length) console.log('   нет:', JSON.stringify(missing));
    if (leaked.length) console.log('   лишнее:', JSON.stringify(leaked));
    console.log('   вышло:', html.replace(/\n/g, ' ').slice(0, 160));
  } else {
    console.log(`ok    | ${name}`);
  }
}

// on a real file of the project
const real = await import('node:fs').then((fs) => fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8'));
const out = renderMarkdown(real);
console.log('\nREADME.md:', real.length, 'символов →', out.length, 'символов html');
console.log('  заголовков:', (out.match(/<h[1-6]>/g) || []).length,
  '| таблиц:', (out.match(/<table>/g) || []).length,
  '| блоков кода:', (out.match(/<pre class="mdcode"/g) || []).length,
  '| списков:', (out.match(/<ul>|<ol>/g) || []).length);
if (/<script|onerror=|onload=/i.test(out)) { console.log('  ОПАСНО: в выводе есть исполняемая разметка'); failed++; }

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
