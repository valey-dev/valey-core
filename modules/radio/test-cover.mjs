// node modules/radio/test-cover.mjs — the cover proxy goes only for a picture and
// only where it was told to.
//
// The scdn.co host check had been there from day one, but it could be got around:
// fetch followed a redirect, and an open redirect on the CDN took the server
// anywhere, while the type of the answer went into the browser as it was. The
// network here is a stand-in: fetch answers whatever the stand says and writes down
// what it was called with.
import { route } from './server.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

let calls = [];
let answer = null;
const response = ({ status = 200, type = 'image/jpeg', bytes = 3, length = null, json = null } = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: new Headers({ 'content-type': type, ...(length != null ? { 'content-length': String(length) } : {}) }),
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
  json: async () => json,
});
globalThis.fetch = async (u, init = {}) => {
  calls.push({ url: String(u), init });
  const a = typeof answer === 'function' ? answer(String(u), init) : answer;
  if (a instanceof Error) throw a;
  return a;
};

const ask = async (query) => {
  let out = null;
  const send = (res, code, body, type) => { out = { code, body, type }; };
  const took = await route(new URL('http://office/api/cover?' + query), {}, {}, send);
  return { took, ...out };
};
let n = 0;
const fresh = () => `https://i.scdn.co/image/${++n}`;   // an address of its own for each case — the cache must not get in the way

// ---------------------------------------------------------------- a direct address
answer = response();
let r = await ask('img=' + encodeURIComponent(fresh()));
ok('The image from the CDN is given', r.took && r.code === 200 && r.type === 'image/jpeg', r);
ok('they follow her without redirects', calls[0] && calls[0].init.redirect === 'error', calls[0] && calls[0].init);

answer = new Error('redirect refused');
r = await ask('img=' + encodeURIComponent(fresh()));
ok('redirect from CDN - failure, not travel', r.code === 502, r);

answer = response({ type: 'text/html; charset=utf-8' });
r = await ask('img=' + encodeURIComponent(fresh()));
ok('not a picture - not given', r.code === 502 && /not an image/.test(r.body.error), r);

answer = response({ length: 5 * 1024 * 1024 });
r = await ask('img=' + encodeURIComponent(fresh()));
ok('five megabytes of header - refusal before reading', r.code === 502 && /too big/.test(r.body.error), r);

answer = response({ bytes: 3 * 1024 * 1024 });
r = await ask('img=' + encodeURIComponent(fresh()));
ok('three megabytes body without header - failure after reading', r.code === 502 && /too big/.test(r.body.error), r);

answer = response({ status: 404 });
r = await ask('img=' + encodeURIComponent(fresh()));
ok('404 from CDN - 502 for us, not an empty “picture”', r.code === 502, r);

calls = [];
r = await ask('img=' + encodeURIComponent('https://evil.example/x.jpg'));
ok('foreign host - refusal without a single request to the outside', r.code === 502 && calls.length === 0, { r, calls: calls.length });

// ------------------------------------------------------------------- by uri
calls = [];
answer = (u) => (u.includes('/oembed') ? response({ type: 'application/json', json: { thumbnail_url: fresh() } }) : response());
r = await ask('uri=spotify:playlist:abc123');
ok('by uri: oEmbed, then image from CDN', r.code === 200 && calls.length === 2, { r, calls: calls.map((c) => c.url) });
ok('and behind the image itself - also without redirects', calls[1] && calls[1].init.redirect === 'error', calls[1] && calls[1].init);

calls = [];
answer = (u) => (u.includes('/oembed') ? response({ type: 'application/json', json: { thumbnail_url: 'https://evil.example/cover.jpg' } }) : response());
r = await ask('uri=spotify:album:zzz999');
ok('oEmbed showed someone else\'s host - they don\'t go after the image', r.code === 502 && calls.length === 1, { r, calls: calls.map((c) => c.url) });

r = await ask('uri=not-a-uri');
ok('non spotify uri - 400', r.code === 400, r);

const untaken = await route(new URL('http://office/api/other'), {}, {}, () => {});
ok('The module does not pick up someone else\'s route', untaken === false, untaken);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
