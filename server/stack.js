// Версия проекта и его стек — то, что дописывается второй строкой на табличке
// над дверью комнаты. Читаются только манифесты в корне репозитория: обход
// дерева ради этого не нужен, а на большом проекте он стоил бы секунды.
//
// Ловушка тут одна, и она стоит всего остального модуля: у Next-проекта тоже
// есть package.json, и наивная проверка «есть package.json → Node» объявляет
// «Node» весь мир. Поэтому сначала фреймворк по зависимостям, и только потом
// язык по самому манифесту.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Порядок здесь — это и есть приоритет: первый манифест, который смог назвать
// стек, отвечает и за версию. Файл, лежащий выше в списке, выигрывает у всех,
// что ниже, — иначе монорепа с package.json и pyproject.toml отвечает по
// настроению файловой системы.
export const MANIFESTS = [
  'package.json', 'pubspec.yaml', 'Cargo.toml', 'pyproject.toml',
  'go.mod', 'Gemfile', 'composer.json', 'Package.swift', 'build.gradle.kts',
];

// Зависимость → как это называется на табличке. Проверяется по порядку, потому
// что next тянет за собой react, а nuxt — vue: побеждает тот, кто конкретнее.
const JS_FRAMEWORKS = [
  ['next', 'Next'], ['nuxt', 'Nuxt'], ['@remix-run/react', 'Remix'],
  ['@angular/core', 'Angular'], ['astro', 'Astro'], ['@sveltejs/kit', 'SvelteKit'],
  ['react-native', 'React Native'], ['electron', 'Electron'], ['expo', 'Expo'],
  ['svelte', 'Svelte'], ['vue', 'Vue'], ['react', 'React'],
  ['express', 'Express'], ['fastify', 'Fastify'],
];

const PY_FRAMEWORKS = [
  ['django', 'Django'], ['fastapi', 'FastAPI'], ['flask', 'Flask'], ['torch', 'PyTorch'],
];

// Мажор фреймворка — «Next 16» говорит больше, чем «Next». Диапазоны и
// префиксы (^16.1.2, ~2.0, >=4) сводятся к первому числу; workspace:*, link: и
// git-ссылки числа не содержат вовсе, и тогда остаётся голое имя.
const major = (spec) => {
  const m = /(\d+)/.exec(String(spec || ''));
  return m ? ` ${m[1]}` : '';
};

// Проверка через `in`, а не по истинности значения: у питоньих зависимостей
// версия не разбирается и значение пустое, но сам факт зависимости есть.
const firstDep = (deps, table) => {
  for (const [dep, label] of table) if (dep in deps) return label + major(deps[dep]);
  return null;
};

// Версия из манифеста бывает пустой строкой, нулём и «0.0.0» — последнее пишут
// генераторы проектов, и на табличке оно выглядит как настоящая версия, хотя
// значит ровно «никто не проставил».
// «v» приписывается только числу. Тег `ios/1.0.0-build21` — тоже версия, и
// «vios/1.0.0-build21» на табличке читается как опечатка: увиденное 29 августа
// 2026 на первом же прогоне по живым проектам.
const usableVersion = (v) => {
  const s = String(v ?? '').trim().replace(/^v(?=\d)/, '');
  if (!s || s === '0.0.0' || s === '0.0.0-0') return null;
  return /^\d/.test(s) ? 'v' + s : s;
};

// Ключ = значение из toml/yaml верхнего уровня, без разбора всего формата:
// нужна одна строка, а тянуть парсер ради неё в проект без зависимостей нельзя.
const topLevel = (text, key) => {
  const re = new RegExp(`^${key}\\s*[:=]\\s*["']?([^"'\\n#]+)`, 'm');
  const m = re.exec(text);
  return m ? m[1].trim() : null;
};

