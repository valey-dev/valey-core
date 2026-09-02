// node tools/test-network.mjs — кого пускать в офис.
//
// Проверяется не «сравниваются ли строки», а решения, каждое из которых
// молча открывает наружу переписку всех сессий: петля всегда своя, закрытый
// офис снаружи не виден вообще, токен из адреса переезжает в куку, а похожий
// токен — это чужой токен.
import { check, isLocal, newToken } from '../server/network.js';
import { publicSettings } from '../server/settings.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const req = (addr, headers = {}) => ({ socket: { remoteAddress: addr }, headers });
const u = (q = '') => new URL('http://localhost:5177/api/state' + q);

const OPEN = { external: true, token: 'sekret-token-value' };
const SHUT = { external: false, token: 'sekret-token-value' };

// ------------------------------------------------------------------- петля

ok('127.0.0.1 — свой', isLocal(req('127.0.0.1')));
ok('::1 — свой', isLocal(req('::1')));
ok('v4 в v6-обёртке — свой', isLocal(req('::ffff:127.0.0.1')));
ok('сосед по Wi-Fi — не свой', !isLocal(req('192.168.10.42')));
// Адрес, начинающийся на 127 в тексте, но не петлевой: строковое сравнение
// «начинается с 127.» пустило бы сюда чужую машину.
ok('127.0.0.1.evil.com — не свой', !isLocal(req('127.0.0.1.evil.com')));

ok('свой ходит без токена', check(req('::1'), u(), OPEN).ok);
ok('свой ходит и в закрытый офис', check(req('::1'), u(), SHUT).ok);
ok('свой ходит, когда токена нет вовсе', check(req('::1'), u(), { external: false, token: '' }).ok);

// ------------------------------------------------------------ закрыто наружу

const shut = check(req('192.168.10.42'), u(), SHUT);
ok('закрытый офис снаружи не пускает', !shut.ok);
ok('и не признаётся, что он тут есть', shut.reason === 'closed', shut);

const noToken = check(req('192.168.10.42'), u(), { external: true, token: '' });
ok('открытый без токена — тоже закрыт', !noToken.ok && noToken.reason === 'closed', noToken);

// --------------------------------------------------------------- токен

ok('снаружи без токена — 401', check(req('192.168.10.42'), u(), OPEN).reason === 'token');
ok('Bearer пускает', check(
  req('192.168.10.42', { authorization: 'Bearer sekret-token-value' }), u(), OPEN).ok);
ok('bearer в нижнем регистре тоже', check(
  req('192.168.10.42', { authorization: 'bearer sekret-token-value' }), u(), OPEN).ok);
ok('кука пускает', check(
  req('192.168.10.42', { cookie: 'theme=dark; valey_net=sekret-token-value' }), u(), OPEN).ok);

const byQuery = check(req('192.168.10.42'), u('?token=sekret-token-value'), OPEN);
ok('токен из адреса пускает', byQuery.ok);
ok('и сразу переезжает в куку', /valey_net=sekret-token-value/.test(byQuery.setCookie || ''), byQuery.setCookie);
ok('кука HttpOnly и SameSite', /HttpOnly/.test(byQuery.setCookie) && /SameSite=Lax/.test(byQuery.setCookie));
ok('и без Secure — иначе по http она не сохранится', !/Secure/.test(byQuery.setCookie));

// Приставка и обрезок — это не токен. Сравнение по длине ловит оба.
ok('обрезанный токен не пускает', !check(req('1.2.3.4', { authorization: 'Bearer sekret-token' }), u(), OPEN).ok);
ok('токен с хвостом не пускает', !check(req('1.2.3.4', { authorization: 'Bearer sekret-token-value-x' }), u(), OPEN).ok);
ok('пустой токен не пускает', !check(req('1.2.3.4', { authorization: 'Bearer ' }), u(), OPEN).ok);

const a = newToken(), b = newToken();
ok('токен длинный и разный', a.length >= 32 && a !== b, a.length);
ok('токен без символов, ломающих адрес', /^[A-Za-z0-9_-]+$/.test(a), a);

// ------------------------------------------------------- токен не утекает

// Ключ здесь `network`, а не `access`: в ядре `access` уже занят гостевой
// системой и хранит токен ХОЗЯИНА. Сложить два секрета в одно поле — значит
// однажды отдать наружу не тот.
const pub = publicSettings({ figma: { token: 'f', files: {} }, network: OPEN });
ok('сетевой токен не уходит на страницу', pub.network.token === undefined, pub.network);
ok('но факт его наличия виден', pub.network.hasToken === true, pub.network);
ok('и external виден', pub.network.external === true, pub.network);

console.log(bad ? `\nпровалено: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
