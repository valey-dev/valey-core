// Delivery of a task into a live chat: `claude --resume <session> -p "<text>"`.
// That continues the very same conversation in headless mode — the reply lands in
// the session transcript, so the office sees it. The open desktop window will not
// redraw itself; the exchange shows up in the history (and in the game).
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT_MS = 10 * 60 * 1000;
export const MODES = new Set(['default', 'acceptEdits', 'bypassPermissions']);

// headless runs cannot answer a permission prompt, so a blocked agent just says so
const BLOCKED_RE = /(упер[а-яё]* в прав|требу[а-яё]* (?:тво[а-яё]* )?подтвержд|нужн[а-яё]* (?:тво[а-яё]* )?разрешени|не хватает прав|нет прав[а-яё]* на|permission (?:denied|required)|requires? (?:your )?approval|not allowed to)/i;

// A run that has not finished in TIMEOUT_MS gets SIGTERM, and one that ignores
// it gets SIGKILL after the grace. Without the second step a hung run kept its
// agent «busy» until the server restarted: nothing else ever clears the flag.
const GRACE_MS = 5000;

const NO_CLI = { checked: false, path: null, error: null, errorKey: null, at: 0 };
let cli = NO_CLI;
let looking = null;
// A found CLI is kept for good, a miss for a minute: somebody may install the
// CLI while the office runs, and «not found» after an install reads as the
// office being broken. The key card's button asks at once (forgetCli).
const MISS_TTL = 60_000;
// The CLI account changes underfoot — somebody logs in as someone else, and
// the office has to notice, so the answer lives a minute rather than until the
// server restarts.
let acc = { at: 0, value: null };
const ACC_TTL = 60_000;
const busy = new Set();

async function lookup() {
  const found = { ...NO_CLI, checked: true, at: Date.now() };
  const explicit = process.env.CLAUDE_BIN;
  if (explicit) { found.path = explicit; return found; }
  try {
    // a login shell, so nvm/homebrew paths are in place
    const { stdout } = await run('/bin/sh', ['-lc', 'command -v claude'], { timeout: 5000 });
    found.path = stdout.trim().split('\n')[0] || null;
  } catch { /* not found — the same answer as an empty one */ }
  if (!found.path) { found.error = 'claude was not found in PATH'; found.errorKey = 'err.noCli'; }
  return found;
}

// One lookup at a time, and nobody reads its answer before it arrives. Until
// 13 September 2026 the «checked» flag went up before the shell answered, so a
// second caller inside those seconds — the tick and a task sent at the same
// moment — was told «not installed» about a CLI that was there.
// `look` is for the stand: the real lookup depends on what this machine has.
export function findCli(look = lookup) {
  if (cli.checked && (cli.path || Date.now() - cli.at < MISS_TTL)) return Promise.resolve(cli);
  if (!looking) {
    // forgetCli may drop this lookup halfway; its answer then goes only to
    // those who were already waiting for it, and the next call asks again
    const p = look()
      .then((c) => { if (looking === p) cli = c; return c; })
      .finally(() => { if (looking === p) looking = null; });
    looking = p;
  }
  return looking;
}

// Which account the CLI continues conversations as. This is a separate login
// from the app: one account may have started the session, and the one the CLI
// runs under is the one that continues it — and the one that hits the limit.
async function account(path) {
  if (acc.value !== null && Date.now() - acc.at < ACC_TTL) return acc.value;
  acc = { at: Date.now(), value: false };
  let out = '';
  try {
    out = (await run(path, ['auth', 'status'], { timeout: 8000 })).stdout;
  } catch (e) {
    // a logged-out CLI answers with the same json but exits with code 1
    out = (e && e.stdout) || '';
  }
  try {
    const d = JSON.parse(out.slice(out.indexOf('{')));
    acc.value = {
      email: d.email || null,
      plan: d.subscriptionType || null,
      loggedIn: d.loggedIn !== false,
    };
  } catch { /* an older CLI without auth status — we manage without the name */ }
  return acc.value;
}

