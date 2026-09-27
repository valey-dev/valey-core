// Stand for #reply-weblinks: which web links L lists from a conversation.
import { webLinks, addressOf } from '../web/weblinks.js';

let failed = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('  ok  |', name);
  else { failed++; console.log('FAIL  |', name, got === undefined ? '' : JSON.stringify(got)); }
};

const msgs = [
  { role: 'user', text: 'глянь https://example.com/prompt и [бриф](https://example.com/brief)', ts: 1 },
  { role: 'assistant', text: 'PR — [PR #48 · score words](https://github.com/kolya/seed-bank/pull/48), кадр — [Score words · v2](<https://www.figma.com/design/abc/Seed-Bank?node-id=1-2>).', ts: 2 },
  { role: 'assistant', text: 'Контраст — https://webaim.org/resources/contrastchecker/. Ещё раз PR: https://github.com/kolya/seed-bank/pull/48', ts: 3 },
  { role: 'assistant', text: 'Команда: `curl https://valey.dev/install.sh | sh`\n```\nhttps://in-a-fence.example\n```\nи файл [ui.js](web/ui.js:12) и картинка ![кадр](https://example.com/p.png)', ts: 4 },
];
const links = webLinks(msgs);
const urls = links.map((l) => l.url);

ok('a link in a prompt is not the agent giving one', !urls.some((u) => u.includes('example.com/prompt') || u.includes('example.com/brief')), urls);
ok('newest reply first', links[0].url === 'https://webaim.org/resources/contrastchecker/', urls);
ok('reading order inside a reply', urls.indexOf('https://github.com/kolya/seed-bank/pull/48') < urls.indexOf('https://www.figma.com/design/abc/Seed-Bank?node-id=1-2'), urls);
ok('a bare address counts, without its full stop', urls.includes('https://webaim.org/resources/contrastchecker/'), urls);
ok('one address named twice is one entry', urls.filter((u) => u.endsWith('/pull/48')).length === 1, urls);
ok('and it keeps the words of the link that had them', links.find((l) => l.url.endsWith('/pull/48')).text === 'PR #48 · score words', links.find((l) => l.url.endsWith('/pull/48')));
ok('angle brackets carry the address', urls.includes('https://www.figma.com/design/abc/Seed-Bank?node-id=1-2'), urls);
ok('an address in inline code is not a link', !urls.some((u) => u.includes('valey.dev')), urls);
ok('nor one in a fence', !urls.some((u) => u.includes('in-a-fence')), urls);
ok('a file link is F\'s, not L\'s', !urls.some((u) => u.includes('ui.js')), urls);
ok('a picture is #reply-image\'s, not a link', !urls.some((u) => u.endsWith('p.png')), urls);
ok('exactly three links', links.length === 3, urls);
ok('the address drops the scheme and a trailing slash', addressOf('https://webaim.org/resources/contrastchecker/') === 'webaim.org/resources/contrastchecker');
ok('nothing from an empty conversation', webLinks([]).length === 0 && webLinks(null).length === 0);

console.log(failed ? `\nfailed: ${failed}` : '\nall good');
process.exit(failed ? 1 : 0);
