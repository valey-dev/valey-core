// node tools/test-devices.mjs — owner devices: pairing with a code, the device's
// token, and who may say yes.
//
// Everything here guards the terminal. A paired device is the owner, and the
// owner's sessions run with bypassPermissions, so each rule below is the
// difference between «my phone» and «anybody on the café Wi-Fi»: a request
// asked through a tunnel, a device that lets in the next device, a token kept
// in the clear, a token that never lapses.
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { freePort } from './lib/office.mjs';
import { isLan, deviceName, deviceOf, hashToken, Pairings, PAIR_TTL, DEVICE_TTL, shownDevice } from '../server/devices.js';

let bad = 0;
let checks = 0;
const ok = (name, cond, got) => {
  checks += 1;
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 200) : JSON.stringify(got)); }
};

// ------------------------------------------------------------------ the network
const req = (addr, headers = {}) => ({ socket: { remoteAddress: addr }, headers });
ok('loopback is ours', isLan(req('127.0.0.1')) && isLan(req('::1')) && isLan(req('::ffff:127.0.0.1')));
ok('a home Wi-Fi address is ours', isLan(req('::ffff:192.168.10.23')) && isLan(req('10.0.0.7')) && isLan(req('172.20.1.1')));
ok('a public address is not', !isLan(req('8.8.8.8')) && !isLan(req('172.32.0.1')) && !isLan(req('::ffff:93.184.216.34')));
ok('a tunnel is not ours, whatever the socket says', !isLan(req('127.0.0.1', { 'x-forwarded-for': '203.0.113.9' })));
ok('IPv6 link-local and ULA are ours', isLan(req('fe80::1')) && isLan(req('fd12:3456::1')));

