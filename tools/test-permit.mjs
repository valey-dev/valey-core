// node tools/test-permit.mjs — запросы разрешения из Claude Code.
//
// Поднимает настоящий сервер: проверять тут почти нечего в чистых функциях —
// вся суть в том, что запрос ВИСИТ, пока хозяин не ответит, и отпускается ровно
// один раз. Такое видно только по живому HTTP.
//
// Настройки уводятся во временный файл (`VALEY_SETTINGS`) и офис поднимается в
// режиме shared: так проверяются обе стороны — хозяин с токеном и гость,
// которому запросов не видно вовсе.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PERMIT_PORT || 5393);
const base = `http://127.0.0.1:${PORT}`;
const OWNER = 'owner-token-for-the-test';
const GUEST = 'guest-pass-for-the-test';

const settingsFile = path.join(os.tmpdir(), `valey-permit-test-${process.pid}.json`);
fs.writeFileSync(settingsFile, JSON.stringify({
  access: { mode: 'shared', token: OWNER, invites: [{ id: 'i1', guest: GUEST, from: 'Костя' }] },
}));

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), VALEY_SETTINGS: settingsFile },
  stdio: 'ignore',
});
const stop = () => {
  try { srv.kill(); } catch { /* уже мёртв */ }
  try { fs.unlinkSync(settingsFile); } catch { /* и не было */ }
};
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

const owner = { 'content-type': 'application/json', 'x-valey-owner': OWNER };
const guest = { 'content-type': 'application/json', 'x-valey-guest': GUEST };

const post = (p, body, headers = owner) => fetch(base + p, {
  method: 'POST', headers, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));

const state = (headers = { 'x-valey-owner': OWNER }) =>
  fetch(base + '/api/state', { headers }).then((r) => r.json());

// Запрос от хука: не ждём его, он висит. Возвращаем промис с ответом.
const askPermit = (payload) => post('/api/permit', payload, owner);

const BASH = (command) => ({
  session_id: 'sess-1',
  tool_name: 'Bash',
  tool_input: { command, description: 'Push the worktree branch' },
  permission_suggestions: [{
    type: 'addRules', behavior: 'allow', destination: 'localSettings',
    rules: [{ toolName: 'Bash', ruleContent: 'git push *' }],
  }],
});

