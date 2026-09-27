// node tools/test-reply-image.mjs — a picture an agent sent in a reply.
//
// The card and the conversation show it differently on purpose (#reply-image,
// approved 17 September 2026): the conversation draws the file, the card types
// the reply out as plain text and only names it. What breaks silently is the
// card — a reply that arrives as markdown used to be printed with its brackets
// and its path, and that is what a person saw instead of a picture.
import { installDom } from './lib/dom.mjs';
import { renderMarkdown } from '../web/markdown.js';
import { applyLine, emptyState } from '../server/agents.js';
import { applyCodexLine } from '../server/codex.js';

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
// Not taken for a picture — and since #reply-links the card reads any link as
// its text, because the card is plain text and the address is noise there.
ok('an ordinary link is not taken for a picture, and reads as its text', clean('см. [бриф](https://x/y)') === 'см. бриф', clean('см. [бриф](https://x/y)'));
ok('a file link reads as its text', clean('Словарь — [docs/score-words.md](docs/score-words.md), строка [ui.js:1860](web/ui.js:1860).') === 'Словарь — docs/score-words.md, строка ui.js:1860.');

// -------------------------------------------------------- the conversation
const html = renderMarkdown('Вот: ![кадр](/tmp/shot.png)');
ok('the conversation draws the file', html.includes('<img src="/api/file?path=%2Ftmp%2Fshot.png"'), html);
ok('the path rides along for the click', html.includes('data-path="/tmp/shot.png"'), html);
ok('and the name is under it', html.includes('<span class="mdpicname">кадр</span>'), html);
const outside = renderMarkdown('![кот](https://x/cat.png)');
ok('a picture from the internet is not fetched', !outside.includes('<img'), outside);

// ------------------------------------------------------- the file served
// /api/file opens only the agent's files, and a picture reaches the transcript
// by a reply, often not by a tool (26 September 2026: 4 of 9 real ones had
// never been touched by one). So a picture named in a reply counts.
const said = (text) => JSON.stringify({ type: 'assistant', timestamp: '2026-09-26T10:00:00Z',
  message: { role: 'assistant', content: [{ type: 'text', text }] } });
const feed = (...lines) => { const st = emptyState(); for (const l of lines) applyLine(st, l); return st; };
const claude = feed(said('Вот кадр:\n![каталог](</Users/k/shots/каталог 2.png>) и ещё ![](/tmp/b.jpg)'));
ok('a picture in a reply is among the agent\'s files', claude.files.has('/Users/k/shots/каталог 2.png'), [...claude.files.keys()]);
ok('both of them', claude.files.has('/tmp/b.jpg'), [...claude.files.keys()]);
ok('and it is marked as a picture', claude.files.get('/tmp/b.jpg')?.image === true, claude.files.get('/tmp/b.jpg'));
const narrow = feed(said('![a](/tmp/x.svg) ![b](shots/rel.png) ![c](https://e.com/c.png) ![d](/etc/passwd)'));
ok('svg, relative, remote and non-pictures do not count', narrow.files.size === 0, [...narrow.files.keys()]);
const prompt = feed(JSON.stringify({ type: 'user', timestamp: '2026-09-26T10:00:00Z',
  message: { role: 'user', content: 'покажи ![x](/Users/k/secret.png)' } }));
ok('a picture named in a prompt does not count — only the agent\'s own reply', prompt.files.size === 0, [...prompt.files.keys()]);
const cx = emptyState();
applyCodexLine(cx, JSON.stringify({ timestamp: '2026-09-26T10:00:00Z', type: 'event_msg', payload: { type: 'item_completed',
  item: { type: 'AgentMessage', content: [{ type: 'text', text: 'Готово ![портрет](</Users/k/out/queen.png>)' }] } } }));
ok('a Codex reply counts the same way', cx.files.has('/Users/k/out/queen.png'), [...cx.files.keys()]);

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
