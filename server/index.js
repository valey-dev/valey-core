// Tiny zero-dependency bridge: static files + SSE stream of the office state.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { snapshot, fileOwners, conversation, PACK_IDS, namePool, nameSample, effectivePack, previewPack } from './agents.js';
import { realWeather, forgetWeather, geocode } from './weather.js';
import {
  getSettings, patchSettings, publicSettings, ownerToken, warnIfSharedSettingsWorktree,
} from './settings.js';
import { deliver, deliveryStatus, forgetCli, isBusy, MODES } from './deliver.js';
import { ask as askPermit, answer as answerPermit, permits, forgetGone } from './permit.js';
import { releaseNudge } from './release.js';
import { loadModules, moduleList, moduleRoute, moduleErrors, moduleOnPatch, moduleObserve, moduleAll, setModuleOff, moduleAsset } from './modules.js';
import { check as checkNetwork, newToken, isLocal, proxied } from './network.js';
import { MIME, fileType, fileHeaders } from './files.js';
import { listenFree } from './port.js';
import { createExposure, lanAddresses } from './expose.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEB = path.join(ROOT, 'web');
const MODS = path.join(ROOT, 'modules');
const PORT = Number(process.env.PORT || 5177);
const POLL_MS = 2500;

// The office version comes from its own package.json rather than a string in
// the interface: the sign on the title screen shows it, and in a release video
// it has to match the tag.
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

let last = { now: 0, agents: [], version: VERSION };
// The switch that opens the running office to the network (expose.js). Set by
// start(); a stand that only builds the handler has none, and the route below
// then flips the settings without any listener to open.
let exposure = null;

// The dictionaries as a list: how many names a pack holds and four samples. It
// never changes, so it is computed once and rides out with the settings — the
// panel draws its dictionary line at once, without waiting for a round trip.
const PACK_LIST = PACK_IDS.map((id) => ({ id, size: namePool(id).length, sample: nameSample(id) }));

// The backstop for one missed error. The handler below is wrapped in a try, but
// a promise thrown without an await never reaches it — and without this line
// Node kills the process, and the office the tabs are connected to simply
// disappears.
process.on('unhandledRejection', (err) => {
  console.error('[unhandled]', (err && err.stack) || err);
});
// Room -> directory on disk. The only way to name a directory for /api/git: the
// client sends the room key that the office already shows on the door.
const cwdOfProject = (project) => {
  const a = (last.agents || []).find((x) => x.project === project && x.cwd);
  return a ? a.cwd : null;
};
const clients = new Set();
// Notes the player left, plus whatever was actually sent into a live chat.
const outbox = [];
let taskSeq = 0;

// ------------------------------------------------------------- the projection
// What a guest sees about an agent. Exactly what is visible to anyone standing
// by his desk: the name, the trade, the room, the state, how long ago. And
// nothing of what the agent does: not the last thing said, not the prompt, not
// the files, not the branch, not the project path — that path is somebody
// else's home directory.
//
// The list is an allowlist rather than a denylist, and that is not taste: the
// snapshot is assembled from a transcript, and with a denylist the next field
// added there would go out in silence.
const SHOWN = [
  'id', 'name', 'gender', 'project', 'seat', 'role', 'roleKey',
  'status', 'act', 'activity', 'mood', 'idleFor', 'startedAt',
  'limited', 'version', 'stack', 'trinkets',
];

// Who was granted what: guest id -> Set of agent ids. Lives in memory and only
// there — a grant must not survive an office restart, just as presence does
// not. An owner who left and came back owes nobody anything.
const grants = new Map();

const granted = (guestId, agentId) => !!(guestId && grants.get(guestId)?.has(agentId));

// A guest who is no longer invited: the streams on his token are closed, and
// what he asked for and was granted is forgotten. Called on revoke, and on
// every tick for a token the settings no longer know — a mode switched back to
// private, or an invitation edited out of the file by hand.
function dropGuest(guestId) {
  grants.delete(guestId);
  for (const k of [...asks.keys()]) if (k.startsWith(guestId + ':')) asks.delete(k);
  for (const res of [...clients]) {
    if (res.valeyGuest !== guestId) continue;
    clients.delete(res);
    try { res.end(); } catch { /* already gone */ }
  }
}

// Access requests. The key is the pair of guest and agent: a second request
// from the same person about the same agent replaces the first rather than
// piling up next to it. That way "ask again" does not become a way to push.
const asks = new Map();
const askKey = (guestId, agentId) => `${guestId}:${agentId}`;

// What the guest sees of access: what he asked for, what is open, where he was refused.
function accessForGuest(guestId) {
  const mine = [...asks.values()].filter((a) => a.guestId === guestId);
  return {
    pending: mine.filter((a) => a.state === 'pending').map((a) => a.agentId),
    refused: mine.filter((a) => a.state === 'refused').map((a) => a.agentId),
    granted: [...(grants.get(guestId) || [])],
  };
}

// What the owner sees: who is asking and who already has access. The guest's
// name comes from presence — it is there anyway, and there is no point asking
// for it twice.
function accessForOwner() {
  const nameOf = (id) => (people.get(id) || {}).name || '';
  const open = [];
  for (const [guestId, set] of grants) {
    for (const agentId of set) open.push({ guestId, who: nameOf(guestId), agentId });
  }
  return {
    requests: [...asks.values()]
      .filter((a) => a.state === 'pending')
      .map((a) => ({ ...a, who: nameOf(a.guestId) })),
    open,
  };
}

function project(snapshot, guestId) {
  return {
    ...snapshot,
    access: accessForGuest(guestId),
    // A permission request is a command from the owner's machine: paths,
    // branches, keys in the arguments. A guest is shown neither the pager nor
    // the count: nothing to decide and nothing to judge by.
    permits: [],
    // The release nudge is the owner's chore and names a file on the owner's
    // disk; on 12 September 2026 a guest's entrance screen carried it, path
    // and all. The page hides it from anyone who is not the owner as well —
    // in private mode a viewer on the Wi-Fi is not projected at all.
    release: null,
    agents: (snapshot.agents || []).map((a) => {
      if (granted(guestId, a.id)) return a;
      const out = {};
      for (const k of SHOWN) if (a[k] !== undefined) out[k] = a[k];
      // outbox is the notes on the desk: a guest leaves them himself and they
      // are about him. The agent's reply is cut out of them by the same rule.
      out.outbox = (a.outbox || []).map((t) => ({
        id: t.id, agentId: t.agentId, at: t.at, state: t.state, text: t.text,
      }));
      return out;
    }),
  };
}

