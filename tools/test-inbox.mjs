// node tools/test-inbox.mjs — files dropped onto a task: where they land, what
// the agent is told, and what the office refuses to carry.
//
// The refusals are the point. A note may be left by a guest and handed to the
// chat by the owner later, so a path named by somebody else would be read by
// the agent with the owner's hands — out of any folder on the machine.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-inbox-'));
process.env.VALEY_INBOX = path.join(dir, 'inbox');
process.env.VALEY_SETTINGS = path.join(dir, 'settings.json');
const { saveFile, safeName, withMentions, prune, inboxDir, MAX_FILES } = await import('../server/inbox.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// ------------------------------------------------------------------ the name
ok('a space would end the mention, so it goes', safeName('снимок экрана.png') === 'снимок-экрана.png', safeName('снимок экрана.png'));
ok('the letters stay, Cyrillic too', safeName('заметки.md') === 'заметки.md');
ok('a path cannot climb out of the folder', safeName('../../etc/passwd') === 'passwd', safeName('../../etc/passwd'));
ok('quotes and @ go: the name is pasted into a line of text', safeName('a"b\'c@d.png') === 'abcd.png', safeName('a"b\'c@d.png'));
ok('a name of nothing but junk still gets one', safeName('???') === 'file', safeName('???'));
ok('a long name is cut, not refused', safeName('x'.repeat(200) + '.png').length === 60);

// ------------------------------------------------------------------ the file
const saved = await saveFile(Buffer.from('шапка съехала'), 'скрин шапки.png');
ok('the file lands under the inbox', saved.path.startsWith(inboxDir() + path.sep), saved.path);
ok('in a folder named by the day', /\d{4}-\d{2}-\d{2}$/.test(path.basename(path.dirname(saved.path))), saved.path);
ok('the name on disk carries the time and the name', /^\d{6}-[a-z0-9]{4}-скрин-шапки\.png$/.test(path.basename(saved.path)), path.basename(saved.path));
ok('and the bytes are there', (await fsp.readFile(saved.path, 'utf8')) === 'шапка съехала');
ok('there is no space in the path — the mention ends at one', !/\s/.test(saved.path), saved.path);

let refused = '';
try { await saveFile(Buffer.alloc(17 * 1024 * 1024), 'huge.bin'); } catch (e) { refused = e.key; }
ok('over 16 MB is refused by its own key', refused === 'inbox.tooBig', refused);
refused = '';
try { await saveFile(Buffer.alloc(0), 'empty.txt'); } catch (e) { refused = e.key; }
ok('an empty file is refused too', refused === 'inbox.empty', refused);

// --------------------------------------------------------------- the mention
ok('no files, no change to the task', withMentions('почини шапку') === 'почини шапку');
const two = withMentions('вот скриншот', [{ path: '/inbox/a.png' }, { path: '/inbox/b.md' }]);
ok('one mention per line, after the text', two === 'вот скриншот\n\n@/inbox/a.png\n@/inbox/b.md', two);
ok('with no words the task is the mentions alone', withMentions('', [{ path: '/inbox/a.png' }]) === '@/inbox/a.png', withMentions('', [{ path: '/inbox/a.png' }]));
ok('more than five are cut', withMentions('x', Array.from({ length: 9 }, (_, i) => ({ path: `/i/${i}` }))).split('\n@').length - 1 === MAX_FILES);

// ----------------------------------------------------------------- the sweep
const old = await saveFile(Buffer.from('старое'), 'old.txt');
const longAgo = Date.now() - 20 * 86400_000;
await fsp.utimes(old.path, new Date(longAgo), new Date(longAgo));
const fresh = await saveFile(Buffer.from('свежее'), 'new.txt');
const swept = await prune();
ok('a file older than a fortnight is swept', swept.files === 1, swept);
ok('and the fresh one stays', !!(await fsp.stat(fresh.path).catch(() => null)));
ok('the old one is gone', !(await fsp.stat(old.path).catch(() => null)));
ok('a sweep with no inbox at all is not a failure', (await prune({ now: Date.now() })).files === 0);

await fsp.rm(dir, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
