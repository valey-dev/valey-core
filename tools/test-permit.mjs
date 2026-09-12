// node tools/test-permit.mjs — permission requests from Claude Code.
//
// It raises a real server: there is almost nothing to check in pure functions
// here — the whole point is that a request HANGS until the owner answers, and is
// released exactly once. That is only visible over live HTTP.
//
// The office is raised by the stand helper on a free port and temporary settings,
// in shared mode: that way both sides are checked — the owner with a token, and a
// guest who sees no requests at all.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { startOffice, ROOT } from './lib/office.mjs';

const OWNER = 'owner-token-for-the-test';
const GUEST = 'guest-pass-for-the-test';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
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
const { base, stop, settingsFile } = await startOffice({
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
  ok('there is no one - the hook is released immediately', alone.status === 200 && !alone.j.decision, alone);

  // A guest does not count as a watcher: the pager does not reach him.
  const g = openStream(`guest=${GUEST}`);
  await g.ready;
  const onlyGuest = await askPermit(BASH('git push'));
  ok('one guest - also “no one”', onlyGuest.status === 200 && !onlyGuest.j.decision, onlyGuest);

  // ------------------------------------------------------- the owner is watching
  const o = openStream(`owner=${OWNER}`);
  await o.ready;

  // --------------------------------------------------------- allow
  let held = askPermit(BASH('git push -u origin HEAD'));
  let s = await untilPermits(1);
  ok('the request is visible to the owner', (s.permits || []).length === 1, s.permits);
  const p1 = (s.permits || [])[0] || {};
  ok('the entire team is visible', p1.command === 'git push -u origin HEAD', p1.command);
  ok('description from the agent on site', p1.description === 'Push the worktree branch', p1.description);
  ok('the rule is named in words', p1.rule === 'Bash(git push *)', p1.rule);
  ok('session bound', p1.agentId === 'sess-1', p1.agentId);

  const gs = await state({ 'x-valey-guest': GUEST });
  ok('the guest does not see requests', (gs.permits || []).length === 0, gs.permits);

  const byGuest = await post('/api/permit/answer', { id: p1.id, decision: 'allow' }, guest);
  ok('the guest cannot answer', byGuest.status === 403, byGuest);

  await post('/api/permit/answer', { id: p1.id, decision: 'allow' });
  let got = await held;
  ok('allowed - the hook gets allow', got.j.decision === 'allow', got.j);
  ok('without “always” rules does not go away', !(got.j.updatedPermissions || []).length, got.j);
  s = await state();
  ok('the answered request leaves the office', (s.permits || []).length === 0, s.permits);

  // ---------------------------------------------------- always allow
  held = askPermit(BASH('git push'));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'always' });
  got = await held;
  ok('“always” – allow with rules', got.j.decision === 'allow' && got.j.updatedPermissions.length === 1, got.j);
  ok('the rules leave as they came',
    got.j.updatedPermissions[0].destination === 'localSettings'
    && got.j.updatedPermissions[0].rules[0].ruleContent === 'git push *', got.j.updatedPermissions);

  // ---------------------------------------------------------- deny
  held = askPermit(BASH('rm -rf /'));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'deny', message: 'сделай ветку' });
  got = await held;
  ok('the refusal comes with a note', got.j.decision === 'deny' && got.j.message === 'сделай ветку', got.j);

  // -------------------------------------------------------- in the terminal
  held = askPermit(BASH('npm publish'));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  got = await held;
  ok('“in the terminal” is an empty response, not a refusal', got.status === 200 && !got.j.decision, got.j);

  // ------------------------------------------------------- not twice
  held = askPermit(BASH('ls'));
  s = await untilPermits(1);
  const id = s.permits[0].id;
  await post('/api/permit/answer', { id, decision: 'allow' });
  await held;
  const again = await post('/api/permit/answer', { id, decision: 'deny' });
  ok('the second response to the same request fails', again.status === 404, again);

  // ------------------------------------------------ the session left the office
  // Neither of these requests has a `sess-1` session on disk, and that is on
  // purpose: this is what an agent the office has not indexed yet looks like. It
  // has to wait for an answer rather than be released by the very first tick.
  held = askPermit(BASH('ls -la'));
  await wait(3000);                              // a snapshot tick takes 2.5 s
  s = await state();
  ok('tact does not let go of a session unknown to the office', (s.permits || []).length === 1, s.permits);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  await held;

  // ------------------------------------------- the event arrives at once
  held = askPermit(BASH('git status'));
  await wait(250);
  ok('the pager receives the event via its own channel',
    o.events.some((e) => e.startsWith('event: permits') && e.includes('git status')),
    o.events.filter((e) => e.startsWith('event: permits')).length);
  ok('the event does not arrive to the guest',
    !g.events.some((e) => e.startsWith('event: permits')),
    g.events.length);
  s = await state();
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  await held;

  // ------------------------------------------------ a question, and its door
  // Questions are held only at PreToolUse: the desktop app does not wait for
  // PermissionRequest on them, and that door has no field for an answer.
  const QUESTION = (event, questions) => ({
    hook_event_name: event,
    session_id: 'sess-1',
    tool_name: 'AskUserQuestion',
    tool_input: { questions },
  });
  const ONE = [{ question: 'Кого берём?', header: 'Зверь',
    options: [{ label: 'Кит', description: 'большой' }, { label: 'Слон', description: 'тоже' }],
    multiSelect: false }];

  const wrongDoor = await askPermit(QUESTION('PermissionRequest', ONE));
  ok('a question at PermissionRequest is let through at once',
    wrongDoor.status === 200 && !wrongDoor.j.decision, wrongDoor);

  const batch = await askPermit(QUESTION('PreToolUse', [...ONE,
    { question: 'А когда?', header: 'Срок', options: [{ label: 'сейчас' }, { label: 'потом' }] }]));
  ok('a batch of questions goes to the client - the card answers one',
    batch.status === 200 && !batch.j.decision, batch);

  const tool = await askPermit({ ...BASH('ls'), hook_event_name: 'PreToolUse' });
  ok('an ordinary tool is never held at PreToolUse',
    tool.status === 200 && !tool.j.decision, tool);

  held = askPermit(QUESTION('PreToolUse', ONE));
  s = await untilPermits(1);
  const q1 = s.permits[0];
  ok('a question at PreToolUse waits for the owner', q1.tool === 'AskUserQuestion' && !!q1.question, q1);

  const allowQ = await post('/api/permit/answer', { id: q1.id, decision: 'allow' });
  ok('allow is no answer to a question', allowQ.status === 404, allowQ);
  const alien = await post('/api/permit/answer', { id: q1.id, decision: 'answer', label: 'Жираф' });
  ok('an option the agent never offered is refused', alien.status === 404, alien);
  s = await state();
  ok('and the question is still waiting', (s.permits || []).some((x) => x.id === q1.id), s.permits);

  await post('/api/permit/answer', { id: q1.id, decision: 'answer', label: 'Слон' });
  got = await held;
  ok('the pressed option comes back as answers keyed by the question',
    got.j.decision === 'answer' && got.j.answers && got.j.answers['Кого берём?'] === 'Слон', got.j);

  held = askPermit(QUESTION('PreToolUse', ONE));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'deny', message: 'спроси потом' });
  got = await held;
  ok('“no answer” still goes out as a refusal with words',
    got.j.decision === 'deny' && got.j.message === 'спроси потом', got.j);

  held = askPermit(QUESTION('PreToolUse', ONE));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'terminal' });
  got = await held;
  ok('“in the terminal” hands the question back empty', got.status === 200 && !got.j.decision, got.j);

  // An MCP tool that happens to take a `question` is a tool asking to run.
  held = askPermit({ hook_event_name: 'PermissionRequest', session_id: 'sess-1',
    tool_name: 'mcp__docs__search', tool_input: { question: 'как деплоить?', options: ['a', 'b'] } });
  s = await untilPermits(1);
  ok('a tool with a question field gets allow and deny, not options', s.permits[0].question === null, s.permits[0]);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'allow' });
  got = await held;
  ok('and allow still works for it', got.j.decision === 'allow', got.j);

  // ------------------------------------------- the hook script itself, end to end
  // Every check above reads the office's answer. What broke on 11 September
  // 2026 was the step after it — what the hook printed to Claude Code — so the
  // real script runs here, against this office, with this office's token.
  const runHook = (payload) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'permit.mjs')], {
      env: { ...process.env, VALEY_URL: base, VALEY_SETTINGS: settingsFile },
    });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.on('close', (code) => {
      let json = null;
      try { json = out ? JSON.parse(out) : null; } catch { json = { unparsed: out }; }
      resolve({ code, json });
    });
    child.stdin.end(JSON.stringify(payload));
  });

  let hook = runHook(QUESTION('PreToolUse', ONE));
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'answer', label: 'Кит' });
  let printed = await hook;
  const hs = printed.json && printed.json.hookSpecificOutput;
  ok('the hook exits clean', printed.code === 0, printed);
  ok('the hook prints an allow for PreToolUse',
    hs && hs.hookEventName === 'PreToolUse' && hs.permissionDecision === 'allow', printed.json);
  ok('with the questions and the answer in updatedInput',
    hs && hs.updatedInput && hs.updatedInput.questions.length === 1
    && hs.updatedInput.answers['Кого берём?'] === 'Кит', hs && hs.updatedInput);

  hook = runHook({ ...BASH('git push'), hook_event_name: 'PermissionRequest' });
  s = await untilPermits(1);
  await post('/api/permit/answer', { id: s.permits[0].id, decision: 'allow' });
  printed = await hook;
  const dec = printed.json && printed.json.hookSpecificOutput && printed.json.hookSpecificOutput.decision;
  ok('the hook prints allow for PermissionRequest as {behavior}', dec && dec.behavior === 'allow', printed.json);

  hook = runHook(QUESTION('PermissionRequest', ONE));
  printed = await hook;
  ok('a question at PermissionRequest leaves the hook silent', printed.code === 0 && printed.json === null, printed);

  await o.close(); await g.close();

  // ------------------------------------- the deferral rule itself, without a server
  // The deferral exists precisely so that a question is released after all, once
  // the session has really ended. Checked by a direct import: the stand must not
  // wait half a minute by the clock, so `now` is passed as a parameter.
  const P = await import('../server/permit.js');
  const one = P.ask({ session_id: 'sess-x', tool_name: 'Bash', tool_input: { command: 'ls' } }, { audience: true });
  P.forgetGone(['sess-other'], Date.now());
  ok('the question that just arrived is experiencing tact', P.permits().length === 1, P.permits());
  P.forgetGone([], Date.now() + P.GRACE_MS + 1000);
  ok('a blank photograph is not considered evidence', P.permits().length === 1, P.permits());
  P.forgetGone(['sess-other'], Date.now() + P.GRACE_MS + 1000);
  ok('and after a delay - released', P.permits().length === 0, P.permits());
  ok('and the hook gets a void, not a refusal', (await one.verdict) === null, await one.verdict);
} catch (e) {
  bad += 1;
console.log('FAIL  | exception →', e.message);
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
  ok('the office can read the question', has, typeof P2.questionOf);
  const nested = has && P2.questionOf({ questions: [{ header: 'Где хаб', question: 'Где живёт хаб?',
    options: [{ label: 'у нас', description: 'хаб у нас, платит владелец' },
      { label: 'у покупателя', description: 'ставит сам, мы не платим' }] }] });
  ok('the question is read from the list', nested && nested.text === 'Где живёт хаб?', nested);
  ok('and options come with it',
    nested && nested.options.map((o) => o.label).join('|') === 'у нас|у покупателя', nested && nested.options);
  // The sentence under an option is what the choice is made on; a label alone
  // says «после демо» and nothing about what that costs.
  ok('and the comment under the option is not lost',
    nested && nested.options[0].note === 'хаб у нас, платит владелец', nested && nested.options[0]);
  const flat = has && P2.questionOf({ question: 'Так тоже спрашивают?', options: ['да', 'нет'] });
  ok('single question reads the same way', flat && flat.text === 'Так тоже спрашивают?', flat);
  ok('lines in options are not lost', flat && flat.options.length === 2, flat && flat.options);
  ok('the line option remains an option, just without a comment',
    flat && flat.options[0].label === 'да' && flat.options[0].note === '', flat && flat.options[0]);
  ok('team is not a question', has && P2.questionOf({ command: 'ls' }) === null, has && P2.questionOf({ command: 'ls' }));

  const asked = P2.ask({ hook_event_name: 'PreToolUse', session_id: 'sess-q', tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question: 'Мержим?', options: [{ label: 'да' }, { label: 'позже' }] }] } },
    { audience: true });
  const shown = P2.permits().find((x) => x.tool === 'AskUserQuestion');
  ok('the application contains the text of the question, not JSON', shown && shown.command === 'Мержим?', shown && shown.command);
  ok('and there are no curly braces in it', shown && !/[{}]/.test(shown.command), shown && shown.command);
  ok('options reach the office', shown && shown.question && shown.question.options.length === 2, shown && shown.question);
  P2.answer(shown.id, { decision: 'answer', label: 'позже' });
  const v = await asked.verdict;
  ok('and the answer is keyed by the question text', v && v.answers && v.answers['Мержим?'] === 'позже', v);
}

await stop();
console.log(bad ? `\n${bad} failures` : '\nall green');
process.exit(bad ? 1 : 0);
