// Who can reach the port at all.
//
// Until 30 August 2026 there was no answer to that question: `server.listen(PORT)`
// with no host is `0.0.0.0`, so the office answered the whole Wi-Fi with no
// checks of any kind. Somebody at the next table who knew the port read every
// session transcript in full through /api/chat and opened files through
// /api/file. Confirmed live the same day: a LAN address of this machine got
// 200 OK.
//
// This is NOT about guests. `settings.access` decides who the office admits as
// a person — owner, invited, nobody. Here it is decided which addresses are
// answered at all. Different questions, different secrets, so a key of its
// own: `settings.network`. Folding them into one means handing out the owner
// token one day, having taken it for the network one.
import crypto from 'node:crypto';

const COOKIE = 'valey_net';

// Loopback is its own: the browser on this machine must know nothing about
// tokens, or the office stops opening on `npm start`, which is what it was
// written for. The comparison is exact, on the whole address: "starts with
// 127." would have let 127.0.0.1.evil.com in here.
export function isLocal(req) {
  // Arrived through a middleman — so not "from this machine", whatever the
  // socket says: a tunnel (cloudflared, ngrok, any reverse proxy) connects to
  // the office over loopback. Until 3 September 2026 only isOwner knew that and
  // the gate did not — a request from a tunnel crossed the threshold as one of
  // ours, without a token. The middleman sets those headers itself; a page in a
  // browser can set them too, but then it gives up loopback of its own accord
  // and gets what an outsider would.
  if (proxied(req)) return false;
  const a = (req.socket && req.socket.remoteAddress) || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

export const PROXIED = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded'];
export const proxied = (req) => PROXIED.some((h) => req.headers && req.headers[h]);

export function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// Constant-time comparison: the token is checked on every request, static
// files included, and a byte-by-byte compare tells its own story in timings.
function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookieToken(req) {
  const raw = (req.headers && req.headers.cookie) || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    // The cookie comes from someone else's machine and is parsed before any
    // check. A broken percent in it is a URIError, and until 3 September 2026
    // that killed the whole office with one request and no token. A broken
    // cookie is simply not a token.
    if (k === COOKIE) { try { return decodeURIComponent(v.join('=')); } catch { return ''; } }
  }
  return '';
}

// No Secure on the cookie, deliberately: outside it travels over http (a
// tunnel, a LAN), and with Secure it would simply not be stored — the office
// would quietly stop opening on the phone. HttpOnly and SameSite stay.
function cookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`;
}

/**
 * Whether to admit the request. Returns `{ ok: true }`, `{ ok: false, reason }`
 * or `{ ok: true, setCookie }` — the last one when the token arrived in the
 * address: it has to be remembered in a cookie and dropped from the URL. A
 * secret in the address bar stays in browser history, in logs and in the
 * Referer header, so it lives there exactly one request — as long as it takes
 * to type it once on a phone.
 */
export function check(req, url, network) {
  if (isLocal(req)) return { ok: true };
  if (!network || !network.external || !network.token) return { ok: false, reason: 'closed' };

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer && same(bearer, network.token)) return { ok: true };
  const fromCookie = cookieToken(req);
  if (fromCookie && same(fromCookie, network.token)) return { ok: true };
  const query = url.searchParams.get('token') || '';
  if (query && same(query, network.token)) return { ok: true, setCookie: cookie(network.token) };
  return { ok: false, reason: 'token' };
}
