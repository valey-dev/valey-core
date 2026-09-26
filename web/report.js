// The page's uncaught errors go into the office's error journal (server/errors.js).
//
// A plain script loaded before main.js, not a module: a module that fails to
// load takes its own handlers down with it, and a broken import is exactly the
// failure worth writing down. On 26 September 2026 a tester's floor froze on
// `main.js:1890` and the only record of it was a screenshot he happened to take.
(function () {
  var sent = {};
  function report(message, stack, where) {
    if (!message) return;
    // The same error from a loop is one line in the journal, and one request.
    var key = message + '|' + (where || '');
    if (sent[key]) return;
    sent[key] = true;
    // The pass comes from web/owned.js once main.js has loaded. Before that — or
    // when main.js never loads — the report goes without one: a private office,
    // the default, admits everything from this machine anyway.
    var headers = { 'content-type': 'application/json' };
    if (window.__valey) headers = window.__valey.owned(headers);
    try {
      fetch('/api/error', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ message: String(message), stack: stack ? String(stack) : '', where: where || '', browser: navigator.userAgent }),
        keepalive: true,
      }).catch(function () { /* the office is gone; nothing to write to */ });
    } catch (e) { /* fetch itself is missing — too old a browser to matter */ }
  }
  window.addEventListener('error', function (ev) {
    // A failed <img> or <script> fires here too, with no message of its own.
    var where = ev.filename ? ev.filename + ':' + ev.lineno + ':' + ev.colno : '';
    if (ev.message) report(ev.message, ev.error && ev.error.stack, where);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    report((r && r.message) || String(r), r && r.stack, '');
  });
})();
