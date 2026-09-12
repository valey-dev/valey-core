// Reading the public web feed of a Telegram channel, t.me/s/<name>.
//
// No network here and no DOM: a string of HTML goes in, a plain object comes
// out. The server fetches, the stand feeds this file invented pages — the
// markup changes under us one day, and that day should be caught by a stand
// rather than by a newspaper that quietly goes blank.
//
// The feed is Telegram's own preview page, not an API. It is read by class
// names (tgme_widget_message_*), and everything that is not recognised is
// dropped rather than guessed at: a post we cannot read is left out of the
// issue, not printed as a row of markup.

// A username as Telegram allows it: 5–32 characters, a letter first, then
// letters, digits and underscores. Private invitations (t.me/+…, joinchat) do
// not match on purpose — they have no public feed and never will.
const NAME_RE = /^[a-z][a-z0-9_]{3,31}$/;
// Service paths of t.me that look like names and are not channels.
const NOT_NAMES = new Set(['joinchat', 'addstickers', 'addemoji', 'addlist', 'share', 'proxy', 'socks', 'login', 'contact', 'iv', 'boost', 'invoice']);

// Whatever a person pastes — t.me/name, https://t.me/s/name, @name, a link to
// one post — comes down to the name, lower-cased: Telegram does not tell
// @Durov from @durov, and neither should the list of papers.
export function normalizeChannel(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?(t|telegram)\.me\//i, '');
  s = s.replace(/^s\//i, '').replace(/^@/, '');
  s = s.split(/[/?#]/)[0].toLowerCase();
  return NAME_RE.test(s) && !NOT_NAMES.has(s) ? s : null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };

export function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Markup to text: line breaks stay line breaks, everything else is its letters.
// Custom emoji arrive as <i class="emoji"><b>🤝</b></i>, so stripping the tags
// leaves the emoji itself — which is exactly what should stay.
export function toText(html) {
  // A newline in the markup is only whitespace; the breaks are the <br>s.
  const s = String(html).replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(s).replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The inner HTML of the first <div> whose opening tag matches `re`, found by
// counting nested divs. A regex up to the next </div> worked on every post
// until a quote block turned up inside one.
export function innerDiv(html, re) {
  const m = re.exec(html);
  if (!m) return null;
  let at = html.indexOf('>', m.index) + 1;
  const start = at;
  let depth = 1;
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = at;
  let t;
  while ((t = tag.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return html.slice(start);
}

// A picture address is accepted only as https: the page also carries
// protocol-relative emoji sprites from telegram.org, and those are decoration.
const bgUrl = (s) => {
  const m = /background-image:url\('([^']+)'\)/.exec(s || '');
  return m && /^https:\/\//.test(m[1]) ? decode(m[1]) : null;
};

function parsePost(chunk) {
  const id = /data-post="[^"/]+\/(\d+)"/.exec(chunk);
  if (!id) return null;
  const textHtml = innerDiv(chunk, /<div class="tgme_widget_message_text[^"]*js-message_text[^"]*"/);
  const text = textHtml ? toText(textHtml) : '';
  const photoTag = /<a class="tgme_widget_message_photo_wrap[^>]*>/.exec(chunk);
  const videoTag = /<i class="tgme_widget_message_video_thumb[^>]*>/.exec(chunk);
  const photo = bgUrl(photoTag && photoTag[0]) || bgUrl(videoTag && videoTag[0]);
  const kind = photoTag ? 'photo' : videoTag ? 'video' : text ? 'text' : 'other';
  // A post with neither words nor a picture is a service line («channel
  // created») or something the preview page cannot show — a poll, a file. It
  // has nothing to print.
  if (!text && !photo) return null;
  const views = /<span class="tgme_widget_message_views">([^<]*)<\/span>/.exec(chunk);
  const date = /<time datetime="([^"]+)"/.exec(chunk);
  return {
    id: Number(id[1]),
    text,
    photo,
    kind,
    views: views ? decode(views[1]).trim() : '',
    date: date ? date[1] : '',
  };
}

export function parseFeed(html) {
  const s = String(html || '');
  // The exact class: a looser match found the _wrap around the title first and
  // printed the verified tick as part of the name.
  const title = innerDiv(s, /<div class="tgme_channel_info_header_title"/);
  const about = innerDiv(s, /<div class="tgme_channel_info_description[^"]*"/);
  const subs = /<span class="counter_value">([^<]*)<\/span>\s*<span class="counter_type">(?:subscribers|subscriber|подписчик[а-я]*)<\/span>/i.exec(s);
  const chunks = s.split(/<div class="tgme_widget_message_wrap/).slice(1);
  const posts = chunks.map(parsePost).filter(Boolean);
  // Newest first: that is how a paper is read, and the page lists them the other way.
  posts.sort((a, b) => b.id - a.id);
  const before = /data-before="(\d+)"/.exec(s);
  const after = /data-after="(\d+)"/.exec(s);
  return {
    title: title ? toText(title) : '',
    about: about ? toText(about) : '',
    subscribers: subs ? decode(subs[1]).trim() : '',
    posts,
    // `before` asks for the issue before this one; a feed that holds its very
    // first post has no older issue to offer.
    before: before ? Number(before[1]) : null,
    after: after ? Number(after[1]) : null,
    // A page that is neither a channel header nor a single post is not a
    // public channel: t.me/s answers a group or a private name with an
    // ordinary page that holds neither.
    isChannel: !!title || posts.length > 0,
  };
}

// The first line of a post becomes the headline, the rest the body. A
// headline longer than a line of a paper is cut at a word, and what is cut
// goes back to the body, so nothing written is lost to the layout.
export function splitHeadline(text, max = 90) {
  const t = String(text || '').trim();
  if (!t) return { head: '', body: '' };
  const nl = t.indexOf('\n');
  let head = nl < 0 ? t : t.slice(0, nl);
  let body = nl < 0 ? '' : t.slice(nl + 1).trim();
  if (head.length > max) {
    const cut = head.lastIndexOf(' ', max);
    const at = cut > max / 2 ? cut : max;
    body = (head.slice(at).trim() + (body ? '\n' + body : '')).trim();
    head = head.slice(0, at).trim() + '…';
  }
  return { head, body };
}
