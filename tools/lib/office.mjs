// What every stand that raises a real office needs: a free port, a settings
// file of its own, and a sessions directory of its own with an invented agent.
//
// This used to live in each stand in its own way, and two of them depended on
// the machine: test-presence started on the user's real settings (in shared
// mode, a cascade of 403s; with weather on, a trip to open-meteo), and
// test-consent waited for a live agent in ~/.claude and gave up after sixteen
// seconds on a clean machine. The ports were fixed, and two worktrees collided.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

// The port is asked of the system rather than assigned: a fixed number is two
// worktrees colliding, which the stand reports as its own failure.
export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// An invented agent: a session with this process's pid (alive by definition)
// and a transcript of a few lines. The data is invented at the source — by the
// rule about anything that can end up in a public repository.
export async function fakeClaudeDir(dir, {
  sessionId = 'aaaaaaaa-0000-4000-8000-000000000001',
  cwd = '/Users/kolya/Projects/rocket-shop',
  said = 'Готово: корзина считает скидку и тест на неё зелёный.',
  asked = 'Посчитай скидку в корзине',
  file = '/Users/kolya/Projects/rocket-shop/src/cart.js',
} = {}) {
  const claude = path.join(dir, 'claude');
  const sessions = path.join(claude, 'sessions');
  const project = path.join(claude, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  await fsp.mkdir(sessions, { recursive: true });
  await fsp.mkdir(project, { recursive: true });
  await fsp.writeFile(path.join(sessions, `${process.pid}.json`), JSON.stringify({
    pid: process.pid, sessionId, cwd, startedAt: Date.now() - 60_000, version: '2.1.260', kind: 'interactive',
  }));
  const ts = (back) => new Date(Date.now() - back).toISOString();
  const lines = [
    { type: 'user', timestamp: ts(50_000), gitBranch: 'feature/cart-discount', message: { role: 'user', content: asked } },
    { type: 'assistant', timestamp: ts(40_000), message: { role: 'assistant', model: 'claude-fable-5', stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'Edit', input: { file_path: file } }] } },
    { type: 'assistant', timestamp: ts(30_000), message: { role: 'assistant', model: 'claude-fable-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: said }] } },
  ];
  await fsp.writeFile(path.join(project, `${sessionId}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return { dir: claude, sessionId, cwd, said, asked, file };
}

/**
 * Raises an office and waits until it answers. Returns { base, port, stop,
 * settingsFile }. settings is what to put in the settings file; claudeDir is the
 * sessions directory, if the stand needs an agent. It is killed by its own child
 * process, not by name and not by port.
 */
export async function startOffice({ settings = {}, claudeDir = null, env = {}, root = ROOT } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-stand-'));
  const settingsFile = path.join(dir, 'settings.json');
  await fsp.writeFile(settingsFile, JSON.stringify({
    // The weather is always off: a stand does not go to the internet, and a run
    // without a network must not turn into a failure.
    weather: { enabled: false }, delivery: { mode: 'default' },
    ...settings,
  }, null, 2));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // `root` is which office to raise, and it is not always this one. A module
  // lives in the other repository and is symlinked into a core checkout; its
  // stand has to raise the core it is plugged into rather than whichever one
  // this file happens to sit in, or it tests a version of the seam nobody is
  // editing.
  const srv = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', VALEY_SETTINGS: settingsFile,
      ...(claudeDir ? { VALEY_CLAUDE_DIR: claudeDir } : {}), ...env,
    },
    stdio: 'ignore',
  });
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try { srv.kill(); } catch { /* already dead */ }
    await fsp.rm(dir, { recursive: true, force: true });
  };
  process.on('exit', () => { try { srv.kill(); } catch { /* already dead */ } });
  for (let i = 0; i < 80; i++) {
    try { await fetch(base + '/api/whoami'); return { base, port, stop, settingsFile, tmp: dir }; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  await stop();
  throw new Error(`офис не поднялся на ${port}`);
}

// Waits for an agent to appear in the snapshot: the server does not assemble it
// in the same millisecond it starts.
export async function waitForAgent(get, tries = 40, pause = 150) {
  for (let i = 0; i < tries; i++) {
    const s = await get();
    if ((s.agents || []).length) return s;
    await new Promise((r) => setTimeout(r, pause));
  }
  throw new Error('агент не появился в снимке офиса');
}
