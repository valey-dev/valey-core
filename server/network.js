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

// Crockford base32: no I, no L, no O, no U. This token exists to be carried to
// another machine by hand — the office prints it at startup for exactly that —
// and base64url was the wrong alphabet for the job: it puts O next to 0 and l
// next to I and 1. On 5 September 2026 a two-machine test lost the same
// character twice, once in the owner link and once in the network token, and
// both times the office answered «нужен токен», which reads as a broken office
// rather than a misread letter.
//
// 20 bytes are 160 bits and exactly 32 characters at five bits each — no
// padding, and no less entropy than the 24 bytes it replaces would give a
// guesser.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// The address an invitation link names. The link was built from the Host the
// owner's page came in on, so an owner looking at http://localhost:5177 handed
// out http://localhost:5177/#code=… — a link that opens the guest's own machine,
// where no office runs. Found on the #guests stand, 26 September 2026; the
// approved frame shows the office's address on the Wi-Fi. So a loopback Host is
// swapped for the first LAN address, but only when the office answers the
// network at all: a private office has no address a guest could reach, and a
// LAN address in its link would fail just the same, only later.
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;
export function inviteHost(host, { external = false, lan = [] } = {}) {
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(String(host || ''));
  if (!m || !LOOPBACK.test(m[1]) || !external || !lan.length) return host;
  return m[2] ? `${lan[0]}:${m[2]}` : lan[0];
}

// The whole invitation link. Seen from the Wi-Fi, the office answers nothing
// without the network token (check() below), and the code rides after the #,
// which never reaches the server: an invited phone was refused with «a token is
// required» before its page could send the code. Found on the #guests stand,
// 26 September 2026. So the link carries the network token, and check() moves
// it from the address into a cookie on the first request, as it does for the
// owner. The owner chose this knowing the cost: the token is a pass through the
// door and nothing more — everything behind it still asks for an invitation
// (measured that day: the page 200, every /api/* 403 «an invitation is
// required») — but a guest who was shown out keeps that pass until the token
// is changed.
export function inviteUrl(host, code, { external = false, lan = [], token = '' } = {}) {
  const at = inviteHost(host, { external, lan });
  const pass = external && token ? `?token=${encodeURIComponent(token)}` : '';
  return `http://${at}/${pass}#code=${code}`;
}

export function newToken() {
  let bits = 0, value = 0, out = '';
  for (const byte of crypto.randomBytes(20)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out;
}

// The other half of the same decision: what the alphabet cannot produce, it
// forgives on the way in. O reads as 0, I and L read as 1, and case does not
// matter — a hand-copied token with those swapped still opens the office
// instead of refusing with no hint at which character went wrong. Nothing is
// weakened: these characters never occur in a token we generate, so the merge
// costs no entropy. Old base64url tokens still work — both sides are folded
// the same way before the compare.
const fold = (s) => String(s).toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');

// Constant-time comparison: the token is checked on every request, static
// files included, and a byte-by-byte compare tells its own story in timings.
function same(a, b) {
  const x = Buffer.from(fold(a));
  const y = Buffer.from(fold(b));
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
