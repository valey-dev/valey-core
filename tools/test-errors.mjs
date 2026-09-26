// node tools/test-errors.mjs — the office's error journal (server/errors.js).
//
// On 26 September 2026 a tester's task failed with «No conversation found with
// session ID» and nothing else: which `claude` the office called and which
// version were never learned, so the bug was never found. The journal keeps
// those, on this machine, with home directories cut to «~».
//
// The CLI here is a script of the stand's own, and the agent an invented one:
// nothing reaches a live chat and the real journal is not touched.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fakeClaudeDir, startOffice, waitForAgent } from './lib/office.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)?.slice(0, 400)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-errors-'));
process.env.VALEY_ERRORS = path.join(dir, 'unit.jsonl');
const { recordError, readErrors, redact, KEEP, REPEAT_MS } = await import('../server/errors.js');

// --- what goes in ---------------------------------------------------------
ok('a home directory becomes ~', redact('at /Users/anna/Projects/x/a.js:1', '/Users/anna') === 'at ~/Projects/x/a.js:1',
  redact('at /Users/anna/Projects/x/a.js:1', '/Users/anna'));
ok('the office address leaves page stacks', redact('update (http://localhost:5177/main.js:1890:21)') === 'update (/main.js:1890:21)',
  redact('update (http://localhost:5177/main.js:1890:21)'));

const file = path.join(dir, 'journal.jsonl');
const t0 = 1_800_000_000_000;
await recordError({ source: 'page', message: 'boom', where: '/main.js:1:1' }, { file, now: t0 });
await recordError({ source: 'page', message: 'boom', where: '/main.js:1:1' }, { file, now: t0 + 1000 });
let got = await readErrors({ file });
ok('the same failure again is one line with a count', got.length === 1 && got[0].count === 2 && got[0].last === t0 + 1000, got);
await recordError({ source: 'page', message: 'boom' }, { file, now: t0 + 1000 + REPEAT_MS + 1 });
got = await readErrors({ file });
ok('and a new line once the window has passed', got.length === 2, got);
ok('empty fields are not written', !('stack' in got[1]) && !('where' in got[1]), got[1]);

const many = path.join(dir, 'many.jsonl');
await Promise.all(Array.from({ length: KEEP + 25 }, (_, i) => recordError({ source: 'server', message: 'e' + i }, { file: many, now: t0 + i })));
got = await readErrors({ file: many });
ok(`writes at once lose nothing and the journal keeps the last ${KEEP}`,
  got.length === KEEP && got[0].message === 'e25' && got[KEEP - 1].message === 'e' + (KEEP + 24), [got.length, got[0], got[KEEP - 1]]);

// --- through the office ---------------------------------------------------
// A CLI that is logged in, says its version, and cannot find the conversation —
// the tester's answer, word for word.
const fake = path.join(dir, 'claude-bin');
await fsp.writeFile(fake, `#!${process.execPath}
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }
if (a[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, email: 'kolya@example.com' })); process.exit(0); }
console.error('No conversation found with session ID: ' + a[a.indexOf('--resume') + 1]);
process.exit(1);
`, { mode: 0o755 });

// A folder that exists: the CLI is spawned in the agent's cwd.
const claude = await fakeClaudeDir(dir, { cwd: dir });
const { base, stop, settingsFile } = await startOffice({ claudeDir: claude.dir, env: { CLAUDE_BIN: fake, VALEY_ERRORS: '' } });
try {
  const journal = settingsFile.replace(/\.json$/, '.errors.jsonl');
  const get = async (p) => (await fetch(base + p)).json();
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const page = await post('/api/error', { message: "Cannot read properties of undefined (reading 'x')",
    stack: 'TypeError\n    at update (http://127.0.0.1:1/main.js:1890:21)', where: 'http://127.0.0.1:1/main.js:1890:21' });
  ok('the page reports an error', page.status === 200, page.status);
  ok('an empty report is refused', (await post('/api/error', {})).status === 400);

  await waitForAgent(() => get('/api/state'));
  const sent = await (await post('/api/task', { agentId: claude.sessionId, text: 'a private task text', deliver: true })).json();
  ok('the task is accepted for delivery', sent.ok === true, sent);
  let failed = null;
  for (let i = 0; i < 60 && !failed; i++) {
    const { errors } = await get('/api/errors');
    failed = (errors || []).find((e) => e.source === 'deliver');
    if (!failed) await new Promise((r) => setTimeout(r, 150));
  }
  ok('a failed delivery lands in the journal with the CLI answer', failed && /No conversation found/.test(failed.message), failed);
  ok('with which CLI and which version', failed && failed.cli === fake && failed.cliVersion === '9.9.9 (Claude Code)', failed);
  ok('and without the text of the task', failed && !JSON.stringify(failed).includes('private task'), failed);

  const { env, errors } = await get('/api/errors');
  const p = errors.find((e) => e.source === 'page');
  ok('the page error keeps its line and loses the address', p && p.where === '/main.js:1890:21' && p.stack.includes('(/main.js:1890:21)'), p);
  ok('the journal names the machine', env && env.node === process.version && env.cliVersion === '9.9.9 (Claude Code)' && env.office, env);
  ok('a stand writes beside its own settings, not into the real journal',
    (await fsp.readFile(journal, 'utf8')).includes('No conversation found'), journal);
} finally {
  await stop();
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} failed` : '\nall ok');
process.exit(bad ? 1 : 0);
