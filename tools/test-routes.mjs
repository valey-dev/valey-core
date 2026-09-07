// node tools/test-routes.mjs — the office routes, in this same process.
//
// Five stands used to raise a real server in a separate process: spawn, wait for
// the port, kill. That checks what survives HTTP and only that; branches like
// "the file is too big" or "the path climbed out of web/" never got there — they
// were not in the run at all until 4 September 2026.
//
// `server/index.js` now hands out its handler separately from the start-up, and
// the stand hangs it on a server of its own on a free port. The settings and the
// sessions directory are its own: the real ones must not be touched, and the
// stand must have no live agents.
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { freePort } from './lib/office.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 200) : JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-routes-'));
const OWNER = 'routes-owner-0001';
const NET = 'routes-net-0001';
await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify({
  access: { mode: 'private', token: OWNER, invites: [] },
  weather: { enabled: false }, delivery: { mode: 'default' },
}, null, 2));
// The variables come before the import: both the settings and the sessions directory are read on it.
process.env.VALEY_SETTINGS = path.join(dir, 'settings.json');
process.env.VALEY_CLAUDE_DIR = path.join(dir, 'no-claude');
delete process.env.VALEY_STAND;

const { createHandler, setSnapshot } = await import('../server/index.js');
const { patchSettings } = await import('../server/settings.js');

const port = await freePort();
const server = http.createServer(createHandler());
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const base = `http://127.0.0.1:${port}`;

// node:http rather than fetch: fetch drops the Host header and follows
// redirects by itself, and both are what is being checked here.
const req = (p, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const r = http.request(base + p, { method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const buf = Buffer.concat(chunks);
      let j = null;
      try { j = JSON.parse(buf.toString('utf8')); } catch { /* not JSON */ }
      resolve({ status: res.statusCode, h: res.headers, j, text: buf.toString('utf8'), bytes: buf.length });
    });
  });
  r.on('error', reject);
  r.end(body);
});

try {
  // ------------------------------------------------------------- static files
  const home = await req('/');
  ok('root gives the office page', home.status === 200 && /<title/i.test(home.text), home.status);
  const callback = await req('/callback');
  ok('/callback - same page: OAuth return address lives in the kernel',
    callback.status === 200 && callback.text === home.text, callback.status);
  const escape = await req('/../server/settings.json');
  ok('the path out from the web/ is not given', escape.status === 403 || escape.status === 404, escape.status);
  const dots = await req('/%2e%2e/server/index.js');
  ok('and in encoded form too', dots.status === 403 || dots.status === 404, dots.status);
  const missing = await req('/нет-такого.js');
  ok('what is not - 404 is text, not empty', missing.status === 404 && missing.text === 'not found', missing.status);

  // -------------------------------------------------------------- modules
  const mods = await req('/api/modules');
  ok('list of modules - array', mods.status === 200 && Array.isArray(mods.j), mods.j);
  const modEscape = await req('/modules/../server/index.js');
  ok('You can\'t get out of the modules folder either', modEscape.status === 403 || modEscape.status === 404, modEscape.status);

  // -------------------------------------------------------------- the stand
  const stand = await req('/api/stand');
  ok('without VALEY_STAND there is no sign', stand.status === 200 && stand.j.text === null, stand.j);
  const toggle = await req('/api/stand/toggle', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-valey-owner': OWNER }, body: '{"id":"radio","off":true}',
  });
  ok('and the module switch too', toggle.status === 404, toggle.status);

  // --------------------------------------------------------- /api/file
  const artifact = path.join(dir, 'работа.md');
  await fsp.writeFile(artifact, '# сделано\n');
  const huge = path.join(dir, 'огромный.png');
  const fh = await fsp.open(huge, 'w');
  await fh.truncate(9 * 1024 * 1024);   // sparse: it takes up no space on disk
  await fh.close();
  const page = path.join(dir, 'страница.html');
  await fsp.writeFile(page, '<h1>агент написал</h1>');
  const gone = path.join(dir, 'испарился.txt');

  setSnapshot({ agents: [{
    id: 'a1', name: 'Костя', project: 'rocket-shop',
    files: [{ path: artifact }, { path: huge }, { path: page }, { path: gone }],
    artifacts: [],
  }] });

  const notMine = await req('/api/file?path=' + encodeURIComponent('/etc/hosts'));
  ok('file not from transcript - 403', notMine.status === 403, notMine.status);
  const mine = await req('/api/file?path=' + encodeURIComponent(artifact));
  ok('the agent\'s artifact is given away', mine.status === 200 && mine.text.includes('сделано'), mine.status);
  ok('and with nosniff', mine.h['x-content-type-options'] === 'nosniff', mine.h);
  const html = await req('/api/file?path=' + encodeURIComponent(page));
  ok('the agent\'s page is given away as an attachment rather than executed',
    html.status === 200 && html.h['content-disposition'] === 'attachment', html.h);
  const big = await req('/api/file?path=' + encodeURIComponent(huge));
  ok('nine megabytes - 413, and the entire file is not readable', big.status === 413, big.status);
  const vanished = await req('/api/file?path=' + encodeURIComponent(gone));
  ok('missing file - 404', vanished.status === 404, vanished.status);

  // ------------------------------------------------------- the network gate
  // Through a middleman means from outside. A closed office answers 404: a
  // scanner has no business learning that anyone lives here.
  const VIA = { 'x-forwarded-for': '203.0.113.7' };
  const closed = await req('/api/whoami', { headers: VIA });
  ok('closed office outside - 404', closed.status === 404 && closed.j.errorKey === 'err.notFound', closed.j);
  const closedPage = await req('/', { headers: VIA });
  ok('and the page is not visible from the outside', closedPage.status === 404, closedPage.status);

  await patchSettings({ network: { external: true, token: NET } });
  const open = await req('/api/whoami', { headers: VIA });
  ok('open office outside asking for token', open.status === 401 && open.j.errorKey === 'err.needToken', open.j);
  const withToken = await req('/api/whoami', { headers: { ...VIA, authorization: 'Bearer ' + NET } });
  ok('they let you in with a token', withToken.status === 200, withToken.status);

  // ------------------------------------------- the token moves from the address into a cookie
  const viaQuery = await req('/?token=' + NET, { headers: VIA });
  ok('a page with a token in the address is redirected', viaQuery.status === 302, viaQuery.status);
  ok('and the token is removed from the address', viaQuery.h.location === '/', viaQuery.h.location);
  ok('and it is in the cookie, HttpOnly and SameSite',
    /valey_net=/.test(viaQuery.h['set-cookie']?.[0] || '')
      && /HttpOnly/i.test(viaQuery.h['set-cookie']?.[0] || '')
      && /SameSite=Lax/i.test(viaQuery.h['set-cookie']?.[0] || ''), viaQuery.h['set-cookie']);
  const apiQuery = await req('/api/whoami?token=' + NET, { headers: VIA });
  ok('the handle using the same token is answered immediately, without redirecting', apiQuery.status === 200, apiQuery.status);

  await patchSettings({ network: { external: false } });
  const shutAgain = await req('/api/whoami', { headers: VIA });
  ok('the office was closed - again 404', shutAgain.status === 404, shutAgain.status);
  const home2 = await req('/api/whoami');
  ok('and from this machine it is open, as it was', home2.status === 200 && home2.j.owner === true, home2.j);
} catch (e) {
  bad += 1;
  console.log('FAIL  | test did not complete →', e.stack);
} finally {
  await new Promise((r) => server.close(r));
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
