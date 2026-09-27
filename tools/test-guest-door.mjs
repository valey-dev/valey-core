// node tools/test-guest-door.mjs — a guest gets in while another office writes
// the same settings file.
//
// Every office on one machine shares ~/.config/valey/settings.json, and each
// saves names and seats on its own tick. Since 7 September 2026 a save from a
// stale copy is refused rather than written over the newer file; until
// 13 September 2026 the door did not retry. /api/enter answered 500, the pass
// it had chosen was lost with the refused save, the stream answered the guest
// 403 on every reconnect, and the page, whose code was already gone from the
// address, showed an empty office for good. "About one entry in two" was
// simply how often the other office had written since the last save.
//
// Here the other office is this stand writing the file between the steps.
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { freePort } from './lib/office.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 200) : JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-door-'));
const FILE = path.join(dir, 'settings.json');
const OWNER = 'door-owner-0001';
await fsp.writeFile(FILE, JSON.stringify({
  access: { mode: 'private', token: OWNER, invites: [] },
  weather: { enabled: false }, delivery: { mode: 'default' },
}, null, 2));
// Before the import: the settings and the sessions directory are read on it.
process.env.VALEY_SETTINGS = FILE;
process.env.VALEY_CLAUDE_DIR = path.join(dir, 'no-claude');
delete process.env.VALEY_STAND;

const { createHandler, setSnapshot } = await import('../server/index.js');
// lastSaid is what a guest must not get: it tells the two projections apart.
setSnapshot({ agents: [{ id: 'a1', name: 'Гоша', project: 'door', status: 'working', lastSaid: 'только хозяину' }] });

const port = await freePort();
const server = http.createServer(createHandler());
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const base = `http://127.0.0.1:${port}`;

