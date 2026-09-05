// The radio — the server half.
//
// There is no secret here: PKCE does not have one, and only the client id of an
// application the person set up themselves goes outside. The server is needed for
// something else — it goes for the cover, so that the address of the picture is not
// taken apart by the page.
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

// The cover of a wave for the pixel body. It is the server that goes outside, not the
// page: the address of the picture is taken from Spotify's oEmbed and accepted only from
// its own CDN.
export async function route(url, req, res, send) {
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
