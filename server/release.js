// Пинок про релизный ролик: вышел минор, а ролика нет. Считается из
// репозитория и файла черновика — руками это состояние не выставляется, иначе
// оно врало бы ровно тогда, когда должно давить.
//
// Кадр: WIP — Пинок про релизный ролик, утверждён 1 сентября 2026.
import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DAY = 86400000;

// Чистая часть отдельно: она решает, показывать ли карточку, и её можно
// проверить стендом без git и без файловой системы.
export function nudgeFrom(info, now = Date.now()) {
  if (!info || !info.tag) return null;
  // Чек-лист закрыт целиком — работа сделана, пинать не за что.
  if (info.draft && info.draft.exists && info.draft.open === 0) return null;
  const days = info.taggedAt ? Math.max(0, Math.floor((now - info.taggedAt) / DAY)) : null;
  return {
    tag: info.tag,
    days,
    draft: `media/${info.tag}.md`,
    // Черновика может не быть: релиз старше генератора или файл удалили.
    // Это не повод молчать — наоборот, шагов до ролика на один больше.
    hasDraft: !!(info.draft && info.draft.exists),
    open: info.draft && info.draft.exists ? info.draft.open : null,
  };
}

// Разбор чек-листа: считаем только пункты списка задач, а не любые скобки в
// тексте — в сценарии их полно.
export function parseChecklist(md) {
  // Пробелов между маркером и скобкой может быть сколько угодно, и маркер
  // бывает `*`: это законный markdown, и черновик правит человек. Строгий
  // шаблон молча терял пункт и делал вид, что работы меньше.
  const open = (md.match(/^[ \t]*[-*][ \t]+\[ \][ \t]+/gm) || []).length;
  const done = (md.match(/^[ \t]*[-*][ \t]+\[[xX]\][ \t]+/gm) || []).length;
  return { open, done, total: open + done };
}

let cache = { at: 0, value: null };
const TTL = 60000;

export async function releaseNudge(root, now = Date.now()) {
  if (now - cache.at < TTL) return cache.value;
  let info = null;
  try {
    // Только версии: репозиторий растит и другие теги, и ближайший из них
    // легко оказывается журнальным.
    const { stdout } = await run('git', ['tag', '-l', 'v[0-9]*.[0-9]*.0', '--sort=-creatordate'], { cwd: root });
    const tag = stdout.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    if (tag) {
      const { stdout: at } = await run('git', ['log', '-1', '--format=%cI', tag], { cwd: root });
      info = { tag, taggedAt: Date.parse(at.trim()) || null, draft: null };
      const file = path.join(root, 'media', `${tag}.md`);
      try {
        const md = await fsp.readFile(file, 'utf8');
        info.draft = { exists: true, ...parseChecklist(md) };
      } catch { info.draft = { exists: false, open: null, done: null, total: 0 }; }
    }
  } catch { /* не репозиторий или git недоступен — молчим, это не ошибка офиса */ }
  cache = { at: now, value: nudgeFrom(info, now) };
  return cache.value;
}
