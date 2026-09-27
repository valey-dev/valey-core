// node tools/test-drop.mjs — a dropped file over the wire: who may put one on
// the owner's disk, and whose paths a task is allowed to carry.
//
// The second question is the sharp one. Anyone invited may leave a note on the
// desk, and the owner hands notes to the chat later — so a path named by a
// guest would be opened by the agent with the owner's hands. The office takes
// files from the owner only, and only the ones it wrote into its own inbox.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fakeClaudeDir, startOffice, waitForAgent } from './lib/office.mjs';

const TOKEN = 'drop-owner-0001';
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-drop-'));
const inbox = path.join(dir, 'inbox');
const fake = await fakeClaudeDir(dir);
const { base, stop } = await startOffice({
  settings: { access: { mode: 'shared', token: TOKEN, invites: [] } },
  claudeDir: fake.dir,
  env: { VALEY_INBOX: inbox },
});

let GUEST = '';
const head = (as) => (as === 'owner' ? { 'x-valey-owner': TOKEN } : as === 'guest' ? { 'x-valey-guest': GUEST } : {});
const call = (p, { as = 'nobody', method = 'POST', body = {} } = {}) =>
  fetch(base + p, { method, headers: { ...head(as), 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
const put = (name, bytes, as = 'owner') =>
  fetch(`${base}/api/inbox?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { ...head(as), 'content-type': 'application/octet-stream' }, body: bytes })
    .then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));

try {
  const made = await call('/api/invite', { as: 'owner', body: { name: 'Костя', from: 'Сергей' } });
  GUEST = (await call('/api/enter', { body: { code: made.j.invite.code } })).j.guest;
  const snap = await waitForAgent(() => call('/api/state', { as: 'owner', method: 'GET' }).then((r) => r.j));
  const agentId = snap.agents[0].id;

  // ------------------------------------------------------------- the upload
  const mine = await put('снимок шапки.png', Buffer.from('PNG-ish bytes'));
  ok('the owner may put a file into the inbox', mine.status === 200 && mine.j.ok, mine);
  ok('it lands in the office\'s own inbox', mine.j.file.path.startsWith(inbox + path.sep), mine.j.file);
  ok('and the name loses its space', path.basename(mine.j.file.path).endsWith('-снимок-шапки.png'), mine.j.file.name);

  const theirs = await put('guest.png', Buffer.from('bytes'), 'guest');
  ok('a guest may not: this would be a write to the owner\'s disk', theirs.status === 403, theirs);
  ok('and nothing of theirs appears in the inbox',
    !(await fsp.readdir(inbox, { recursive: true })).some((f) => String(f).includes('guest')), await fsp.readdir(inbox, { recursive: true }));

  // -------------------------------------------------------------- the task
  const withFile = await call('/api/task', { as: 'owner', body: { agentId, text: 'вот шапка', files: [mine.j.file] } });
  ok('a task carries the file it was given', withFile.j.task.files.length === 1 && withFile.j.task.files[0].path === mine.j.file.path, withFile.j.task.files);

  // A screenshot with no words is «вот, посмотри» — a message. The browser
  // allowed it from the first day; the server did not, and answered as if the
  // agent were missing.
  const wordless = await call('/api/task', { as: 'owner', body: { agentId, text: '', files: [mine.j.file] } });
  ok('a task of one file and no words is taken', wordless.status === 200 && wordless.j.ok && wordless.j.task.files.length === 1, wordless.j);
  const nothing = await call('/api/task', { as: 'owner', body: { agentId, text: '', files: [] } });
  ok('a task of nothing at all is not', nothing.status === 400 && nothing.j.errorKey === 'err.taskEmpty', nothing.j);
  const outside = await call('/api/task', { as: 'owner', body: { agentId, text: 'прочитай', files: [{ path: '/etc/hosts', name: 'hosts' }] } });
  ok('a path outside the inbox is dropped, task and all', outside.j.task.files.length === 0, outside.j.task.files);

  const invented = await call('/api/task', { as: 'owner', body: { agentId, text: 'прочитай', files: [{ path: path.join(inbox, 'нет-такого.png'), name: 'нет-такого.png' }] } });
  ok('so is a path inside it that is not on disk', invented.j.task.files.length === 0, invented.j.task.files);

  const guestNote = await call('/api/task', { as: 'guest', body: { agentId, text: 'посмотри', files: [mine.j.file] } });
  ok('a guest may still leave a note', guestNote.status === 200 && guestNote.j.ok, guestNote.status);
  ok('but it carries no files at all — even ones the office wrote itself',
    guestNote.j.task.files.length === 0, guestNote.j.task.files);
} finally {
  await stop();
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
