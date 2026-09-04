// node tools/test-permit.mjs — запросы разрешения из Claude Code.
//
// Поднимает настоящий сервер: проверять тут почти нечего в чистых функциях —
// вся суть в том, что запрос ВИСИТ, пока хозяин не ответит, и отпускается ровно
// один раз. Такое видно только по живому HTTP.
//
// Офис поднимается стендовым помощником на свободном порту и временных
// настройках, в режиме shared: так проверяются обе стороны — хозяин с токеном
// и гость, которому запросов не видно вовсе.
import { startOffice } from './lib/office.mjs';

const OWNER = 'owner-token-for-the-test';
const GUEST = 'guest-pass-for-the-test';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Порт спрашивается у системы, а не выбирается. Раньше здесь стоял 5396 с
// объяснением, почему не 5393: стенд согласия занимал тот, и на общем прогоне
// два сервера дрались за один номер — падал то один, то другой, и никогда там,
// где сломано. Выбранный номер лечит одно столкновение и ждёт следующего:
// прогонов на машине столько, сколько открыто сессий, а свободных чисел из
// головы — сколько успел придумать. `startOffice` берёт порт нулём у ядра,
// поднимает офис на временных настройках и убирает за собой.
const { base, stop } = await startOffice({
  settings: {
    access: { mode: 'shared', token: OWNER, invites: [{ id: 'i1', guest: GUEST, from: 'Костя' }] },
  },
});
process.on('SIGINT', () => { stop(); process.exit(130); });

const owner = { 'content-type': 'application/json', 'x-valey-owner': OWNER };
const guest = { 'content-type': 'application/json', 'x-valey-guest': GUEST };

const post = (p, body, headers = owner) => fetch(base + p, {
  method: 'POST', headers, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));

const state = (headers = { 'x-valey-owner': OWNER }) =>
  fetch(base + '/api/state', { headers }).then((r) => r.json());

// Ждём, пока запрос доедет до офиса, а не «примерно четверть секунды». Под
// нагрузкой — а стенды гоняются подряд — четверти секунды не хватало, и стенд
// падал на ровном месте раз на десяток прогонов, показывая пустой список там,
// где на самом деле было «ещё не дошло».
async function untilPermits(n) {
  for (let i = 0; i < 100; i++) {
    const s = await state();
    if ((s.permits || []).length >= n) return s;
    await wait(50);
  }
  throw new Error(`запрос не доехал до офиса за 5 секунд`);
}

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
//
// Возвращаемое обещание `ready` ждёт первого события, а не «примерно двухсот
// миллисекунд». Сервер кладёт соединение в список зрителей сразу после того,
// как напишет в него первый снимок, — значит пришедший кадр и есть признак,
// что зритель посчитан. Со `sleep` вместо этого стенд падал примерно раз на
// три прогона, и падал не там, где сломано: «запрос виден хозяину → []».
function openStream(query) {
  const ctl = new AbortController();
  const events = [];
  let first;
  const ready = new Promise((r) => { first = r; });
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
        first();
      }
    }
  }).catch(() => { /* закрыли — так и было задумано */ });
  return { events, ready, close: () => { ctl.abort(); return done; } };
}

try {
  // Ждать, пока офис ответит, здесь больше нечем: startOffice возвращается
  // только после первого удачного /api/whoami.

  // ------------------------------------------------- в офисе никого нет
  const alone = await askPermit(BASH('git push'));
  ok('никого нет — хук отпускается сразу', alone.status === 200 && !alone.j.decision, alone);

  // Гость не считается зрителем: пейджер до него не доходит.
  const g = openStream(`guest=${GUEST}`);
  await g.ready;
  const onlyGuest = await askPermit(BASH('git push'));
  ok('один гость — тоже «никого»', onlyGuest.status === 200 && !onlyGuest.j.decision, onlyGuest);

  // ------------------------------------------------------- хозяин смотрит
  const o = openStream(`owner=${OWNER}`);
  await o.ready;

  // --------------------------------------------------------- разрешить
  let held = askPermit(BASH('git push -u origin HEAD'));
  let s = await untilPermits(1);
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
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'always' });
  got = await held;
  ok('«всегда» — allow с правилами', got.j.decision === 'allow' && got.j.updatedPermissions.length === 1, got.j);
  ok('правила уходят как пришли',
    got.j.updatedPermissions[0].destination === 'localSettings'
    && got.j.updatedPermissions[0].rules[0].ruleContent === 'git push *', got.j.updatedPermissions);

  // ---------------------------------------------------------- отказать
  held = askPermit(BASH('rm -rf /'));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'deny', message: 'сделай ветку' });
  got = await held;
  ok('отказ доходит с запиской', got.j.decision === 'deny' && got.j.message === 'сделай ветку', got.j);

  // -------------------------------------------------------- в терминале
  held = askPermit(BASH('npm publish'));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  got = await held;
  ok('«в терминале» — пустой ответ, а не отказ', got.status === 200 && !got.j.decision, got.j);

  // ------------------------------------------------------- дважды нельзя
  held = askPermit(BASH('ls'));
  s = await untilPermits(1);
  const id = s.permits[0].id;
  await post('/api/permit/answer', { id, decision: 'allow' });
  await held;
  const again = await post('/api/permit/answer', { id, decision: 'deny' });
  ok('второй ответ на тот же запрос не проходит', again.status === 404, again);

  // ------------------------------------------------ сессия ушла из офиса
  // Сессии `sess-1` на диске нет ни у одного из этих запросов, и это нарочно:
  // так выглядит агент, которого офис ещё не проиндексировал. Он обязан
  // дождаться ответа, а не быть отпущенным первым же тактом.
  held = askPermit(BASH('ls -la'));
  await wait(3000);                              // такт снимка проходит за 2.5 с
  s = await state();
  ok('неизвестную офису сессию такт не отпускает', (s.permits || []).length === 1, s.permits);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  await held;

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

  // ------------------------------------- само правило отсрочки, без сервера
  // Отсрочка нужна ровно затем, чтобы вопрос всё-таки отпускался, когда сессия
  // действительно кончилась. Проверяется прямым импортом: ждать полминуты по
  // часам стенд не должен, поэтому `now` передаётся параметром.
  const P = await import('../server/permit.js');
  const one = P.ask({ session_id: 'sess-x', tool_name: 'Bash', tool_input: { command: 'ls' } }, { audience: true });
  P.forgetGone(['sess-other'], Date.now());
  ok('только что пришедший вопрос переживает такт', P.permits().length === 1, P.permits());
  P.forgetGone([], Date.now() + P.GRACE_MS + 1000);
  ok('пустой снимок не считается доказательством', P.permits().length === 1, P.permits());
  P.forgetGone(['sess-other'], Date.now() + P.GRACE_MS + 1000);
  ok('а через отсрочку — отпускается', P.permits().length === 0, P.permits());
  ok('и хук получает пустоту, а не отказ', (await one.verdict) === null, await one.verdict);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | исключение →', e.message);
}

await stop();
console.log(bad ? `\n${bad} ПРОВАЛ(ов)` : '\nвсё зелено');
process.exit(bad ? 1 : 0);
