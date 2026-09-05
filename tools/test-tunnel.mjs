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
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
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
  ok('своя машина — хозяин, как и была', direct.j && direct.j.owner === true, direct);

  // ------------------------------------------------ a middleman is the outside
  for (const h of ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded']) {
    const via = await get('/api/whoami', { [h]: '203.0.113.7' });
    ok(`через посредника (${h}) без токена — порог закрыт`, via.status === 401 && via.j.errorKey === 'err.needToken', via);
  }
  const bearer = await get('/api/whoami', BEARER);
  ok('с сетевым токеном — пускают, но не хозяин', bearer.status === 200 && bearer.j.owner === false, bearer);
  const look = await get('/api/state', BEARER);
  ok('и смотреть офис в private с токеном можно — свойство одной Wi-Fi остаётся', look.status === 200, look.status);
  const asOwner = await get('/api/whoami', { ...BEARER, 'x-valey-owner': OWNER });
  ok('токен хозяина работает и через туннель — иначе хозяин не попадёт в свой офис снаружи',
    asOwner.j && asOwner.j.owner === true, asOwner);

  // ------------------------------------------------------------- the cookie
  const query = await get('/api/whoami?token=' + NET, VIA);
  ok('токен строкой в адресе принимают один раз и запоминают кукой',
    query.status === 200 && /valey_net=/.test(query.cookie || ''), query);
  const cookie = await get('/api/whoami', { ...VIA, cookie: 'valey_net=' + NET });
  ok('и по куке пускают', cookie.status === 200, cookie.status);
  const badCookie = await get('/api/whoami', { ...VIA, cookie: 'valey_net=%E0%A4%A' });
  ok('битый процент в куке — не токен, а не URIError на весь офис', badCookie.status === 401, badCookie.status);
  const still = await get('/api/whoami');
  ok('и офис после неё жив', still.status === 200 && still.j.owner === true, still.status);

  // -------------------------------------------------- a closed office — 404
  // The owner closes the port from loopback; the gate reads the settings on every request.
  const shut = await fetch(base + '/api/settings', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-valey-owner': OWNER },
    body: JSON.stringify({ network: { external: false } }),
  }).then((r) => r.status);
  ok('хозяин закрывает офис', shut === 200, shut);
  const closed = await get('/api/whoami', BEARER);
  ok('посреднику закрытый офис отвечает 404, даже с токеном: сканеру знать нечего', closed.status === 404, closed.status);
  const home = await get('/api/whoami');
  ok('а с этой машины офис открыт, как и был', home.status === 200 && home.j.owner === true, home.status);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.message);
} finally {
  await stop();
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
