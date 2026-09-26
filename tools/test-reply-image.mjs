// node tools/test-reply-image.mjs — a picture an agent sent in a reply.
//
// The card and the conversation show it differently on purpose (#reply-image,
// approved 17 September 2026): the conversation draws the file, the card types
// the reply out as plain text and only names it. What breaks silently is the
// card — a reply that arrives as markdown used to be printed with its brackets
// and its path, and that is what a person saw instead of a picture.
import { installDom } from './lib/dom.mjs';
import { renderMarkdown } from '../web/markdown.js';

installDom();
const { clean } = await import('../web/ui.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// ---------------------------------------------------------------- the card
const codex = clean('Готово, вот кадр:\n![каталог после правки](</Users/k/shots/каталог 2.png>)');
ok('the card names the picture instead of printing markdown', codex.includes('🖼 каталог после правки'), codex);
ok('and neither the path nor the brackets survive', !/\]\(|\.png/.test(codex), codex);
const bare = clean('![кадр](/tmp/shot.png)');
ok('a bare path is named too', bare === '🖼 кадр', bare);
const noAlt = clean('![](/tmp/снимок-шапки.png)');
ok('with no caption the file name is the name', noAlt === '🖼 снимок-шапки.png', noAlt);
ok('an ordinary link is left alone', clean('см. [бриф](https://x/y)') === 'см. [бриф](https://x/y)', clean('см. [бриф](https://x/y)'));

// -------------------------------------------------------- the conversation
const html = renderMarkdown('Вот: ![кадр](/tmp/shot.png)');
ok('the conversation draws the file', html.includes('<img src="/api/file?path=%2Ftmp%2Fshot.png"'), html);
ok('the path rides along for the click', html.includes('data-path="/tmp/shot.png"'), html);
ok('and the name is under it', html.includes('<span class="mdpicname">кадр</span>'), html);
const outside = renderMarkdown('![кот](https://x/cat.png)');
ok('a picture from the internet is not fetched', !outside.includes('<img'), outside);

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
