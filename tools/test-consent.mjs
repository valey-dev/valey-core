// node tools/test-consent.mjs — what a guest sees about an agent, and how that
// changes.
//
// The default is checked first: a guest gets the projection, not the transcript.
// This is not about buttons — a panel can be drawn any way at all, and the
// question is what leaves the machine down the wire.
//
// The office is its own, with its own port, its own settings and its own
// sessions directory: the stand switches the mode, knows the token in advance
// and works with an invented agent. Until 4 September 2026 it waited for a LIVE
// session in ~/.claude and gave up after sixteen seconds on a clean machine —
// that is, it passed exactly where somebody was already working, and nowhere
// else.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fakeClaudeDir, startOffice, waitForAgent } from './lib/office.mjs';

const TOKEN = 'consent-owner-0001';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-consent-'));
const fake = await fakeClaudeDir(dir);
const { base, stop } = await startOffice({
  settings: { access: { mode: 'shared', token: TOKEN, invites: [] } },
  claudeDir: fake.dir,
});

let GUEST = '';
const call = (p, { as = 'nobody', method = 'POST', body = {} } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (as === 'owner') headers['x-valey-owner'] = TOKEN;
  if (as === 'guest') headers['x-valey-guest'] = GUEST;
  return fetch(base + p, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
};
const stateAs = (who) => call('/api/state', { as: who, method: 'GET' }).then((r) => r.j);

// The fields the owner sees and a guest must not. The list from the brief: the
// last thing said, the prompt, the files, the branch, the project path.
const SECRET = ['lastSaid', 'lastAsked', 'files', 'artifacts', 'branch', 'cwd', 'title', 'model', 'turns'];

try {
  const made = await call('/api/invite', { as: 'owner', body: { name: 'Костя', from: 'Сергей' } });
  GUEST = (await call('/api/enter', { body: { code: made.j.invite.code } })).j.guest;
  ok('гость вошёл', !!GUEST, GUEST);

  // The snapshot is not built in the same millisecond the server starts.
  const asOwner = await waitForAgent(() => stateAs('owner'));
  const agentId = asOwner.agents[0].id;
  ok('в офисе выдуманный агент, а не чья-то живая сессия',
    asOwner.agents[0].project === 'rocket-shop' && asOwner.agents[0].lastSaid === fake.said,
    { project: asOwner.agents[0].project, said: asOwner.agents[0].lastSaid });

  // ------------------------------------------------------ the default
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

  // ------------------------------------------------------ the request
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

  // ------------------------------------------------------ the refusal
  const reqId = (await stateAs('owner')).access.requests[0].id;
  await call('/api/access/answer', { as: 'owner', body: { id: reqId, yes: false } });
  const refused = await stateAs('guest');
  ok('гость видит отказ, а не тишину', refused.access.refused.includes(agentId), refused.access);
  const stillClosed = await call('/api/chat?id=' + agentId, { as: 'guest', method: 'GET' });
  ok('и разговор по-прежнему закрыт', stillClosed.status === 403, stillClosed.status);

  // ------------------------------------------------------ the consent
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

  // ------------------------------------------------------ the revoke
  const guestId = (await stateAs('owner')).access.open[0].guestId;
  await call('/api/access/revoke', { as: 'owner', body: { guestId, agentId } });
  const shut = await stateAs('guest');
  ok('после отзыва снова только проекция',
    shut.agents.find((x) => x.id === agentId).lastSaid === undefined, null);
  const chatShut = await call('/api/chat?id=' + agentId, { as: 'guest', method: 'GET' });
  ok('и разговор закрылся обратно', chatShut.status === 403, chatShut.status);

  // ------------------------------ the projection has to survive being drawn
  // Handing a guest a trimmed agent is only half of it — the office must be
  // able to draw one. On 5 September 2026 it could not: syncActors read
  // a.artifacts.length and artifacts is not in SHOWN, so a guest on a second
  // laptop got a floor with rooms and no people. The plan is built a line
  // before the actors are placed, which is why the crash looked like an empty
  // office rather than an error. The stand feeds the placement a REAL guest
  // snapshot from the server rather than a hand-made object: a hand-made one
  // does not know which field is missing.
  const { syncActors } = await import('../web/actors.js');
  const seen = await stateAs('guest');
  const layout = { byAgent: new Map((seen.agents || []).map((a, i) =>
    [a.id, { room: { key: 'r' + i, x: 0, y: 0 }, desk: { i, x: 10, y: 10 } }])) };
  const actors = new Map();
  let drew = null;
  try { syncActors(actors, seen.agents || [], layout); } catch (e) { drew = e.message; }
  ok('гостевой снимок переживает расстановку актёров', drew === null, drew);
  ok('и все агенты расставлены', actors.size === (seen.agents || []).length,
    [actors.size, (seen.agents || []).length]);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.message);
} finally {
  await stop();
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
