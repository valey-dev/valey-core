// node tools/test-guest.mjs — who is let in and what they may do.
//
// It raises an office in shared mode with a settings file of its own: the real
// one must not be touched, the working office's token lives there, and the stand
// needs both to switch the mode and to know the token in advance.
//
// The boundary is what is checked, not the button. We hide the button from a
// guest, but hiding is not forbidding: the page is theirs, and everything it can
// send, it will send.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { startOffice, ROOT } from './lib/office.mjs';

const TOKEN = 'test-owner-token-0001';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// The sessions directory is its own and empty: the stand is about the threshold and the rights, it needs no agents.
const { base, stop } = await startOffice({
  settings: { access: { mode: 'shared', token: TOKEN, invites: [] } },
  claudeDir: '/nonexistent-claude-dir',
});

let GUEST = '';
let revoked = 0;
const call = (p, { as = 'nobody', method = 'POST', body = {} } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (as === 'owner') headers['x-valey-owner'] = TOKEN;
  if (as === 'guest') headers['x-valey-guest'] = GUEST;
  return fetch(base + p, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
};

try {
  // ------------------------------------------------- no entry without an invitation
  const cold = await call('/api/state', { method: 'GET' });
  ok('without an invitation the office is not shown at all', cold.status === 403, cold.status);
  ok('and failure explains what is missing', cold.j && cold.j.errorKey === 'err.needCode', cold.j);
  const whoCold = await call('/api/whoami', { method: 'GET' });
  ok('but you can always ask who you are', whoCold.status === 200, whoCold.status);
  ok('and the office admits that a code is needed', whoCold.j.needsCode === true, whoCold.j);

  // ------------------------------------------------------------ the door
  const made = await call('/api/invite', { as: 'owner', body: { name: 'Костя', from: 'Сергей' } });
  ok('the host makes an invitation', made.status === 200 && !!made.j.invite.code, made.status);
  ok('and there is code in the link', (made.j.url || '').includes(made.j.invite.code), made.j.url);
  ok('the code is not six digits - they don’t brute force it',
    made.j.invite.code.length >= 12, made.j.invite.code.length);

  const guestOnly = await call('/api/invite', { body: { name: 'сам себя' } });
  ok('guest cannot invite', guestOnly.status === 403, guestOnly.status);

  const enter = await call('/api/enter', { body: { code: made.j.invite.code } });
  ok('they let you in according to the code', enter.status === 200 && !!enter.j.guest, enter.status);
  ok('and they say who called', enter.j.from === 'Сергей', enter.j);
  GUEST = enter.j.guest;

  const again = await call('/api/enter', { body: { code: made.j.invite.code } });
  ok('second time using the same link - no', again.status === 403, again.status);
  ok('and the reason is given', again.j.errorKey === 'err.codeUsed', again.j);
  const junkCode = await call('/api/enter', { body: { code: 'нет-такого' } });
  ok('someone else\'s code doesn\'t work', junkCode.j.errorKey === 'err.codeUnknown', junkCode.j);

  // -------------------------------------------------------- what a guest may do
  const look = await call('/api/state', { as: 'guest', method: 'GET' });
  ok('walker looks at the office', look.status === 200, look.status);
  const here = await call('/api/here', { as: 'guest', body: { id: 'g1', name: 'Костя', x: 10, y: 10 } });
  ok('and walks on it', here.status === 200, here.status);
  const note = await call('/api/task', { as: 'guest', body: { agentId: 'нет-такого', text: 'привет' } });
  ok('and leaves a note on the table', note.status !== 403, note.status);
  const streamRes = await fetch(base + '/api/stream?guest=' + encodeURIComponent(GUEST));
  const stream = streamRes.status;
  ok('the thread starts using the same gap in the query line', stream === 200, stream);
  // Kept open until the revoke below: resolves true when the server ends it,
  // false if it is still open eight seconds after the invitation went.
  const streamClosed = (async () => {
    const reader = streamRes.body.getReader();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const { done } = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r({ done: null }), 500))]);
      if (done === true) return true;
      if (done === null && revoked && Date.now() > revoked + 8000) return false;
    }
    return false;
  })();
  // EventSource cannot set headers, so without this the owner in shared mode
  // lost his own office: the page is alive and the stream is refused to it.
  const ownerStream = await fetch(base + '/api/stream?owner=' + encodeURIComponent(TOKEN)).then((r) => r.status);
  ok('and the owner into his own stream - too', ownerStream === 200, ownerStream);
  const noPass = await fetch(base + '/api/stream').then((r) => r.status);
  ok('and without a pass the stream is closed', noPass === 403, noPass);

  // ------------------------------------------------------- what a guest may not do
  const deliver = await call('/api/task', { as: 'guest', body: { agentId: 'x', text: 'y', deliver: true } });
  ok('Can\'t send to chat', deliver.status === 403, deliver);
  ok('and the refusal is about a right, not about a pass', deliver.j.errorKey === 'err.guest', deliver.j);
  const settings = await call('/api/settings', { as: 'guest', body: { lang: 'en' } });
  ok('You cannot change office settings', settings.status === 403, settings.status);
  const shot = await fetch(base + '/api/shot?name=x', {
    method: 'POST', headers: { 'x-valey-guest': GUEST }, body: 'data:image/png;base64,AA',
  }).then((r) => r.status);
  ok('You can\'t write frames to someone else\'s disk', shot === 403, shot);

  // ------------------------------------------------------- the token does not leak
  const seen = await fetch(base + '/api/settings', { headers: { 'x-valey-guest': GUEST } }).then((r) => r.text());
  ok('There is no host token in the settings', !seen.includes(TOKEN), null);
  ok('and the invitation code too', !seen.includes(made.j.invite.code), null);
  ok('and the issued guest token', !seen.includes(GUEST), null);
  const list = await call('/api/invites', { as: 'owner', method: 'GET' });
  ok('The owner does not have codes in the list - he received the link once',
    !JSON.stringify(list.j).includes(made.j.invite.code), list.j);
  ok('but you can see who was called and whether he entered',
    list.j.invites[0].name === 'Костя' && list.j.invites[0].used === true, list.j.invites[0]);

  // ------------------------------------------------ what a guest may load at all
  // The manifest decides, and the expectation is read off the manifests rather
  // than assumed to be "everything": the free build declares both of its
  // modules open, but a developer's tree holds paid modules beside them that say
  // nothing — hidden, by the rule that silence is no. Until 11 September 2026
  // this line compared the guest's list with the owner's whole one, and was red
  // in every tree with a paid module and green only in CI. The filter itself is
  // checked over fixtures in tools/test-modules.mjs, where there is a module to
  // hide; what this checks live is the other failure — filtering that keeps a
  // guest from loading anything and empties the shared floor.
  const mineMods = await call('/api/modules', { as: 'owner', method: 'GET' });
  const theirMods = await call('/api/modules', { as: 'guest', method: 'GET' });
  ok('the owner gets the module list', mineMods.status === 200 && Array.isArray(mineMods.j), mineMods.status);
  ok('and so does a guest, rather than a refusal', theirMods.status === 200 && Array.isArray(theirMods.j), theirMods.status);
  const ids = (list) => list.map((m) => m.id).sort().join();
  const shown = (mineMods.j || []).filter((m) => {
    try { return JSON.parse(readFileSync(path.join(ROOT, 'modules', m.id, 'module.json'), 'utf8')).guests === 'shown'; }
    catch { return false; }
  });
  ok('the ones declared open reach a guest, and only those', ids(theirMods.j || []) === ids(shown), [ids(shown), ids(theirMods.j || [])]);
  ok('and they have something to load with', (theirMods.j || []).every((m) => !!m.client), theirMods.j);

  // The release nudge names a draft on the owner's disk; a guest's snapshot
  // carries none, whatever the owner's says.
  const theirState = await call('/api/state', { as: 'guest', method: 'GET' });
  ok('the guest snapshot arrives', theirState.status === 200 && !!theirState.j, theirState.status);
  ok('and carries no release nudge', theirState.j && theirState.j.release === null, theirState.j && theirState.j.release);

  // --------------------------------------------- the files under /modules/
  // The private repository sits under modules/ on a developer's machine, and
  // until 12 September 2026 any file of it was one URL away for anyone past
  // the network gate. Now the invitation gate covers the folder, and a module
  // hands out only what its page needs.
  const raw = (p, as) => fetch(base + p, { headers: as === 'owner' ? { 'x-valey-owner': TOKEN } : as === 'guest' ? { 'x-valey-guest': GUEST } : {} }).then((r) => r.status);
  ok('without an invitation a module file is refused', await raw('/modules/plan/client.js') === 403, await raw('/modules/plan/client.js'));
  ok('a guest gets the client of a module shown to him', await raw('/modules/plan/client.js', 'guest') === 200, await raw('/modules/plan/client.js', 'guest'));
  ok('the manifest and the server are not files of the page', await raw('/modules/plan/module.json', 'owner') === 404 && await raw('/modules/plan/server.js', 'owner') === 404);
  ok('nothing at the root of modules/ is served', await raw('/modules/AGENTS.md', 'owner') === 404 && await raw('/modules/.git/HEAD', 'owner') === 404);
  ok('nor a path that climbs out', await raw('/modules/plan/..%2F..%2Fpackage.json', 'owner') === 404);

  // ------------------------------------------------------------- evicting
  const out = await call('/api/invite/revoke', { as: 'owner', body: { id: list.j.invites[0].id } });
  revoked = Date.now();
  ok('the host cancels the invitation', out.status === 200, out.status);
  const after = await call('/api/state', { as: 'guest', method: 'GET' });
  ok('and the one kicked out doesn\'t look anymore', after.status === 403, after.status);
  // The stream opened before the revoke ends with it: until 12 September 2026
  // it went on receiving the projection — the granted agent included — for as
  // long as the tab stayed open. Only a fresh request was refused.
  ok('and the stream he had open is closed too', await streamClosed, streamClosed);
} catch (e) {
  bad += 1;
  console.log('FAIL  | test did not complete →', e.message);
} finally {
  await stop();
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
