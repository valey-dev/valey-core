// node tools/test-tunnel.mjs — the office behind a middleman.
//
// A tunnel connects to the office over loopback, while the shortcut "came from
// this machine" looks at the address. Without checking the middleman's headers a
// guest from a tunnel in private mode would come out as the owner: the address
// matched. That is the first half.
//
// The second is from 3 September 2026: the network gate sees those headers too.
// Before that it knew only the address, and a request from a tunnel crossed the
// threshold as one of ours, without a token — while README promises "outside
// only together with a token". An office opened through a tunnel without
// VALEY_EXTERNAL is precisely an open port without a token. So a middleman is
// now outside: a closed office answers it 404, an open one 401 until it presents
// the network token; only the owner token makes it the owner, as before.
import { startOffice } from './lib/office.mjs';

const OWNER = 'tunnel-owner-0001';
const NET = 'tunnel-net-token-0001';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const { base, stop } = await startOffice({
  settings: {
    // private on purpose: that is the mode the trap lives in
    access: { mode: 'private', token: OWNER, invites: [] },
    // open to the outside and with a token — as README requires; it still
    // listens on loopback, a stand has no business showing a port on the Wi-Fi
    network: { external: true, token: NET },
  },
  claudeDir: '/nonexistent-claude-dir',
});

const get = (p, headers = {}) => fetch(base + p, { headers })
  .then(async (r) => ({ status: r.status, j: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') }));
const VIA = { 'x-forwarded-for': '203.0.113.7' };
const BEARER = { ...VIA, authorization: 'Bearer ' + NET };

try {
  const direct = await get('/api/whoami');
  ok('own car - the owner, as it was', direct.j && direct.j.owner === true, direct);

  // ------------------------------------------------ a middleman is the outside
  for (const h of ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded']) {
    const via = await get('/api/whoami', { [h]: '203.0.113.7' });
    ok(`through an intermediary (${h}) without a token - the threshold is closed`, via.status === 401 && via.j.errorKey === 'err.needToken', via);
  }
  const bearer = await get('/api/whoami', BEARER);
  ok('with a network token - they let you in, but not the owner', bearer.status === 200 && bearer.j.owner === false, bearer);
  const look = await get('/api/state', BEARER);
  ok('and you can view the office in private with a token - the property of one Wi-Fi remains', look.status === 200, look.status);
  const asOwner = await get('/api/whoami', { ...BEARER, 'x-valey-owner': OWNER });
  ok('The owner\'s token also works through the tunnel - otherwise the owner will not get into his office from the outside',
    asOwner.j && asOwner.j.owner === true, asOwner);

  // ------------------------------------------------------------- the cookie
  const query = await get('/api/whoami?token=' + NET, VIA);
  ok('the token string in the address is accepted once and remembered with a cookie',
    query.status === 200 && /valey_net=/.test(query.cookie || ''), query);
  const cookie = await get('/api/whoami', { ...VIA, cookie: 'valey_net=' + NET });
  ok('and they let you in according to cookies', cookie.status === 200, cookie.status);
  const badCookie = await get('/api/whoami', { ...VIA, cookie: 'valey_net=%E0%A4%A' });
  ok('a broken percentage in a cookie is not a token, not a URIError for the entire office', badCookie.status === 401, badCookie.status);
  const still = await get('/api/whoami');
  ok('and the office is alive after her', still.status === 200 && still.j.owner === true, still.status);

  // -------------------------------------------------- a closed office — 404
  // The owner closes the port from loopback; the gate reads the settings on every request.
  const shut = await fetch(base + '/api/settings', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-valey-owner': OWNER },
    body: JSON.stringify({ network: { external: false } }),
  }).then((r) => r.status);
  ok('the owner is closing the office', shut === 200, shut);
  const closed = await get('/api/whoami', BEARER);
  ok('the closed office responds to the intermediary with 404, even with a token: the scanner has nothing to know', closed.status === 404, closed.status);
  const home = await get('/api/whoami');
  ok('and from this machine the office is open as it was', home.status === 200 && home.j.owner === true, home.status);
} catch (e) {
  bad += 1;
  console.log('FAIL  | test did not complete →', e.message);
} finally {
  await stop();
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
