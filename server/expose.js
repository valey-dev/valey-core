// Opening the office to the network while it runs, and closing it again.
//
// Until 12 September 2026 the only way to let a phone reach the office was to
// restart it with VALEY_EXTERNAL=1 and carry a 32-character token from the
// terminal to the phone by hand. The live feed lives on the phone, so that
// restart was the price of using it at all.
//
// The office keeps its main socket on 127.0.0.1 and, when opened, adds one
// listener per address this machine has in its networks. Rebinding the main
// socket to 0.0.0.0 was the other way, and it cannot be done in place: closing
// a server waits for its open connections, and the owner's own page holds one
// forever (/api/stream). Specific addresses do not collide with loopback on the
// same port, on macOS or on Linux, so the owner's tab never notices.
//
// Who may come in through those listeners is not decided here. The gate in
// network.js reads `settings.network` on every request: closed means 404 to
// anything that is not this machine, open means the token or nothing. So an
// office started with 0.0.0.0 (VALEY_EXTERNAL=1, or HOST) is still closed by
// the switch — the socket stays, the answer is 404.
import http from 'node:http';
import os from 'node:os';

// The addresses a phone on the same network could use: IPv4, not loopback.
// IPv6 link-local ones are left out: a QR code with fe80::…%en0 opens nothing.
export function lanAddresses(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(ifaces)) {
    for (const a of list || []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (v4 && !a.internal) out.push(a.address);
    }
  }
  return out;
}

const WILD = new Set(['0.0.0.0', '::', '']);

/**
 * The switch for one running office. `handler` is the office's request handler,
 * `port` the port it bound, `host` the address of its main socket. Returns
 * { open, close, state } — open and close are idempotent and resolve once the
 * listeners are up or gone.
 */
export function createExposure({ handler, port, host, addresses = lanAddresses }) {
  const extra = [];              // { server, sockets }
  let since = WILD.has(host) ? Date.now() : null;
  const wild = WILD.has(host);

  async function open() {
    if (!since) since = Date.now();
    if (wild || extra.length) return state();
    for (const address of addresses()) {
      const server = http.createServer(handler);
      const sockets = new Set();
      server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
      // One address failing — a Wi-Fi that dropped between the lookup and the
      // bind — must not keep the others shut.
      await new Promise((resolve) => {
        server.once('error', (err) => {
          console.log(`  network: ${address}:${port} did not open — ${err.code || err.message}`);
          resolve();
        });
        server.listen(port, address, () => { extra.push({ server, sockets, address }); resolve(); });
      });
    }
    return state();
  }

  async function close() {
    since = null;
    const all = extra.splice(0);
    await Promise.all(all.map(({ server, sockets }) => new Promise((resolve) => {
      server.close(() => resolve());
      // A phone holding the stream open would keep the listener alive for as
      // long as it likes: close means now.
      for (const s of sockets) s.destroy();
    })));
    return state();
  }

  function state() {
    return {
      listening: wild || extra.length > 0,
      since,
      addresses: wild ? addresses() : extra.map((e) => e.address),
    };
  }

  return { open, close, state };
}
