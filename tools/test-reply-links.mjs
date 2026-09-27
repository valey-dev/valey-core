// Stand for #reply-links: which files an agent names by link, and which of them
// the office will hand out. These rules widen what /api/file serves, so every
// refusal is pinned here as well as every acceptance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkTarget, namedLinks, namedPaths, fileList, LIST_MAX } from '../server/links.js';

let failed = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('  ok  |', name);
  else { failed++; console.log('FAIL  |', name, got === undefined ? '' : JSON.stringify(got)); }
};

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-links-'));
fs.mkdirSync(path.join(cwd, 'docs'));
fs.mkdirSync(path.join(cwd, 'web'));
fs.mkdirSync(path.join(cwd, '.claude'));
fs.writeFileSync(path.join(cwd, 'docs', 'score-words.md'), '# words\n');
fs.writeFileSync(path.join(cwd, 'web', 'ui.js'), 'x\n'.repeat(2000));
fs.writeFileSync(path.join(cwd, 'docs', 'my notes.md'), 'n\n');
fs.writeFileSync(path.join(cwd, '.env'), 'SECRET=1\n');
fs.writeFileSync(path.join(cwd, '.claude', 'settings.json'), '{}');

console.log('\nwhere a link points');
let t = linkTarget('docs/score-words.md', cwd);
ok('a relative path resolves against the agent folder', t.path === path.join(cwd, 'docs/score-words.md') && !t.reason, t);
t = linkTarget('web/ui.js:1860', cwd);
ok(':1860 is a line, not part of the name', t.path === path.join(cwd, 'web/ui.js') && t.line === 1860, t);
ok(':1860-1872 opens on its first line', linkTarget('web/ui.js:1860-1872', cwd).line === 1860);
ok('#L42 is a line too', linkTarget('web/ui.js#L42', cwd).line === 42);
ok('an absolute path inside the folder is fine', !linkTarget(path.join(cwd, 'web/ui.js'), cwd).reason);
ok('%20 is decoded', linkTarget('docs/my%20notes.md', cwd).path === path.join(cwd, 'docs/my notes.md'));
ok('a web address is not a file', linkTarget('https://example.com/a.md', cwd) === null);
ok('mailto is not a file', linkTarget('mailto:a@b.c', cwd) === null);
ok('an anchor is not a file', linkTarget('#section', cwd) === null);
ok('a Windows-looking scheme is not a file', linkTarget('file:///etc/passwd', cwd) === null);

console.log('\nwhat the office refuses');
ok('../ leaves the folder', linkTarget('../secret.md', cwd).reason === 'outside');
ok('an absolute path elsewhere is outside', linkTarget('/etc/passwd', cwd).reason === 'outside');
ok('~/ is outside unless the folder is home', linkTarget('~/.ssh/id_rsa', cwd).reason === 'outside');
ok('.env under the folder is hidden', linkTarget('.env', cwd).reason === 'hidden');
ok('a file under .claude is hidden', linkTarget('.claude/settings.json', cwd).reason === 'hidden');
ok('web/../.env normalises and is still hidden', linkTarget('web/../.env', cwd).reason === 'hidden');
ok('the folder itself is not a file', linkTarget('.', cwd).reason === 'outside');
{ const nc = linkTarget('docs/score-words.md', ''); ok('no folder known — nothing opens', !nc || !!nc.reason, nc); }
// A dot in the path above the folder is the folder's own business: worktrees live
// under .claude/worktrees, and 191 of 476 measured links came from there.
const deep = path.join(cwd, '.claude', 'wt');
fs.mkdirSync(path.join(deep, 'web'), { recursive: true });
ok('a dot folder above the agent folder does not count', !linkTarget('web/ui.js', deep).reason, linkTarget('web/ui.js', deep));

console.log('\nwhich replies count');
const msgs = [
  { role: 'user', text: 'посмотри [ключи](.env) и [ui](web/ui.js:5)', ts: 1 },
  { role: 'assistant', text: 'Словарь — [docs/score-words.md](docs/score-words.md), ещё [ui.js:1860](web/ui.js:1860).', ts: 2 },
  { role: 'assistant', text: 'Кадр: ![кадр](/tmp/shot.png) и [заметки](<docs/my notes.md>), [сайт](https://valey.dev), [снова](web/ui.js:12)', ts: 3 },
  { role: 'assistant', text: 'а вот [секрет](.env) и [чужое](../x.md) и [нет файла](docs/gone.md)', ts: 4 },
];
const links = namedLinks(msgs, cwd);
const names = links.map((l) => l.name);
ok('a link in a prompt is not the agent naming a file', !links.some((l) => l.ts === 1));
ok('a picture is #reply-image\'s, not a file link', !names.includes('shot.png'), names);
ok('newest reply first', links[0].ts === 4, links.map((l) => l.ts));
ok('angle brackets carry a space', names.includes('my notes.md'), names);
const ui = links.find((l) => l.name === 'ui.js');
ok('one file named twice is one entry with both hrefs', ui && ui.hrefs.length === 2 && ui.hrefs.includes('web/ui.js:1860') && ui.hrefs.includes('web/ui.js:12'), ui);
ok('its line is the newest mention\'s', ui && ui.line === 12, ui && ui.line);
const allowed = namedPaths(msgs, cwd);
ok('/api/file may hand out a named file', allowed.has(path.join(cwd, 'docs/score-words.md')));
ok('/api/file may not hand out .env, even named', !allowed.has(path.join(cwd, '.env')));
ok('/api/file may not hand out a file outside, even named', !allowed.has(path.resolve(cwd, '../x.md')));
ok('/api/file may not hand out what only a prompt named', namedPaths([msgs[0]], cwd).size === 0);

console.log('\nthe list F raises');
const list = await fileList(msgs, cwd, 1e6);
ok('only files on disk', list.files.every((f) => fs.existsSync(f.path)), list.files.map((f) => f.name));
ok('three files open', list.files.length === 3, list.files.map((f) => f.name));
ok('the refusals are counted by reason', list.refused.hidden === 1 && list.refused.outside === 1 && list.refused.gone === 1, list.refused);
ok('a file carries its folder relative to the agent', list.files.find((f) => f.name === 'score-words.md').dir === 'docs/');
const big = await fileList(msgs, cwd, 10);
ok('a file too big to view does not open', !big.files.some((f) => f.name === 'ui.js') && big.refused.gone === 2, big.refused);
const many = [{ role: 'assistant', ts: 9, text: Array.from({ length: 12 }, (_, i) => `[f${i}](docs/f${i}.md)`).join(' ') }];
for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(cwd, 'docs', `f${i}.md`), 'x');
const twelve = await fileList(many, cwd, 1e6);
ok('every openable file reaches the page, not only the nine F shows', twelve.files.length === 12 && LIST_MAX === 9, twelve.files.length);

fs.rmSync(cwd, { recursive: true, force: true });
console.log(failed ? `\nfailed: ${failed}` : '\nall good');
process.exit(failed ? 1 : 0);
