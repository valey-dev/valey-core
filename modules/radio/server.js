// The radio — the server half.
//
// There is no secret here: PKCE does not have one, and only the client id of an
// application the person set up themselves goes outside. The server is needed for
// something else — it goes for the cover, so that the address of the picture is not
// taken apart by the page, and it asks a stream what it is and what it is playing,
// which the page cannot: a station's answer carries no CORS headers, so its own
// headers and the title woven into the sound are closed to the browser.
//
// Privacy, stated once: the server talks only to addresses the owner typed or picked
// into their own receiver, and only while they check or play one. Nothing about the
// office goes to the station beyond what any player sends.
import { covers } from './covers.js';
import dns from 'node:dns/promises';
import { readFileSync } from 'node:fs';

export const defaults = () => ({
  // the Spotify application set up by the user: the client id only
  spotify: { clientId: '' },
});

export const merge = (prev, patch) => ({
  spotify: { ...prev.spotify, ...(patch.spotify || {}) },
});

// How much cover we need. The picture for the body is 40×40, while the largest variant
// at Spotify is a 640×640 jpeg, tens of kilobytes; two megabytes is not a ceiling for a
// cover but a ceiling for what is not a cover.
const MAX_COVER = 2 * 1024 * 1024;

// One trip for a picture. The host check stands above, but on its own it can be got
// around: an open redirect on the CDN would take the fetch anywhere, and the type of the
// answer went into the browser as it was. So a redirect is an error, a non-picture is an
// error, and the size is limited both before and after reading.
async function fetchCover(src) {
  const img = await fetch(src, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!img.ok) throw new Error(`cover ${img.status}`);
  const type = (img.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) throw new Error(`not an image: ${type || 'no type'}`);
  if (Number(img.headers.get('content-length') || 0) > MAX_COVER) throw new Error('cover too big');
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length > MAX_COVER) throw new Error('cover too big');
  return { buf, type };
}

// How long a station has to answer, the same ten seconds the receiver waits for sound.
const STREAM_WAIT = 10_000;
// A playlist is a few lines of text; a metadata block is at most 16 × 255 bytes and
// sits after icy-metaint bytes of sound, which stations keep under a hundred kilobytes.
const MAX_PLAYLIST = 64 * 1024;
const MAX_METAINT = 256 * 1024;

// What the content type of a stream means for a browser's <audio>.
export function formatOf(type) {
  const t = (type || '').split(';')[0].trim().toLowerCase();
  if (t === 'audio/mpeg' || t === 'audio/mp3' || t === 'audio/mpeg3') return 'mp3';
  if (t === 'audio/aac' || t === 'audio/aacp' || t === 'audio/x-aac' || t === 'audio/mp4') return 'aac';
  if (t === 'audio/ogg' || t === 'application/ogg' || t === 'audio/opus') return 'ogg';
  if (t === 'audio/flac' || t === 'audio/x-flac') return 'flac';
  if (t === 'audio/wav' || t === 'audio/x-wav') return 'wav';
  if (/(scpls|mpegurl)/.test(t)) return '';   // a playlist, not sound
  if (t.startsWith('audio/')) return t.slice(6);
  return '';
}

