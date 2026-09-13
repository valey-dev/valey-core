// Replacing a running office with a newer one, without breaking anything.
//
// `npm start` runs server/supervisor.js, which holds the port and runs the
// office as a cluster worker. An update brings up a second worker beside the
// first; the new one accepts connections at once but holds every request at
// the gate until the old one has handed over what lives in its memory. The old
// one stops accepting, lets its held questions and delivery runs go to the new
// one, tells every page «updated», waits for requests in flight, writes its
// state to a file and leaves. No connection is refused at any moment, and a new
// worker that fails to start leaves the old one running.
//
// An update is not a restart. Guests, what they were granted, the notes on the
// desks all move across; a Ctrl-C is still a restart and still forgets them.
// Decided 13 September 2026.
//
// Frames: [WIP section #office-update](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=2169-6969)
import cluster from 'node:cluster';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkUpdate, pullUpdate } from './update.js';

// What the supervisor tells a worker, read once and taken out of the
// environment. Everything the office starts inherits process.env — a delivered
// `claude --resume`, and whatever that agent runs in turn — and until v0.55.1
// these went along. On 13 September 2026 an agent resumed by an updated office
// ran the stands, and every `node server/index.js` it started took itself for
// the next worker: it went for port 5177 and would have waited for a handover
// nobody was going to send. Only a worker of the supervisor may act on them.
export const SWAP_ENV = ['VALEY_WORKER', 'VALEY_PORT_FIXED', 'VALEY_HOST_FIXED', 'VALEY_HANDOFF_WAIT'];
const told = Object.fromEntries(SWAP_ENV.map((k) => [k, process.env[k]]));
for (const k of SWAP_ENV) delete process.env[k];

export const isWorker = cluster.isWorker && told.VALEY_WORKER === '1';

// Where the previous worker listened. The next one takes exactly that address:
// asked to find a free port it would walk the same road again and could land
// elsewhere, and «office already running» would stop it at its own port.
export function fixedAddress() {
  const port = isWorker ? Number(told.VALEY_PORT_FIXED) : 0;
  return port ? { port, host: told.VALEY_HOST_FIXED || '127.0.0.1' } : null;
}

// ------------------------------------------------------------------- the gate
let inflight = 0;
let openGate = null;
let gate = null;
let onOpen = null;
// Once a swap is asked for, every answer closes its connection. A keep-alive
// socket left open would carry the next request to this office after it has
// stopped accepting — and that request would die with it. Found by the stand
// on its second run: one probe of thirty-eight refused.
let closing = false;
if (isWorker && told.VALEY_HANDOFF_WAIT === '1') {
  gate = new Promise((resolve) => { openGate = resolve; });
  // A handoff that never comes must not hold the office forever: after half a
  // minute the new worker serves with what it has.
  setTimeout(open, 30_000).unref();
}

// Let the held requests in, then start whatever waited for the handover.
function open() {
  if (openGate) { openGate(); openGate = null; gate = null; }
  if (onOpen) { const f = onOpen; onOpen = null; f(); }
}

export const gated = (handler) => async (req, res) => {
  inflight += 1;
  res.on('close', () => { inflight -= 1; });
  if (closing) res.setHeader('Connection', 'close');
  if (gate) await gate;
  return handler(req, res);
};

// ------------------------------------------------------------- the update state
// What the version row in the office tab shows. One office, one update at a
// time: a second press while one runs gets the same state back.
export const upd = { state: 'idle', current: null, available: null, feats: 0, fixes: 0, steps: [], reason: null, repo: null, detail: null, at: 0 };
const readVersion = (root) => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

export async function runCheck(root, running) {
  if (upd.state === 'checking' || upd.state === 'updating') return upd;
  Object.assign(upd, { state: 'checking', current: running, reason: null, repo: null, detail: null, steps: [] });
  const r = await checkUpdate(root);
  upd.at = Date.now();
  if (r.error) return Object.assign(upd, { state: 'failed', reason: r.error.reason, repo: r.error.repo || null, detail: r.error.detail || null });
  // The code on disk can already be ahead of the running office: a previous
  // update pulled it and the new server did not come up. Then there is still
  // something to update to, although git has nothing new.
  const onDisk = readVersion(root);
  if (r.upToDate && onDisk === running) return Object.assign(upd, { state: 'latest', available: null, feats: 0, fixes: 0 });
  return Object.assign(upd, { state: 'available', available: r.available || onDisk, feats: r.feats, fixes: r.fixes });
}

export async function runUpdate(root, running) {
  if (upd.state === 'updating') return upd;
  if (!isWorker) {
    // `npm run dev`, a stand: nobody holds the port, so there is nothing to
    // hand the office over to. Refused before any pull, so nothing moves.
    return Object.assign(upd, { state: 'failed', reason: 'noSupervisor', repo: null, detail: null, at: Date.now() });
  }
  Object.assign(upd, { state: 'updating', current: running, reason: null, repo: null, detail: null, steps: [] });
  const r = await pullUpdate(root, { step: (k) => upd.steps.push(k) });
  if (!r.ok) return Object.assign(upd, { state: 'failed', reason: r.reason, repo: r.repo || null, detail: r.detail || null, at: Date.now() });
  // Nothing came in and the running office is what is on disk: there is no
  // newer office to hand over to, and a swap for nothing still blinks every page.
  if (r.from === r.to && r.to === running) return Object.assign(upd, { state: 'latest', available: null, at: Date.now() });
  upd.available = readVersion(root);
  upd.steps.push('server');
  closing = true;
  process.send({ valey: 'swap' });
  return upd;
}

// ---------------------------------------------------------------- the handover
// `office` is index.js's half: the listening server, the exposure listeners,
// and what to do with what lives in its memory.
export function listenForSwap(office) {
  if (!isWorker) return;
  onOpen = office.onOpen || null;
  // Without a gate there is no handover to wait for.
  if (!gate && onOpen) open();
  process.on('message', async (m) => {
    if (!m || !m.valey) return;
    if (m.valey === 'drain') await drain(office);
    if (m.valey === 'handoff') await receive(office, m.file);
    if (m.valey === 'swap-failed') {
      closing = false;
      Object.assign(upd, { state: 'failed', reason: 'newServer', repo: null, detail: String(m.detail || '').slice(0, 400), at: Date.now() });
    }
  });
  // The supervisor is gone — a Ctrl-C, a stand being stopped. Without it the
  // worker is an office nobody can reach; it leaves too.
  process.on('disconnect', () => process.exit(0));
}

async function receive(office, file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    await office.importState(state);
  } catch (e) {
    console.error('[update] the handover could not be read:', e.message);
  }
  try { fs.unlinkSync(file); } catch { /* already gone */ }
  open();
}

async function drain(office) {
  office.server.close();
  try { await office.closeExtra(); } catch { /* the exposure was not open */ }
  office.releaseRuns();
  office.retryPermits();
  office.farewell(readVersion(office.root));
  if (office.server.closeIdleConnections) office.server.closeIdleConnections();
  const until = Date.now() + 5000;
  while (inflight > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  const file = path.join(os.tmpdir(), `valey-handoff-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(office.exportState()), { mode: 0o600 });
  process.send({ valey: 'handoff', file }, () => {
    if (office.server.closeAllConnections) office.server.closeAllConnections();
    setTimeout(() => process.exit(0), 50);
  });
}
