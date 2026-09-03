// Есть ли в каталоге репозиторий. Это всё, что ядро знает про git: панель
// истории уехала модулем в modules/gittree/ 3 сентября 2026, а здесь остался
// один вопрос — от него зависит, вырастет ли в комнате дерево и что покажет
// стек версии в stack.js.
//
// `git` отдаётся наружу нарочно: модулю нужен тот же запускатель с теми же
// таймаутами, а скопированный руками помощник расходится с оригиналом молча.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const git = (dir, args, opts = {}) => run('git', args, {
  cwd: dir,
  timeout: opts.timeout || 5000,
  maxBuffer: opts.maxBuffer || 8 * 1024 * 1024,
});

// Отдельным вопросом, потому что от ответа зависит не только панель.
export async function hasRepo(dir) {
  if (!dir) return false;
  try {
    await git(dir, ['rev-parse', '--git-dir'], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
