// Что нужно каждому стенду, который поднимает настоящий офис: свободный порт,
// свой файл настроек, свой каталог сессий с выдуманным агентом.
//
// Раньше это лежало в каждом стенде по-своему, и два из них зависели от
// машины: test-presence стартовал на настоящих настройках пользователя (в
// режиме shared — каскад 403, с погодой — поход в open-meteo), а test-consent
// ждал живого агента в ~/.claude и на чистой машине падал через шестнадцать
// секунд. Порты были фиксированные, и два worktree сталкивались.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

// Порт спрашивается у системы, а не назначается: фиксированный номер — это
// столкновение двух worktree, о котором стенд сообщает как о своём провале.
export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// Выдуманный агент: сессия с pid этого процесса (он жив по определению) и
// транскрипт из нескольких строк. Данные придуманы с самого начала — по
// правилу про всё, что может уехать в публичный репозиторий.
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
 * Поднимает офис и ждёт, пока он ответит. Возвращает { base, port, stop, settingsFile }.
 * settings — что положить в файл настроек; claudeDir — каталог сессий, если
 * стенду нужен агент. Гасится по своему потомку, а не по имени и не по порту.
 */
export async function startOffice({ settings = {}, claudeDir = null, env = {} } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-stand-'));
  const settingsFile = path.join(dir, 'settings.json');
  await fsp.writeFile(settingsFile, JSON.stringify({
    // Погода выключена всегда: стенд не ходит в интернет, и запуск без сети
    // не должен становиться провалом.
    weather: { enabled: false }, delivery: { mode: 'default' },
    ...settings,
  }, null, 2));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
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
    try { srv.kill(); } catch { /* уже мёртв */ }
    await fsp.rm(dir, { recursive: true, force: true });
  };
  process.on('exit', () => { try { srv.kill(); } catch { /* уже мёртв */ } });
  for (let i = 0; i < 80; i++) {
    try { await fetch(base + '/api/whoami'); return { base, port, stop, settingsFile, tmp: dir }; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  await stop();
  throw new Error(`офис не поднялся на ${port}`);
}

// Ждёт, пока в снимке появится агент: сервер собирает его не в ту же
// миллисекунду, что стартует.
export async function waitForAgent(get, tries = 40, pause = 150) {
  for (let i = 0; i < tries; i++) {
    const s = await get();
    if ((s.agents || []).length) return s;
    await new Promise((r) => setTimeout(r, pause));
  }
  throw new Error('агент не появился в снимке офиса');
}
