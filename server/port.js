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

// Who answers on a port. An office says so on /api/version; anything else —
// another program, a closed port, a hung socket — is `null`. The timeout is
// short on purpose: this runs on the way to a startup message, not a request.
export function whoIsOn(port, { host = '127.0.0.1', timeout = 1500 } = {}) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/api/version', timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve(j && j.valey === true ? { version: String(j.version || '?') } : null);
        } catch { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
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
export async function listenFree(server, port, host, { probe = whoIsOn, tries = 10, log = () => {} } = {}) {
  for (let i = 0; i <= tries; i++) {
    const p = port + i;
    try {
      await listenOnce(server, p, host);
      return p;
    } catch (err) {
      if (!err || err.code !== 'EADDRINUSE') throw err;
      const other = await probe(p);
      if (other) {
        log(`Valey is already running at http://localhost:${p} (v${other.version}) — open that one.`);
        log(`  A second office beside it: PORT=${p + 1} npm start`);
        return null;
      }
      log(`Port ${p} is taken by something that is not Valey — trying ${p + 1}.`);
    }
  }
  throw new Error(`no free port between ${port} and ${port + tries}`);
}