// ------------------------------------------------------------------ the owner
// Anyone may watch; only the owner may command. The right lives in the token in
// the settings file, and the page presents it in a header.
//
// Until the office is declared shared, everything from this same machine counts
// as the owner's: that is how the office always worked, and local work must not
// change because guests appeared. The shortcut is dangerous in exactly one
// place — a tunnel is started here too, and its guest arrives over loopback. So
// 'shared' has to be switched on BEFORE the office becomes visible from
// outside, and it is a person's switch, not the server's guess.
// An invitation carries neither its code nor the guest token outward: the panel
// shows who was invited and whether they came in, and the owner got the link at
// the moment it was made.
const safeInvite = (i) => ({
  id: i.id, name: i.name, from: i.from, at: i.at, usedAt: i.usedAt, used: !!i.usedAt,
});

async function isOwner(req) {
  const s = await getSettings();
  // A header for ordinary requests, a query parameter for the stream.
  // EventSource cannot set headers, and without this the owner in shared mode
  // lost his own office: the page is alive and the stream is refused to it.
  // Found on 30 August 2026 by the first reload after switching to shared.
  //
  // A token in the query string is worse than one in a header — but a cookie
  // here is worse than both: the office shares a port with other tabs of the
  // same localhost, and they share the cookie. The guest pass travels the same
  // way for the same reason.
  const given = req.headers['x-valey-owner']
    || new URL(req.url, 'http://localhost').searchParams.get('owner');
  if (s.access.token && given && given === s.access.token) return true;
  if (s.access.mode === 'shared') return false;
  // Arrived through a middleman — so not "from this machine", whatever address
  // the socket shows. A tunnel (cloudflared, ngrok, any reverse proxy) connects
  // to the office over loopback, and without this check its guest in private
  // mode came out as the owner: the address matched. The middleman sets those
  // headers itself, and only somebody already inside can forge them.
  //
  // This does not replace the shared switch; it is the backstop for forgetting
  // it: the right order is shared first, tunnel second.
  if (proxied(req)) return false;
  return isLocal(req);
}

// A guest is whoever came in by an invitation and holds the token issued to
// them. Different from the owner in everything: may watch, may not command.
async function guestOf(req) {
  // A header for ordinary requests, a parameter for the stream: EventSource
  // cannot set headers, and the stream is the first thing a guest needs.
  const given = req.headers['x-valey-guest']
    || new URL(req.url, 'http://localhost').searchParams.get('guest');
  if (!given) return null;
  const s = await getSettings();
  return (s.access.invites || []).find((i) => i.guest && i.guest === given) || null;
}

// Who to let over the threshold at all. In private the office is open as it
// always was: it is on your machine, and a colleague on the same Wi-Fi walks in
// by the address. In shared the office is visible from outside, and then only
// somebody invited may watch.
async function admitted(req) {
  const s = await getSettings();
  if (s.access.mode !== 'shared') return true;
  if (await isOwner(req)) return true;
  return !!(await guestOf(req));
}

const forbidden = (res) => send(res, 403, {
  error: 'viewing is allowed, control is not',
  errorKey: 'err.guest',
});

// ----------------------------------------------------------------- the people
// Who is walking the office right now. Lives in memory and only there: presence
// does not survive a server restart, and that is right — a person who is not
// here should not stay standing.
//
// The people have a tick of their own, because the shared snapshot goes out
// every POLL_MS = 2.5 s. In that time a person crosses half the corridor, and
// somebody else's walk would look like teleporting. The snapshot is heavy —
// sessions, weather, settings; presence is light, and running it more often
// costs practically nothing.
const people = new Map();
const PEOPLE_MS = 120;
const PEOPLE_TTL = 8000;

// A look arrives from somebody else's machine, so it is sieved here rather than
// at drawing time. On 30 August 2026 a person with half the fields brought
// drawPerson down on shade(look.shirt) — undefined instead of a colour — and
// everyone queued below vanished along with the frame. Only known keys and only
// sane values get through: what is missing the client fills in with its own
// defaults.
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const LOOK_COLOURS = ['skin', 'hair', 'shirt', 'pants', 'boots'];
const LOOK_WORDS = ['head', 'face', 'hands'];

function cleanLook(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of LOOK_COLOURS) if (typeof src[k] === 'string' && HEX.test(src[k])) out[k] = src[k];
  for (const k of LOOK_WORDS) if (typeof src[k] === 'string' && src[k].length <= 12) out[k] = src[k];
  if (typeof src.glasses === 'boolean') out.glasses = src.glasses;
  for (const k of ['style', 'tall']) {
    if (Number.isFinite(src[k])) out[k] = Math.max(0, Math.min(4, Math.round(src[k])));
  }
  return out;
}

function livePeople(now = Date.now()) {
  for (const [id, p] of people) if (now - p.at > PEOPLE_TTL) people.delete(id);
  return [...people.values()];
}

function peopleTick() {
  const list = livePeople();
  // With one person there is nobody to broadcast to: he knows where he stands.
  if (list.length > 1) {
    const payload = `event: people\ndata: ${JSON.stringify(list)}\n\n`;
    for (const res of clients) res.write(payload);
  }
  setTimeout(peopleTick, PEOPLE_MS);
}

// Whether there is anybody worth asking. A guest does not count: the pager does
// not reach him, and holding a question for him means holding it for nobody.
const audience = () => [...clients].some((res) => !res.valeyGuest);

// One event to one person's open streams. Presence broadcasts to everybody and
// needs nothing like this; a module that introduces two browsers to each other
// does — an offer is addressed to one person, not to the floor. Returns how
// many streams took it, and zero is an answer rather than an error: the other
// tab may have closed half a second ago.
function toPerson(id, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let n = 0;
  for (const res of clients) if (res.valeyPerson === id) { res.write(payload); n += 1; }
  return n;
}

