#!/usr/bin/env node
// The office opens to the network and closes again while it runs — the switch
// behind the live feed's key card. A real office on a free port, and, where
// this machine has an address in a network, real requests through it: the
// point is that a phone can reach the office after «open» and cannot after
// «close», and that is only proven by a socket, not by a settings file.
import fs from 'node:fs';
import assert from 'node:assert';
import { startOffice } from './lib/office.mjs';
import { lanAddresses } from '../server/expose.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log('ok    | ' + msg); };

const office = await startOffice();
const net = async (action, headers = {}) => {
  const r = await fetch(office.base + '/api/network', action
    ? { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ action }) }
    : { headers });
  return { status: r.status, body: r.status === 200 ? await r.json() : null };
};
const lan = lanAddresses()[0];
// Through the network, as a phone would: the answer's status, or 0 when nobody
// is listening on that address at all.
const fromLan = async (path, headers = {}) => {
  try { return (await fetch(`http://${lan}:${office.port}${path}`, { headers, redirect: 'manual' })).status; }
  catch { return 0; }
};

try {
  let r = await net();
  ok(r.status === 200 && r.body.external === false, 'a fresh office is closed to the network');
  ok(r.body.port === office.port, 'the answer names the port the office is on');

  r = await net('open');
  const token = r.body.token;
  ok(r.body.external === true && /^[0-9A-HJKMNP-TV-Z]{32}$/.test(token), 'open makes a 32-character code in the unambiguous alphabet');
  ok(typeof r.body.since === 'number', 'open says since when the office listens');
  const saved = JSON.parse(fs.readFileSync(office.settingsFile, 'utf8')).network;
  ok(saved.external === true && saved.token === token, 'the open state is saved and survives a restart');

  // Somebody who is not the owner cannot flip it, even with the network code:
  // the code lets a phone watch, not command.
  r = await net('close', { authorization: 'Bearer ' + token, 'x-forwarded-for': '10.0.0.9' });
  ok(r.status === 403, 'the network code does not make a phone the owner');

  if (lan) {
    ok(await fromLan('/api/version') === 401, `from ${lan} without the code: 401`);
    ok(await fromLan('/api/version?token=' + token) === 200, `from ${lan} with the code: in`);
    ok(await fromLan('/feed/?token=' + token) === 302, 'a link with the code is answered with a redirect that drops it from the address');

    r = await net('rotate');
    ok(r.body.token !== token && r.body.token.length === 32, 'rotate gives a new code');
    ok(await fromLan('/api/version?token=' + token) === 401, 'the old code no longer opens anything');

    r = await net('close');
    ok(r.body.external === false, 'close says closed');
    ok(await fromLan('/api/version?token=' + r.body.token) === 0, 'after close nobody listens on the network address');
    ok((await fetch(office.base + '/api/version')).status === 200, 'this machine keeps its office through open and close');

    r = await net('open');
    ok(await fromLan('/api/version?token=' + r.body.token) === 200, 'it opens again after a close');
    await net('close');
  } else {
    console.log('skip  | this machine has no address in a network: the socket half was not checked');
  }

  r = await net('sideways');
  ok(r.status === 400, 'an unknown action is refused, not guessed');
} finally {
  await office.stop();
}
console.log(`net switch: ${n} checks passed`);
