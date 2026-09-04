// node tools/test-origin.mjs — кто говорит с офисом с этой же машины.
//
// Всё с петли считается хозяйским, и это доверие достаётся любой вкладке того
// же браузера. 3 сентября 2026 ревью показало, чего это стоило: чужая страница
// POST-ом в /api/settings меняла токен хозяина и режим доставки, а через DNS
// rebinding читала снимок и слала /api/task с deliver — то есть запускала
// claude --resume с bypassPermissions. Стенд проверяет три признака, которые
// ставит браузер и не подделать скриптом: Origin, Sec-Fetch-Site и Host.
//
// Здесь же — то, от чего офис падал: битый JSON в открытую до входа ручку,
// тело без конца, массив вместо объекта. Каждая проверка заканчивается
// вопросом «жив ли сервер», потому что ответ 400 на мёртвом офисе не бывает.
import http from 'node:http';
import { fileOwners } from '../server/agents.js';
import { startOffice } from './lib/office.mjs';

const OWNER = 'origin-owner-0001';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

// ------------------------------------------------ чьи файлы: без сервера
{
  const snap = { agents: [
    { id: 'a', files: [{ path: '/p/a.md' }], artifacts: [] },
    { id: 'b', files: [], artifacts: [{ path: '/p/b.png' }] },
    { id: 'c', files: [{ path: '/p/a.md' }], artifacts: [] },
  ] };
  ok('файл из транскрипта знает всех своих агентов', JSON.stringify(fileOwners('/p/a.md', snap)) === '["a","c"]', fileOwners('/p/a.md', snap));
  ok('артефакт — тоже', JSON.stringify(fileOwners('/p/b.png', snap)) === '["b"]', fileOwners('/p/b.png', snap));
  ok('чужой путь ничей', fileOwners('/etc/hosts', snap).length === 0, fileOwners('/etc/hosts', snap));
}

// private — режим, в котором петля и есть хозяин; именно тут дыра и жила.
const { base, port: PORT, stop } = await startOffice({
  settings: { access: { mode: 'private', token: OWNER, invites: [] } },
  claudeDir: '/nonexistent-claude-dir',
});

