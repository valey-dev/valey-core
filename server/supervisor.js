// The process `npm start` runs: it holds the port and runs the office under it.
//
// The office itself is server/index.js, started here as a cluster worker. The
// point of the extra process is that the port belongs to it rather than to the
// office: an update brings up a newer office beside the running one and lets
// the old one go, and the port is never closed in between (server/swap.js
// tells the rest of the story).
//
// This file is deliberately small. It is the one piece an update does not
// replace — the supervisor started by `npm start` keeps running until the next
// Ctrl-C — so whatever lives here has to be right for a long time.
//
// A Ctrl-C reaches the supervisor and the workers alike and is what it always
// was: a restart. A worker that dies on its own is the office dying, and the
// supervisor goes with it rather than hide a crash behind a silent restart.
import cluster from 'node:cluster';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// A worker inherits this process's environment, and the first one must not be
// told it is taking over: a shell started by an office before v0.55.1 carries
// the handover's instructions (the list is SWAP_ENV in server/swap.js, copied
// rather than imported to keep this file small), and the first worker would
// have gone for the old office's port and waited for its handover.
for (const k of ['VALEY_WORKER', 'VALEY_PORT_FIXED', 'VALEY_HOST_FIXED', 'VALEY_HANDOFF_WAIT']) delete process.env[k];
// silent: the workers' output is passed through by hand, so the last lines of a
// worker that failed to start can be told to the office that asked for it.
// VALEY_WORKER_EXEC is for the stand alone: a worker of its own that can be told
// to fail on start, which is the one thing an update must survive.
cluster.setupPrimary({ exec: process.env.VALEY_WORKER_EXEC || path.join(here, 'index.js'), silent: true });

const TAIL = 2000;
let current = null;
let bound = null;
let swapping = false;

function fork(env = {}) {
  const w = cluster.fork({ VALEY_WORKER: '1', ...env });
  w.tail = '';
  w.process.stdout.pipe(process.stdout);
  w.process.stderr.on('data', (d) => { process.stderr.write(d); w.tail = (w.tail + d).slice(-TAIL); });
  w.on('message', (m) => onMessage(w, m));
  return w;
}

function onMessage(w, m) {
  if (!m || !m.valey) return;
  if (m.valey === 'bound' && w === current) bound = { port: m.port, host: m.host };
  if (m.valey === 'swap' && w === current && !swapping && bound) swap();
}

async function swap() {
  swapping = true;
  const old = current;
  const next = fork({ VALEY_PORT_FIXED: String(bound.port), VALEY_HOST_FIXED: bound.host, VALEY_HANDOFF_WAIT: '1' });
  const failed = await new Promise((resolve) => {
    const t = setTimeout(() => resolve('the new server did not start within 30 s'), 30_000);
    next.once('listening', () => { clearTimeout(t); resolve(null); });
    next.once('exit', (code) => { clearTimeout(t); resolve(`the new server exited with code ${code}: ${next.tail.trim().split('\n').slice(-3).join(' · ')}`); });
  });
  if (failed) {
    // The running office stays exactly as it was; it only learns why.
    try { next.kill(); } catch { /* already gone */ }
    old.send({ valey: 'swap-failed', detail: failed });
    swapping = false;
    return;
  }
  pending = next;
  const onHandoff = (m) => {
    if (!m || m.valey !== 'handoff') return;   // anything else it says on the way out
    old.off('message', onHandoff);
    promote(m.file);
    console.log('[update] the office was replaced without stopping');
  };
  old.on('message', onHandoff);
  old.send({ valey: 'drain' });
}

let pending = null;
function promote(file) {
  current = pending;
  pending = null;
  swapping = false;
  current.send({ valey: 'handoff', file: file || '' });
}

cluster.on('exit', (w, code, signal) => {
  // The old office died on its way out, before handing anything over: the new
  // one is already listening, so it takes over with an empty hand rather than
  // the whole office going down with the old one.
  if (w === current && pending) { promote(''); return; }
  if (w !== current) return;           // the old office leaving after a handover
  process.exit(code ?? (signal ? 1 : 0));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const w of Object.values(cluster.workers || {})) { try { w.kill(sig); } catch { /* gone */ } }
    process.exit(0);
  });
}

current = fork();
