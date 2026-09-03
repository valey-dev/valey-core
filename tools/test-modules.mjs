// node tools/test-modules.mjs — загрузчик модулей.
//
// Модуль — это папка, которой в бесплатной сборке просто нет. Отсюда главное
// свойство, которое здесь и проверяется: **отсутствие модулей не сбой**. Если
// загрузчик начнёт падать или шуметь на пустом месте, бесплатная сборка
// перестанет собираться, и узнается это на пользователе.
//
// Остальное — про то, что модуль нельзя подсунуть мимо манифеста: папка без
// `module.json` и папка, чей id разъехался с именем, игнорируются. Второе не
// придирка: по id строится путь /modules/<id>/, и разъехавшись, они дают
// модуль, чей клиент не скачивается.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadModules, moduleList, moduleDefaults, moduleErrors, moduleRoute, moduleObserve } from '../server/modules.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-modules-'));

// 1. Каталога modules/ нет вовсе — бесплатная сборка.
ok('без каталога modules/ загрузчик молчит и отдаёт пустоту', (await loadModules(root)).length === 0);
ok('список пуст', moduleList().length === 0);
ok('настроек не добавилось', Object.keys(moduleDefaults()).length === 0);
ok('маршрут никем не перехвачен', (await moduleRoute(new URL('http://x/api/wip'), {}, {}, () => {})) === false);

// 2. Нормальный модуль с сервером.
const mods = path.join(root, 'modules');
await fsp.mkdir(path.join(mods, 'пример'), { recursive: true });
await fsp.writeFile(path.join(mods, 'пример', 'module.json'), JSON.stringify({
  id: 'пример', name: { ru: 'Пример', en: 'Sample' }, tier: 'office',
  client: 'client.js', style: 'style.css', server: 'server.js'
}));
await fsp.writeFile(path.join(mods, 'пример', 'server.js'),
  'import fsp from "node:fs/promises";\n' +
  'export const defaults = () => ({ пример: { ключ: "" } });\n' +
  'export const route = (url, req, res, send) => url.pathname === "/api/wip" ? (send(res, 200, { ok: true }), true) : false;\n' +
  // Наблюдатель пишет на диск, а не в память: проверять через повторный
  // import нельзя — модуль уже загружен, и второй import отдаст кэш.
  `export async function observe(now, prev) { await fsp.writeFile(${JSON.stringify(path.join(root, 'seen.json'))}, JSON.stringify([now?.n, prev?.n])); }\n`);

// 3. Папка без манифеста и папка с чужим id — не модули.
await fsp.mkdir(path.join(mods, 'мусор'), { recursive: true });
await fsp.mkdir(path.join(mods, 'чужой'), { recursive: true });
await fsp.writeFile(path.join(mods, 'чужой', 'module.json'), JSON.stringify({ id: 'не-тот-id', client: 'client.js' }));

const loaded = await loadModules(root);
ok('загрузился ровно один модуль', loaded.length === 1, loaded.map(m => m.id));
ok('это он', loaded[0]?.id === 'пример');
ok('в списке для клиента есть путь к клиенту и стилю',
  moduleList()[0]?.client === 'client.js' && moduleList()[0]?.style === 'style.css', moduleList());
ok('модуль довёз свои настройки', moduleDefaults()['пример']?.ключ === '', moduleDefaults());
ok('ошибок нет', moduleErrors().length === 0, moduleErrors());

let answered = null;
const taken = await moduleRoute(new URL('http://x/api/wip'), {}, {}, (_res, code, body) => { answered = { code, body }; });
ok('модуль забрал свой маршрут', taken === true && answered?.code === 200, answered);
ok('чужой маршрут не забрал', (await moduleRoute(new URL('http://x/api/state'), {}, {}, () => {})) === false);

// 4. Сломанный сервер модуля не роняет офис, но и не молчит.
await fsp.mkdir(path.join(mods, 'broken'), { recursive: true });
await fsp.writeFile(path.join(mods, 'broken', 'module.json'), JSON.stringify({ id: 'broken', server: 'server.js' }));
await fsp.writeFile(path.join(mods, 'broken', 'server.js'), 'this is not javascript(');
await loadModules(root);
ok('сломанный модуль не уронил загрузку', moduleList().some(m => m.id === 'пример'));
ok('сломанный модуль не попал в список для клиента', !moduleList().some(m => m.id === 'broken'));
ok('и о нём сказано вслух', moduleErrors().some(e => e.id === 'broken'), moduleErrors());

// 5. Наблюдение за снимком офиса. Точка серверная, и она нужна тем, кто ведёт
// журнал: клиентский `tick` — про кадр в браузере, а браузер бывает закрыт,
// пока офис работает.
await moduleObserve({ n: 2 }, { n: 1 });
ok('наблюдателю достались снимок и предыдущий',
  await fsp.readFile(path.join(root, 'seen.json'), 'utf8') === '[2,1]',
  await fsp.readFile(path.join(root, 'seen.json'), 'utf8').catch(() => null));

// Упавший наблюдатель не роняет такт и не глотает соседей: это зовётся раз в
// 2.5 секунды и обязано пережить любой чужой код.
await fsp.mkdir(path.join(mods, 'падучий'), { recursive: true });
await fsp.writeFile(path.join(mods, 'падучий', 'module.json'), JSON.stringify({ id: 'падучий', server: 'server.js' }));
await fsp.writeFile(path.join(mods, 'падучий', 'server.js'),
  'export const observe = async () => { throw new Error("наблюдатель упал"); };\n');
await loadModules(root);
let survived = true;
try { await moduleObserve({ n: 3 }, { n: 2 }); } catch { survived = false; }
ok('упавший наблюдатель не уронил такт', survived);
ok('и не помешал соседу отработать',
  await fsp.readFile(path.join(root, 'seen.json'), 'utf8') === '[3,2]',
  await fsp.readFile(path.join(root, 'seen.json'), 'utf8').catch(() => null));

await fsp.rm(root, { recursive: true, force: true });
console.log(bad ? `\n${bad} упало` : '\nвсё прошло');
process.exit(bad ? 1 : 0);
