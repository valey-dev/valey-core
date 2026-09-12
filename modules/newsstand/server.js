// The newsstand — the server half.
//
// This is the second place in the office that talks to the outside world, after
// the weather, and it is built to be read before it is run:
//
//   - It goes to exactly one host, t.me, for the public web feed of a channel
//     (t.me/s/<name>) — no login, no token, no phone number, no API key.
//   - It goes only for channels the owner put on the stand. With the list empty
//     it makes no request at all; a guest cannot add to the list, because the
//     list lives in the settings and only the owner writes those.
//   - The newest issue of a channel is fetched at most once every FRESH_MS;
//     older issues only when somebody turns the pages back, and they are kept.
//   - Pictures are fetched by this server and handed to the page, so the
//     browser never talks to Telegram. Only a picture address the feed itself
//     named is fetched — the proxy does not go where a page asks it to.
import { parseFeed, normalizeChannel } from './feed.js';

// How many papers fit on the stand. Not a technical ceiling: past a dozen the
// stand stops being something you read in the morning.
export const MAX_CHANNELS = 12;
export const FRESH_MS = 15 * 60 * 1000;
const OLD_MS = 6 * 60 * 60 * 1000;
const PAGE_MAX = 3 * 1024 * 1024;
const IMG_MAX = 5 * 1024 * 1024;

let ctx = null;
export function setup(c) { ctx = c; }

export const defaults = () => ({ newsstand: { channels: [] } });

// The list is replaced whole and cleaned on the way in: whatever the page sent,
// only valid names, each once, at most MAX_CHANNELS. Returned on every save,
// not only when the patch touches it — the core has already laid the raw patch
// over the settings, and this is what puts the cleaned list back on top.
export function merge(prev, patch) {
  const was = (prev && prev.newsstand && Array.isArray(prev.newsstand.channels)) ? prev.newsstand.channels : [];
  const next = patch && patch.newsstand && Array.isArray(patch.newsstand.channels) ? patch.newsstand.channels : was;
  const channels = [...new Set(next.map(normalizeChannel).filter(Boolean))].slice(0, MAX_CHANNELS);
  return { newsstand: { channels } };
}

// ------------------------------------------------------------------ the feed

const pages = new Map();     // `${name}:${before}` → { at, feed } | { at, error }
const pending = new Map();   // the same key → a promise, so ten tabs make one request
const pictures = new Set();  // picture addresses the feeds named; the proxy fetches nothing else
const images = new Map();    // address → { buf, type }
// The «older issue» cursors each feed handed out. Turning a page back is allowed
// only to a cursor Telegram itself gave: a number typed by hand would be one more
// request to t.me per number, and a guest can type numbers.
const cursors = new Set();   // `${name}:${before}`

const nofeed = () => Object.assign(new Error('no public feed'), { code: 'nofeed' });

async function fetchPage(name, before) {
  const url = `https://t.me/s/${name}` + (before ? `?before=${before}` : '');
  // A redirect is how t.me says «there is no public feed here»: a group, a
  // private name or no such name at all is sent on to t.me/<name>. Following it
  // would parse a landing page as an empty paper.
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
  if (r.status !== 200) throw nofeed();
  const text = await r.text();
  if (text.length > PAGE_MAX) throw new Error('feed page too big');
  const feed = parseFeed(text);
  if (!feed.isChannel) throw nofeed();
  for (const p of feed.posts) if (p.photo) pictures.add(p.photo);
  if (feed.before) cursors.add(`${name}:${feed.before}`);
  if (cursors.size > 4000) cursors.clear();
  if (pictures.size > 4000) pictures.clear();
  return feed;
}

// One issue: the newest when `before` is empty, otherwise the one before post
// `before`. An error is kept for as long as a page would be, so a channel that
// went private is not asked again on every poll.
export async function issue(name, before = 0) {
  const key = `${name}:${before || ''}`;
  const hit = pages.get(key);
  const ttl = before ? OLD_MS : FRESH_MS;
  if (hit && Date.now() - hit.at < ttl) return hit;
  if (pending.has(key)) return pending.get(key);
  const job = fetchPage(name, before)
    .then((feed) => ({ at: Date.now(), feed }))
    .catch((e) => ({ at: Date.now(), error: e.code || 'network' }))
    .then((entry) => {
      pending.delete(key);
      // A network error is not remembered: the next poll should try again,
      // unlike «no public feed», which will still be true in a quarter of an hour.
      if (entry.feed || entry.error === 'nofeed') {
        pages.set(key, entry);
        if (pages.size > 80) pages.delete(pages.keys().next().value);
      }
      return entry;
    });
  pending.set(key, job);
  return job;
}

