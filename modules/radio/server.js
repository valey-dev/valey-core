// Радио — серверная половина.
//
// Секрета здесь нет: у PKCE его не бывает, наружу уходит только client id
// приложения, заведённого самим человеком. Сервер нужен для другого — он
// ходит за обложкой, чтобы адрес картинки не разбирала страница.
import { covers } from './covers.js';

export const defaults = () => ({
  // приложение Spotify, заведённое пользователем: только client id
  spotify: { clientId: '' },
});

export const merge = (prev, patch) => ({
  spotify: { ...prev.spotify, ...(patch.spotify || {}) },
});

// Обложка волны для пиксельного корпуса. Наружу ходит сервер, а не страница:
// адрес картинки берётся из oEmbed Spotify и принимается только с его же CDN.
export async function route(url, req, res, send) {
  if (url.pathname !== '/api/cover') return false;
  // В ядре тело писалось как `return send(...)`, и возвращённое значение никого
  // не интересовало. Здесь оно решает, забрал ли модуль запрос: вернув undefined,
  // модуль сказал бы «не мой», и ядро попыталось бы ответить вторым разом в те
  // же заголовки. Поэтому отвечаем через обёртку, которая говорит «забрал».
  const reply = (...a) => { send(...a); return true; };
    // Плеер знает обложку текущего трека прямым адресом, встроенный — только uri волны.
  const direct = url.searchParams.get('img');
  if (direct) {
    try {
      const src = new URL(direct);
      if (!/(^|\.)scdn\.co$/.test(src.hostname)) return reply(res, 502, { error: 'unexpected cover host' });
      const hitDirect = covers.get(direct);
      if (hitDirect) return reply(res, 200, hitDirect.buf, hitDirect.type);
      const img = await fetch(src, { signal: AbortSignal.timeout(8000) });
      const entry = { buf: Buffer.from(await img.arrayBuffer()), type: img.headers.get('content-type') || 'image/jpeg' };
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
    const img = await fetch(thumb, { signal: AbortSignal.timeout(8000) });
    const buf = Buffer.from(await img.arrayBuffer());
    const entry = { buf, type: img.headers.get('content-type') || 'image/jpeg' };
    if (covers.size > 32) covers.clear();
    covers.set(uri, entry);
    return reply(res, 200, entry.buf, entry.type);
  } catch (e) {
    return reply(res, 502, { error: e.message });
  }
  return true;
}
