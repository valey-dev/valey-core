// node tools/test-files-present.mjs — the board and an agent's file list show only
// files that can still be opened.
//
// Reported 13 September 2026: files on the board came out as a ✕ instead of a
// thumbnail and would not open. They were paths a transcript remembered and the disk
// did not — screenshots cleaned out of /tmp, deleted drafts. The disk here is a real
// temporary folder; the clock is passed in, so the ten-second memory is checked
// without waiting ten seconds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { present, viewable, MAX_VIEW } from '../server/files.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-present-'));
const at = (n) => path.join(dir, n);
fs.writeFileSync(at('a.png'), 'x');
fs.writeFileSync(at('b.md'), 'x');
fs.writeFileSync(at('c.png'), 'x');
fs.mkdirSync(at('folder'));
fs.writeFileSync(at('huge.png'), '');
fs.truncateSync(at('huge.png'), MAX_VIEW + 1);   // sparse: the size without the bytes

const list = ['a.png', 'gone.png', 'folder', 'huge.png', 'b.md', 'c.png'].map((n) => ({ path: at(n) }));
let now = 1_000_000;
const names = (xs) => xs.map((f) => path.basename(f.path));

ok('a file that is there can be opened', await viewable(at('a.png'), now));
ok('a file that is gone cannot', !(await viewable(at('gone.png'), now)));
ok('a folder is not a file', !(await viewable(at('folder'), now)));
ok('a file too big to serve is left out', !(await viewable(at('huge.png'), now)));

let out = await present(list, 16, now);
ok('only what opens stays, in the same order', names(out).join(',') === 'a.png,b.md,c.png', names(out));
out = await present(list, 2, now);
ok('the cut comes after the check: gone files take no place', names(out).join(',') === 'a.png,b.md', names(out));

fs.rmSync(at('a.png'));
ok('a file removed a moment ago is still remembered within ten seconds', await viewable(at('a.png'), now + 5_000));
ok('and forgotten after them', !(await viewable(at('a.png'), now + 10_001)));
fs.writeFileSync(at('gone.png'), 'back');
ok('a file that came back is seen again after the ten seconds', await viewable(at('gone.png'), now + 20_000));

fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
