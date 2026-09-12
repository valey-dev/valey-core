// The DevTools protocol client behind tools/shot.mjs. It lives apart so that a
// stand can drive it with a fake socket: CI has neither Chrome nor, on Node 18
// and 20, a global WebSocket, and the failures below are exactly the ones a run
// with a real browser cannot be made to produce on purpose.
//
// Every command ends. Until 12 September 2026 it did not, in three ways:
//
// - Chrome answered an error and `send` resolved with `undefined`. `--viewport
//   390` (no height) was refused by Emulation.setDeviceMetricsOverride, and the
//   frame came out 1400×733 with exit 0 — the flag looked obeyed.
// - The socket closed under a pending command, and nothing settled it. Node
//   noticed the unsettled top-level await and quit with code 13 and no word
//   about Chrome, leaving the temporary profile behind.
// - Chrome stayed alive and never answered. The event loop was held open by the
//   socket, so the run hung until someone killed it — three runs on 4 and
//   5 September, killed at 137 and 143 with no clue which step it was.
//
// So an error rejects, a close rejects everything pending and everything sent
// after it, and a command unanswered for `timeout` ms rejects — each naming the
// method, because the method is the only clue to what went wrong.

export function cdp(ws, { timeout = 30000 } = {}) {
  let id = 0;
  let gone = '';
  const pending = new Map();
  const handlers = new Map();

  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.fail(`${m.error.message}${m.error.data ? ` (${m.error.data})` : ''}`);
      else p.done(m.result);
      return;
    }
    if (m.method && handlers.has(m.method)) handlers.get(m.method)(m.params);
  });
  ws.addEventListener('close', () => {
    gone = 'Chrome closed the connection';
    for (const p of pending.values()) p.fail(gone);
    pending.clear();
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const fail = (why) => reject(new Error(`${method}: ${why}`));
    if (gone) { fail(gone); return; }
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); fail(`no answer in ${timeout / 1000} s`); }, timeout);
    pending.set(n, {
      done: (r) => { clearTimeout(timer); resolve(r); },
      fail: (why) => { clearTimeout(timer); fail(why); },
    });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  return { send, on: (method, fn) => handlers.set(method, fn) };
}