// What a page may see of a post: the picture goes through this server.
const forPage = (p) => ({ ...p, photo: p.photo ? `/api/newsstand/img?u=${encodeURIComponent(p.photo)}` : null });

async function channelsOnStand() {
  const s = ctx && ctx.settings ? await ctx.settings() : {};
  return (s.newsstand && Array.isArray(s.newsstand.channels)) ? s.newsstand.channels : [];
}

// Only a picture from Telegram's own CDN, only one a feed named, only an image,
// never through a redirect, and never bigger than a picture needs to be.
const CDN = /(^|\.)(telesco\.pe|cdn-telegram\.org|telegram-cdn\.org)$/;
async function fetchImage(src) {
  const u = new URL(src);
  if (u.protocol !== 'https:' || !CDN.test(u.hostname)) throw new Error('unexpected picture host');
  const r = await fetch(u, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!r.ok) throw new Error(`picture ${r.status}`);
  const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) throw new Error(`not an image: ${type || 'no type'}`);
  if (Number(r.headers.get('content-length') || 0) > IMG_MAX) throw new Error('picture too big');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > IMG_MAX) throw new Error('picture too big');
  return { buf, type };
}

export async function route(url, req, res, send, rctx = {}) {
  if (!url.pathname.startsWith('/api/newsstand')) return false;
  const reply = (...a) => { send(...a); return true; };
  const path = url.pathname.slice('/api/newsstand'.length) || '/';

  // The stand: every paper with its newest post, for the flag and the tabs.
  if (path === '/') {
    const names = await channelsOnStand();
    const list = await Promise.all(names.map(async (name) => {
      const e = await issue(name);
      if (!e.feed) return { name, error: e.error };
      // the ids of the newest issue: the page counts what it has not read yet
      return { name, title: e.feed.title || name, latest: e.feed.posts.length ? e.feed.posts[0].id : null, ids: e.feed.posts.map((p) => p.id) };
    }));
    return reply(res, 200, { channels: list, fresh: FRESH_MS });
  }

  // One issue of one paper. Only a paper that is on the stand: otherwise
  // anybody who can open the office could make this server fetch any name.
  if (path === '/issue') {
    const name = normalizeChannel(url.searchParams.get('ch'));
    if (!name || !(await channelsOnStand()).includes(name)) return reply(res, 404, { error: 'not on the stand' });
    const before = Math.max(0, parseInt(url.searchParams.get('before') || '0', 10) || 0);
    if (before && !cursors.has(`${name}:${before}`)) return reply(res, 404, { error: 'unknown issue' });
    const e = await issue(name, before);
    if (!e.feed) return reply(res, 502, { error: e.error });
    const f = e.feed;
    return reply(res, 200, {
      name, title: f.title || name, about: f.about, subscribers: f.subscribers,
      posts: f.posts.map(forPage), before: f.before, after: f.after, at: e.at,
    });
  }

  if (path === '/img') {
    const src = url.searchParams.get('u') || '';
    if (!pictures.has(src)) return reply(res, 404, { error: 'unknown picture' });
    const hit = images.get(src);
    if (hit) return reply(res, 200, hit.buf, hit.type, { 'cache-control': 'private, max-age=86400' });
    try {
      const entry = await fetchImage(src);
      if (images.size > 120) images.delete(images.keys().next().value);
      images.set(src, entry);
      return reply(res, 200, entry.buf, entry.type, { 'cache-control': 'private, max-age=86400' });
    } catch (e) {
      return reply(res, 502, { error: e.message });
    }
  }

  // Checking a name before it goes on the stand — the owner's alone, because it
  // is the one route where the caller chooses what this server fetches.
  if (path === '/probe') {
    if (!rctx.isOwner || !(await rctx.isOwner())) return reply(res, 403, { error: 'owner only' });
    const name = normalizeChannel(url.searchParams.get('ch'));
    if (!name) return reply(res, 400, { error: 'badname' });
    const e = await issue(name);
    if (!e.feed) return reply(res, 200, { name, error: e.error });
    return reply(res, 200, { name, title: e.feed.title || name });
  }

  return reply(res, 404, { error: 'no such route' });
}

// Test seam: the stand clears the caches between cases.
export function _reset() { pages.clear(); pending.clear(); pictures.clear(); images.clear(); cursors.clear(); }