// ----------------------------------------------------------------- the name
ok('an Xbox says Xbox', deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0') === 'Xbox · Edge');
ok('an iPhone says iPhone · Safari', deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1') === 'iPhone · Safari');
ok('nothing known is a «device», not an empty line', deviceName('') === 'device');

// ------------------------------------------------------------- the requests
{
  const P = new Pairings();
  const t0 = 1_000_000;
  const a = P.ask({ ip: '192.168.10.23', name: 'iPhone · Safari' }, t0);
  ok('a request carries four digits', /^\d{4}$/.test(a.code), a.code);
  const b = P.ask({ ip: '192.168.10.23', name: 'iPhone · Safari' }, t0 + 1000);
  ok('asking again from the same address replaces the first', P.pending(t0 + 1000).length === 1 && P.pending(t0 + 1000)[0].id === b.id);
  ok('the owner is not shown the token, only the code', !('token' in P.pending(t0 + 1000)[0]));
  ok('before the answer the device reads «pending»', P.collect(b.id, t0 + 2000).state === 'pending');
  const rec = P.answer(b.id, true, t0 + 3000);
  ok('a yes makes a record with a hash, not a token', rec && /^[0-9a-f]{64}$/.test(rec.hash) && !('token' in rec), rec);
  const first = P.collect(b.id, t0 + 4000);
  ok('the device collects its token once', first.state === 'granted' && typeof first.token === 'string' && first.token.length >= 40);
  ok('and the hash on disk is the hash of that token', hashToken(first.token) === rec.hash);
  const second = P.collect(b.id, t0 + 5000);
  ok('a second read gets no token', second.state === 'granted' && !second.token);
  ok('an answered request cannot be answered again', P.answer(b.id, true, t0 + 6000) === null);

  const c = P.ask({ ip: '192.168.10.40', name: 'Xbox · Edge' }, t0);
  ok('a no makes nothing', P.answer(c.id, false, t0 + 1000) === null && P.collect(c.id, t0 + 2000).state === 'refused');

  const d = P.ask({ ip: '192.168.10.41', name: 'iPad · Safari' }, t0);
  ok('a request lives two minutes', P.collect(d.id, t0 + PAIR_TTL + 1).state === 'expired');
  ok('and a late yes does nothing', P.answer(d.id, true, t0 + PAIR_TTL + 2) === null);
}

// ---------------------------------------------------------------- the token
{
  const now = 50 * DEVICE_TTL;
  const token = 'phone-token-0001';
  const devices = [{ id: 'd1', name: 'iPhone', hash: hashToken(token), pairedAt: now - 1000, lastSeen: now - 1000 }];
  ok('the right token finds its device', deviceOf(devices, token, now)?.id === 'd1');
  ok('a wrong token finds nothing', deviceOf(devices, 'phone-token-0002', now) === null);
  ok('the hash itself is not a token', deviceOf(devices, devices[0].hash, now) === null);
  ok('thirty days unused and the device lapses', deviceOf(devices, token, now + DEVICE_TTL) === null);
  ok('the page is never shown the hash', !('hash' in shownDevice(devices[0], now)));
}

// ------------------------------------------------------------- the whole road
// A shared office on a real handler: this machine is not the owner here, so the
// stand plays the phone from loopback and the owner with the owner token.
const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-devices-'));
const FILE = path.join(dir, 'settings.json');
const OWNER = 'devices-owner-0001';
const NET = 'NETWORKCODE0000000000000000000001';
const tunnelled = { 'x-forwarded-for': '203.0.113.9', authorization: 'Bearer ' + NET };
await fsp.writeFile(FILE, JSON.stringify({
  access: { mode: 'shared', token: OWNER, invites: [] },
  // The network is open with a code, so a tunnel that knows the code gets past
  // the gate and meets the pairing rule itself rather than a closed door.
  network: { external: true, token: NET },
  weather: { enabled: false }, delivery: { mode: 'default' },
}, null, 2));
process.env.VALEY_SETTINGS = FILE;
process.env.VALEY_CLAUDE_DIR = path.join(dir, 'no-claude');
delete process.env.VALEY_STAND;

const { createHandler, setSnapshot } = await import('../server/index.js');
setSnapshot({ agents: [] });
const port = await freePort();
const server = http.createServer(createHandler());
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const base = `http://127.0.0.1:${port}`;
const call = (p, { method = 'GET', headers = {}, body } = {}) => fetch(base + p, {
  method, headers: body ? { 'content-type': 'application/json', origin: base, ...headers } : headers,
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
const owner = { 'x-valey-owner': OWNER };

try {
  ok('a phone in a shared office is not the owner', (await call('/api/whoami')).j?.owner === false);
  const tunnel = await call('/api/pair', { method: 'POST', headers: tunnelled, body: { name: 'iPhone' } });
  ok('pairing through a tunnel is refused', tunnel.status === 403, tunnel);
  const asked = await call('/api/pair', { method: 'POST', body: { name: 'iPhone · Safari' } });
  ok('the phone asks and gets a code', asked.status === 200 && /^\d{4}$/.test(asked.j?.code || ''), asked);
  const seen = await call('/api/state', { headers: owner });
  ok('the owner sees the request with the same code', seen.j?.access?.pairings?.[0]?.code === asked.j.code, seen.j?.access);
  ok('a stranger may not answer', (await call('/api/pair/answer', { method: 'POST', body: { id: asked.j.id, yes: true } })).status === 403);
  const yes = await call('/api/pair/answer', { method: 'POST', headers: owner, body: { id: asked.j.id, yes: true } });
  ok('the owner says yes', yes.status === 200 && yes.j?.access?.devices?.length === 1, yes);
  const got = await call('/api/pair?id=' + asked.j.id);
  ok('the phone collects its token', got.j?.state === 'granted' && !!got.j?.token, got);
  const dev = { 'x-valey-device': got.j.token };
  ok('and from now on it is the owner', (await call('/api/whoami', { headers: dev })).j?.owner === true);
  ok('on the stream road too', (await call('/api/whoami?device=' + encodeURIComponent(got.j.token))).j?.owner === true);
  ok('not through a tunnel', (await call('/api/whoami', { headers: { ...dev, ...tunnelled } })).j?.owner === false);
  const disk = await fsp.readFile(FILE, 'utf8');
  ok('the settings file keeps the hash, not the token', disk.includes(hashToken(got.j.token)) && !disk.includes(got.j.token));
  const pub = await call('/api/state', { headers: dev });
  ok('the page never gets a hash', !JSON.stringify(pub.j).includes(hashToken(got.j.token)));
  // A paired device may not let in the next one.
  const next = await call('/api/pair', { method: 'POST', body: { name: 'Xbox · Edge' } });
  ok('a device answering a pairing is refused', (await call('/api/pair/answer', { method: 'POST', headers: dev, body: { id: next.j.id, yes: true } })).status === 403);
  ok('a device revoking is refused as well', (await call('/api/devices/revoke', { method: 'POST', headers: dev, body: { id: yes.j.access.devices[0].id } })).status === 403);
  ok('the owner revokes with one call', (await call('/api/devices/revoke', { method: 'POST', headers: owner, body: { id: yes.j.access.devices[0].id } })).status === 200);
  ok('and the phone is nobody again', (await call('/api/whoami', { headers: dev })).j?.owner === false);
} finally {
  server.close();
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} of ${checks} failed` : `\ndevices: ${checks} checks`);
process.exit(bad ? 1 : 0);