// Открытый поток — это и есть «в офисе кто-то есть». Без него сервер обязан
// ответить хуку сразу.
function openStream(query) {
  const ctl = new AbortController();
  const events = [];
  const done = fetch(`${base}/api/stream?${query}`, { signal: ctl.signal }).then(async (r) => {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done: fin } = await reader.read();
      if (fin) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        events.push(buf.slice(0, i));
        buf = buf.slice(i + 2);
      }
    }
  }).catch(() => { /* закрыли — так и было задумано */ });
  return { events, close: () => { ctl.abort(); return done; } };
}

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { await fetch(base + '/api/whoami'); up = true; } catch { await wait(150); }
  }
  if (!up) throw new Error(`сервер не поднялся на ${PORT} — занят?`);

  // ------------------------------------------------- в офисе никого нет
  const alone = await askPermit(BASH('git push'));
  ok('никого нет — хук отпускается сразу', alone.status === 200 && !alone.j.decision, alone);

  // Гость не считается зрителем: пейджер до него не доходит.
  const g = openStream(`guest=${GUEST}`);
  await wait(200);
  const onlyGuest = await askPermit(BASH('git push'));
  ok('один гость — тоже «никого»', onlyGuest.status === 200 && !onlyGuest.j.decision, onlyGuest);

  // ------------------------------------------------------- хозяин смотрит
  const o = openStream(`owner=${OWNER}`);
  await wait(200);

  // --------------------------------------------------------- разрешить
  let held = askPermit(BASH('git push -u origin HEAD'));
  await wait(250);
  let s = await state();
  ok('запрос виден хозяину', (s.permits || []).length === 1, s.permits);
  const p1 = (s.permits || [])[0] || {};
  ok('команда видна целиком', p1.command === 'git push -u origin HEAD', p1.command);
  ok('описание от агента на месте', p1.description === 'Push the worktree branch', p1.description);
  ok('правило названо словами', p1.rule === 'Bash(git push *)', p1.rule);
  ok('привязан к сессии', p1.agentId === 'sess-1', p1.agentId);

  const gs = await state({ 'x-valey-guest': GUEST });
  ok('гость не видит запросов', (gs.permits || []).length === 0, gs.permits);

  const byGuest = await post('/api/permit/answer', { id: p1.id, decision: 'allow' }, guest);
  ok('гость не может ответить', byGuest.status === 403, byGuest);

  await post('/api/permit/answer', { id: p1.id, decision: 'allow' });
  let got = await held;
  ok('разрешено — хук получает allow', got.j.decision === 'allow', got.j);
  ok('без «всегда» правил не уходит', !(got.j.updatedPermissions || []).length, got.j);
  s = await state();
  ok('отвеченный запрос уходит из офиса', (s.permits || []).length === 0, s.permits);

  // ---------------------------------------------------- всегда разрешать
  held = askPermit(BASH('git push'));
  await wait(250);
  s = await state();
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'always' });
  got = await held;
  ok('«всегда» — allow с правилами', got.j.decision === 'allow' && got.j.updatedPermissions.length === 1, got.j);
  ok('правила уходят как пришли',
    got.j.updatedPermissions[0].destination === 'localSettings'
    && got.j.updatedPermissions[0].rules[0].ruleContent === 'git push *', got.j.updatedPermissions);

  // ---------------------------------------------------------- отказать
  held = askPermit(BASH('rm -rf /'));
  await wait(250);
  s = await state();
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'deny', message: 'сделай ветку' });
  got = await held;
  ok('отказ доходит с запиской', got.j.decision === 'deny' && got.j.message === 'сделай ветку', got.j);

  // -------------------------------------------------------- в терминале
  held = askPermit(BASH('npm publish'));
  await wait(250);
  s = await state();
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  got = await held;
  ok('«в терминале» — пустой ответ, а не отказ', got.status === 200 && !got.j.decision, got.j);

  // ------------------------------------------------------- дважды нельзя
  held = askPermit(BASH('ls'));
  await wait(250);
  s = await state();
  const id = s.permits[0].id;
  await post('/api/permit/answer', { id, decision: 'allow' });
  await held;
  const again = await post('/api/permit/answer', { id, decision: 'deny' });
  ok('второй ответ на тот же запрос не проходит', again.status === 404, again);

  // ------------------------------------------------ сессия ушла из офиса
  held = askPermit({ ...BASH('ls'), session_id: 'sess-gone' });
  await wait(250);
  s = await state();
  ok('чужая сессия сначала ждёт', (s.permits || []).length === 1, s.permits);
  // Снимок собирается раз в 2.5 с и не находит такой сессии на диске — вопрос
  // отпускается сам.
  got = await Promise.race([held, wait(4000).then(() => 'висит')]);
  ok('вопрос исчезнувшей сессии отпускается', got !== 'висит' && !(got.j || {}).decision, got);

  // ------------------------------------------- событие приходит сразу
  held = askPermit(BASH('git status'));
  await wait(250);
  ok('пейджеру событие приходит своим каналом',
    o.events.some((e) => e.startsWith('event: permits') && e.includes('git status')),
    o.events.filter((e) => e.startsWith('event: permits')).length);
  ok('гостю событие не приходит',
    !g.events.some((e) => e.startsWith('event: permits')),
    g.events.length);
  s = await state();
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  await held;

  await o.close(); await g.close();
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | исключение →', e.message);
}

stop();
console.log(bad ? `\n${bad} ПРОВАЛ(ов)` : '\nвсё зелено');
process.exit(bad ? 1 : 0);
