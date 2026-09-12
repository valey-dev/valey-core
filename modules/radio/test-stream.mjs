// node modules/radio/test-stream.mjs — internet radio by its stream: what a pasted
// line is, what a station's answer amounts to, and who may send the server to ask.
//
// The network is a stand-in, as in test-cover: fetch answers what the stand says and
// writes down where it was sent. The four picks were played by hand on 12 September
// 2026; this stand is for the branches no station would show on demand — HLS, a
// playlist, a closed stream, a page instead of sound, a guest.
import { parseWave, kindOf, mixedContent, PICKS, radio, stream } from './radio.js';
import { route, probe, classify, formatOf, playlistEntry, parseIcy } from './server.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// ---------------------------------------------------------------- the line
ok('a Spotify link stays Spotify',
  parseWave('https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn?si=x').kind === 'spotify');
ok('an http(s) address is a stream',
  parseWave(' https://ice6.somafm.com/groovesalad-128-mp3 ').uri === 'https://ice6.somafm.com/groovesalad-128-mp3');
ok('words are neither', parseWave('lofi beats') === null);
ok('another scheme is neither', parseWave('ftp://x/y.mp3') === null);
ok('a Spotify station is Spotify', kindOf({ uri: 'spotify:playlist:1' }) === 'spotify');
ok('an address in the list is a stream', kindOf({ uri: 'https://x/y' }) === 'stream');
ok('every pick is a stream', PICKS.every((p) => kindOf(p) === 'stream' && /^https:/.test(p.uri)), PICKS);

ok('http on an https page is mixed content', mixedContent('http://x/a', { protocol: 'https:' }));
ok('https on an https page is not', !mixedContent('https://x/a', { protocol: 'https:' }));
ok('http on the http office is not', !mixedContent('http://x/a', { protocol: 'http:' }));

// ---------------------------------------------------------------- the answer
ok('audio/mpeg is mp3', formatOf('audio/mpeg; charset=x') === 'mp3');
ok('aacp is aac', formatOf('audio/aacp') === 'aac');
ok('a playlist type is not sound', formatOf('audio/x-mpegurl') === '' && formatOf('audio/x-scpls') === '');
ok('html is not sound', formatOf('text/html') === '');

const good = classify({ status: 200, url: 'https://x/s', type: 'audio/mpeg',
  headers: { 'icy-br': '128,128', 'icy-name': 'NTS 1', 'icy-metaint': '16000' } });
ok('a stream answers with format, bitrate and name',
  good.ok && good.format === 'mp3' && good.bitrate === 128 && good.name === 'NTS 1' && good.metaint === 16000, good);
ok('HLS by its address', classify({ status: 200, url: 'https://x/live.m3u8?t=1', type: 'audio/mpeg' }).reason === 'hls');
ok('HLS by its type', classify({ status: 200, url: 'https://x/live', type: 'application/vnd.apple.mpegurl' }).reason === 'hls');
ok('404 is a closed stream', classify({ status: 404, url: 'https://x/s', type: 'text/html' }).reason === 'gone');
ok('500 is an error with its code', classify({ status: 500, url: 'https://x/s', type: '' }).status === 500);
ok('a page is not a stream', classify({ status: 200, url: 'https://x/', type: 'text/html' }).reason === 'notAudio');

ok('a .pls gives its first file',
  playlistEntry('[playlist]\nNumberOfEntries=2\nFile1=https://ice1.somafm.com/gs-128-aac\nFile2=https://ice2/x').url === 'https://ice1.somafm.com/gs-128-aac');
ok('a plain .m3u gives its first address', playlistEntry('#EXTM3U\n#EXTINF:-1,x\nhttp://a/b\n').url === 'http://a/b');
ok('an .m3u with #EXT-X- is HLS', playlistEntry('#EXTM3U\n#EXT-X-VERSION:3\nchunk.aac').hls === true);

const block = (s) => { const b = Buffer.alloc(Math.ceil(s.length / 16) * 16); b.write(s, 'utf8'); return b; };
ok('StreamTitle out of a metadata block', parseIcy(block("StreamTitle='Moodymann - Shades';StreamUrl='';")) === 'Moodymann - Shades');
ok('Latin-1 is read as Latin-1', parseIcy(Buffer.from("StreamTitle='Beyonc\xe9';", 'latin1')) === 'Beyoncé');
ok('no title is an empty title', parseIcy(block("StreamUrl='x';")) === '');

// ---------------------------------------------------------------- the trips
let calls = [];
let answers = {};
const reply = ({ status = 200, type = 'audio/mpeg', url, headers = {}, text = '' }) => ({
  status, url,
  headers: new Headers({ 'content-type': type, ...headers }),
  body: text ? new Blob([text]).stream() : null,
});
globalThis.fetch = async (u, init = {}) => {
  calls.push({ url: String(u), init });
  const a = answers[String(u)];
  if (a instanceof Error) throw a;
  if (!a) throw new TypeError('fetch failed');
  return reply({ url: String(u), ...a });
};

