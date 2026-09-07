// node tools/test-network.mjs — who is let into the office.
//
// What is checked is not "are strings compared" but the decisions, each of which
// quietly opens every session's correspondence to the outside: loopback is
// always our own, a closed office is not visible from outside at all, a token
// from the address moves into a cookie, and a token that merely looks alike is
// somebody else's token.
import { check, isLocal, newToken } from '../server/network.js';
import { publicSettings } from '../server/settings.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const req = (addr, headers = {}) => ({ socket: { remoteAddress: addr }, headers });
const u = (q = '') => new URL('http://localhost:5177/api/state' + q);

const OPEN = { external: true, token: 'sekret-token-value' };
const SHUT = { external: false, token: 'sekret-token-value' };

// ------------------------------------------------------------------ loopback

ok('127.0.0.1 - own', isLocal(req('127.0.0.1')));
ok('::1 - yours', isLocal(req('::1')));
ok('v4 in v6 wrapper - yours', isLocal(req('::ffff:127.0.0.1')));
ok('Wi-Fi neighbor is not your own', !isLocal(req('192.168.10.42')));
// An address that starts with 127 as text but is not loopback: a string compare
// of "starts with 127." would let another machine in here.
ok('127.0.0.1.evil.com is not yours', !isLocal(req('127.0.0.1.evil.com')));

ok('yours walks without a token', check(req('::1'), u(), OPEN).ok);
ok('his goes to a closed office', check(req('::1'), u(), SHUT).ok);
ok('yours goes when there is no token at all', check(req('::1'), u(), { external: false, token: '' }).ok);

// ------------------------------------------------------- closed to the outside

const shut = check(req('192.168.10.42'), u(), SHUT);
ok('closed office doesn\'t allow outside', !shut.ok);
ok('and doesn’t admit that he’s here', shut.reason === 'closed', shut);

const noToken = check(req('192.168.10.42'), u(), { external: true, token: '' });
ok('open without a token - also closed', !noToken.ok && noToken.reason === 'closed', noToken);

// ---------------------------------------------------------------- the token

ok('outside without token - 401', check(req('192.168.10.42'), u(), OPEN).reason === 'token');
ok('Bearer lets in', check(
  req('192.168.10.42', { authorization: 'Bearer sekret-token-value' }), u(), OPEN).ok);
ok('bearer is lowercase too', check(
  req('192.168.10.42', { authorization: 'bearer sekret-token-value' }), u(), OPEN).ok);
ok('lets in the cook', check(
  req('192.168.10.42', { cookie: 'theme=dark; valey_net=sekret-token-value' }), u(), OPEN).ok);

const byQuery = check(req('192.168.10.42'), u('?token=sekret-token-value'), OPEN);
ok('the token from the address is allowed', byQuery.ok);
ok('and immediately moves to the cookie', /valey_net=sekret-token-value/.test(byQuery.setCookie || ''), byQuery.setCookie);
ok('HttpOnly and SameSite cookies', /HttpOnly/.test(byQuery.setCookie) && /SameSite=Lax/.test(byQuery.setCookie));
ok('and without Secure - otherwise it will not be saved via http', !/Secure/.test(byQuery.setCookie));

// A prefix and a truncation are not the token. Comparing by length catches both.
ok('the trimmed token does not allow', !check(req('1.2.3.4', { authorization: 'Bearer sekret-token' }), u(), OPEN).ok);
ok('token with a tail does not allow', !check(req('1.2.3.4', { authorization: 'Bearer sekret-token-value-x' }), u(), OPEN).ok);
ok('an empty token does not allow', !check(req('1.2.3.4', { authorization: 'Bearer ' }), u(), OPEN).ok);

const a = newToken(), b = newToken();
ok('the token is long and different', a.length >= 32 && a !== b, a.length);
ok('token without address-breaking characters', /^[A-Za-z0-9_-]+$/.test(a), a);

// The token is carried to another machine by hand, so the alphabet must not
// contain a pair a human can read wrong. On 5 September 2026 a two-machine test
// lost the same character twice — O read as 0 — and both times the office
// answered that a token was needed, which reads as a broken office rather than
// a misread letter.
ok('there are no doubles in the token: I, L, O, U', !/[ILOU]/.test(a), a);
const TYPED = { external: true, token: 'PFVTSWJ6MPHN0MGH2G8VBPNX8RHYQ7E9' };
const typedAs = (t) => check(req('1.2.3.4', { authorization: 'Bearer ' + t }), u(), TYPED).ok;
ok('zero typed as O still lets you in', typedAs('PFVTSWJ6MPHNOMGH2G8VBPNX8RHYQ7E9'));
ok('a unit typed with the letter l still allows', typedAs('PFVTSWJ6MPHN0MGH2G8VBPNX8RHYQ7E9'.replace('1', 'l')));
ok('lowercase token is allowed', typedAs('pfvtswj6mphn0mgh2g8vbpnx8rhyq7e9'));
ok('but someone else\'s token still won\'t let me in', !typedAs('PFVTSWJ6MPHN0MGH2G8VBPNX8RHYQ7EX'));

// ------------------------------------------------------ the token does not leak

// The key here is `network`, not `access`: in the core `access` is already taken
// by the guest system and holds the OWNER's token. Folding two secrets into one
// field means handing out the wrong one some day.
const pub = publicSettings({ figma: { token: 'f', files: {} }, network: OPEN });
ok('the network token does not go to the page', pub.network.token === undefined, pub.network);
ok('but the fact of its presence is visible', pub.network.hasToken === true, pub.network);
ok('and external is visible', pub.network.external === true, pub.network);

console.log(bad ? `\nfailed: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
