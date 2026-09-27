// node modules/newsstand/test-feed.mjs — the newsstand reads a feed page and
// goes to the network only where it was told to.
//
// The pages here are invented: the same markup Telegram's t.me/s preview uses
// (class names, data-post, the «older issue» link), with made-up channels and
// posts. The network is a stand-in that answers what the case says and writes
// down every address it was asked for — the privacy claim in server.js is a
// list of things that must not be fetched, and that list is checked here.
import { parseFeed, normalizeChannel, splitHeadline, toText } from './feed.js';
import { route, merge, setup, _reset } from './server.js';
// The markup is built by the papers of the picture office, so a page under test
// and a page in a release picture cannot drift apart. The words here stay
// Russian: they are what checks the entity decoding.
import { post, page, PHOTO } from './demo.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const PIC = 'https://cdn4.telesco.pe/file/mug.jpg';
const sample = page('tihaya_sborka', [
  post('tihaya_sborka', 4125, { text: 'Кэш зависимостей переехал<br/>Сборка скачивает на 400 МБ меньше.' }),
  post('tihaya_sborka', 4127, { text: '<i class="emoji" style="background-image:url(\'//telegram.org/img/emoji/40/F09F8E89.png\')"><b>🎉</b></i> Пятничный релиз ушёл без единого отката<br/><br/>Третью неделю подряд &laquo;зелёный&raquo; прогон &amp; тишина.', photo: PIC, views: '3.4K' }),
  post('tihaya_sborka', 4126, {}),   // a service line: neither words nor a picture
  post('tihaya_sborka', 4124, { text: 'Цитата недели<blockquote>Зелёный прогон — это <div class="x">не значит</div>, что всё работает.</blockquote>' }),
]);

// ------------------------------------------------------------------ the parser
{
  const f = parseFeed(sample);
  ok('title without the verified tick', f.title === 'Тихая сборка', f.title);
  ok('about and subscribers', f.about === 'о сборках, релизах и тишине в логах' && f.subscribers === '12.4K', [f.about, f.subscribers]);
  ok('the service line is dropped', f.posts.length === 3, f.posts.map((p) => p.id));
  ok('newest first', f.posts.map((p) => p.id).join() === '4127,4125,4124', f.posts.map((p) => p.id));
  ok('the older-issue cursor', f.before === 4100, f.before);
  const lead = f.posts[0];
  ok('emoji kept, entities decoded, breaks kept', lead.text === '🎉 Пятничный релиз ушёл без единого отката\n\nТретью неделю подряд «зелёный» прогон & тишина.', lead.text);
  ok('photo address and kind', lead.photo === PIC && lead.kind === 'photo', [lead.photo, lead.kind]);
  ok('views and date', lead.views === '3.4K' && lead.date === '2026-09-12T11:32:00+00:00', [lead.views, lead.date]);
  ok('a div inside a quote does not cut the text', f.posts[2].text.includes('что всё работает'), f.posts[2].text);
  ok('a page with no channel is not a channel', parseFeed('<html><body>Telegram – a new era of messaging</body></html>').isChannel === false);
  ok('protocol-relative emoji is not a photo', parseFeed(page('x', [post('x', 1, { text: 'a', photo: '//telegram.org/img/e.png' })])).posts[0].photo === null);
}

// --------------------------------------------------------------- the headline
{
  ok('first line is the headline', JSON.stringify(splitHeadline('Заголовок\nтекст')) === JSON.stringify({ head: 'Заголовок', body: 'текст' }));
  const long = 'слово '.repeat(30).trim();
  const s = splitHeadline(long, 40);
  ok('a long first line is cut at a word and nothing is lost', s.head.endsWith('…') && s.head.length <= 41 && (s.head.slice(0, -1) + ' ' + s.body).replace(/\s+/g, ' ') === long, s);
  ok('toText folds tags and spaces', toText('a  <b>b</b>\n<br>c') === 'a b\nc', toText('a  <b>b</b>\n<br>c'));
}

// ------------------------------------------------------------ channel names
{
  const cases = [['t.me/Tihaya_Sborka', 'tihaya_sborka'], ['https://t.me/s/tihaya_sborka/4127', 'tihaya_sborka'], ['@coffee_and_code', 'coffee_and_code'],
    ['pixel_dnya', 'pixel_dnya'], ['https://telegram.me/pixel_dnya', 'pixel_dnya'], ['t.me/+AbCdEf', null], ['t.me/joinchat/AbCdEf', null],
    ['abc', null], ['1channel', null], ['t.me/share/url?x=1', null], ['', null]];
  for (const [inp, want] of cases) ok(`name ${JSON.stringify(inp)} → ${want}`, normalizeChannel(inp) === want, normalizeChannel(inp));
}

