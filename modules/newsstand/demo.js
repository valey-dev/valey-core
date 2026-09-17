// The papers of the picture office: invented channels, in the markup t.me/s
// serves, and a picture drawn here rather than fetched.
//
// The office goes to Telegram for real papers, and a public screenshot of a
// real channel is a screenshot of real people's posts — the rule about invented
// data covers exactly this. So v0.45.0 shipped its note with a photograph of an
// empty stand: the feature had nothing it was allowed to show. With
// VALEY_PICTURE=1 (tools/lib/office.mjs, PICTURE_ENV) the stand reads these
// pages instead, any channel name gets a paper, and the office makes no request
// at all.
//
// The markup is the stand's own: test-feed.mjs builds its cases with the same
// two functions, so a paper in a picture and a paper under test cannot drift
// apart. Only the words differ — there they are Russian, to check the decoding.
import zlib from 'node:zlib';

// One post, as t.me/s writes it: the wrapper carries the channel and the number,
// the picture rides in a background-image, and the footer holds views and date.
export const post = (ch, id, { text = '', photo = '', views = '1.2K', date = '2026-09-12T11:32:00+00:00' } = {}) => `
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="${ch}/${id}">
  <div class="tgme_widget_message_bubble">
    ${photo ? `<a class="tgme_widget_message_photo_wrap 1 2" href="https://t.me/${ch}/${id}" style="width:800px;background-image:url('${photo}')"></a>` : ''}
    ${text ? `<div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>` : ''}
    <div class="tgme_widget_message_footer"><div class="tgme_widget_message_info">
      <span class="tgme_widget_message_views">${views}</span>
      <a class="tgme_widget_message_date" href="https://t.me/${ch}/${id}"><time datetime="${date}" class="time">14:32</time></a>
    </div></div>
  </div></div></div>`;

// A channel's page: the header with the name, the subscriber counter and the
// description, then the history, newest last — the preview's own order.
export const page = (ch, posts, { title = 'Тихая сборка', about = 'о сборках, релизах и тишине в логах', subscribers = '12.4K', before = 4100 } = {}) => `<!DOCTYPE html><html><body>
<div class="tgme_channel_info"><div class="tgme_channel_info_header">
  <div class="tgme_channel_info_header_title_wrap"><div class="tgme_channel_info_header_title"><span dir="auto">${title}</span></div>
  <div class="tgme_channel_info_header_labels"><i class="verified-icon"> ✔</i></div></div></div>
  <div class="tgme_channel_info_counters"><div class="tgme_channel_info_counter"><span class="counter_value">${subscribers}</span> <span class="counter_type">subscribers</span></div></div>
  <div class="tgme_channel_info_description">${about}</div>
</div>
<section class="tgme_channel_history js-message_history">
  ${before ? `<div class="tgme_widget_message_centered js-messages_more_wrap"><a href="/s/${ch}?before=${before}" class="tme_messages_more js-messages_more" data-before="${before}"></a></div>` : ''}
  ${posts.join('\n')}
</section></body></html>`;

// The picture address the invented posts carry. It looks like Telegram's CDN
// because the page has to look like Telegram's: what answers it is the office
// itself, and only in the picture office.
export const PHOTO = 'https://cdn4.telesco.pe/file/valey-demo-halftone.jpg';

// Two papers, so the stand has tabs and the flag has something to count. The
// company is the invented one the release notes and the demo video use.
const PAPERS = [
  {
    name: 'quiet_build', title: 'The quiet build', subscribers: '12.4K',
    about: 'builds, releases and silence in the logs',
    posts: [
      { id: 4127, photo: PHOTO, views: '3.4K', text: 'Friday release went out with nothing rolled back<br/><br/>Third week of a green run in a row. The cart calculates the discount, the chart keeps its timezone, and nobody was woken up at night.' },
      { id: 4125, text: 'The dependency cache moved<br/>A build downloads 400 MB less than it did in August.' },
      { id: 4124, text: 'Quote of the week<br/><br/><blockquote>A green run does not mean it works. It means nothing we thought to ask has an answer we did not expect.</blockquote>' },
    ],
  },
  {
    name: 'pixel_dnya', title: 'Pixel of the day', subscribers: '3.1K',
    about: 'one screen a day, and why it is drawn that way',
    posts: [
      { id: 812, photo: PHOTO, views: '1.9K', text: 'A lamp on the desk<br/><br/>Amber while somebody waits on you, green once every agent is done. Six pixels, and the whole floor reads it from the door.' },
      { id: 811, text: 'Halftone, not a gradient<br/>A dot grid survives being stretched by whole pixels; a gradient turns into bands.' },
    ],
  },
];

const paperFor = (name) => PAPERS.find((p) => p.name === name) || PAPERS[0];

// The page a picture office serves for a channel. Any name gets a paper — the
// recipe types whichever address the frame wants — and the older issue is the
// same paper one step shorter, so turning a page back has somewhere to go.
export function demoPage(name, before = 0) {
  const paper = paperFor(name);
  const posts = before ? paper.posts.slice(1) : paper.posts;
  return page(name, posts.map((p) => post(name, p.id, p)),
    { title: paper.title, about: paper.about, subscribers: paper.subscribers, before: before ? 0 : paper.posts[paper.posts.length - 1].id - 9 });
}

// ------------------------------------------------------------ the picture
// A halftone square, drawn here: a picture in a public note may not be a file
// somebody found, and a paper without a picture does not show what the paper is
// for. Grey dots on paper, the size a lead post's photograph is shown at.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

let cached = null;
export function picture(width = 480, height = 320) {
  if (cached) return cached;
  // A halftone photograph of a desk lamp: the brightness is a soft glow around
  // a point, and every cell of the grid answers it with a dot whose radius
  // grows as the light falls. Dots rather than a gradient on purpose — the
  // office stretches a picture by whole pixels, and a gradient turns into
  // bands, which is also what the paper's own post says.
  const cell = 8;
  const glow = (x, y) => {
    const dx = (x - width * 0.42) / (width * 0.38);
    const dy = (y - height * 0.38) / (height * 0.42);
    const light = Math.exp(-(dx * dx + dy * dy) * 1.6);
    const desk = y > height * 0.72 ? 0.35 : 0;      // the desk it stands on
    return Math.min(1, light + desk);
  };
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width + 1);            // the leading filter byte stays 0
    for (let x = 0; x < width; x++) {
      const cx = Math.floor(x / cell) * cell + cell / 2;
      const cy = Math.floor(y / cell) * cell + cell / 2;
      const dist = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      // 0.8 of a half-cell at the darkest: at a full one the dots touch and
      // the shadow goes solid black, which is a blot rather than a photograph.
      const radius = (cell / 2) * 0.8 * Math.pow(1 - glow(cx, cy), 0.75);
      row[x + 1] = dist < radius ? 0x2b : 0xe4;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0;                         // 8 bits, greyscale
  cached = {
    buf: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
    type: 'image/png',
  };
  return cached;
}
