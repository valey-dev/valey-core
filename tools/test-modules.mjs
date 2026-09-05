// node tools/test-modules.mjs — the module loader.
//
// A module is a folder that in the free build is simply not there. Hence the
// main property, and the one checked here: **no modules is not a failure**. If
// the loader starts throwing or complaining over nothing, the free build stops
// building, and that gets discovered by a user.
//
// The rest is about a module not being smuggled in past its manifest: a folder
// without a `module.json`, and a folder whose id drifted from its name, are
// ignored. The second is not pedantry: the path /modules/<id>/ is built from the
// id, and once they drift you get a module whose client cannot be downloaded.
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
// A real module lies inside the repository, and that repository's package.json
// says "type": "module" — which is how its `server.js` knows it is ESM. The
// stand-in lies in a temp folder where there is no such package.json, so it
// writes its own. Without this line the stand passed on Node 20 and 22, where
// module syntax is detected automatically, and failed on Node 18, where it is
// not: found by the very first CI run on 4 September 2026 — which is what the
// matrix was set up for.
await fsp.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));

// 1. No modules/ directory at all — the free build.
ok('без каталога modules/ загрузчик молчит и отдаёт пустоту', (await loadModules(root)).length === 0);
ok('список пуст', moduleList().length === 0);
ok('настроек не добавилось', Object.keys(moduleDefaults()).length === 0);
ok('маршрут никем не перехвачен', (await moduleRoute(new URL('http://x/api/wip'), {}, {}, () => {})) === false);

// 2. A normal module with a server.
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
  // The observer writes to disk rather than to memory: checking through a second
  // import is not on — the module is already loaded, and a second import returns
  // the cache.
  `export async function observe(now, prev) { await fsp.writeFile(${JSON.stringify(path.join(root, 'seen.json'))}, JSON.stringify([now?.n, prev?.n])); }\n`);

// 3. A folder with no manifest and a folder with a foreign id are not modules.
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

// 4. A broken module server does not bring the office down, but does not stay quiet either.
await fsp.mkdir(path.join(mods, 'broken'), { recursive: true });
await fsp.writeFile(path.join(mods, 'broken', 'module.json'), JSON.stringify({ id: 'broken', server: 'server.js' }));
await fsp.writeFile(path.join(mods, 'broken', 'server.js'), 'this is not javascript(');
await loadModules(root);
ok('сломанный модуль не уронил загрузку', moduleList().some(m => m.id === 'пример'));
ok('сломанный модуль не попал в список для клиента', !moduleList().some(m => m.id === 'broken'));
ok('и о нём сказано вслух', moduleErrors().some(e => e.id === 'broken'), moduleErrors());

// 5. Watching the office snapshot. The point is server-side, and it is needed by
// whoever keeps a journal: the client's `tick` is about a frame in the browser,
// and the browser is often closed while the office keeps running.
await moduleObserve({ n: 2 }, { n: 1 });
// Read once and defensively: if the observer never ran there is no file, and a
// second read brought the stand down along with the remaining checks — that is
// how the first CI run showed a crash instead of four honest failures.
const seen = await fsp.readFile(path.join(root, 'seen.json'), 'utf8').catch(() => null);
ok('наблюдателю достались снимок и предыдущий', seen === '[2,1]', seen);

// An observer that throws neither stops the tick nor swallows its neighbours:
// this is called every 2.5 seconds and has to survive any foreign code.
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