// Logged in as someone else — the office learns it at once, without waiting out the minute
export function forgetAccount() { acc = { at: 0, value: null }; }
// The full recheck behind the key card's button: the binary and the account
// both, without waiting out the minute a miss is kept.
export function forgetCli() { cli = NO_CLI; looking = null; forgetAccount(); }

export async function deliveryStatus() {
  const c = await findCli();
  const who = c.path ? await account(c.path) : null;
  // a logged-out CLI looks installed, but it will not carry the task through
  const out = who && who.loggedIn === false;
  return {
    available: !!c.path && !out,
    path: c.path,
    account: who || null,
    error: c.error,
    errorKey: c.errorKey || null,
    // the key travels next to the Russian text: the office is bilingual, the server is not
    hintKey: !c.path ? 'err.installCli' : out ? 'err.loggedOut' : null,
    hint: !c.path
      ? 'Install the CLI: npm install -g @anthropic-ai/claude-code (or set CLAUDE_BIN)'
      : out ? 'The CLI is signed out; run claude auth login in a terminal' : null,
  };
}

export function isBusy(agentId) { return busy.has(agentId); }

// task is mutated in place so the game can watch it move through its states;
// the timings are for the stand, which cannot wait ten minutes
export async function deliver(task, agent, mode = 'default', { timeout = TIMEOUT_MS, grace = GRACE_MS } = {}) {
  const c = await findCli();
  if (!c.path) { task.state = 'failed'; task.error = 'claude CLI is not installed'; task.errorKey = 'err.notInstalled'; return task; }
  if (busy.has(agent.id)) { task.state = 'failed'; task.error = 'another message is already being sent to this agent'; task.errorKey = 'err.busy'; return task; }

  const args = ['--resume', agent.id, '-p', task.text];
  if (MODES.has(mode) && mode !== 'default') args.push('--permission-mode', mode);

  busy.add(agent.id);
  task.state = 'sending';
  task.startedAt = Date.now();

  const child = spawn(c.path, args, {
    cwd: agent.cwd || process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; if (out.length > 200_000) out = out.slice(-200_000); });
  child.stderr.on('data', (d) => { err += d; if (err.length > 20_000) err = err.slice(-20_000); });

  let timedOut = false, kill = null;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    kill = setTimeout(() => child.kill('SIGKILL'), grace);
  }, timeout);
  const stop = () => { clearTimeout(timer); clearTimeout(kill); busy.delete(agent.id); };
  // 'close' waits for the pipes as well as the process, and whatever the run
  // started — a tool's shell — inherits them and outlives the kill. A stopped
  // run has nothing more to say, so its pipes are closed from this side.
  child.on('exit', () => { if (timedOut) { child.stdout.destroy(); child.stderr.destroy(); } });

  return new Promise((resolve) => {
    child.on('error', (e) => {
      stop();
      task.state = 'failed'; task.error = e.message; task.finishedAt = Date.now();
      console.error('[deliver]', e.message);
      resolve(task);
    });
    child.on('close', (code) => {
      stop();
      task.finishedAt = Date.now();
      if (timedOut) {
        // a killed run closes with no code, which used to read «exited with code null»
        task.state = 'failed';
        task.error = `claude did not finish in ${Math.round(timeout / 60000)} minutes and was stopped`;
        task.errorKey = 'err.timedOut';
      } else if (code === 0) {
        task.state = 'delivered';
        task.reply = out.trim().slice(0, 2000);
        task.mode = mode;
        if (mode !== 'bypassPermissions' && BLOCKED_RE.test(task.reply)) {
          task.blocked = true;
          console.log('[deliver] blocked on permissions; mode was:', mode);
        }
      } else {
        const raw = (err.trim() || out.trim() || `claude exited with code ${code}`);
        const notAuthed = /not logged in|please run \/login/i.test(raw);
        task.errorKey = notAuthed ? 'err.notAuthed' : null;
        task.error = notAuthed
          ? 'CLI is not authorized: open a terminal, start claude, and run /login (or claude setup-token)'
          : raw.slice(0, 500);
        task.state = 'failed';
      }
      console.log(`[deliver] ${agent.name || agent.id}: ${task.state}`);
      resolve(task);
    });
  });
}
