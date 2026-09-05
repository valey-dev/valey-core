// node tools/test-routes.mjs — маршруты офиса, в этом же процессе.
//
// Пять стендов до этого поднимали настоящий сервер отдельным процессом: спавн,
// ожидание порта, гашение. Так проверяется то, что переживает HTTP, и только
// оно; ветки вроде «файл слишком большой» или «путь вылез из web/» туда не
// попадали вовсе — их и не было в прогоне до 4 сентября 2026.
//
// `server/index.js` теперь отдаёт обработчик отдельно от запуска, и стенд
// вешает его на свой сервер на свободном порту. Настройки и каталог сессий
// свои: настоящие трогать нельзя, а живых агентов у стенда быть не должно.
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { freePort } from './lib/office.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', typeof got === 'string' ? got.slice(0, 200) : JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-routes-'));
const OWNER = 'routes-owner-0001';
const NET = 'routes-net-0001';
await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify({
  access: { mode: 'private', token: OWNER, invites: [] },
  weather: { enabled: false }, delivery: { mode: 'default' },
}, null, 2));
// Переменные — до импорта: и настройки, и каталог сессий читаются на нём.
process.env.VALEY_SETTINGS = path.join(dir, 'settings.json');
process.env.VALEY_CLAUDE_DIR = path.join(dir, 'no-claude');
delete process.env.VALEY_STAND;

const { createHandler, setSnapshot } = await import('../server/index.js');
const { patchSettings } = await import('../server/settings.js');

const port = await freePort();
const server = http.createServer(createHandler());
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const base = `http://127.0.0.1:${port}`;

// node:http, а не fetch: fetch выбрасывает заголовок Host и сам ходит по
// редиректам, а здесь проверяется и то, и другое.
const req = (p, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const r = http.request(base + p, { method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const buf = Buffer.concat(chunks);
      let j = null;
      try { j = JSON.parse(buf.toString('utf8')); } catch { /* не JSON */ }
      resolve({ status: res.statusCode, h: res.headers, j, text: buf.toString('utf8'), bytes: buf.length });
    });
  });
  r.on('error', reject);
  r.end(body);
});

