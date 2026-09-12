// node modules/radio/test-search.mjs — finding a station in the radio-browser catalogue.
//
// The catalogue and the network are stand-ins: catalog.hosts is set by hand, so no
// DNS is asked, and fetch answers from a table and writes down what it was sent. The
// live catalogue was searched by hand on 13 September 2026 — «jazz», «маяк», «nts»,
// the genres; this stand is for what a live answer will not show on demand: a dead
// station, an HLS one, a duplicate, a catalogue that does not answer, a guest.
import { route, search, toFound, catalog, GENRES } from './server.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const station = (n, extra = {}) => ({
  stationuuid: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  name: `Station ${n}`, url: `https://s${n}.example/live`, url_resolved: `https://s${n}.example/live`,
  countrycode: 'gb', codec: 'MP3', bitrate: 128, hls: 0, lastcheckok: 1, ...extra,
});

// ---------------------------------------------------------------- one row
const row = toFound(station(1, { name: '  NTS   Radio 1 ', codec: 'AAC+', bitrate: 64 }));
ok('a station becomes a row: name, country, codec, bitrate, address',
  row.name === 'NTS Radio 1' && row.country === 'GB' && row.codec === 'aac+' && row.bitrate === 64 && row.uri === 'https://s1.example/live', row);
ok('HLS is dropped', toFound(station(2, { hls: 1 })) === null);
ok('an .m3u8 address is dropped even unflagged', toFound(station(3, { url_resolved: 'https://x/live.m3u8' })) === null);
ok('a station silent at the last check is dropped', toFound(station(4, { lastcheckok: 0 })) === null);
ok('a station without a name is dropped', toFound(station(5, { name: ' ' })) === null);
ok('a non-http address is dropped', toFound(station(6, { url_resolved: 'rtsp://x/y', url: 'rtsp://x/y' })) === null);

// ---------------------------------------------------------------- the trips
catalog.hosts = ['cat.example']; catalog.at = Date.now();
let calls = [];
let answer = () => [];
globalThis.fetch = async (u, init = {}) => {
  calls.push({ url: String(u), init });
  const a = answer(new URL(String(u)));
  if (a instanceof Error) throw a;
  return { ok: true, status: 200, json: async () => a };
};

answer = (u) => (u.searchParams.get('name') === 'jazz'
  ? [station(10), station(11, { hls: 1 }), station(12), station(10)]
  : u.searchParams.get('tag') === 'jazz' ? [station(12), station(13), station(14)] : []);
let out = await search({ q: 'jazz' });
ok('a word is looked for in names, then topped up from tags, without repeats',
  out.map((x) => x.name).join(',') === 'Station 10,Station 12,Station 13,Station 14', out.map((x) => x.name));
ok('names first: the first trip asks for the name, the second for the tag',
  calls[0].url.includes('name=jazz') && calls[1].url.includes('tag=jazz'), calls.map((c) => c.url));
ok('the catalogue is asked by popularity, broken stations hidden',
  /order=clickcount/.test(calls[0].url) && /reverse=true/.test(calls[0].url) && /hidebroken=true/.test(calls[0].url));
ok('with a User-Agent that says who asks', /^valey-office\/\S+ \(\+https:\/\/valey\.dev\)$/.test(calls[0].init.headers['User-Agent']), calls[0].init.headers);

calls = [];
answer = () => Array.from({ length: 20 }, (_, i) => station(100 + i));
out = await search({ q: 'many' });
ok('no more than eight rows', out.length === 8, out.length);
ok('and a full page of names needs no second trip', calls.length === 1, calls.length);

calls = [];
out = await search({ q: 'many' });
ok('the same words within five minutes are not asked again', calls.length === 0 && out.length === 8);

calls = [];
answer = (u) => (u.searchParams.get('tag') === 'ambient' ? [station(200)] : [station(201)]);
out = await search({ tag: 'ambient' });
ok('a genre is a tag and only a tag', calls.length === 1 && calls[0].url.includes('tag=ambient') && !calls[0].url.includes('name='), calls.map((c) => c.url));
ok('every genre of the row is one the server accepts', GENRES.length === 6);

// ---------------------------------------------------------------- the route
const ask = async (path, owner = true) => {
  let got = null;
  const send = (res, code, body) => { got = { code, body }; };
  const took = await route(new URL('http://office' + path), {}, {}, send, { isOwner: async () => owner });
  return { took, ...got };
};
calls = [];
let r = await ask('/api/radio/search?q=jazz', false);
ok('a guest is refused the search, and nothing goes out', r.took && r.code === 403 && calls.length === 0, { r, calls });
r = await ask('/api/radio/search?q=j');
ok('one letter is not a search', r.code === 400, r);
r = await ask('/api/radio/search?tag=polka');
ok('a genre outside the row is refused', r.code === 400, r);

const late = new Error('timeout'); late.name = 'TimeoutError';
answer = () => late;
r = await ask('/api/radio/search?q=slowword');
ok('a catalogue that does not answer is a timeout, not a crash', r.code === 200 && r.body.error === 'timeout' && r.body.stations.length === 0, r);
answer = () => new TypeError('fetch failed');
r = await ask('/api/radio/search?q=deadword');
ok('a catalogue that is not there is silent', r.body.error === 'silent', r);

calls = [];
answer = () => ({ ok: 'true' });
const uuid = '960e57c5-0601-11e8-ae97-52543be04c81';
r = await ask('/api/radio/click?uuid=' + uuid);
await new Promise((res) => setTimeout(res, 0));
ok('a caught station is reported to the catalogue by its id', r.code === 200 && calls.length === 1 && calls[0].url === `https://cat.example/json/url/${uuid}`, calls);
calls = [];
r = await ask('/api/radio/click?uuid=' + encodeURIComponent('../../json/stations'));
ok('and only by an id', r.code === 400 && calls.length === 0, { r, calls });
r = await ask('/api/radio/click?uuid=' + uuid, false);
ok('a guest does not report clicks', r.code === 403);

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
