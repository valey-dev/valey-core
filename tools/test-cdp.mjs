// node tools/test-cdp.mjs — every command of the camera ends, one way or another.
//
// tools/cdp.mjs is what shot.mjs speaks to Chrome with. Until 12 September 2026
// a refused command resolved as `undefined` and the frame came out wrong with
// exit 0; a closed socket left the run to die with Node's code 13; a command
// Chrome never answered hung the run until somebody killed it. None of the three
// can be staged with a real browser on demand, and CI has no browser, so the
// socket here is a fake one that answers — or does not — as each check needs.
import { cdp } from './cdp.mjs';

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('FAIL  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};

// Just enough of a WebSocket: listeners, and a record of what was sent.
const fake = () => {
  const on = { message: [], close: [] };
  const sent = [];
  return {
    sent,
    addEventListener: (type, fn) => on[type].push(fn),
    send: (s) => sent.push(JSON.parse(s)),
    answer: (m) => on.message.forEach((fn) => fn({ data: JSON.stringify(m) })),
    close: () => on.close.forEach((fn) => fn({})),
  };
};
const outcome = (p) => p.then((v) => ({ v }), (e) => ({ e: e.message }));

{
  const ws = fake();
  const { send } = cdp(ws);
  const p = outcome(send('Page.captureScreenshot', { format: 'png' }));
  ws.answer({ id: ws.sent[0].id, result: { data: 'AAA' } });
  const r = await p;
  ok('an answer resolves with its result', r.v?.data === 'AAA', r);
  ok('and the command went out with its method and params',
    ws.sent[0].method === 'Page.captureScreenshot' && ws.sent[0].params.format === 'png', ws.sent[0]);
}

{
  // The case that started this: `--viewport 390` has no height, and Chrome refuses.
  const ws = fake();
  const { send } = cdp(ws);
  const p = outcome(send('Emulation.setDeviceMetricsOverride', { width: 390 }));
  ws.answer({ id: 1, error: { code: -32602, message: 'Invalid parameters', data: 'Failed to deserialize params.height' } });
  const r = await p;
  ok('a refusal rejects instead of resolving as undefined', 'e' in r, r);
  ok('and the error names the method, the message and the detail',
    /^Emulation\.setDeviceMetricsOverride: Invalid parameters \(Failed to deserialize params\.height\)$/.test(r.e || ''), r.e);
}

{
  const ws = fake();
  const { send } = cdp(ws);
  const a = outcome(send('Page.reload'));
  const b = outcome(send('Page.captureScreenshot'));
  ws.close();
  const [ra, rb] = await Promise.all([a, b]);
  ok('a closed socket rejects every pending command',
    ra.e === 'Page.reload: Chrome closed the connection' && rb.e === 'Page.captureScreenshot: Chrome closed the connection', [ra, rb]);
  const later = await outcome(send('Runtime.evaluate'));
  ok('and a command sent after the close rejects at once, without sending',
    later.e === 'Runtime.evaluate: Chrome closed the connection' && ws.sent.length === 2, { later, sent: ws.sent.length });
}

{
  // The hang: Chrome alive, the socket open, and no answer ever.
  const ws = fake();
  const { send } = cdp(ws, { timeout: 50 });
  const started = Date.now();
  const r = await outcome(send('Page.captureScreenshot'));
  ok('an unanswered command rejects after the timeout, naming the method',
    r.e === 'Page.captureScreenshot: no answer in 0.05 s', r);
  ok('and it does so on time', Date.now() - started < 1000, Date.now() - started);
  let threw = null;
  try { ws.answer({ id: 1, result: {} }); } catch (err) { threw = err.message; }
  ok('an answer arriving after the timeout is dropped quietly', threw === null, threw);
}

{
  const ws = fake();
  const { on } = cdp(ws);
  const got = [];
  on('Page.screencastFrame', (p) => got.push(p.sessionId));
  ws.answer({ method: 'Page.screencastFrame', params: { sessionId: 7 } });
  ws.answer({ method: 'Page.loadEventFired', params: {} });
  ok('events reach the handler for their method and no other', got.length === 1 && got[0] === 7, got);
}

console.log(bad ? `\n${bad} failed` : '\nall intact');
process.exit(bad ? 1 : 0);