const isHls = (url, type) => /\.m3u8(\?|#|$)/i.test(url) || /vnd\.apple\.mpegurl/i.test(type || '');
// A playlist by its type, or by its name when the type says no sound either.
const isPlaylist = (url, type) => /(scpls|mpegurl)/i.test(type || '')
  || (/\.(pls|m3u)(\?|#|$)/i.test(url) && !formatOf(type));

// The first address in a .pls or a plain .m3u — what SomaFM, for one, hands out
// instead of the stream itself. A playlist with #EXT-X- lines is HLS in disguise.
export function playlistEntry(text) {
  if (/#EXT-X-/i.test(text)) return { hls: true };
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.trim().match(/^(?:File\d+=)?(https?:\/\/\S+)$/i);
    if (m) return { url: m[1] };
  }
  return {};
}

// What one answer from a station amounts to. Pure, so the stand can walk every
// branch without a network: ok with a format, or a reason the receiver says aloud.
export function classify({ status, url, type, headers = {} }) {
  if (isHls(url, type)) return { ok: false, reason: 'hls' };
  if (status === 404 || status === 410) return { ok: false, reason: 'gone', status };
  if (status >= 400) return { ok: false, reason: 'status', status };
  const format = formatOf(type);
  if (!format) return { ok: false, reason: 'notAudio', type: (type || '').split(';')[0] };
  const br = parseInt(String(headers['icy-br'] || '').split(',')[0], 10);
  return {
    ok: true, format,
    bitrate: Number.isFinite(br) && br > 0 ? br : 0,
    name: String(headers['icy-name'] || '').trim().slice(0, 80),
    metaint: parseInt(headers['icy-metaint'] || '0', 10) || 0,
  };
}

// One trip to a station: headers only, the sound is let go the moment they arrive.
// Redirects are followed — NTS answers through two of them to its edge servers — but
// the receiver keeps the address it was given: an edge server is today's, the relay
// that chose it is the station's.
async function ask(url, { body = 0 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), STREAM_WAIT);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'Icy-MetaData': '1' } });
    const headers = Object.fromEntries(r.headers);
    let text = '';
    if (body && r.body) {
      const reader = r.body.getReader();
      const chunks = []; let got = 0;
      while (got < body) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
      }
      text = Buffer.concat(chunks).subarray(0, body).toString('utf8');
    }
    return { status: r.status, url: r.url || url, type: r.headers.get('content-type') || '', headers, text };
  } finally {
    clearTimeout(timer);
    ctl.abort();   // a live stream never ends on its own
  }
}

const failed = (e) => ({ ok: false, reason: e && e.name === 'AbortError' ? 'timeout' : 'unreachable' });

// Is this a stream the browser will play? A playlist is opened once and its first
// entry asked in turn; the answer carries the address to keep.
export async function probe(raw) {
  let url;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'notUrl' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'notUrl' };
  if (isHls(url.href, '')) return { ok: false, reason: 'hls' };
  try {
    let keep = url.href;
    let a = await ask(url.href, { body: isPlaylist(url.href, '') ? MAX_PLAYLIST : 0 });
    if (isPlaylist(a.url, a.type) && !isHls(a.url, a.type)) {
      if (!a.text) a = await ask(a.url, { body: MAX_PLAYLIST });
      const entry = playlistEntry(a.text);
      if (entry.hls) return { ok: false, reason: 'hls' };
      if (!entry.url) return { ok: false, reason: 'notAudio', type: 'playlist' };
      keep = entry.url;
      a = await ask(entry.url);
    }
    const out = classify(a);
    if (out.ok) out.uri = keep;
    return out;
  } catch (e) {
    return failed(e);
  }
}

// StreamTitle out of an ICY metadata block: StreamTitle='Artist - Track';StreamUrl='';
// Stations write it in UTF-8 mostly and in Latin-1 sometimes; a decode that produced
// replacement characters is tried again the other way.
export function parseIcy(buf) {
  let text = Buffer.from(buf).toString('utf8');
  if (text.includes('\uFFFD')) text = Buffer.from(buf).toString('latin1');
  const m = text.replace(/\0+$/, '').match(/StreamTitle='(.*?)';/s);
  return m ? m[1].trim() : '';
}

// What is playing now: read up to the first metadata block and no further. Asked every
// twenty seconds by a playing receiver, so the answer is kept for as long.
const nowCache = new Map();
const NOW_TTL = 20_000;

export async function nowPlaying(url) {
  const hit = nowCache.get(url);
  if (hit && Date.now() - hit.at < NOW_TTL) return hit.out;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), STREAM_WAIT);
  let out = { title: '' };
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'Icy-MetaData': '1' } });
    const metaint = parseInt(r.headers.get('icy-metaint') || '0', 10);
    if (metaint > 0 && metaint <= MAX_METAINT && r.body) {
      const reader = r.body.getReader();
      let buf = Buffer.alloc(0);
      let need = metaint + 1;
      while (buf.length < need) {
        const { done, value } = await reader.read();
        if (done) break;
        buf = Buffer.concat([buf, value]);
        if (buf.length > metaint && need === metaint + 1) need = metaint + 1 + buf[metaint] * 16;
      }
      const len = buf[metaint] * 16;
      if (len) out = { title: parseIcy(buf.subarray(metaint + 1, metaint + 1 + len)) };
    }
  } catch { /* a station that does not answer simply has no title */ } finally {
    clearTimeout(timer);
    ctl.abort();
  }
  if (nowCache.size > 32) nowCache.clear();
  nowCache.set(url, { at: Date.now(), out });
  return out;
}