// The pager has to ring at once rather than on the snapshot tick: 2.5 seconds
// is the difference between "I am being called" and "I was called". The event
// goes to owners only, because a guest's projection holds no requests at all.
function broadcastPermits() {
  if (!last) return;
  last.permits = permits();
  const payload = `event: permits\ndata: ${JSON.stringify(last.permits)}\n\n`;
  for (const res of clients) if (!res.valeyGuest) res.write(payload);
}

async function tick() {
  try {
    // Observers need the previous snapshot: an event is a difference, not a
    // state. The core does not compute it — it only hands over both sides.
    const prev = last;
    // Assembled in full before it becomes `last`: the fields below are awaited
    // one by one, and /api/state served in between handed out a snapshot with a
    // version and no release nudge yet. A stand caught exactly that on
    // 12 September 2026, once in a full run under load and never alone.
    const next = await snapshot();
    next.version = VERSION;
    next.release = await releaseNudge(ROOT);
    for (const a of next.agents) a.outbox = outbox.filter((t) => t.agentId === a.id).slice(-5);
    next.weather = await realWeather();
    next.settings = publicSettings(await getSettings());
    next.delivery = await deliveryStatus();
    next.people = livePeople();
    next.access = accessForOwner();
    // A question asked by a session the office no longer has is released: there
    // is nobody to answer it, and waiting nine minutes holds someone's terminal.
    forgetGone(next.agents.map((a) => a.id));
    next.permits = permits();
    // Observers run before the broadcast: a module may add its own to the
    // snapshot, and the client should get it on this tick, not 2.5 seconds
    // later.
    await moduleObserve(next, prev);
    last = next;
    const full = `data: ${JSON.stringify(last)}\n\n`;
    // A stream is only as invited as the settings say right now.
    const acc = (await getSettings()).access;
    const invited = new Set((acc.invites || []).map((i) => i.guest).filter(Boolean));
    for (const res of [...clients]) {
      if (res.valeyGuest && (acc.mode !== 'shared' || !invited.has(res.valeyGuest))) dropGuest(res.valeyGuest);
    }
    // Guests get their own projection: each has his own set of what is open.
    for (const res of clients) {
      res.write(res.valeyGuest ? `data: ${JSON.stringify(project(last, res.valeyGuest))}\n\n` : full);
    }
  } catch (err) {
    console.error('[tick]', err.message);
  }
  setTimeout(tick, POLL_MS);
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// A body error is an answer, not a crash: the code and the key go to the client
// from the handler wrapper, and it closes the connection so an unread body does
// not hang in the socket.
class BodyError extends Error {
  constructor(code, key, message) { super(message); this.code = code; this.key = key; }
}

// A ceiling on the body. Until 3 September 2026 no route had one, the ones open
// before login included: a gigabyte into /api/enter piled up in memory to the
// end. A stand frame needs more — there is one of it and only the owner sends
// it.
const BODY_MAX = 64 * 1024;
const SHOT_MAX = 16 * 1024 * 1024;

async function readBody(req, max = BODY_MAX) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new BodyError(413, 'err.tooBig', 'request body is too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// A JSON body only with an application/json header. This is not pedantry: a
// browser will not send a request with that header from another site without a
// preflight, and the office does not answer preflights. An empty body is an
// empty object, as before.
async function readJson(req, max = BODY_MAX) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new BodyError(415, 'err.notJson', 'application/json is required');
  const raw = await readBody(req, max);
  if (!raw.trim()) return {};
  let b;
  try { b = JSON.parse(raw); } catch { throw new BodyError(400, 'err.badJson', 'invalid JSON'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new BodyError(400, 'err.badJson', 'a JSON object is required');
  return b;
}

// -------------------------------------------------------------- a foreign tab
// Everything from loopback counts as the owner's (see isOwner), and that trust
// is inherited by every tab in the same browser: a page on another site sends a
// POST to 127.0.0.1:5177 and the socket is loopback. Until 3 September 2026
// such a POST to /api/settings changed the owner token and the delivery mode,
// and /api/task with deliver started claude --resume with bypassPermissions.
// Two marks, both set by the browser and neither forgeable from a script:
//  - Origin and Sec-Fetch-Site: where the request came from. Our own page is the
//    same host.
//  - Host: who was addressed. DNS rebinding resolves a foreign name to
//    127.0.0.1, and then Origin matches Host while Host is not ours.
// curl, the stands and EventSource arrive with neither Origin nor
// Sec-Fetch-Site: that is not a browser tab, and they are trusted here.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i;

function hostOk(req) {
  // Through a middleman the host name is foreign by definition — a tunnel
  // arrives with its own public name, and the network gate has already asked its
  // requests for a token. From outside the host is this machine's address in
  // somebody's network, and there is no listing that.
  if (!isLocal(req)) return true;
  return LOCAL_HOST.test(req.headers.host || '');
}

function crossSite(req) {
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  if (origin === 'null') return true;
  let from;
  try { from = new URL(origin).host; } catch { return true; }
  // A middleman that rewrites Host must leave the real one in X-Forwarded-Host
  // — otherwise our own page coming through the tunnel counts as foreign.
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return from.toLowerCase() !== String(host).split(',')[0].trim().toLowerCase();
}

// These are the doors people come in through, so they are always open:
// otherwise a guest can neither present a code nor learn that a code is needed
// at all. /api/stand is open alongside them: the stand sign has to be shown
// before entry, or an empty screen leaves it unclear whose office this is and
// what is being checked on it.
const OPEN = new Set(['/api/enter', '/api/whoami', '/api/stand']);

/**
 * The request handler, separate from the start-up.
 *
 * Until 4 September 2026 this file listened on a port at import time, and for a
 * stand to ask one route for one status it had to raise a process: spawn, wait
 * for the port, kill. Five such stands cost a second and a half of the run and
 * could only check what survives HTTP. Now `npm start` calls start() at the
 * bottom of the file, while a stand takes the handler and hangs it on a server
 * of its own in the same process.
 *
 * One error, one 500 answer, rather than a dead office. Until 3 September 2026
 * broken JSON in /api/enter — a route open before login — killed the process
 * together with every tab listening to it.
 */
export function createHandler() {
  return async (req, res) => {
    try {
      await handle(req, res);
    } catch (e) {
      if (e instanceof BodyError) {
        if (!res.headersSent) {
          res.setHeader('connection', 'close');
          send(res, e.code, { error: e.message, errorKey: e.key });
        }
        return;
      }
      console.error('[http]', req.method, req.url, (e && e.stack) || e);
      try {
        if (!res.headersSent) send(res, 500, { error: 'internal error', errorKey: 'err.internal' });
        else res.end();
      } catch { /* the socket is already closed */ }
    }
  };
}

// A stand has nowhere to get an office snapshot from: it is assembled out of
// this machine's live sessions. So it can be put in by hand — for the stands
// only, and only while the ticks are not running.
export function setSnapshot(s) {
  last = { ...last, ...s };
  return last;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // The first question is not "who are you" but "where from". The gate below
  // decides whether to admit a person; this one decides whether to answer the
  // address at all. It stands above the static files, because the hole was
  // exactly there: without it the office served the page, the stream and
  // /api/file to the whole Wi-Fi.
  const net = checkNetwork(req, url, (await getSettings()).network);
  if (!net.ok) {
    // A closed office answers 404 rather than 403: a scanner has no business
    // learning that something lives at this address and merely refuses entry.
    return send(res, net.reason === 'closed' ? 404 : 401, net.reason === 'closed'
      ? { error: 'not found', errorKey: 'err.notFound' }
      : { error: 'a token is required', errorKey: 'err.needToken' });
  }
  // The token arrived in the address — remember it in a cookie and take it out
  // of the URL, so the secret does not stay in browser history and in the
  // Referer header.
  if (net.setCookie) {
    res.setHeader('set-cookie', net.setCookie);
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      url.searchParams.delete('token');
      res.writeHead(302, { location: url.pathname + (url.search || '') });
      return res.end();
    }
  }

  // A foreign host name over loopback is rebinding. We answer as a closed
  // office would: 404, a scanner has no business learning anyone lives here.
  if (!hostOk(req)) return send(res, 404, { error: 'not found', errorKey: 'err.notFound' });
  // A foreign tab changes state only through a non-GET: it cannot read a GET
  // anyway, the same-origin rule keeps the answer from it.
  if (req.method !== 'GET' && req.method !== 'HEAD' && crossSite(req)) {
    return send(res, 403, { error: 'request came from another page', errorKey: 'err.crossSite' });
  }

  // The gate stands before every handler rather than inside each: that way a
  // new endpoint is closed by default rather than forgotten. Static files are
  // not gated — the page has to be shown if only to say "a code is needed".
  if (url.pathname.startsWith('/api/') && !OPEN.has(url.pathname) && !(await admitted(req))) {
    return send(res, 403, { error: 'an invitation is required', errorKey: 'err.needCode' });
  }

  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive',
    });
    // The stream remembers who is listening: there is one snapshot, and it is
    // seen differently.
    const guest = await guestOf(req);
    const who = guest ? guest.guest : null;
    res.valeyGuest = who;
    // Who is on the other end of this stream, by the same id `/api/here` uses.
    // Presence does not need it — it broadcasts to everyone — but the voice does:
    // an SDP offer is addressed to one person, and without a name on the socket
    // there is nobody to address it to.
    res.valeyPerson = String(url.searchParams.get('me') || '').slice(0, 64) || null;
    res.write(`data: ${JSON.stringify(who ? project(last, who) : last)}\n\n`);
    // Whoever just came in sees who is already in the office at once, not a presence tick later.
    res.write(`event: people\ndata: ${JSON.stringify(livePeople())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Who is asking. The page learns this before it draws a single button a guest
  // should not have.
  // The office's name tag, for a second office that finds this port taken: no
  // settings, no owner check, nothing a guest could not read off the page anyway.
  if (url.pathname === '/api/version') {
    return send(res, 200, { valey: true, version: VERSION });
  }

  // Opening the office to the network from the office itself: the live feed's
  // key card is the button, this is the switch. Owner only — the answer carries
  // the network token, which the settings stream never does (publicSettings
  // sends hasToken): the card has to put it into a QR code and a link, and only
  // the owner is shown it, in this one response.
  if (url.pathname === '/api/network') {
    if (!(await isOwner(req))) return forbidden(res);
    if (req.method === 'POST') {
      const { action } = await readJson(req);
      const n = (await getSettings()).network || {};
      if (action === 'open') {
        await patchSettings({ network: { external: true, token: n.token || newToken() } });
        if (exposure) await exposure.open();
      } else if (action === 'close') {
        await patchSettings({ network: { external: false } });
        if (exposure) await exposure.close();
      } else if (action === 'rotate') {
        // Phones holding the old token get 401 on their next request, and the
        // feed already reads that as «ask for a new code».
        await patchSettings({ network: { token: newToken() } });
      } else {
        return send(res, 400, { error: 'action is open, close or rotate' });
      }
    }
    const n = (await getSettings()).network || {};
    const st = exposure ? exposure.state() : { since: null, addresses: lanAddresses() };
    return send(res, 200, {
      external: !!n.external,
      token: n.token || '',
      port: req.socket.localPort,
      since: n.external ? st.since : null,
      addresses: n.external && st.addresses.length ? st.addresses : lanAddresses(),
    });
  }

  if (url.pathname === '/api/whoami') {
    const s = await getSettings();
    const guest = await guestOf(req);
    return send(res, 200, {
      owner: await isOwner(req),
      mode: s.access.mode,
      guest: !!guest,
      from: guest ? guest.from : '',
      // whether a code is needed right now: the page decides by this whether to
      // show the "you were invited" card or the "this code is no good" one
      needsCode: !(await admitted(req)),
    });
  }

  // A guest asks for access to one agent. Not "to everything" and not "for a
  // while": the request names one, and that is what the owner sees.
  if (url.pathname === '/api/access' && req.method === 'POST') {
    const guest = await guestOf(req);
    if (!guest) return send(res, 403, { error: 'only a guest may ask', errorKey: 'err.guestOnly' });
    const b = await readJson(req);
    const agentId = String(b.agentId || '');
    if (!agentId) return send(res, 400, { error: 'agentId is required' });
    asks.set(askKey(guest.guest, agentId), {
      id: crypto.randomUUID().slice(0, 8),
      guestId: guest.guest, agentId,
      note: String(b.note || '').slice(0, 140),
      at: Date.now(), state: 'pending',
    });
    return send(res, 200, { ok: true });
  }

  // The owner answers. A refusal does not erase the request: the guest has to
  // see a "no" rather than silence, or he will think it never arrived.
  if (url.pathname === '/api/access/answer' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    const ask = [...asks.values()].find((a) => a.id === b.id);
    if (!ask) return send(res, 404, { error: 'this request no longer exists' });
    if (b.yes) {
      if (!grants.has(ask.guestId)) grants.set(ask.guestId, new Set());
      grants.get(ask.guestId).add(ask.agentId);
      asks.delete(askKey(ask.guestId, ask.agentId));
    } else {
      ask.state = 'refused';
    }
    return send(res, 200, { ok: true, access: accessForOwner() });
  }

  // Close what was opened. One button, no confirmation: revoking must not take
  // longer than granting, or nobody uses it.
  if (url.pathname === '/api/access/revoke' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    grants.get(String(b.guestId || ''))?.delete(String(b.agentId || ''));
    return send(res, 200, { ok: true, access: accessForOwner() });
  }

  // The owner invites a guest. The code is longer than on the frame: the
  // caption there read 7f3a9c — six characters, 24 bits, which a script walks
  // through in minutes once the office is visible from outside. Twelve
  // characters are the same half-line in a link and 48 bits, which nobody
  // brute-forces.
  if (url.pathname === '/api/invite' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    const s = await getSettings();
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const invite = {
      // the id lets the panel revoke an invitation without knowing the code:
      // the code goes into the link once and is never shown again.
      id: crypto.randomUUID().slice(0, 8),
      code,
      name: String(b.name || '').slice(0, 24),
      from: String(b.from || '').slice(0, 24),
      at: Date.now(), usedAt: null, guest: null,
    };
    // Inviting and going shared are one action. While the office is private,
    // everything from this machine counts as the owner's, and a tunnel runs
    // from it too: somebody invited through a tunnel would come out as the
    // owner. Inviting without opening up is not possible, so this is not a
    // separate switch but a consequence.
    await patchSettings({
      access: { ...s.access, mode: 'shared', invites: [...(s.access.invites || []), invite] },
    });
    const host = req.headers.host || `localhost:${PORT}`;
    // The owner token comes back together with the link — not a relaxation but
    // the condition for an invitation working at all. Going shared kills the
    // "came from this machine" shortcut, and a page that was the owner over
    // loopback a moment ago turned into a guest on its very next request: a
    // person locked himself out by pressing "create a link". Only the owner
    // gets this far, so handing him his own token risks nothing.
    return send(res, 200, {
      ok: true, invite, owner: (await getSettings()).access.token,
      url: `http://${host}/#code=${code}`,
    });
  }

  // Revoke: both an unclaimed link and a guest who already came in through it.
  // There is no difference in the action — the invitation disappears, and with
  // it the token issued by it.
  if (url.pathname === '/api/invite/revoke' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    const s = await getSettings();
    const left = (s.access.invites || []).filter((i) => i.id !== b.id);
    await patchSettings({ access: { ...s.access, invites: left } });
    // The token dies with the invitation, and so does everything that held it.
    // Until 12 September 2026 only the next request was refused: a stream
    // opened on the token kept receiving the projection — with the agent the
    // guest had been granted — after the invitation was gone.
    for (const i of (s.access.invites || [])) if (i.id === b.id && i.guest) dropGuest(i.guest);
    return send(res, 200, { ok: true, invites: left.map(safeInvite) });
  }

  // The list for the owner's panel. Codes are not handed out even to him: he
  // got the link once, at creation, and the list is for seeing who came in.
  if (url.pathname === '/api/invites') {
    if (!(await isOwner(req))) return forbidden(res);
    const s = await getSettings();
    return send(res, 200, { invites: (s.access.invites || []).map(safeInvite) });
  }

  // Entry by code. One use: it worked, it is spent, and the same link does not
  // let anyone in twice. In exchange a guest token is issued, so a page reload
  // does not put the person back outside the door.
  if (url.pathname === '/api/enter' && req.method === 'POST') {
    const b = await readJson(req);
    const s = await getSettings();
    const invites = s.access.invites || [];
    const invite = invites.find((i) => i.code === String(b.code || ''));
    if (!invite) return send(res, 403, { error: 'this invitation does not exist', errorKey: 'err.codeUnknown' });
    if (invite.usedAt) return send(res, 403, { error: 'this code has already been used', errorKey: 'err.codeUsed' });
    invite.usedAt = Date.now();
    invite.guest = crypto.randomUUID();
    await patchSettings({ access: { ...s.access, invites } });
    return send(res, 200, { ok: true, guest: invite.guest, from: invite.from });
  }

  // A person says they are here and where exactly. Only this goes out: the
  // name, the look, the position and the room — the same as anyone standing
  // nearby sees. No transcripts, no paths, no files are here, and none can be.
  if (url.pathname === '/api/here' && req.method === 'POST') {
    const raw = await readBody(req);
    if (raw.length > 2000) return send(res, 413, { error: 'request body is too large' });
    let b;
    try { b = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid JSON' }); }
    if (!b || typeof b.id !== 'string' || !b.id) return send(res, 400, { error: 'id is required' });
    const num = (v) => (Number.isFinite(v) ? Math.round(v) : 0);
    people.set(b.id.slice(0, 64), {
      id: b.id.slice(0, 64),
      name: String(b.name || '').slice(0, 24),
      look: cleanLook(b.look),
      x: num(b.x), y: num(b.y), dir: b.dir === -1 ? -1 : 1,
      moving: !!b.moving,
      room: b.room == null ? null : String(b.room).slice(0, 64),
      at: Date.now(),
    });
    return send(res, 200, { ok: true, people: people.size });
  }

  // Left properly rather than by timeout: the tab closes, the spot is freed at
  // once, without eight seconds of a ghost in the corridor.
  if (url.pathname === '/api/gone' && req.method === 'POST') {
    const raw = await readBody(req);
    let b = null;
    try { b = JSON.parse(raw); } catch { /* an empty body is an answer too */ }
    if (b && typeof b.id === 'string') people.delete(b.id.slice(0, 64));
    return send(res, 200, { ok: true });
  }

  // Presence is computed on the spot rather than taken from the last tick: the
  // snapshot is built every 2.5 s, and a person manages to come and go in that
  // time. A point request must not lie about who is in the room now.
  if (url.pathname === '/api/state') {
    const guest = await guestOf(req);
    const seen = guest ? project(last, guest.guest) : last;
    // Presence and access are computed on the spot: both change more often than
    // the snapshot is built, and a point request must not lie about who is in
    // the room and who asked for what.
    return send(res, 200, {
      ...seen,
      people: livePeople(),
      access: guest ? accessForGuest(guest.guest) : accessForOwner(),
      // For the same reason as presence and access: a permission request lives
      // seconds and arrives between ticks. A tab opened a moment ago has to see
      // the one hanging right now, not emptiness until the first tick.
      permits: guest ? [] : permits(),
    });
  }

  // the full recent conversation of one agent, for reading in the office
  if (url.pathname === '/api/chat') {
    const id = url.searchParams.get('id') || '';
    // An agent's conversation is not a projection. It opens for a guest only by
    // consent, and only for the agent the consent was given about.
    const guest = await guestOf(req);
    if (guest && !granted(guest.guest, id)) {
      return send(res, 403, { error: 'this conversation is not open', errorKey: 'err.notGranted' });
    }
    const agent = last.agents.find((a) => a.id === id);
    if (!agent) return send(res, 404, { error: 'this agent is not in the office', errorKey: 'err.noSuchAgent' });
    return send(res, 200, { agent: { id, name: agent.name, title: agent.title }, messages: conversation(id) });
  }

  // Leave a note on the desk, or actually send it into the agent's chat.
  if (url.pathname === '/api/task' && req.method === 'POST') {
    try {
      const { agentId, text, deliver: wantsDelivery, mode: wantedMode, resend } = await readJson(req);
      // Anyone may leave a note on the desk: the owner sees it when he comes
      // back and decides himself. Sending into the chat is another matter: it
      // starts claude --resume in a live session, and with bypassPermissions
      // that is the terminal. Watching is allowed, commanding is not.
      if ((wantsDelivery || resend) && !(await isOwner(req))) return forbidden(res);
      // A note already lying on the desk can be handed over to the chat as it is:
      // it moves rather than multiplies, so the desk does not keep a stale twin.
      const lying = resend
        ? outbox.find((t) => t.id === resend && t.agentId === agentId && t.state === 'note')
        : null;
      if (resend && !lying) return send(res, 400, { error: 'this note is no longer on the desk', errorKey: 'err.noteGone' });
      const body = lying ? lying.text : text;
      if (!agentId || !body) return send(res, 400, { error: 'agentId and text required' });
      if (lying) outbox.splice(outbox.indexOf(lying), 1);
      const task = {
        id: ++taskSeq, agentId, text: String(body).slice(0, 4000),
        at: Date.now(), state: 'note', reply: null, error: null,
      };
      outbox.push(task);

      if (!wantsDelivery && !lying) {
        console.log(`[note] ${agentId}: ${task.text.slice(0, 80)}`);
        return send(res, 200, { ok: true, task, delivery: await deliveryStatus() });
      }

      const agent = last.agents.find((a) => a.id === agentId);
      if (!agent) { task.state = 'failed'; task.error = 'the agent is no longer in the office'; task.errorKey = 'err.agentGone'; return send(res, 200, { ok: true, task }); }
      const status = await deliveryStatus();
      if (!status.available) { task.state = 'failed'; task.error = status.hint; task.errorKey = status.hintKey; return send(res, 200, { ok: true, task, delivery: status }); }
      if (isBusy(agentId)) { task.state = 'failed'; task.error = 'another message is already being sent to this agent'; task.errorKey = 'err.busy'; return send(res, 200, { ok: true, task }); }

      const { delivery } = await getSettings();
      const mode = MODES.has(wantedMode) ? wantedMode : delivery.mode;
      task.state = 'sending';
      console.log(`[deliver] -> ${agent.name}: ${task.text.slice(0, 80)}`);
      deliver(task, agent, mode).catch((e) => { task.state = 'failed'; task.error = e.message; });
      return send(res, 200, { ok: true, task, delivery: status });
    } catch (e) {
      if (e instanceof BodyError) throw e;
      return send(res, 400, { error: e.message });
    }
  }

  // fresh=1 — forget the cached CLI answer and ask again. The cache lives a
  // minute, which is right for the background; but somebody who has just been
  // to the terminal and pressed «check now» should not have to wait it out.
  if (url.pathname === '/api/delivery') {
    if (url.searchParams.get('fresh') === '1') forgetCli();
    return send(res, 200, await deliveryStatus());
  }
  // A permission request from Claude Code. It comes from the hook on this same
  // machine and HANGS here until the owner answers: while it hangs there is no
  // dialog in the terminal. Only the owner can answer, so only he is let in to
  // ask: somebody else's request here is a way to draw a fake command in the
  // office and collect a real "allow" for it.
  if (url.pathname === '/api/permit' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    // tool_input for Write is a whole file, and 64 KB is not enough for it. A
    // limit is still needed: the body is read into memory, and there can be many
    // requests.
    const body = await readJson(req, SHOT_MAX);
    const { held, verdict, entry } = askPermit(body, { audience: audience() });
    // Nobody is here — the office steps aside immediately. An empty answer
    // returns the hook to its normal path, and the person sees the native dialog
    // without waiting a second.
    if (!held) return send(res, 200, {});
    // Nine minutes is longer than any default timeout that might close the
    // socket for us.
    res.setTimeout(0);
    if (req.socket) req.socket.setTimeout(0);
    // The hook was killed or the terminal was closed — there is no question any
    // more. Without this the card would hang in the office until the timer, and
    // the owner would be answering into the void.
    req.on('close', () => { if (!res.writableEnded) answerPermit(entry.id, { decision: 'terminal' }); broadcastPermits(); });
    broadcastPermits();
    const v = await verdict;
    broadcastPermits();
    return send(res, 200, v || {});
  }

  // The owner's answer. A guest may not even look in here: he sees no requests.
  if (url.pathname === '/api/permit/answer' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    const done = answerPermit(String(b.id || ''), { decision: String(b.decision || ''), message: b.message, label: b.label });
    if (!done) return send(res, 404, { error: 'this request no longer exists', errorKey: 'err.permitGone' });
    broadcastPermits();
    return send(res, 200, { ok: true, ...done, permits: permits() });
  }


  // Where the office looks out of the window, and whether it looks at all.
  if (url.pathname === '/api/settings') {
    if (req.method === 'POST') {
      // The settings are the weather, the language, the delivery mode and
      // service keys: they are shared across the whole office, and a guest has
      // no business changing them.
      if (!(await isOwner(req))) return forbidden(res);
      try {
        const patch = await readJson(req);
        const saved = await patchSettings(patch);
        forgetWeather();
        moduleOnPatch(patch);
        last.weather = await realWeather({ force: true });
        return send(res, 200, { ok: true, settings: publicSettings(saved), weather: last.weather, packs: PACK_LIST });
      } catch (e) {
        if (e instanceof BodyError) throw e;
        return send(res, 400, { error: e.message });
      }
    }
    return send(res, 200, { settings: publicSettings(await getSettings()), weather: last.weather, packs: PACK_LIST });
  }

  // City search, proxied so the page itself never talks to the outside.
  if (url.pathname === '/api/geocode') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return send(res, 200, { results: [] });
    try {
      return send(res, 200, { results: await geocode(q, url.searchParams.get('lang')) });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }


  // Dev helper: the game posts a rendered frame, we drop it on disk to look at.
  if (url.pathname === '/api/shot' && req.method === 'POST') {
    // The frame is written as a file to the owner's disk. A guest may take a
    // screenshot with his own browser — but not put pictures in someone else's
    // folder.
    if (!(await isOwner(req))) return forbidden(res);
    const body = await readBody(req, SHOT_MAX);
    const b64 = body.replace(/^data:image\/png;base64,/, '');
    const dir = path.join(ROOT, '.shots');
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, (url.searchParams.get('name') || 'latest').replace(/[^\w-]/g, '') + '.png');
    await fsp.writeFile(file, Buffer.from(b64, 'base64'));
    return send(res, 200, { ok: true, file });
  }

  // Serve an artifact, but only files that actually appeared in a transcript.
  if (url.pathname === '/api/file') {
    const p = url.searchParams.get('path') || '';
    const owners = fileOwners(p, last);
    if (!owners.length) return send(res, 403, { error: 'not an agent artifact' });
    // A file belongs to a conversation: it opens for a guest exactly when the
    // conversation does, by the same consent as /api/chat. Until 3 September
    // 2026 only the list itself was checked here, and a guest with any pass read
    // everything the agent had ever opened — a Read of an .env included, if the
    // path was guessed.
    const guest = await guestOf(req);
    if (guest && !owners.some((id) => granted(guest.guest, id))) {
      return send(res, 403, { error: 'this conversation is not open', errorKey: 'err.notGranted' });
    }
    try {
      const st = await fsp.stat(p);
      if (st.size > 8 * 1024 * 1024) return send(res, 413, { error: 'too big' });
      // Show but do not run: html and svg go out as an attachment, see files.js.
      return send(res, 200, await fsp.readFile(p), fileType(p), fileHeaders(p));
    } catch {
      return send(res, 404, { error: 'gone' });
    }
  }

  // What the office would be called on each pack. The panel has to show the
  // price of a keypress BEFORE the keypress, and there is nothing on the page to
  // compute it with — the dictionaries live here.
  //
  // Asked only when the panel is opened. The route itself costs two
  // milliseconds, but the server is single-threaded, and a request that lands
  // during a walk over the transcripts waits with everybody else — 4 seconds on
  // this stand on 4 September 2026. So the list of dictionaries (size and
  // sample) is not part of it: that is static and rides out with the settings,
  // so the line in the panel stands at once and only the price waits.
  if (url.pathname === '/api/names') {
    const s = await getSettings();
    const packs = [];
    for (const id of PACK_IDS) packs.push({ id, names: await previewPack(id) });
    return send(res, 200, { choice: s.namePack || 'auto', pack: effectivePack(s), packs });
  }

  // Which modules made it into this build. The client builds its imports from
  // this list, so the list is the only thing the core knows about modules — and
  // therefore the place to decide what a guest is allowed to load at all. A
  // module that does not say `"guests": "shown"` is left out of a guest's list,
  // so its client never reaches the page: no key of its own gets registered, no
  // object of its own gets drawn, and its panel cannot be opened.
  if (url.pathname === '/api/modules') return send(res, 200, moduleList(await isOwner(req)));

  // The test stand. An empty text means "this is an ordinary office" and the
  // client draws nothing. git is asked for the branch only here: in a normal run
  // this route makes no sense, and an extra call out serves nothing.
  if (url.pathname === '/api/stand') {
    const text = process.env.VALEY_STAND || '';
    if (!text) return send(res, 200, { text: null });
    let branch = '';
    try {
      branch = execFileSync('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch { /* not a repository — we manage without the branch */ }
    return send(res, 200, {
      text, branch, port: PORT,
      modules: moduleList(true).map((m) => m.id),      // the stand plate is the owner's
      all: moduleAll(),
      errors: moduleErrors(),
    });
  }

  // The module switch on the stand. Not in OPEN and owner-only: a guest of the
  // office must not be able to switch off other people's features. It lives as
  // long as the server does.
  if (url.pathname === '/api/stand/toggle') {
    if (!process.env.VALEY_STAND) return send(res, 404, { error: 'stand mode is not active' });
    if (!(await isOwner(req))) return forbidden(res);
    const body = await readJson(req);
    if (!setModuleOff(body.id, !!body.off)) return send(res, 404, { error: 'no such module, or switched off in its manifest' });
    return send(res, 200, { ok: true, all: moduleAll() });
  }

  // A module's files. A branch of its own rather than WEB: in the free build
  // there is no modules/ folder at all, and confusing it with the core's static
  // files means serving one day what was never put there.
  if (url.pathname.startsWith('/modules/')) {
    // Only what a module's page needs, decided by the loader and never by the
    // path (see moduleAsset). The invitation gate covers this branch as it
    // covers /api/: a person without a code loads no modules, and a guest gets
    // the files of the modules shown to him and a 404 for the rest.
    if (!(await admitted(req))) return send(res, 403, { error: 'an invitation is required', errorKey: 'err.needCode' });
    const [id, ...rest] = url.pathname.slice('/modules/'.length).split('/');
    let file = null;
    try { file = await moduleAsset(decodeURIComponent(id), rest.map(decodeURIComponent).join('/'), await isOwner(req)); } catch { file = null; }
    if (!file) return send(res, 404, 'not found', 'text/plain');
    try {
      const buf = await fsp.readFile(file);
      return send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    } catch {
      return send(res, 404, 'not found', 'text/plain');
    }
  }

  // The modules' own routes. They come after every core route: a module extends
  // the office, it does not redefine it.
  if (await moduleRoute(url, req, res, send, { isOwner: () => isOwner(req) })) return;

  // static; /callback is an OAuth return address: we serve the same office, and
  // the module that started that authorisation parses it. The branch stays in
  // the core because a module cannot add a static address of its own — an honest
  // hole in the seam.
  const rel = url.pathname === '/' || url.pathname === '/callback'
    ? 'index.html' : url.pathname.slice(1);
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB)) return send(res, 403, { error: 'nope' });
  try {
    const buf = await fsp.readFile(file);
    return send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch {
    return send(res, 404, 'not found', 'text/plain');
  }
}

