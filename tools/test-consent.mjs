// node tools/test-consent.mjs — что гость видит об агенте и как это меняется.
//
// Умолчание проверяется первым: гостю уходит проекция, а не транскрипт. Это
// не про кнопки — панель можно нарисовать какой угодно, а вопрос в том, что
// уходит с машины по проводу.
//
// Офис свой, на своём порту и со своим файлом настроек: стенд переключает
// режим и знает токен заранее, трогать рабочий офис нельзя.
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.CONSENT_PORT || 5393);
const base = `http://127.0.0.1:${PORT}`;
const TOKEN = 'consent-owner-0001';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-consent-'));
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
const stateAs = (who) => call('/api/state', { as: who, method: 'GET' }).then((r) => r.j);

// Поля, которые видит хозяин и не должен видеть гость. Список из брифа:
// последняя реплика, запрос, файлы, ветка, путь проекта.
const SECRET = ['lastSaid', 'lastAsked', 'files', 'artifacts', 'branch', 'cwd', 'title', 'model', 'turns'];

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { await fetch(base + '/api/whoami'); up = true; } catch { await wait(150); }
  }
  if (!up) throw new Error(`сервер не поднялся на ${PORT} — занят?`);

  const made = await call('/api/invite', { as: 'owner', body: { name: 'Костя', from: 'Сергей' } });
  GUEST = (await call('/api/enter', { body: { code: made.j.invite.code } })).j.guest;
  ok('гость вошёл', !!GUEST, GUEST);

  // Офис читает живые сессии и транскрипты — первый снимок собирается не в ту
  // же миллисекунду, что стартует сервер. Ждём, пока в нём кто-нибудь появится.
  let asOwner = null;
  for (let i = 0; i < 40; i++) {
    asOwner = await stateAs('owner');
    if ((asOwner.agents || []).length) break;
    await wait(400);
  }
  if (!(asOwner.agents || []).length) throw new Error('в офисе нет ни одного агента — стенду не с чем работать');
  const agentId = asOwner.agents[0].id;

  // ------------------------------------------------------ умолчание
  const asGuest = await stateAs('guest');
  const a = asGuest.agents.find((x) => x.id === agentId);
  ok('гость видит агента', !!a, asGuest.agents.length);
  ok('и его имя, роль, комнату и состояние',
    !!a.name && !!a.roleKey && !!a.project && !!a.status, a);
  const leaked = SECRET.filter((k) => a[k] !== undefined);
  ok('но ничего из того, чем агент занят', leaked.length === 0, leaked);
  ok('у хозяина эти поля на месте — значит их правда прячут, а не потеряли',
    SECRET.some((k) => asOwner.agents[0][k] !== undefined), null);

  const chat = await call('/api/chat?id=' + agentId, { as: 'guest', method: 'GET' });
  ok('разговор гостю закрыт', chat.status === 403, chat.status);
  ok('и отказ назван', chat.j && chat.j.errorKey === 'err.notGranted', chat.j);

  // ------------------------------------------------------ просьба
  const ask = await call('/api/access', { as: 'guest', body: { agentId, note: 'подстрахую' } });
  ok('гость может попросить', ask.status === 200, ask.status);
  const ownerSees = await stateAs('owner');
  ok('хозяин видит запрос', (ownerSees.access.requests || []).length === 1, ownerSees.access);
  ok('и в нём написано, о ком и что просили',
    ownerSees.access.requests[0].agentId === agentId
      && ownerSees.access.requests[0].note === 'подстрахую', ownerSees.access.requests[0]);
  const askAgain = await call('/api/access', { as: 'guest', body: { agentId, note: 'ну пожалуйста' } });
  ok('повторная просьба заменяет прежнюю, а не ложится второй',
    (await stateAs('owner')).access.requests.length === 1, askAgain.status);

  const byGuest = await call('/api/access/answer', { as: 'guest', body: { id: 'что угодно', yes: true } });
  ok('сам себе гость открыть не может', byGuest.status === 403, byGuest.status);

  // ------------------------------------------------------ отказ
  const reqId = (await stateAs('owner')).access.requests[0].id;
  await call('/api/access/answer', { as: 'owner', body: { id: reqId, yes: false } });
  const refused = await stateAs('guest');
  ok('гость видит отказ, а не тишину', refused.access.refused.includes(agentId), refused.access);
  const stillClosed = await call('/api/chat?id=' + agentId, { as: 'guest', method: 'GET' });
  ok('и разговор по-прежнему закрыт', stillClosed.status === 403, stillClosed.status);

  // ------------------------------------------------------ согласие
  await call('/api/access', { as: 'guest', body: { agentId, note: 'ещё раз' } });
  const reqId2 = (await stateAs('owner')).access.requests[0].id;
  const yes = await call('/api/access/answer', { as: 'owner', body: { id: reqId2, yes: true } });
  ok('хозяин открывает доступ', yes.status === 200, yes.status);

  const opened = await stateAs('guest');
  const b = opened.agents.find((x) => x.id === agentId);
  ok('теперь гость видит, чем агент занят', b.lastSaid !== undefined, Object.keys(b).length);
  ok('и это записано у него в доступе', opened.access.granted.includes(agentId), opened.access);
  const chatOpen = await call('/api/chat?id=' + agentId, { as: 'guest', method: 'GET' });
  ok('разговор открылся', chatOpen.status === 200, chatOpen.status);

  const other = opened.agents.find((x) => x.id !== agentId);
  if (other) ok('но только про этого агента, не про всех', other.lastSaid === undefined, Object.keys(other));

  ok('хозяин видит, кому что открыто',
    (await stateAs('owner')).access.open.some((o) => o.agentId === agentId), null);

  // ------------------------------------------------------ отзыв
  const guestId = (await stateAs('owner')).access.open[0].guestId;
  await call('/api/access/revoke', { as: 'owner', body: { guestId, agentId } });
  const shut = await stateAs('guest');
  ok('после отзыва снова только проекция',
    shut.agents.find((x) => x.id === agentId).lastSaid === undefined, null);
  const chatShut = await call('/api/chat?id=' + agentId, { as: 'guest', method: 'GET' });
  ok('и разговор закрылся обратно', chatShut.status === 403, chatShut.status);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.message);
} finally {
  stop();
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
