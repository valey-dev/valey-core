// Загрузчик модулей на стороне сервера.
//
// Модуль — это папка в `modules/` с `module.json`. Ядро обязано работать, когда
// папки нет вовсе: бесплатная сборка собирается тем, что её просто не кладут, а
// не тем, что где-то снимается галочка. Поэтому здесь ни одной проверки прав и
// ни одного ключа — только «лежит или не лежит».
//
// Разбор целиком — MODULES.md.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let loaded = [];

// Выключенные на стенде. Живут в памяти сервера и умирают вместе с ним: стенд
// — это проверка, а не режим работы, и забытая галочка не должна пережить
// перезапуск. Настоящая бесплатная сборка получается тем, что папки нет; здесь
// же лежит имитация — офис перестаёт знать о модуле, файлы остаются на диске.
const off = new Set();
const live = () => loaded.filter((m) => !m.error && !off.has(m.id));

export function setModuleOff(id, value) {
  if (!loaded.some((m) => m.id === id)) return false;
  if (value) off.add(id); else off.delete(id);
  return true;
}

// Всё, что лежит на диске, вместе с состоянием — для панели стенда.
export function moduleAll() {
  return loaded.map((m) => ({ id: m.id, off: off.has(m.id), broken: !!m.error }));
}

export async function loadModules(root) {
  const dir = path.join(root, 'modules');
  loaded = [];
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return loaded;                       // модулей нет — это нормальный режим, а не сбой
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const base = path.join(dir, e.name);
    // stat, а не e.isDirectory(): у символической ссылки на каталог dirent
    // говорит «не каталог», и приватные модули, привязанные ссылками из
    // соседнего репозитория, просто не находились бы. Ссылка — штатный способ
    // положить сюда чужой модуль, см. README репозитория модулей.
    try {
      if (!(await fsp.stat(base)).isDirectory()) continue;
    } catch {
      continue;                          // битая ссылка — не модуль, а мусор
    }
    let manifest;
    try {
      manifest = JSON.parse(await fsp.readFile(path.join(base, 'module.json'), 'utf8'));
    } catch {
      continue;                          // папка без манифеста — не модуль
    }
    // id обязан совпадать с именем папки: по нему строится путь /modules/<id>/,
    // и разъехавшись, они дают модуль, чей клиент не скачать.
    if (manifest.id !== e.name) continue;
    const mod = { id: manifest.id, manifest, dir: base, server: null, error: null };
    if (manifest.server) {
      try {
        mod.server = await import(pathToFileURL(path.join(base, manifest.server)).href);
      } catch (err) {
        mod.error = String((err && err.message) || err);
      }
    }
    loaded.push(mod);
  }
  return loaded;
}

// Что отдаём клиенту: только то, по чему он соберёт свои импорты.
export function moduleList() {
  return live().map(m => ({
    id: m.id,
    name: m.manifest.name || {},
    tier: m.manifest.tier || 'office',
    client: m.manifest.client || null,
    style: m.manifest.style || null
  }));
}

// Куски настроек, которые модуль добавляет в общий файл.
export function moduleDefaults() {
  const out = {};
  for (const m of live()) {
    if (typeof m.server?.defaults !== 'function') continue;
    Object.assign(out, m.server.defaults());
  }
  return out;
}

// Слияние настроек. Модуль возвращает фрагмент, который кладётся поверх общего
// результата: у мольберта так переживает сохранение токен, которого страница
// не видела и стёрла бы первым же patch'ем.
export function moduleMerge(prev, patch) {
  const out = {};
  for (const m of live()) {
    if (typeof m.server?.merge !== 'function') continue;
    Object.assign(out, m.server.merge(prev, patch));
  }
  return out;
}

// Что из настроек модуля можно показать странице. Ответ — фрагмент поверх
// общего: секреты вырезает сам модуль, потому что он один знает, где они.
export function modulePublic(s) {
  const out = {};
  for (const m of live()) {
    if (typeof m.server?.publicView !== 'function') continue;
    Object.assign(out, m.server.publicView(s));
  }
  return out;
}

// Побочные действия на сохранении настроек — сбросить кеш, забыть токен.
export function moduleOnPatch(patch) {
  for (const m of live()) {
    if (typeof m.server?.onPatch !== 'function') continue;
    try { m.server.onPatch(patch); } catch (err) { console.log(`модуль ${m.id} споткнулся на настройках: ${err}`); }
  }
}

// Маршруты. Первый, кто ответил true, забирает запрос.
export async function moduleRoute(url, req, res, send) {
  for (const m of live()) {
    if (typeof m.server?.route !== 'function') continue;
    if (await m.server.route(url, req, res, send)) return true;
  }
  return false;
}

// Наблюдение за снимком офиса. Ядро строит его раз в POLL_MS и раздаёт
// клиентам; модулю, который ведёт журнал или считает метрики, нужен тот же
// снимок на сервере. Клиентская точка `tick` для этого не годится: она про
// кадр в браузере, а браузер может быть закрыт — офис при этом работает.
//
// Ждём модули, а не бросаем и забываем: журналу нужен порядок, а такт и так
// стоит на await'ах снимка, погоды и настроек. Упавший наблюдатель не роняет
// такт и не молчит — как и везде в загрузчике.
export async function moduleObserve(now, prev) {
  const seen = live().filter((m) => typeof m.server?.observe === 'function');
  if (!seen.length) return;
  const done = await Promise.allSettled(seen.map((m) => m.server.observe(now, prev)));
  done.forEach((r, i) => {
    if (r.status === 'rejected') console.log(`модуль ${seen[i].id} споткнулся на снимке: ${r.reason}`);
  });
}

// Модуль, который не завёлся, не должен молчать: иначе «фича пропала» будет
// расследоваться глазами вместо одной строки в логе.
export function moduleErrors() {
  return loaded.filter(m => m.error).map(m => ({ id: m.id, error: m.error }));
}
