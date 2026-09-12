// Listening when the port is already taken.
//
// `EADDRINUSE` on 5177 means one of two very different things, and until
// 11 September 2026 both printed the same stack trace. The office's own port
// was taken by another office — somebody ran `npm start` twice, or from two
// folders — and the right answer is not an error but the address of the one
// already running. Or the port belongs to something else entirely, and the
// office moves one port up and says so.
//
// Nothing here stops a process that is not ours. The port is asked who it is
// and left alone; the same rule the working agreements set for people applies
// to the code.
import http from 'node:http';

// A small JSON GET, or null for anything that is not JSON in time.
function getJson(port, host, path, timeout) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path, timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

// Who answers on a port. An office says so on /api/version; anything else —
// another program, a closed port, a hung socket — is `null`. The timeout is
// short on purpose: this runs on the way to a startup message, not a request.
//
// Offices older than /api/version (before 11 September 2026, v0.33.0) answer
// 404 there, and on 12 September one of them — started the day before and never
// restarted — was called «not Valey», and the new office walked past it. They
// do answer /api/whoami, with a shape nothing else would: that is the fallback,
// and the version is then unknown (`null`).
export async function whoIsOn(port, { host = '127.0.0.1', timeout = 1500 } = {}) {
  const v = await getJson(port, host, '/api/version', timeout);
  if (v && v.valey === true) return { version: String(v.version || '?') };
  const w = await getJson(port, host, '/api/whoami', timeout);
  if (w && typeof w === 'object' && 'owner' in w && 'mode' in w) return { version: null };
  return null;
}

const listenOnce = (server, port, host) => new Promise((resolve, reject) => {
  const onError = (err) => { server.off('listening', onListen); reject(err); };
  const onListen = () => { server.off('error', onError); resolve(); };
  server.once('error', onError);
  server.once('listening', onListen);
  server.listen(port, host);
});

/**
 * Bind the server to `port`, or to the next free one within `tries` ports.
 *
 * Returns the port bound, or `null` when an office already answers on a port
 * that was tried: the caller has nothing to run then, and `log` has already
 * said where the running office is. Any error other than a taken port is
 * thrown as it was.
 */
export async function listenFree(server, port, host, { probe = whoIsOn, tries = 10, log = () => {}, own = null } = {}) {
  for (let i = 0; i <= tries; i++) {
    const p = port + i;
    // Ports end at 65535. Walking past it asked Node to bind 65536 and died
    // with ERR_SOCKET_BAD_PORT instead of the sentence below: the stand hit it
    // on 12 September 2026 when the system handed it 65535 as an ephemeral port.
    if (p > 65535) break;
    try {
      await listenOnce(server, p, host);
      return p;
    } catch (err) {
      if (!err || err.code !== 'EADDRINUSE') throw err;
      const other = await probe(p);
      if (other) {
        const which = other.version ? `v${other.version}` : 'an older version';
        log(`Valey is already running at http://localhost:${p} (${which}) — open that one.`);
        // A different version running is usually the office this one was
        // meant to replace: the installer updates the folder, not the process.
        if (own && other.version !== own) log(`  To run v${own} instead, stop that one and start again.`);
        log(`  A second office beside it: PORT=${p + 1} npm start`);
        return null;
      }
      log(`Port ${p} is taken by something that is not Valey — trying ${p + 1}.`);
    }
  }
  throw new Error(`no free port between ${port} and ${port + tries}`);
}