/**
 * Raise the office: modules, settings, the port and the ticks.
 *
 * Where to listen — loopback by default: until 30 August 2026 no host was given
 * at all, and that is `0.0.0.0` — the office answered the whole Wi-Fi without a
 * single check. It can be opened to the outside, but only together with a token:
 * one without the other is that very hole.
 */
export async function start({ port = PORT, host = process.env.HOST } = {}) {
  warnIfSharedSettingsWorktree();
  // Modules come before the first read of the settings: their defaults go into
  // the cache as it is built, and the cache is built once. Until 4 September
  // 2026 the order was the other way round, and a module's section appeared in
  // the settings only after the first save — the radio client masked that with
  // `|| {}`.
  // The context is the office's half of the seam: what a module cannot reach on
  // its own and should not reimplement. Both pieces are about people — who is
  // standing where, and how to say one thing to one of them — because that is
  // what the floor tier is built out of. A module that wants neither simply
  // does not export `setup`.
  // `settings` comes along because a module route gets none: `defaults` and
  // `publicView` are handed the settings, and `route` was not — so a module
  // holding a secret in settings had nowhere to read it at request time. The
  // voice needs it for temporary relay credentials, which must be computed per
  // request and must never be written into the page.
  const mods = await loadModules(ROOT, { people: livePeople, toPerson, settings: getSettings });
  let boot = await getSettings();
  const external = process.env.VALEY_EXTERNAL === '1' || !!(boot.network || {}).external;
  if (external && !(boot.network || {}).token) {
    boot = await patchSettings({ network: { external: true, token: newToken() } });
    console.log('A network token was created and saved to the office settings');
  }
  const HOST = host || (external ? '0.0.0.0' : '127.0.0.1');
  const handler = createHandler();
  const server = http.createServer(handler);

  // A taken port is asked who it is before anything is concluded. Another
  // office there means this one has nothing to do; something else means the
  // next port up, said out loud — the canonical-port line below then explains
  // what that costs.
  const bound = await listenFree(server, port, HOST, { log: console.log, own: VERSION });
  if (bound === null) return null;
  port = bound;
  exposure = createExposure({ handler, port, host: HOST });
  if (external) await exposure.open();
  const token = await ownerToken();
  const s = await getSettings();
  console.log(`Valey office at http://localhost:${port}`);
  // Where the questions from Claude Code go. Several offices run on this machine
  // at once — worktrees, stands, the one you actually work in — and the hook asks
  // exactly one of them. On 6 September 2026 that cost an evening: two pager
  // requests were expected in an office that could never have received them,
  // because the hook was talking to another port. So every office says out loud
  // whether it is the one being asked.
  const canon = Number((s.network || {}).port) || 5177;
  if (port === canon) console.log('  Claude Code questions arrive here (canonical port)');
  else console.log(`  Claude Code questions go to ${canon}; this office will not receive them`);
  if (external) {
    const t = (boot.network || {}).token || '';
    console.log(`  exposed on ${HOST}; from another device, open once with a token:`);
    console.log(`  http://<this-machine-address>:${port}/?token=${t || '<see settings>'}`);
  }
  if (mods.length) console.log(`  modules: ${mods.map(m => m.id).join(', ')}`);
  // A module that failed to load must say so here: otherwise a missing feature
  // gets investigated by eye instead of by one line in the log.
  for (const e of moduleErrors()) console.log(`  module failed to start: ${e.id} — ${e.error}`);
  // The owner link is printed every time, not only in shared mode: open it once
  // and you stay the owner in this browser even after the office becomes shared.
  // Looking it up in the settings file later is an extra step at a bad moment.
  console.log(`  owner: http://localhost:${port}/#owner=${token}`);
  if (s.access.mode === 'private') {
    console.log('  mode: private — everything from this machine is treated as the owner.');
    console.log('  Switch to shared before exposing the office to the network.');
  } else {
    console.log('  mode: shared — only a client presenting the token may control the office.');
  }
  tick();
  peopleTick();
  return server;
}

// Run the file and the office comes up; import it and only the handler comes
// out. Checked by argv rather than by a flag: `npm start` and
// `node server/index.js` are the same thing, and a stand should not have to do
// anything special.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Another office already answering is a clean exit, not a failure: the
  // message above says where it is. Modules loaded on the way may hold timers,
  // so the process is ended rather than left to drain.
  if (await start() === null) process.exit(0);
}
