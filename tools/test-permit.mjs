// node tools/test-permit.mjs — permission requests from Claude Code.
//
// It raises a real server: there is almost nothing to check in pure functions
// here — the whole point is that a request HANGS until the owner answers, and is
// released exactly once. That is only visible over live HTTP.
//
// The office is raised by the stand helper on a free port and temporary settings,
// in shared mode: that way both sides are checked — the owner with a token, and a
// guest who sees no requests at all.
import { startOffice } from './lib/office.mjs';

const OWNER = 'owner-token-for-the-test';
const GUEST = 'guest-pass-for-the-test';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The port is asked of the system rather than chosen. There used to be a 5396
// here with an explanation of why not 5393: the consent stand took that one, and
// in a shared run two servers fought over one number — now one fell, now the
// other, and never where the fault was. A chosen number cures one collision and
// waits for the next: there are as many runs on a machine as there are open
// sessions, and as many free numbers off the top of one's head as one managed to
// invent. `startOffice` asks the kernel for a port with a zero, raises the office
// on temporary settings and cleans up after itself.
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

// We wait until the request reaches the office rather than "about a quarter of a
// second". Under load — and the stands run one after another — a quarter of a
// second was not enough, and the stand failed over nothing about once in ten
// runs, showing an empty list where the truth was "it has not arrived yet".
async function untilPermits(n) {
  for (let i = 0; i < 100; i++) {
    const s = await state();
    if ((s.permits || []).length >= n) return s;
    await wait(50);
  }
  throw new Error(`запрос не доехал до офиса за 5 секунд`);
}

// A request from the hook: we do not await it, it hangs. We return a promise with the answer.
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

// An open stream is exactly what "somebody is in the office" means. Without it
// the server has to answer the hook at once.
//
// The returned `ready` promise waits for the first event rather than "about two
// hundred milliseconds". The server puts a connection into the list of watchers
// right after it writes the first snapshot into it — so an arrived frame is the
// sign that the watcher has been counted. With a `sleep` instead, the stand
// failed about once in three runs, and failed where nothing was broken: "the
// request is visible to the owner → []".
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
  }).catch(() => { /* closed — that was the intent */ });
  return { events, ready, close: () => { ctl.abort(); return done; } };
}

try {
  // There is nothing else to wait on for the office to answer here: startOffice
  // returns only after the first successful /api/whoami.

  // ------------------------------------------------- nobody is in the office
  const alone = await askPermit(BASH('git push'));
  ok('никого нет — хук отпускается сразу', alone.status === 200 && !alone.j.decision, alone);

  // A guest does not count as a watcher: the pager does not reach him.
  const g = openStream(`guest=${GUEST}`);
  await g.ready;
  const onlyGuest = await askPermit(BASH('git push'));
  ok('один гость — тоже «никого»', onlyGuest.status === 200 && !onlyGuest.j.decision, onlyGuest);

  // ------------------------------------------------------- the owner is watching
  const o = openStream(`owner=${OWNER}`);
  await o.ready;

  // --------------------------------------------------------- allow
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

  // ---------------------------------------------------- always allow
  held = askPermit(BASH('git push'));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'always' });
  got = await held;
  ok('«всегда» — allow с правилами', got.j.decision === 'allow' && got.j.updatedPermissions.length === 1, got.j);
  ok('правила уходят как пришли',
    got.j.updatedPermissions[0].destination === 'localSettings'
    && got.j.updatedPermissions[0].rules[0].ruleContent === 'git push *', got.j.updatedPermissions);

  // ---------------------------------------------------------- deny
  held = askPermit(BASH('rm -rf /'));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'deny', message: 'сделай ветку' });
  got = await held;
  ok('отказ доходит с запиской', got.j.decision === 'deny' && got.j.message === 'сделай ветку', got.j);

  // -------------------------------------------------------- in the terminal
  held = askPermit(BASH('npm publish'));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  got = await held;
  ok('«в терминале» — пустой ответ, а не отказ', got.status === 200 && !got.j.decision, got.j);

  // ------------------------------------------------------- not twice
  held = askPermit(BASH('ls'));
  s = await untilPermits(1);
  const id = s.permits[0].id;
  await post('/api/permit/answer', { id, decision: 'allow' });
  await held;
  const again = await post('/api/permit/answer', { id, decision: 'deny' });
  ok('второй ответ на тот же запрос не проходит', again.status === 404, again);

  // ------------------------------------------------ the session left the office
  // Neither of these requests has a `sess-1` session on disk, and that is on
  // purpose: this is what an agent the office has not indexed yet looks like. It
  // has to wait for an answer rather than be released by the very first tick.
  held = askPermit(BASH('ls -la'));
  await wait(3000);                              // a snapshot tick takes 2.5 s
  s = await state();
  ok('неизвестную офису сессию такт не отпускает', (s.permits || []).length === 1, s.permits);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  await held;

  // ------------------------------------------- the event arrives at once
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

  // ------------------------------------- the deferral rule itself, without a server
  // The deferral exists precisely so that a question is released after all, once
  // the session has really ended. Checked by a direct import: the stand must not
  // wait half a minute by the clock, so `now` is passed as a parameter.
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