// ------------------------------------------------------------- the settings
{
  const m = merge({ newsstand: { channels: ['a_channel'] } }, { newsstand: { channels: ['@Tihaya_Sborka', 't.me/tihaya_sborka', 'bad name', 'pixel_dnya'] } });
  ok('the list is cleaned, lower-cased and deduplicated', m.newsstand.channels.join() === 'tihaya_sborka,pixel_dnya', m);
  const kept = merge({ newsstand: { channels: ['pixel_dnya'] } }, { lang: 'ru' });
  ok('a save that does not touch the list keeps it', kept.newsstand.channels.join() === 'pixel_dnya', kept);
  const many = merge({}, { newsstand: { channels: Array.from({ length: 20 }, (_, i) => `channel_${i}`) } });
  ok('at most twelve papers', many.newsstand.channels.length === 12, many.newsstand.channels.length);
}

// ------------------------------------------------------------- the network
let calls = [];
let answers = {};
globalThis.fetch = async (u, init = {}) => {
  const url = String(u);
  calls.push({ url, init });
  const a = answers[url] || { status: 404, body: '' };
  if (a instanceof Error) throw a;
  return {
    ok: a.status >= 200 && a.status < 300, status: a.status,
    headers: new Headers({ 'content-type': a.type || 'text/html' }),
    text: async () => a.body,
    arrayBuffer: async () => new Uint8Array(a.bytes || 3).buffer,
  };
};
let channels = [];
let isOwner = true;
setup({ settings: async () => ({ newsstand: { channels } }) });
const ask = async (path) => {
  let out = null;
  const send = (res, code, body, type) => { out = { code, body, type }; };
  const took = await route(new URL('http://office' + path), {}, {}, send, { isOwner: async () => isOwner });
  return { took, ...out };
};

{
  _reset(); calls = []; channels = [];
  const r = await ask('/api/newsstand');
  ok('an empty stand makes no request at all', r.code === 200 && r.body.channels.length === 0 && calls.length === 0, { r, calls });
  ok('a foreign path is not taken', (await ask('/api/cover')).took === false);
}

{
  _reset(); calls = []; channels = ['tihaya_sborka'];
  answers = { 'https://t.me/s/tihaya_sborka': { status: 200, body: sample } };
  const r1 = await ask('/api/newsstand');
  const r2 = await ask('/api/newsstand');
  ok('the stand lists the paper with its newest post', r1.body.channels[0].title === 'Тихая сборка' && r1.body.channels[0].latest === 4127, r1.body);
  ok('only t.me, and once within the quarter hour', calls.length === 1 && calls[0].url === 'https://t.me/s/tihaya_sborka' && calls[0].init.redirect === 'manual', calls);
  const iss = await ask('/api/newsstand/issue?ch=tihaya_sborka');
  ok('the issue comes from the cache', calls.length === 1 && iss.body.posts.length === 3, { calls: calls.length });
  ok('the picture goes through the office', iss.body.posts[0].photo === '/api/newsstand/img?u=' + encodeURIComponent(PIC), iss.body.posts[0].photo);
  const off = await ask('/api/newsstand/issue?ch=pixel_dnya');
  ok('a paper that is not on the stand is refused, not fetched', off.code === 404 && calls.length === 1, { off, calls });
  const typed = await ask('/api/newsstand/issue?ch=tihaya_sborka&before=17');
  ok('a hand-typed older issue is refused, not fetched', typed.code === 404 && calls.length === 1, { typed, calls });
  answers['https://t.me/s/tihaya_sborka?before=4100'] = { status: 200, body: page('tihaya_sborka', [post('tihaya_sborka', 4099, { text: 'старое' })], { before: 4050 }) };
  const older = await ask('/api/newsstand/issue?ch=tihaya_sborka&before=4100');
  ok('the older issue the feed offered is fetched', older.code === 200 && older.body.posts[0].id === 4099 && calls.at(-1).url.endsWith('?before=4100'), older);
}