// Разбор одного манифеста. Чистая функция от текста — из-за неё модуль и
// тестируется без файловой системы.
export function readManifest(file, text) {
  try {
    if (file === 'package.json') {
      const p = JSON.parse(text);
      const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
      return { version: usableVersion(p.version), stack: firstDep(deps, JS_FRAMEWORKS) || 'Node' };
    }
    if (file === 'pubspec.yaml') {
      // 1.2.3+45 — «+45» это номер сборки для сторов, на табличке он лишний
      const v = usableVersion((topLevel(text, 'version') || '').split('+')[0]);
      return { version: v, stack: /^\s*flutter\s*:/m.test(text) ? 'Flutter' : 'Dart' };
    }
    if (file === 'Cargo.toml') {
      return { version: usableVersion(topLevel(text, 'version')), stack: /tauri/.test(text) ? 'Tauri' : 'Rust' };
    }
    if (file === 'pyproject.toml') {
      // Зависимости в pyproject лежат тремя способами (PEP 621, poetry, pdm) и
      // все три пишут имя пакета первым словом строки или первым в кавычках.
      // Ищем именно имена, а не подстроку: «django» встречается и в описании
      // проекта, и в url репозитория, и в имени самого пакета.
      const deps = {};
      for (const m of text.matchAll(/(?:^\s*|["'])([a-zA-Z][a-zA-Z0-9_.-]*)\s*(?:[=><~^!]|["']\s*[:=])/gm)) {
        deps[m[1].toLowerCase()] = '';
      }
      return { version: usableVersion(topLevel(text, 'version')), stack: firstDep(deps, PY_FRAMEWORKS) || 'Python' };
    }
    if (file === 'go.mod') return { version: null, stack: 'Go' };
    if (file === 'Gemfile') return { version: null, stack: /rails/.test(text) ? 'Rails' : 'Ruby' };
    if (file === 'composer.json') {
      const p = JSON.parse(text);
      const deps = { ...(p.require || {}), ...(p['require-dev'] || {}) };
      return { version: usableVersion(p.version), stack: deps['laravel/framework'] ? 'Laravel' : 'PHP' };
    }
    if (file === 'Package.swift') return { version: null, stack: 'Swift' };
    if (file === 'build.gradle.kts') return { version: usableVersion(topLevel(text, 'version')), stack: 'Kotlin' };
  } catch { /* битый манифест — та же пустота, что и отсутствующий */ }
  return null;
}

// Первый манифест из MANIFESTS, который вообще прочитался. Версии в нём может
// не быть — это отдельный случай, и её добирает git.
export function pickManifest(found) {
  for (const file of MANIFESTS) {
    if (found[file] == null) continue;
    const info = readManifest(file, found[file]);
    if (info && info.stack) return { file, ...info };
  }
  return null;
}

// ------------------------------------------------------------------ с диска

const TTL = 5 * 60_000;
const cache = new Map(); // dir -> { at, info }

async function readRoot(dir) {
  const found = {};
  await Promise.all(MANIFESTS.map(async (f) => {
    try { found[f] = await fsp.readFile(path.join(dir, f), 'utf8'); } catch { /* нет так нет */ }
  }));
  return found;
}

// Запасной вариант, когда манифест есть, а версии в нём нет (go.mod, Gemfile) —
// или манифеста нет вовсе. Тег без коммитов сверху, поэтому --abbrev=0: длинный
// «v1.2.3-14-gdeadbee» на табличке шириной в тридцать пикселей не помещается.
async function gitTag(dir) {
  try {
    const { stdout } = await run('git', ['describe', '--tags', '--abbrev=0'], { cwd: dir, timeout: 2000 });
    return usableVersion(stdout.trim());
  } catch {
    return null;
  }
}

// { version, stack } для корня репозитория. Обе половины независимы: нашлась
// версия без стека — вернётся только версия. Не нашлось ничего — вернётся
// пустой объект, и табличка останется ровно такой, как была: выдуманный v0.0.0
// хуже пустоты, он выглядит как правда.
export async function projectInfo(dir) {
  if (!dir) return {};
  const hit = cache.get(dir);
  if (hit && Date.now() - hit.at < TTL) return hit.info;

  const picked = pickManifest(await readRoot(dir));
  const info = {};
  if (picked?.stack) info.stack = picked.stack;
  const version = picked?.version || await gitTag(dir);
  if (version) info.version = version;

  cache.set(dir, { at: Date.now(), info });
  return info;
}