// ---- a question is a question, not a wall of braces --------------------------
// Claude Code asks the person through the same channel it asks for permission,
// and the input of such a request has no command in it. Until 6 September 2026
// commandOf fell through to JSON.stringify, so the pager showed a line of braces
// and the owner could see that something was being asked and not what.
{
  const P2 = await import('../server/permit.js');
  // Asked before anything is called: a missing export should read as a failed
  // check, not as a stack trace on line 231.
  const has = typeof P2.questionOf === 'function';
  ok('офис умеет читать вопрос', has, typeof P2.questionOf);
  const nested = has && P2.questionOf({ questions: [{ header: 'Где хаб', question: 'Где живёт хаб?',
    options: [{ label: 'у нас', description: 'хаб у нас, платит владелец' },
      { label: 'у покупателя', description: 'ставит сам, мы не платим' }] }] });
  ok('вопрос читается из списка', nested && nested.text === 'Где живёт хаб?', nested);
  ok('и варианты приезжают с ним',
    nested && nested.options.map((o) => o.label).join('|') === 'у нас|у покупателя', nested && nested.options);
  // The sentence under an option is what the choice is made on; a label alone
  // says «после демо» and nothing about what that costs.
  ok('и комментарий под вариантом не теряется',
    nested && nested.options[0].note === 'хаб у нас, платит владелец', nested && nested.options[0]);
  const flat = has && P2.questionOf({ question: 'Так тоже спрашивают?', options: ['да', 'нет'] });
  ok('одиночный вопрос читается так же', flat && flat.text === 'Так тоже спрашивают?', flat);
  ok('строки в вариантах не теряются', flat && flat.options.length === 2, flat && flat.options);
  ok('вариант строкой остаётся вариантом, просто без комментария',
    flat && flat.options[0].label === 'да' && flat.options[0].note === '', flat && flat.options[0]);
  ok('команда — не вопрос', has && P2.questionOf({ command: 'ls' }) === null, has && P2.questionOf({ command: 'ls' }));

  const asked = P2.ask({ session_id: 'sess-q', tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question: 'Мержим?', options: [{ label: 'да' }, { label: 'позже' }] }] } },
    { audience: true });
  const shown = P2.permits().find((x) => x.tool === 'AskUserQuestion');
  ok('в заявке стоит текст вопроса, а не JSON', shown && shown.command === 'Мержим?', shown && shown.command);
  ok('и фигурных скобок в ней нет', shown && !/[{}]/.test(shown.command), shown && shown.command);
  ok('варианты доезжают до офиса', shown && shown.question && shown.question.options.length === 2, shown && shown.question);
  P2.answer(shown.id, { decision: 'allow' });
  await asked.verdict;
}

await stop();
console.log(bad ? `\n${bad} ПРОВАЛ(ов)` : '\nвсё зелено');
process.exit(bad ? 1 : 0);