const call = (p, { method = 'GET', headers = {}, body } = {}) => fetch(base + p, {
  method, headers: body ? { 'content-type': 'application/json', origin: base, ...headers } : headers,
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
const owner = { 'x-valey-owner': OWNER };

// The other office: reads the file, changes its own part, puts it back by
// rename — the way server/settings.js writes, so the inode changes too.
let foreign = 0;
async function otherOfficeWrites() {
  const s = JSON.parse(await fsp.readFile(FILE, 'utf8'));
  foreign += 1;
  s.names = { ...(s.names || {}), ['other-' + foreign]: 'Вера' };
  await fsp.writeFile(FILE + '.other', JSON.stringify(s, null, 2));
  await fsp.rename(FILE + '.other', FILE);
}
const onDisk = async () => JSON.parse(await fsp.readFile(FILE, 'utf8'));

// The first frame of the stream, as the page gets it. `pass` is the query the
// page builds (web/owned.js, passQuery).
async function firstFrame(pass) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2000);
  try {
    const r = await fetch(`${base}/api/stream?${pass}`, { signal: ctl.signal });
    const reader = r.body.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    const text = new TextDecoder().decode(value);
    const m = /^data: (.*)$/m.exec(text);
    return { status: r.status, data: m ? JSON.parse(m[1]) : null, text };
  } catch (e) {
    return { status: 0, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

try {
  // ------------------------------------------------------------ the invite
  await call('/api/invites', { headers: owner });
  await otherOfficeWrites();
  const inv = await call('/api/invite', { method: 'POST', headers: owner, body: { name: 'Гость', from: 'Сергей' } });
  ok('an invitation is made while another office writes the file', inv.status === 200 && !!inv.j?.invite?.code, inv);
  let disk = await onDisk();
  ok('and it is on disk, next to the other office\'s change',
    disk.access.invites.length === 1 && disk.names['other-1'] === 'Вера', disk);

  // -------------------------------------------------------------- the door
  await otherOfficeWrites();
  const enter = await call('/api/enter', { method: 'POST', body: { code: inv.j.invite.code } });
  ok('the code is exchanged for a pass, not answered with 500', enter.status === 200 && !!enter.j?.guest, enter);
  const guest = enter.j?.guest || '';
  disk = await onDisk();
  const saved = disk.access.invites[0] || {};
  ok('the pass handed out is the one on disk', saved.guest === guest && !!saved.usedAt, saved);
  ok('the retry keeps what the other office wrote', disk.names['other-2'] === 'Вера' && disk.names['other-1'] === 'Вера', disk.names);

  const who = await call('/api/whoami', { headers: { 'x-valey-guest': guest } });
  ok('the server knows the guest by it', who.j?.guest === true && who.j?.needsCode === false, who.j);
  const frame = await firstFrame(new URLSearchParams({ guest }).toString());
  ok('the stream opens for the guest', frame.status === 200, frame);
  ok('and the first snapshot has the agents in it', frame.data?.agents?.[0]?.name === 'Гоша', frame.data);

  // ------------------------------------------- a browser that was an owner
  // localStorage is per origin and stands reuse ports, so a guest's browser
  // can still hold the owner token of whatever office stood on this port
  // before. The page used to send the stream that token alone.
  const { setTokens, passQuery } = await import('../web/owned.js');
  setTokens({ owner: 'owner-of-an-old-stand', guest });
  const both = passQuery();
  ok('the page puts both passes into the stream address',
    new URLSearchParams(both).get('owner') === 'owner-of-an-old-stand' && new URLSearchParams(both).get('guest') === guest, both);
  const stale = await firstFrame(both);
  ok('a guest holding a dead owner token still gets the stream', stale.status === 200, stale);
  ok('with the agents, as a guest', stale.data?.agents?.[0]?.name === 'Гоша' && stale.data.agents[0].lastSaid === undefined, stale.data);
  setTokens({ owner: '', guest });
  ok('a guest alone sends the guest pass alone', passQuery() === new URLSearchParams({ guest }).toString(), passQuery());
  setTokens({ owner: '', guest: '' });
  ok('nobody sends nothing', passQuery() === '', passQuery());

  const mine = await firstFrame(new URLSearchParams({ owner: OWNER, guest }).toString());
  ok('an owner who also holds a guest pass gets the owner\'s office, not a projection',
    mine.status === 200 && mine.data?.agents?.[0]?.lastSaid === 'только хозяину', mine.data);

  const again = await call('/api/enter', { method: 'POST', body: { code: inv.j.invite.code } });
  ok('the code still lets in only once', again.status === 403 && again.j?.errorKey === 'err.codeUsed', again);
  const unknown = await call('/api/enter', { method: 'POST', body: { code: 'nosuchcode00' } });
  ok('an unknown code is still refused as unknown', unknown.status === 403 && unknown.j?.errorKey === 'err.codeUnknown', unknown);

  // ------------------------------------------------ spent on «Войти», not on arrival
  // A messenger's built-in browser opening the link used to spend it; the page
  // now only peeks on arrival and spends on «Войти».
  const inv2 = await call('/api/invite', { method: 'POST', headers: owner, body: { name: 'Второй', from: 'Сергей' } });
  const code2 = inv2.j?.invite?.code;
  const peek = await call('/api/enter', { method: 'POST', body: { code: code2, peek: true } });
  ok('a peek names the inviter', peek.status === 200 && peek.j?.peek === true && peek.j?.from === 'Сергей', peek);
  ok('and hands out no pass', !peek.j?.guest, peek.j);
  const peekAgain = await call('/api/enter', { method: 'POST', body: { code: code2, peek: true } });
  ok('so the link can be opened again, by anything', peekAgain.status === 200 && peekAgain.j?.peek === true, peekAgain);
  const unspent = (await onDisk()).access.invites.find((i) => i.code === code2) || {};
  ok('a peeked code stays unspent on disk', !unspent.usedAt && !unspent.guest, unspent);

  const spend = await call('/api/enter', { method: 'POST', body: { code: code2 } });
  const guest2 = spend.j?.guest || '';
  ok('entering spends it for a pass', spend.status === 200 && !!guest2, spend);
  const usedAt = ((await onDisk()).access.invites.find((i) => i.code === code2) || {}).usedAt;

  // The same browser carries the pass the code gave it: the link still works there.
  const mine2 = { 'x-valey-guest': guest2 };
  const back = await call('/api/enter', { method: 'POST', headers: mine2, body: { code: code2 } });
  ok('the browser that spent it gets in by the same link again', back.status === 200 && back.j?.guest === guest2, back);
  const backPeek = await call('/api/enter', { method: 'POST', headers: mine2, body: { code: code2, peek: true } });
  ok('its peek is an entry too, with the same pass', backPeek.status === 200 && backPeek.j?.guest === guest2 && !backPeek.j?.peek, backPeek);
  ok('and none of that spends it again',
    ((await onDisk()).access.invites.find((i) => i.code === code2) || {}).usedAt === usedAt, usedAt);

  const other = await call('/api/enter', { method: 'POST', body: { code: code2 } });
  ok('another browser is told the code is used', other.status === 403 && other.j?.errorKey === 'err.codeUsed', other);
  const otherPeek = await call('/api/enter', { method: 'POST', body: { code: code2, peek: true } });
  ok('its peek too', otherPeek.status === 403 && otherPeek.j?.errorKey === 'err.codeUsed', otherPeek);
  const forged = await call('/api/enter', { method: 'POST', headers: { 'x-valey-guest': guest }, body: { code: code2 } });
  ok('a pass from another invitation does not open this one', forged.status === 403 && forged.j?.errorKey === 'err.codeUsed', forged);

  // ------------------------------------------------------------ the revoke
  await otherOfficeWrites();
  const rev = await call('/api/invite/revoke', { method: 'POST', headers: owner, body: { id: inv.j.invite.id } });
  ok('an invitation is revoked while another office writes the file', rev.status === 200 && !(rev.j?.invites || []).some((i) => i.id === inv.j.invite.id), rev);
  disk = await onDisk();
  ok('it is gone from disk, and the other office\'s change is not', !disk.access.invites.some((i) => i.id === inv.j.invite.id) && disk.names['other-3'] === 'Вера', disk);
  const out = await call('/api/whoami', { headers: { 'x-valey-guest': guest } });
  ok('and the pass it gave out no longer lets in', out.j?.guest === false && out.j?.needsCode === true, out.j);
} catch (e) {
  bad += 1;
  console.log('FAIL  | test did not complete →', e.stack);
} finally {
  server.close();
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
