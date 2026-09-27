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

// The environment of an office raised to be photographed for the public —
// release notes, the social card. Everything in the office that speaks to its
// owner rather than about the product is switched off here, in one place, so
// the next such thing is one more line rather than one more incident:
//   VALEY_STAND  the yellow stand plaque — a leftover from the caller's shell
//                was photographed into a release note on 10 September 2026;
//   VALEY_NUDGE  the release-video nudge on the entrance — «v0.39.0 — not
//                shot» with a path on the owner's disk reached the public
//                v0.40.0 note on 12 September 2026.
// tools/test-picture-office.mjs raises an office with it and checks both.
// VALEY_PICTURE lets the picture office show what needs a second device —
// a pairing request (server/index.js, /api/pair).
export const PICTURE_ENV = Object.freeze({ VALEY_STAND: '', VALEY_NUDGE: 'off', VALEY_PICTURE: '1' });

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
  // The session file used to be named after this process's pid alone, so a
  // second invented agent in the same directory overwrote the first one and the
  // floor came out with one person on it. The name is free-form — the office
  // reads the pid out of the file, not off it — so a slot is enough.
  slot = '',
  branch = 'feature/cart-discount',
  sessionId = 'aaaaaaaa-0000-4000-8000-000000000001',
  cwd = '/Users/kolya/Projects/rocket-shop',
  said = 'Done: the cart calculates the discount and its test is green.',
  asked = 'Calculate the discount in the cart',
  file = '/Users/kolya/Projects/rocket-shop/src/cart.js',
  // Tokens the last reply was fed, written as the app writes usage; 0 writes
  // none, and the card and the bubble show no context at all (#context-size).
  ctx = 0,
} = {}) {
  const claude = path.join(dir, 'claude');
  const sessions = path.join(claude, 'sessions');
  const project = path.join(claude, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  await fsp.mkdir(sessions, { recursive: true });
  await fsp.mkdir(project, { recursive: true });
  await fsp.writeFile(path.join(sessions, `${process.pid}${slot ? '-' + slot : ''}.json`), JSON.stringify({
    pid: process.pid, sessionId, cwd, startedAt: Date.now() - 60_000, version: '2.1.260', kind: 'interactive',
  }));
  const ts = (back) => new Date(Date.now() - back).toISOString();
  // effort rides on every reply at the top level, as the app writes it, so the
  // card draws the level beside the model (#model-card).
  const lines = [
    { type: 'user', timestamp: ts(50_000), gitBranch: branch, message: { role: 'user', content: asked } },
    { type: 'assistant', timestamp: ts(40_000), effort: 'high', message: { role: 'assistant', model: 'claude-fable-5', stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'Edit', input: { file_path: file } }] } },
    { type: 'assistant', timestamp: ts(30_000), effort: 'high', message: { role: 'assistant', model: 'claude-fable-5', stop_reason: 'end_turn',
      ...(ctx ? { usage: { input_tokens: 3, cache_read_input_tokens: ctx - 3, cache_creation_input_tokens: 0, output_tokens: 400 } } : {}),
      content: [{ type: 'text', text: said }] } },
  ];
  await fsp.writeFile(path.join(project, `${sessionId}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  // The transcript's own path rides along: a picture that needs the agent in a
  // state no prompt reaches — cut off mid-step — gets there by a line appended to
  // it, the way the app itself would write one.
  return { dir: claude, sessionId, cwd, said, asked, file, transcript: path.join(project, `${sessionId}.jsonl`) };
}

// An invented Codex thread: a rollout under sessions/, a writer lock this
// process holds open — the office seats a thread only while some process
// holds its lock, as the Codex app does — and a name in the session index.
// Shapes as read off Codex Desktop on 13 September 2026 (server/codex.js).
// Returns { dir, release }; release() lets go of the lock.
export async function fakeCodexDir(dir, {
  id = '01a0aaaa-0000-7000-8000-00000000c0de',
  cwd = '/Users/kolya/Projects/tide-charts',
  branch = 'fix/timezone-drift',
  title = 'Timezone on the chart',
  asked = 'The chart is an hour off after the clocks change',
  said = 'Found it: the chart was drawn in local time and the data comes in UTC.',
  file = '/Users/kolya/Projects/tide-charts/src/chart.js',
} = {}) {
  const codex = path.join(dir, 'codex');
  const day = path.join(codex, 'sessions', '2026', '09', '13');
  await fsp.mkdir(day, { recursive: true });
  await fsp.mkdir(path.join(codex, 'thread-writer-locks'), { recursive: true });
  const ts = (back) => new Date(Date.now() - back).toISOString();
  const line = (back, type, payload) => JSON.stringify({ timestamp: ts(back), type, payload });
  const lines = [
    line(60_000, 'session_meta', { id, session_id: id, timestamp: ts(60_000), cwd, originator: 'Codex Desktop', source: 'vscode', git: { branch } }),
    line(55_000, 'event_msg', { type: 'task_started' }),
    line(55_000, 'turn_context', { cwd, model: 'gpt-invented' }),
    line(54_000, 'event_msg', { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: asked }] } }),
    line(40_000, 'event_msg', { type: 'item_completed', item: { type: 'FileChange', changes: { [file]: { type: 'update' } } } }),
    line(30_000, 'event_msg', { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text: said }] } }),
  ];
  await fsp.writeFile(path.join(day, `rollout-2026-09-13T10-00-00-${id}.jsonl`), lines.join('\n') + '\n');
  await fsp.appendFile(path.join(codex, 'session_index.jsonl'), JSON.stringify({ id, thread_name: title }) + '\n');
  const lock = path.join(codex, 'thread-writer-locks', id + '.lock');
  await fsp.writeFile(lock, '');
  const fh = await fsp.open(lock, 'r');
  return { dir: codex, id, release: () => fh.close() };
}

/**
 * Raises an office and waits until it answers. Returns { base, port, stop,
 * settingsFile }. settings is what to put in the settings file; claudeDir is the
 * sessions directory, if the stand needs an agent; codexDir the same for Codex
 * threads. It is killed by its own child process, not by name and not by port.
 */
export async function startOffice({ settings = {}, claudeDir = null, codexDir = null, env = {}, root = ROOT } = {}) {
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
      ...(claudeDir ? { VALEY_CLAUDE_DIR: claudeDir } : {}),
      // Always set: a stand without Codex threads must not read the real
      // ~/.codex of the machine it runs on — its frames may go public.
      VALEY_CODEX_DIR: codexDir || path.join(dir, 'no-codex'),
      ...env,
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
  throw new Error(`the office did not start on ${port}`);
}

// Waits for an agent to appear in the snapshot: the server does not assemble it
// in the same millisecond it starts.
export async function waitForAgent(get, tries = 40, pause = 150) {
  for (let i = 0; i < tries; i++) {
    const s = await get();
    if ((s.agents || []).length) return s;
    await new Promise((r) => setTimeout(r, pause));
  }
  throw new Error('the agent did not appear in the office snapshot');
}
