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
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
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
ok('Without the modules/ directory, the bootloader is silent and renders empty', (await loadModules(root)).length === 0);
ok('the list is empty', moduleList().length === 0);
ok('no settings added', Object.keys(moduleDefaults()).length === 0);
ok('the route is not intercepted by anyone', (await moduleRoute(new URL('http://x/api/wip'), {}, {}, () => {})) === false);

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
  'export const route = async (url, req, res, send, ctx) => {\n' +
  '  if (url.pathname === "/api/wip") { send(res, 200, { ok: true }); return true; }\n' +
  '  if (url.pathname === "/api/wip/where") {\n' +
  '    if (!(ctx && ctx.isOwner && await ctx.isOwner())) { send(res, 403, { error: "не хозяин" }); return true; }\n' +
  '    send(res, 200, { file: "/tmp/settings.json" }); return true;\n' +
  '  }\n' +
  '  return false;\n' +
  '};\n' +
  // The observer writes to disk rather than to memory: checking through a second
  // import is not on — the module is already loaded, and a second import returns
  // the cache.
  `export async function observe(now, prev) { await fsp.writeFile(${JSON.stringify(path.join(root, 'seen.json'))}, JSON.stringify([now?.n, prev?.n])); }\n`);

// 3. A folder with no manifest and a folder with a foreign id are not modules.
await fsp.mkdir(path.join(mods, 'мусор'), { recursive: true });
await fsp.mkdir(path.join(mods, 'чужой'), { recursive: true });
await fsp.writeFile(path.join(mods, 'чужой', 'module.json'), JSON.stringify({ id: 'не-тот-id', client: 'client.js' }));

const loaded = await loadModules(root);
ok('Exactly one module loaded', loaded.length === 1, loaded.map(m => m.id));
ok('it\'s him', loaded[0]?.id === 'пример');
ok('in the list for the client there is a path to the client and style',
  moduleList()[0]?.client === 'client.js' && moduleList()[0]?.style === 'style.css', moduleList());
ok('the module delivered its settings', moduleDefaults()['пример']?.ключ === '', moduleDefaults());
ok('no errors', moduleErrors().length === 0, moduleErrors());

let answered = null;
const taken = await moduleRoute(new URL('http://x/api/wip'), {}, {}, (_res, code, body) => { answered = { code, body }; });
ok('the module took its route', taken === true && answered?.code === 200, answered);
ok('didn\'t take someone else\'s route', (await moduleRoute(new URL('http://x/api/state'), {}, {}, () => {})) === false);

// The owner check is handed to a module route, not worked out inside it: the
// office has one such check and it knows about private mode, local addresses
// and the middleman. A module asks, and refuses on its own.
answered = null;
await moduleRoute(new URL('http://x/api/wip/where'), {}, {}, (_res, code, body) => { answered = { code, body }; },
  { isOwner: async () => true });
ok('the route answers the owner', answered?.code === 200 && answered.body.file === '/tmp/settings.json', answered);
answered = null;
await moduleRoute(new URL('http://x/api/wip/where'), {}, {}, (_res, code, body) => { answered = { code, body }; },
  { isOwner: async () => false });
ok('guest - refusal', answered?.code === 403, answered);
answered = null;
await moduleRoute(new URL('http://x/api/wip/where'), {}, {}, (_res, code, body) => { answered = { code, body }; });
ok('without context, it’s also a failure, not a fall', answered?.code === 403, answered);

// 4. A broken module server does not bring the office down, but does not stay quiet either.
await fsp.mkdir(path.join(mods, 'broken'), { recursive: true });
await fsp.writeFile(path.join(mods, 'broken', 'module.json'), JSON.stringify({ id: 'broken', server: 'server.js' }));
await fsp.writeFile(path.join(mods, 'broken', 'server.js'), 'this is not javascript(');
await loadModules(root);
ok('broken module didn\'t drop the load', moduleList().some(m => m.id === 'пример'));
ok('the broken module was not included in the list for the client', !moduleList().some(m => m.id === 'broken'));
ok('and it is said out loud', moduleErrors().some(e => e.id === 'broken'), moduleErrors());

// 5. Watching the office snapshot. The point is server-side, and it is needed by
// whoever keeps a journal: the client's `tick` is about a frame in the browser,
// and the browser is often closed while the office keeps running.
await moduleObserve({ n: 2 }, { n: 1 });
// Read once and defensively: if the observer never ran there is no file, and a
// second read brought the stand down along with the remaining checks — that is
// how the first CI run showed a crash instead of four honest failures.
const seen = await fsp.readFile(path.join(root, 'seen.json'), 'utf8').catch(() => null);
ok('the observer got the photo and the previous one', seen === '[2,1]', seen);

// An observer that throws neither stops the tick nor swallows its neighbours:
// this is called every 2.5 seconds and has to survive any foreign code.
await fsp.mkdir(path.join(mods, 'падучий'), { recursive: true });
await fsp.writeFile(path.join(mods, 'падучий', 'module.json'), JSON.stringify({ id: 'падучий', server: 'server.js' }));
await fsp.writeFile(path.join(mods, 'падучий', 'server.js'),
  'export const observe = async () => { throw new Error("observer crashed"); };\n');
await loadModules(root);
let survived = true;
try { await moduleObserve({ n: 3 }, { n: 2 }); } catch { survived = false; }
ok('the fallen observer did not drop the beat', survived);
ok('and didn’t stop the neighbor from working',
  await fsp.readFile(path.join(root, 'seen.json'), 'utf8') === '[3,2]',
  await fsp.readFile(path.join(root, 'seen.json'), 'utf8').catch(() => null));

await fsp.rm(root, { recursive: true, force: true });
console.log(bad ? `\n${bad} упало` : '\nall passed');
process.exit(bad ? 1 : 0);