answers = { 'https://relay/stream2': { url: 'https://edge-7.example/nts2', headers: { 'icy-br': '256' } } };
let out = await probe('https://relay/stream2');
ok('a redirected stream keeps the address it was given, not the edge',
  out.ok && out.uri === 'https://relay/stream2' && out.bitrate === 256, out);
ok('and asks for the title in the sound', calls[0].init.headers['Icy-MetaData'] === '1');

answers = {
  'https://somafm.example/gs.pls': { type: 'audio/x-scpls', text: '[playlist]\nFile1=https://ice.example/gs-aac\n' },
  'https://ice.example/gs-aac': { type: 'audio/aacp', headers: { 'icy-name': 'Groove Salad [SomaFM]' } },
};
out = await probe('https://somafm.example/gs.pls');
ok('a playlist is opened and its first stream kept', out.ok && out.uri === 'https://ice.example/gs-aac' && out.format === 'aac', out);

answers = { 'https://tv.example/live.m3u': { type: 'audio/x-mpegurl', text: '#EXTM3U\n#EXT-X-TARGETDURATION:6\n' } };
out = await probe('https://tv.example/live.m3u');
ok('an .m3u that turns out HLS is HLS', out.reason === 'hls', out);

calls = [];
out = await probe('https://tv.example/live.m3u8');
ok('an .m3u8 is refused without a trip', out.reason === 'hls' && calls.length === 0, { out, calls });

const abort = new Error('aborted'); abort.name = 'AbortError';
answers = { 'https://slow.example/s': abort };
out = await probe('https://slow.example/s');
ok('a station that does not answer in time is a timeout', out.reason === 'timeout', out);

answers = {};
out = await probe('https://nowhere.example/s');
ok('a station that is not there is unreachable', out.reason === 'unreachable', out);
ok('a non-address is refused', (await probe('javascript:alert(1)')).reason === 'notUrl');

// ---------------------------------------------------------------- who may ask
const ask = async (path, owner) => {
  let got = null;
  const send = (res, code, body) => { got = { code, body }; };
  const took = await route(new URL('http://office' + path), {}, {}, send, { isOwner: async () => owner });
  return { took, ...got };
};
answers = { 'https://ice.example/gs': { headers: { 'icy-br': '128' } } };
calls = [];
let r = await ask('/api/radio/probe?url=' + encodeURIComponent('https://ice.example/gs'), false);
ok('a guest is refused the check', r.took && r.code === 403 && calls.length === 0, { r, calls });
r = await ask('/api/radio/now?url=' + encodeURIComponent('https://ice.example/gs'), false);
ok('and the title', r.took && r.code === 403, r);
r = await ask('/api/radio/probe?url=' + encodeURIComponent('https://ice.example/gs'), true);
ok('the owner gets the answer', r.code === 200 && r.body.ok && r.body.bitrate === 128, r);
r = await ask('/api/radio/now?url=file%3A%2F%2F%2Fetc%2Fpasswd', true);
ok('the title is asked of http(s) only', r.code === 400, r);
r = await ask('/api/radio/other', true);
ok('another path is not the radio’s', r.took === false, r);

// ---------------------------------------------------------------- the ✕
// Reported 13 September 2026: removing a wave nobody was listening to broke the
// music off — a stream for a second, a Spotify playlist back to its first track.
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const spotify = (n) => ({ name: 'sp' + n, uri: 'spotify:playlist:' + n });
const loads = [];
const ctl = { loadUri: (u) => loads.push(u), pause() {}, play() {} };
const audio = () => {
  const a = { stops: 0, src: 'x', pause() {}, load() {}, getAttribute: () => a.src, removeAttribute() { a.stops += 1; a.src = null; } };
  return a;
};

Object.assign(radio, { stations: [spotify(1), spotify(2), spotify(3)], current: 0, playing: true, sdk: false, controller: ctl });
radio.remove(2);
ok('removing a Spotify wave that is not playing leaves the playlist alone', loads.length === 0 && radio.current === 0 && radio.playing, loads);

Object.assign(radio, { stations: [spotify(1), spotify(2), spotify(3)], current: 2 });
radio.remove(0);
ok('removing a wave above the current one keeps the same wave current',
  loads.length === 0 && radio.station().uri === 'spotify:playlist:3', { loads, current: radio.current });

const nts = { name: 'NTS 1', uri: 'https://relay/stream' };
stream.audio = audio();
Object.assign(radio, { stations: [spotify(1), nts, spotify(2)], current: 1, playing: true });
radio.remove(2);
ok('removing another wave does not touch a playing stream', stream.audio.stops === 0 && radio.station() === nts, stream.audio.stops);

radio.remove(1);
ok('removing the playing stream lets it go', stream.audio.stops === 1, stream.audio.stops);
ok('and tunes the wave that took its place', loads.at(-1) === 'spotify:playlist:1', loads);

radio.stations = [spotify(1)];
radio.remove(0);
ok('the last wave stays', radio.stations.length === 1);
radio.playing = false;

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