// Не fetch, а node:http: fetch в Node молча выбрасывает заголовок Host, и
// первый прогон этого стенда 3 сентября 2026 слал своё имя вместо чужого —
// три «провала» сервера, который отвечал правильно. Origin и Sec-Fetch-Site
// оба клиента ставят как есть; это и позволяет сыграть за чужую страницу.
const req = (p, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const r = http.request(base + p, { method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      let j = null;
      try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* не JSON */ }
      resolve({ status: res.statusCode, j, h: res.headers });
    });
  });
  r.on('error', reject);
  r.end(body);
});
const json = (p, body, headers = {}) =>
  req(p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const alive = async (name) => {
  const r = await req('/api/whoami').catch(() => ({ status: 0 }));
  ok(`${name} — офис жив`, r.status === 200 && r.j && r.j.owner === true, r.status);
};

try {
  // -------------------------------------------------------------- rebinding
  const bound = await req('/', { headers: { host: 'evil.example' } });
  ok('чужое имя на петле — страницу не отдают, и отвечают как закрытый офис', bound.status === 404, bound.status);
  const boundApi = await req('/api/state', { headers: { host: `evil.example:${PORT}` } });
  ok('и снимок под чужим именем не отдают', boundApi.status === 404, boundApi.status);
  for (const h of [`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`, 'localhost']) {
    const own = await req('/api/state', { headers: { host: h } });
    ok(`своё имя (${h}) — как и было`, own.status === 200, own.status);
  }

  // ---------------------------------------------------------- чужая вкладка
  const foreign = await json('/api/settings', { lang: 'en' }, { origin: 'http://evil.example' });
  ok('POST с чужого Origin — отказ', foreign.status === 403 && foreign.j.errorKey === 'err.crossSite', foreign);
  const sfs = await json('/api/settings', { lang: 'en' }, { 'sec-fetch-site': 'cross-site' });
  ok('и по Sec-Fetch-Site: cross-site — тоже, даже без Origin', sfs.status === 403, sfs.status);
  const nul = await json('/api/task', { agentId: 'x', text: 'y' }, { origin: 'null' });
  ok('Origin: null — это не своя страница', nul.status === 403, nul.status);
  const own = await json('/api/settings', { lang: 'ru' }, { origin: `http://127.0.0.1:${PORT}` });
  ok('свой Origin — настройки сохраняются', own.status === 200 && own.j.ok === true, own);
  const ownName = await json('/api/settings', { lang: 'ru' }, { origin: `http://localhost:${PORT}`, host: `localhost:${PORT}` });
  ok('свой Origin по имени localhost — тоже', ownName.status === 200, ownName.status);
  const noOrigin = await json('/api/settings', { lang: 'ru' });
  ok('без Origin вовсе (curl, тесты) — верим', noOrigin.status === 200, noOrigin.status);
  const foreignGet = await req('/api/state', { headers: { origin: 'http://evil.example' } });
  ok('GET с чужого Origin отвечают: прочитать его чужая страница всё равно не сможет', foreignGet.status === 200, foreignGet.status);
  const beacon = await json('/api/gone', { id: 'nobody' }, { 'sec-fetch-site': 'same-origin' });
  ok('маячок закрытой вкладки проходит', beacon.status === 200, beacon.status);
  const foreignBeacon = await json('/api/gone', { id: 'nobody' }, { 'sec-fetch-site': 'cross-site' });
  ok('а чужой маячок — нет', foreignBeacon.status === 403, foreignBeacon.status);

  // -------------------------------------------------------------- тип тела
  const plain = await req('/api/settings', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"lang":"en"}' });
  ok('JSON под видом text/plain — не принимают', plain.status === 415 && plain.j.errorKey === 'err.notJson', plain);
  const bare = await req('/api/enter', { method: 'POST', body: '{"code":"x"}' });
  ok('и без заголовка вовсе — тоже, даже в открытую ручку', bare.status === 415, bare.status);
  const charset = await req('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"lang":"ru"}' });
  ok('application/json с charset — это всё ещё JSON', charset.status === 200, charset.status);

  // ---------------------------------------------------- от чего офис падал
  const broken = await req('/api/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' });
  ok('битый JSON в /api/enter — 400, а не смерть', broken.status === 400 && broken.j.errorKey === 'err.badJson', broken);
  await alive('после битого JSON');
  const arr = await req('/api/access/answer', { method: 'POST', headers: { 'content-type': 'application/json', 'x-valey-owner': OWNER }, body: '[1,2]' });
  ok('массив вместо объекта — 400', arr.status === 400, arr.status);
  await alive('после массива');
  const empty = await req('/api/invite/revoke', { method: 'POST', headers: { 'content-type': 'application/json', 'x-valey-owner': OWNER }, body: '' });
  ok('пустое тело — пустой объект, как и раньше', empty.status === 200, empty.status);
  const huge = await req('/api/task', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId: 'x', text: 'я'.repeat(100 * 1024) }),
  });
  ok('тело без конца — 413, а не память до конца', huge.status === 413 && huge.j.errorKey === 'err.tooBig', huge);
  await alive('после тела в сто килобайт');
  const method = await req('/api/enter', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
  ok('чужой метод в ручку входа — не 500', method.status !== 500, method.status);
  await alive('после чужого метода');

  // ------------------------------------------------------------ модули
  // Проверка привязана к тому, какие модули доехали до сборки, а не к радио:
  // без папки modules/ (бесплатная сборка) спрашивать про spotify не у кого,
  // и стенд, требующий его всегда, красный ровно там, где всё правильно.
  const mods = (await req('/api/modules')).j || [];
  if (mods.some((m) => m.id === 'radio')) {
    const boot = await req('/api/settings');
    ok('секция модуля есть в настройках с первого запроса, до любого сохранения',
      boot.status === 200 && boot.j && boot.j.settings && 'spotify' in boot.j.settings, boot.j && Object.keys(boot.j.settings || {}));
  } else {
    ok('модулей в сборке нет — про их настройки и не спрашиваем', true, mods.length);
  }

  // --------------------------------------------------------------- файлы
  const file = await req('/api/file?path=' + encodeURIComponent('/etc/hosts'));
  ok('файл не из транскрипта не отдают', file.status === 403, file.status);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.message);
} finally {
  await stop();
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