try {
  // ------------------------------------------------------------- статика
  const home = await req('/');
  ok('корень отдаёт страницу офиса', home.status === 200 && /<title/i.test(home.text), home.status);
  const callback = await req('/callback');
  ok('/callback — та же страница: адрес возврата OAuth живёт в ядре',
    callback.status === 200 && callback.text === home.text, callback.status);
  const escape = await req('/../server/settings.json');
  ok('путь наружу из web/ не отдают', escape.status === 403 || escape.status === 404, escape.status);
  const dots = await req('/%2e%2e/server/index.js');
  ok('и в закодированном виде тоже', dots.status === 403 || dots.status === 404, dots.status);
  const missing = await req('/нет-такого.js');
  ok('чего нет — 404 текстом, а не пустотой', missing.status === 404 && missing.text === 'not found', missing.status);

  // -------------------------------------------------------------- модули
  const mods = await req('/api/modules');
  ok('список модулей — массив', mods.status === 200 && Array.isArray(mods.j), mods.j);
  const modEscape = await req('/modules/../server/index.js');
  ok('из папки модулей наружу тоже не выйти', modEscape.status === 403 || modEscape.status === 404, modEscape.status);

  // -------------------------------------------------------------- стенд
  const stand = await req('/api/stand');
  ok('без VALEY_STAND таблички нет', stand.status === 200 && stand.j.text === null, stand.j);
  const toggle = await req('/api/stand/toggle', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-valey-owner': OWNER }, body: '{"id":"radio","off":true}',
  });
  ok('и переключателя модулей — тоже', toggle.status === 404, toggle.status);

  // --------------------------------------------------------- /api/file
  const artifact = path.join(dir, 'работа.md');
  await fsp.writeFile(artifact, '# сделано\n');
  const huge = path.join(dir, 'огромный.png');
  const fh = await fsp.open(huge, 'w');
  await fh.truncate(9 * 1024 * 1024);   // разреженный: место на диске не занимает
  await fh.close();
  const page = path.join(dir, 'страница.html');
  await fsp.writeFile(page, '<h1>агент написал</h1>');
  const gone = path.join(dir, 'испарился.txt');

  setSnapshot({ agents: [{
    id: 'a1', name: 'Костя', project: 'rocket-shop',
    files: [{ path: artifact }, { path: huge }, { path: page }, { path: gone }],
    artifacts: [],
  }] });

  const notMine = await req('/api/file?path=' + encodeURIComponent('/etc/hosts'));
  ok('файл не из транскрипта — 403', notMine.status === 403, notMine.status);
  const mine = await req('/api/file?path=' + encodeURIComponent(artifact));
  ok('артефакт агента отдают', mine.status === 200 && mine.text.includes('сделано'), mine.status);
  ok('и с nosniff', mine.h['x-content-type-options'] === 'nosniff', mine.h);
  const html = await req('/api/file?path=' + encodeURIComponent(page));
  ok('страницу агента отдают вложением, а не исполняют',
    html.status === 200 && html.h['content-disposition'] === 'attachment', html.h);
  const big = await req('/api/file?path=' + encodeURIComponent(huge));
  ok('девять мегабайт — 413, и файл не читается целиком', big.status === 413, big.status);
  const vanished = await req('/api/file?path=' + encodeURIComponent(gone));
  ok('пропавший файл — 404', vanished.status === 404, vanished.status);

  // ------------------------------------------------------- сетевой гейт
  // Через посредника — значит снаружи. Закрытый офис отвечает 404: сканеру
  // незачем знать, что здесь кто-то живёт.
  const VIA = { 'x-forwarded-for': '203.0.113.7' };
  const closed = await req('/api/whoami', { headers: VIA });
  ok('закрытый офис снаружи — 404', closed.status === 404 && closed.j.errorKey === 'err.notFound', closed.j);
  const closedPage = await req('/', { headers: VIA });
  ok('и страницы снаружи не видно', closedPage.status === 404, closedPage.status);

  await patchSettings({ network: { external: true, token: NET } });
  const open = await req('/api/whoami', { headers: VIA });
  ok('открытый офис снаружи просит токен', open.status === 401 && open.j.errorKey === 'err.needToken', open.j);
  const withToken = await req('/api/whoami', { headers: { ...VIA, authorization: 'Bearer ' + NET } });
  ok('с токеном пускают', withToken.status === 200, withToken.status);

  // ------------------------------------------- токен из адреса уезжает в куку
  const viaQuery = await req('/?token=' + NET, { headers: VIA });
  ok('страницу с токеном в адресе отдают редиректом', viaQuery.status === 302, viaQuery.status);
  ok('и токен из адреса убран', viaQuery.h.location === '/', viaQuery.h.location);
  ok('а в куке он есть, HttpOnly и SameSite',
    /valey_net=/.test(viaQuery.h['set-cookie']?.[0] || '')
      && /HttpOnly/i.test(viaQuery.h['set-cookie']?.[0] || '')
      && /SameSite=Lax/i.test(viaQuery.h['set-cookie']?.[0] || ''), viaQuery.h['set-cookie']);
  const apiQuery = await req('/api/whoami?token=' + NET, { headers: VIA });
  ok('ручку по тому же токену отвечают сразу, без редиректа', apiQuery.status === 200, apiQuery.status);

  await patchSettings({ network: { external: false } });
  const shutAgain = await req('/api/whoami', { headers: VIA });
  ok('офис закрыли — снова 404', shutAgain.status === 404, shutAgain.status);
  const home2 = await req('/api/whoami');
  ok('а с этой машины он открыт, как и был', home2.status === 200 && home2.j.owner === true, home2.j);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.stack);
} finally {
  await new Promise((r) => server.close(r));
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
