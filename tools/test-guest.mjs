// node tools/test-guest.mjs — кого пускают и что ему можно.
//
// Поднимает офис в режиме shared со своим файлом настроек: трогать настоящий
// нельзя, там живёт токен рабочего офиса, а стенду нужно и режим переключить,
// и токен знать заранее.
//
// Проверяется граница, а не кнопка. Кнопку у гостя мы прячем, но прятать — не
// значит запрещать: страница чужая, и всё, что она может послать, она пошлёт.
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.GUEST_PORT || 5392);
const base = `http://127.0.0.1:${PORT}`;
const TOKEN = 'test-owner-token-0001';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-guest-'));
const settingsFile = path.join(dir, 'settings.json');
await fsp.writeFile(settingsFile, JSON.stringify({
  access: { mode: 'shared', token: TOKEN, invites: [] },
  weather: { enabled: false }, delivery: { mode: 'default' },
}, null, 2));

const srv = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), VALEY_SETTINGS: settingsFile },
  stdio: 'ignore',
});
const stop = () => { try { srv.kill(); } catch { /* уже мёртв */ } };
process.on('exit', stop);

let GUEST = '';
const call = (p, { as = 'nobody', method = 'POST', body = {} } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (as === 'owner') headers['x-valey-owner'] = TOKEN;
  if (as === 'guest') headers['x-valey-guest'] = GUEST;
  return fetch(base + p, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
};

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { await fetch(base + '/api/whoami'); up = true; } catch { await wait(150); }
  }
  if (!up) throw new Error(`сервер не поднялся на ${PORT} — занят?`);

  // ------------------------------------------------- без приглашения никак
  const cold = await call('/api/state', { method: 'GET' });
  ok('без приглашения офис не показывают вовсе', cold.status === 403, cold.status);
  ok('и отказ объясняет, чего не хватает', cold.j && cold.j.errorKey === 'err.needCode', cold.j);
  const whoCold = await call('/api/whoami', { method: 'GET' });
  ok('но спросить, кто ты, можно всегда', whoCold.status === 200, whoCold.status);
  ok('и офис признаётся, что нужен код', whoCold.j.needsCode === true, whoCold.j);

  // ------------------------------------------------------------ дверь
  const made = await call('/api/invite', { as: 'owner', body: { name: 'Костя', from: 'Сергей' } });
  ok('хозяин делает приглашение', made.status === 200 && !!made.j.invite.code, made.status);
  ok('и в ссылке есть код', (made.j.url || '').includes(made.j.invite.code), made.j.url);
  ok('код не шестизначный — перебором по нему не ходят',
    made.j.invite.code.length >= 12, made.j.invite.code.length);

  const guestOnly = await call('/api/invite', { body: { name: 'сам себя' } });
  ok('гость приглашать не может', guestOnly.status === 403, guestOnly.status);

  const enter = await call('/api/enter', { body: { code: made.j.invite.code } });
  ok('по коду впускают', enter.status === 200 && !!enter.j.guest, enter.status);
  ok('и говорят, кто позвал', enter.j.from === 'Сергей', enter.j);
  GUEST = enter.j.guest;

  const again = await call('/api/enter', { body: { code: made.j.invite.code } });
  ok('второй раз по той же ссылке — нет', again.status === 403, again.status);
  ok('и причина названа', again.j.errorKey === 'err.codeUsed', again.j);
  const junkCode = await call('/api/enter', { body: { code: 'нет-такого' } });
  ok('чужой код не подходит', junkCode.j.errorKey === 'err.codeUnknown', junkCode.j);

  // -------------------------------------------------------- что гостю можно
  const look = await call('/api/state', { as: 'guest', method: 'GET' });
  ok('вошедший смотрит офис', look.status === 200, look.status);
  const here = await call('/api/here', { as: 'guest', body: { id: 'g1', name: 'Костя', x: 10, y: 10 } });
  ok('и ходит по нему', here.status === 200, here.status);
  const note = await call('/api/task', { as: 'guest', body: { agentId: 'нет-такого', text: 'привет' } });
  ok('и оставляет записку на столе', note.status !== 403, note.status);
  const stream = await fetch(base + '/api/stream?guest=' + encodeURIComponent(GUEST)).then((r) => r.status);
  ok('поток пускает по тому же пропуску в строке запроса', stream === 200, stream);
  // EventSource не умеет заголовки, поэтому в общем режиме хозяин без этого
  // терял собственный офис: страница жива, а поток ей отказывают.
  const ownerStream = await fetch(base + '/api/stream?owner=' + encodeURIComponent(TOKEN)).then((r) => r.status);
  ok('и хозяина в его собственный поток — тоже', ownerStream === 200, ownerStream);
  const noPass = await fetch(base + '/api/stream').then((r) => r.status);
  ok('а без пропуска поток закрыт', noPass === 403, noPass);

  // ------------------------------------------------------- что гостю нельзя
  const deliver = await call('/api/task', { as: 'guest', body: { agentId: 'x', text: 'y', deliver: true } });
  ok('отправить в чат нельзя', deliver.status === 403, deliver);
  ok('и отказ про право, а не про пропуск', deliver.j.errorKey === 'err.guest', deliver.j);
  const settings = await call('/api/settings', { as: 'guest', body: { lang: 'en' } });
  ok('менять настройки офиса нельзя', settings.status === 403, settings.status);
  const shot = await fetch(base + '/api/shot?name=x', {
    method: 'POST', headers: { 'x-valey-guest': GUEST }, body: 'data:image/png;base64,AA',
  }).then((r) => r.status);
  ok('писать кадры на чужой диск нельзя', shot === 403, shot);

  // ------------------------------------------------------- токен не течёт
  const seen = await fetch(base + '/api/settings', { headers: { 'x-valey-guest': GUEST } }).then((r) => r.text());
  ok('токена хозяина в настройках нет', !seen.includes(TOKEN), null);
  ok('и кода приглашения тоже', !seen.includes(made.j.invite.code), null);
  ok('и выданного гостевого токена', !seen.includes(GUEST), null);
  const list = await call('/api/invites', { as: 'owner', method: 'GET' });
  ok('в списке у хозяина кодов нет — ссылку он получил один раз',
    !JSON.stringify(list.j).includes(made.j.invite.code), list.j);
  ok('но видно, кого звали и вошёл ли он',
    list.j.invites[0].name === 'Костя' && list.j.invites[0].used === true, list.j.invites[0]);

  // ------------------------------------------------------------- выгнать
  const out = await call('/api/invite/revoke', { as: 'owner', body: { id: list.j.invites[0].id } });
  ok('хозяин гасит приглашение', out.status === 200, out.status);
  const after = await call('/api/state', { as: 'guest', method: 'GET' });
  ok('и выгнанный больше не смотрит', after.status === 403, after.status);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.message);
} finally {
  stop();
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