// ------------------------------------------------------------- the catalogue
// Finding a station by its name or genre instead of hunting for its stream address.
// radio-browser.info is an open, community-run catalogue: no key, no account. Its
// rules are three and all are kept here — find the servers through DNS rather than
// hard-coding one, send a User-Agent that says who is asking, and report a click when
// a found station is actually played, which is how the catalogue ranks popularity.
// Frames: WIP «Радио: поиск станций» (2119:5501).
//
// What goes out: the word typed (or a genre's tag), from this server, only on Enter or
// a press on a genre — never as the person types. The office's name and address stay.
const CATALOG_SRV = '_api._tcp.radio-browser.info';
const CATALOG_FALLBACK = 'all.api.radio-browser.info';
const FOUND = 8;
const version = (() => {
  try { return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { return '0'; }
})();
const AGENT = `valey-office/${version} (+https://valey.dev)`;

// The catalogue's servers, looked up once an hour. The stand replaces hosts and fetch.
export const catalog = {
  hosts: null, at: 0,
  async host() {
    if (!this.hosts || Date.now() - this.at > 3600_000) {
      try {
        const srv = await dns.resolveSrv(CATALOG_SRV);
        this.hosts = srv.map((r) => r.name).filter(Boolean);
      } catch { this.hosts = []; }
      if (!this.hosts.length) this.hosts = [CATALOG_FALLBACK];
      this.at = Date.now();
    }
    return this.hosts[Math.floor(Math.random() * this.hosts.length)];
  },
  async get(path) {
    const r = await fetch(`https://${await this.host()}${path}`, {
      signal: AbortSignal.timeout(STREAM_WAIT), headers: { 'User-Agent': AGENT },
    });
    if (!r.ok) throw new Error(`catalogue ${r.status}`);
    return r.json();
  },
};

// One station as the receiver needs it. HLS and stations the catalogue did not find
// on the air at its last check are dropped here: a row that cannot be caught is noise.
export function toFound(s) {
  if (!s || Number(s.hls) === 1 || Number(s.lastcheckok) !== 1) return null;
  const uri = String(s.url_resolved || s.url || '').trim();
  if (!/^https?:\/\//i.test(uri) || /\.m3u8(\?|#|$)/i.test(uri)) return null;
  const name = String(s.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return null;
  return {
    uuid: String(s.stationuuid || ''),
    name,
    country: String(s.countrycode || '').toUpperCase().slice(0, 2),
    codec: String(s.codec || '').toLowerCase().slice(0, 8),
    bitrate: Number(s.bitrate) || 0,
    uri,
  };
}

// The catalogue's tags are a mess — pop, music, méxico, estación — so the receiver's
// genre row is its own and short, and each word is sent as one tag known to be there.
export const GENRES = ['jazz', 'ambient', 'lofi', 'techno', 'classical', 'news'];

const query = (params) => '/json/stations/search?' + new URLSearchParams({
  hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '30', ...params,
});

// A word is looked for in names first and topped up from tags, as the frame promises:
// «NTS» is a name, «jazz» is both. A genre is a tag and nothing else.
const found = new Map();
export async function search({ q = '', tag = '' } = {}) {
  const key = tag ? 'tag:' + tag : 'q:' + q.toLowerCase();
  const hit = found.get(key);
  if (hit && Date.now() - hit.at < 300_000) return hit.out;
  const lists = tag
    ? [await catalog.get(query({ tag }))]
    : [await catalog.get(query({ name: q }))];
  if (!tag && lists[0].filter((x) => toFound(x)).length < FOUND) lists.push(await catalog.get(query({ tag: q.toLowerCase() })));
  const seen = new Set();
  const out = [];
  for (const s of lists.flat()) {
    const f = toFound(s);
    if (!f || seen.has(f.uuid || f.uri)) continue;
    seen.add(f.uuid || f.uri);
    out.push(f);
    if (out.length >= FOUND) break;
  }
  if (found.size > 64) found.clear();
  found.set(key, { at: Date.now(), out });
  return out;
}

async function catalogRoute(url, res, reply) {
  if (url.pathname === '/api/radio/click') {
    // The catalogue's own request: count a play. Fire and forget — nobody waits on it.
    const uuid = url.searchParams.get('uuid') || '';
    if (!/^[0-9a-f-]{36}$/i.test(uuid)) return reply(res, 400, { error: 'not a station' });
    catalog.get('/json/url/' + uuid).catch(() => {});
    return reply(res, 200, { ok: true });
  }
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  const tag = url.searchParams.get('tag') || '';
  if (tag && !GENRES.includes(tag)) return reply(res, 400, { error: 'unknown genre' });
  if (!tag && q.length < 2) return reply(res, 400, { error: 'too short' });
  try {
    return reply(res, 200, { stations: await search({ q, tag }) });
  } catch (e) {
    return reply(res, 200, { stations: [], error: e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'silent' });
  }
}

// The stream routes belong to the owner — the check, the title and the catalogue. A
// guest's receiver plays streams just the same — <audio> needs no server — but it does
// not get to send this server to arbitrary addresses or words: those are the owner's,
// the sound is everyone's.
async function streamRoute(url, res, reply, ctx) {
  const owner = ctx && ctx.isOwner ? await ctx.isOwner() : false;
  if (!owner) return reply(res, 403, { error: 'owner only' });
  if (url.pathname === '/api/radio/search' || url.pathname === '/api/radio/click') return catalogRoute(url, res, reply);
  const target = url.searchParams.get('url') || '';
  if (url.pathname === '/api/radio/probe') return reply(res, 200, await probe(target));
  let u;
  try { u = new URL(target); } catch { return reply(res, 400, { error: 'not a url' }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return reply(res, 400, { error: 'not a url' });
  return reply(res, 200, await nowPlaying(u.href));
}

// The cover of a wave for the pixel body. It is the server that goes outside, not the
// page: the address of the picture is taken from Spotify's oEmbed and accepted only from
// its own CDN.
export async function route(url, req, res, send, ctx) {
  if (/^\/api\/radio\/(probe|now|search|click)$/.test(url.pathname)) {
    return streamRoute(url, res, (...a) => { send(...a); return true; }, ctx);
  }
  if (url.pathname !== '/api/cover') return false;
  // In the core the body was written as `return send(...)`, and the returned value
  // interested nobody. Here it decides whether the module took the request: returning
  // undefined, a module would say "not mine", and the core would try to answer a second
  // time into the same headers. So we answer through a wrapper that says "taken".
  const reply = (...a) => { send(...a); return true; };
    // The player knows the cover of the current track by direct address, the built-in one only the uri of a wave.
  const direct = url.searchParams.get('img');
  if (direct) {
    try {
      const src = new URL(direct);
      if (!/(^|\.)scdn\.co$/.test(src.hostname)) return reply(res, 502, { error: 'unexpected cover host' });
      const hitDirect = covers.get(direct);
      if (hitDirect) return reply(res, 200, hitDirect.buf, hitDirect.type);
      const entry = await fetchCover(src);
      if (covers.size > 64) covers.clear();
      covers.set(direct, entry);
      return reply(res, 200, entry.buf, entry.type);
    } catch (e) {
      return reply(res, 502, { error: e.message });
    }
  }

  const uri = url.searchParams.get('uri') || '';
  const m = uri.match(/^spotify:(playlist|album|track|artist|show|episode):([A-Za-z0-9]+)$/);
  if (!m) return reply(res, 400, { error: 'not a spotify uri' });
  const hit = covers.get(uri);
  if (hit) return reply(res, 200, hit.buf, hit.type);
  try {
    const page = `https://open.spotify.com/${m[1]}/${m[2]}`;
    const meta = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(page)}`,
      { signal: AbortSignal.timeout(8000) }).then((r) => r.json());
    const thumb = new URL(meta.thumbnail_url || '');
    if (!/(^|\.)scdn\.co$/.test(thumb.hostname)) return reply(res, 502, { error: 'unexpected cover host' });
    const entry = await fetchCover(thumb);
    if (covers.size > 32) covers.clear();
    covers.set(uri, entry);
    return reply(res, 200, entry.buf, entry.type);
  } catch (e) {
    return reply(res, 502, { error: e.message });
  }
}
