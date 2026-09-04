// Кто вообще может достучаться до порта.
//
// До 30 августа 2026 ответа на этот вопрос не было ни одного: `server.listen(PORT)`
// без хоста — это `0.0.0.0`, то есть офис отвечал всей сети Wi-Fi, а проверок не
// было никаких. Сосед по кафе, знающий порт, читал транскрипты всех сессий
// целиком через /api/chat и открывал файлы через /api/file. Проверено живьём
// тогда же: с LAN-адреса этой машины приходило 200 OK.
//
// Это НЕ про гостей. `settings.access` решает, кого офис пускает как человека —
// хозяин, приглашённый, никто. Здесь решается, с каких адресов вообще
// принимаются запросы. Вопросы разные, секреты разные, поэтому и ключ свой:
// `settings.network`. Сложить их в один — значит однажды выдать наружу токен
// хозяина, приняв его за сетевой.
import crypto from 'node:crypto';

const COOKIE = 'valey_net';

// Петля — это свои: браузер на этой же машине не должен ничего знать про
// токены, иначе офис перестаёт открываться по `npm start`, ради чего он и
// написан. Сравнение строгое, по полному адресу: «начинается на 127.» пустило
// бы сюда 127.0.0.1.evil.com.
export function isLocal(req) {
  // Пришло через посредника — значит не «с этой машины», чей бы адрес ни был в
  // сокете: туннель (cloudflared, ngrok, любой обратный прокси) соединяется с
  // офисом с петли. До 3 сентября 2026 это знал только isOwner, а гейт нет —
  // и запрос из туннеля проходил порог как свой, без токена. Заголовки ставит
  // сам посредник; страница из браузера тоже может их поставить, но тогда она
  // сама отказывается от петли и получает то, что получил бы посторонний.
  if (proxied(req)) return false;
  const a = (req.socket && req.socket.remoteAddress) || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

export const PROXIED = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded'];
export const proxied = (req) => PROXIED.some((h) => req.headers && req.headers[h]);

export function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// Сравнение постоянного времени: токен проверяется на каждом запросе, включая
// статику, и побайтовое сравнение рассказывает о себе таймингами.
function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookieToken(req) {
  const raw = (req.headers && req.headers.cookie) || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    // Кука приходит с чужой машины и разбирается до любой проверки. Битый
    // процент в ней — URIError, и до 3 сентября 2026 он ронял весь офис одним
    // запросом без токена. Битая кука — это просто не токен.
    if (k === COOKIE) { try { return decodeURIComponent(v.join('=')); } catch { return ''; } }
  }
  return '';
}

// Кука без Secure — сознательно: наружу это ходит по http (туннель, LAN), и с
// Secure она просто не сохранится, а офис молча перестанет открываться на
// телефоне. HttpOnly и SameSite остаются.
function cookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`;
}

/**
 * Пускать ли запрос. Возвращает `{ ok: true }`, `{ ok: false, reason }` или
 * `{ ok: true, setCookie }` — последнее когда токен приехал строкой в адресе:
 * его надо запомнить кукой и убрать из URL. Секрет в адресной строке остаётся
 * в истории браузера, в логах и в заголовке Referer, поэтому живёт он там ровно
 * один запрос — столько, сколько нужно, чтобы его один раз набрали на телефоне.
 */
export function check(req, url, network) {
  if (isLocal(req)) return { ok: true };
  if (!network || !network.external || !network.token) return { ok: false, reason: 'closed' };

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer && same(bearer, network.token)) return { ok: true };
  const fromCookie = cookieToken(req);
  if (fromCookie && same(fromCookie, network.token)) return { ok: true };
  const query = url.searchParams.get('token') || '';
  if (query && same(query, network.token)) return { ok: true, setCookie: cookie(network.token) };
  return { ok: false, reason: 'token' };
}
