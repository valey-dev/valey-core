#!/usr/bin/env node
// A taken port: another office answers with its address, anything else moves
// the office one port up. Both are proven with real sockets on loopback, and
// neither ever touches the process holding the port.
import http from 'node:http';
import assert from 'node:assert';
import { whoIsOn, listenFree } from '../server/port.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n++; };

const listen = (server, port = 0) => new Promise((r) => server.listen(port, '127.0.0.1', () => r(server.address().port)));
const close = (server) => new Promise((r) => server.close(() => r()));

// Something that is not an office: answers, but not with the name tag.
const stranger = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('hello'); });
const sPort = await listen(stranger);
eq(await whoIsOn(sPort), null, 'a plain http server was mistaken for an office');

// A closed port: nobody there.
const probe = http.createServer(); const freePort = await listen(probe); await close(probe);
eq(await whoIsOn(freePort), null, 'a closed port was mistaken for an office');

// An office: the name tag on /api/version.
const office = http.createServer((req, res) => {
  if (req.url === '/api/version') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ valey: true, version: '9.9.9' })); }
  res.writeHead(404); res.end();
});
const oPort = await listen(office);
const who = await whoIsOn(oPort);
ok(who && who.version === '9.9.9', 'the office on the port was not recognised');

// The fallback: the stranger holds the port, the office goes one up and says so.
const logs = [];
const mine = http.createServer();
const bound = await listenFree(mine, sPort, '127.0.0.1', { log: (l) => logs.push(l) });
ok(bound !== null && bound > sPort, `did not move off the taken port: ${bound}`);
eq(mine.address().port, bound, 'reported a port it is not listening on');
ok(logs.some((l) => l.includes(`Port ${sPort} is taken by something that is not Valey`)), `no word about the stranger: ${logs.join(' | ')}`);
ok(!logs.some((l) => l.includes('already running')), 'called a stranger an office');
await close(mine);

// Another office on the port: nothing to run, and the address is in the log.
const logs2 = [];
const second = http.createServer();
const res2 = await listenFree(second, oPort, '127.0.0.1', { log: (l) => logs2.push(l) });
eq(res2, null, 'started a second office next to a running one');
ok(logs2.some((l) => l.includes(`already running at http://localhost:${oPort} (v9.9.9)`)), `no address of the running office: ${logs2.join(' | ')}`);
ok(logs2.some((l) => l.includes(`PORT=${oPort + 1} npm start`)), 'no way offered to run a second office on purpose');
ok(!second.listening, 'the second server is listening although it said it would not');

// The stranger and the office are still there: nothing was stopped.
eq((await whoIsOn(oPort)).version, '9.9.9', 'the running office was disturbed');
eq(await new Promise((r) => http.get({ host: '127.0.0.1', port: sPort, path: '/' }, (res) => r(res.statusCode)).on('error', () => r(0))), 200, 'the stranger was disturbed');

// Errors that are not a taken port pass through untouched.
const bad = http.createServer();
await assert.rejects(listenFree(bad, sPort, '203.0.113.7', { probe: async () => null }), (e) => e.code === 'EADDRNOTAVAIL', 'a foreign error was swallowed');
n++;

// The real route answers with the name tag.
const { createHandler } = await import('../server/index.js');
const real = http.createServer(createHandler());
const rPort = await listen(real);
const tag = await whoIsOn(rPort);
ok(tag && /^\d+\.\d+\.\d+/.test(tag.version), `the real office has no name tag: ${JSON.stringify(tag)}`);
await close(real);

await close(stranger); await close(office);
console.log(`port: ${n} checks passed`);