{
  _reset(); calls = []; channels = ['tihaya_sborka'];
  answers = {
    'https://t.me/s/tihaya_sborka': { status: 200, body: sample },
    [PIC]: { status: 200, type: 'image/jpeg', bytes: 10 },
  };
  const evil = await ask('/api/newsstand/img?u=' + encodeURIComponent('https://evil.example/x.png'));
  ok('the proxy refuses an address no feed named', evil.code === 404 && calls.length === 0, { evil, calls });
  await ask('/api/newsstand/issue?ch=tihaya_sborka');
  const pic = await ask('/api/newsstand/img?u=' + encodeURIComponent(PIC));
  ok('a named picture is fetched without redirects', pic.code === 200 && pic.type === 'image/jpeg' && calls.at(-1).init.redirect === 'error', { code: pic.code, calls });
  answers[PIC] = { status: 200, type: 'text/html', bytes: 10 };
  _reset(); await ask('/api/newsstand/issue?ch=tihaya_sborka');
  const html = await ask('/api/newsstand/img?u=' + encodeURIComponent(PIC));
  ok('a picture that is not an image is refused', html.code === 502, html);
}

{
  _reset(); calls = []; channels = [];
  answers = {
    'https://t.me/s/closed_club': { status: 302, body: '' },
    'https://t.me/s/pixel_dnya': { status: 200, body: page('pixel_dnya', [post('pixel_dnya', 7, { text: 'пиксель' })], { title: 'Пиксель дня' }) },
  };
  isOwner = false;
  const guest = await ask('/api/newsstand/probe?ch=pixel_dnya');
  ok('a guest may not make the office fetch a name', guest.code === 403 && calls.length === 0, { guest, calls });
  isOwner = true;
  const closed = await ask('/api/newsstand/probe?ch=@closed_club');
  ok('a redirect means no public feed', closed.body.error === 'nofeed', closed.body);
  const good = await ask('/api/newsstand/probe?ch=t.me/pixel_dnya');
  ok('the owner probes a public channel', good.body.title === 'Пиксель дня' && good.body.name === 'pixel_dnya', good.body);
  const badName = await ask('/api/newsstand/probe?ch=t.me/+secret');
  ok('an invitation link is not a name', badName.code === 400, badName);
}

// ------------------------------------------------- the office for pictures
// With VALEY_PICTURE=1 the stand reads invented papers and makes no request at
// all: a public screenshot of a real channel is a screenshot of real people's
// posts. Until 17 September 2026 there was no seam for it, and the note for
// v0.45.0 went out with a photograph of an empty stand.
{
  process.env.VALEY_PICTURE = '1';
  _reset(); calls = []; answers = {}; channels = ['quiet_build', 'pixel_dnya'];
  const stand = await ask('/api/newsstand');
  ok('the picture office has papers on the stand', stand.body.channels.length === 2 && stand.body.channels[0].title === 'The quiet build', stand.body.channels);
  ok('and says so, so the page does not offer a channel that does not exist', stand.body.invented === true, stand.body.invented);
  const one = await ask('/api/newsstand/issue?ch=pixel_dnya');
  ok('and a paper has a lead post with a picture', one.body.posts[0].photo && one.body.posts[0].text.startsWith('A lamp on the desk'), one.body.posts[0]);
  const img = await ask('/api/newsstand/img?u=' + encodeURIComponent(PHOTO));
  ok('the picture is drawn here, as a PNG', img.code === 200 && img.type === 'image/png' && img.body.length > 100, { code: img.code, type: img.type });
  const older = await ask('/api/newsstand/issue?ch=pixel_dnya&before=' + one.body.before);
  ok('an older issue is there to turn back to', older.code === 200 && older.body.posts.length >= 1, older.body);
  // A real name typed into the picture office: no paper is put on it, and the
  // office does not go looking for the real one either. Until 17 September 2026
  // any name got the first invented paper — `xoykonline` came back titled «The
  // quiet build», which is an invented paper wearing somebody's address.
  _reset(); calls = []; channels = ['xoykonline'];
  const foreign = await ask('/api/newsstand/probe?ch=xoykonline');
  ok('a name nobody invented is refused, not dressed in a paper', foreign.body.error === 'invented' && !foreign.body.title, foreign.body);
  const stand2 = await ask('/api/newsstand');
  ok('and it stands on the shelf as invented-only, with no posts', stand2.body.channels[0].error === 'invented' && !stand2.body.channels[0].ids, stand2.body.channels[0]);
  ok('still nothing fetched', calls.length === 0, calls.map((c) => c.url));
  delete process.env.VALEY_PICTURE;
  _reset(); calls = []; channels = ['tihaya_sborka'];
  answers = { 'https://t.me/s/tihaya_sborka': { status: 200, body: sample } };
  const real = await ask('/api/newsstand');
  ok('a real stand is not marked invented', real.body.invented === undefined, real.body.invented);
}

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
