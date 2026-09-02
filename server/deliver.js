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

let cli = { checked: false, path: null, error: null };
// Аккаунт CLI меняется на ходу — человек перелогинился, и офис должен это заметить,
// поэтому ответ живёт минуту, а не до перезапуска сервера.
let acc = { at: 0, value: null };
const ACC_TTL = 60_000;
const busy = new Set();

export async function findCli() {
  if (cli.checked) return cli;
  cli.checked = true;
  const explicit = process.env.CLAUDE_BIN;
  if (explicit) { cli.path = explicit; return cli; }
  try {
    // a login shell, so nvm/homebrew paths are in place
    const { stdout } = await run('/bin/sh', ['-lc', 'command -v claude'], { timeout: 5000 });
    const p = stdout.trim().split('\n')[0];
    if (p) cli.path = p;
    else { cli.error = 'claude не найден в PATH'; cli.errorKey = 'err.noCli'; }
  } catch {
    cli.error = 'claude не найден в PATH'; cli.errorKey = 'err.noCli';
  }
  return cli;
}

// Каким аккаунтом CLI продолжает разговоры. Это отдельный вход от приложения:
// сессию мог завести один аккаунт, а продолжит её тот, под которым живёт CLI, —
// и упирается в лимит тоже он.
async function account(path) {
  if (acc.value !== null && Date.now() - acc.at < ACC_TTL) return acc.value;
  acc = { at: Date.now(), value: false };
  let out = '';
  try {
    out = (await run(path, ['auth', 'status'], { timeout: 8000 })).stdout;
  } catch (e) {
    // разлогиненный CLI отвечает тем же json, но выходит с кодом 1
    out = (e && e.stdout) || '';
  }
  try {
    const d = JSON.parse(out.slice(out.indexOf('{')));
    acc.value = {
      email: d.email || null,
      plan: d.subscriptionType || null,
      loggedIn: d.loggedIn !== false,
    };
  } catch { /* старый CLI без auth status — обойдёмся без имени */ }
  return acc.value;
}

// Перелогинился — офис узнает об этом сразу, не дожидаясь конца минуты
export function forgetAccount() { acc = { at: 0, value: null }; }

export async function deliveryStatus() {
  const c = await findCli();
  const who = c.path ? await account(c.path) : null;
  // разлогиненный CLI выглядит как установленный, но задание он не донесёт
  const out = who && who.loggedIn === false;
  return {
    available: !!c.path && !out,
    path: c.path,
    account: who || null,
    error: c.error,
    errorKey: c.errorKey || null,
    // ключ едет рядом с русским текстом: офис двуязычный, а сервер — нет
    hintKey: !c.path ? 'err.installCli' : out ? 'err.loggedOut' : null,
    hint: !c.path
      ? 'Установи CLI: npm install -g @anthropic-ai/claude-code (или укажи путь в CLAUDE_BIN)'
      : out ? 'CLI разлогинен — в терминале claude auth login' : null,
  };
}

export function isBusy(agentId) { return busy.has(agentId); }

// task is mutated in place so the game can watch it move through its states
export async function deliver(task, agent, mode = 'default') {
  const c = await findCli();
  if (!c.path) { task.state = 'failed'; task.error = 'claude CLI не установлен'; task.errorKey = 'err.notInstalled'; return task; }
  if (busy.has(agent.id)) { task.state = 'failed'; task.error = 'этому агенту уже что-то отправляется'; task.errorKey = 'err.busy'; return task; }

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

  const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);

  return new Promise((resolve) => {
    child.on('error', (e) => {
      clearTimeout(timer); busy.delete(agent.id);
      task.state = 'failed'; task.error = e.message; task.finishedAt = Date.now();
      console.error('[deliver]', e.message);
      resolve(task);
    });
    child.on('close', (code) => {
      clearTimeout(timer); busy.delete(agent.id);
      task.finishedAt = Date.now();
      if (code === 0) {
        task.state = 'delivered';
        task.reply = out.trim().slice(0, 2000);
        task.mode = mode;
        if (mode !== 'bypassPermissions' && BLOCKED_RE.test(task.reply)) {
          task.blocked = true;
          console.log('[deliver] упёрся в права, режим был:', mode);
        }
      } else {
        const raw = (err.trim() || out.trim() || `claude вышел с кодом ${code}`);
        const notAuthed = /not logged in|please run \/login/i.test(raw);
        task.errorKey = notAuthed ? 'err.notAuthed' : null;
        task.error = notAuthed
          ? 'CLI не авторизован: открой терминал, запусти claude и выполни /login (или claude setup-token)'
          : raw.slice(0, 500);
        task.state = 'failed';
      }
      console.log(`[deliver] ${agent.name || agent.id}: ${task.state}`);
      resolve(task);
    });
  });
}
