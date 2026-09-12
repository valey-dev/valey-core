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

// The two stream routes belong to the owner. A guest's receiver plays streams just the
// same — <audio> needs no server — but it does not get to send this server to arbitrary
// addresses: the check and the title are the owner's, the sound is everyone's.
async function streamRoute(url, res, reply, ctx) {
  const owner = ctx && ctx.isOwner ? await ctx.isOwner() : false;
  if (!owner) return reply(res, 403, { error: 'owner only' });
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
  if (url.pathname === '/api/radio/probe' || url.pathname === '/api/radio/now') {
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
