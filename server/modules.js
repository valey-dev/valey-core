// The module loader, server side.
//
// A module is a folder in `modules/` with a `module.json`. The core has to work
// when the folder is not there at all: the free build is made by not putting it
// there, not by unticking a box somewhere. So there is not a single licence
// check and not a single key here — only "is the folder present".
//
// The whole reasoning is in MODULES.md.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let loaded = [];

// Switched off on the stand. They live in the server's memory and die with it:
// a stand is a check, not a mode of operation, and a forgotten tick must not
// survive a restart. The real free build comes from the folder being absent;
// what lives here is a simulation — the office stops knowing about the module
// while the files stay on disk.
const off = new Set();
const live = () => loaded.filter((m) => !m.error && !off.has(m.id));

export function setModuleOff(id, value) {
  if (!loaded.some((m) => m.id === id)) return false;
  if (value) off.add(id); else off.delete(id);
  return true;
}

// Everything on disk, with its state — for the stand card.
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
    return loaded;                       // no modules is a normal build, not a failure
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const base = path.join(dir, e.name);
    // stat, not e.isDirectory(): for a symlink to a directory the dirent says
    // "not a directory", and modules linked in from the neighbouring
    // repository would simply not be found. A symlink is the intended way to
    // put someone else's module here — see the modules repository README.
    try {
      if (!(await fsp.stat(base)).isDirectory()) continue;
    } catch {
      continue;                          // a broken symlink is rubbish, not a module
    }
    let manifest;
    try {
      manifest = JSON.parse(await fsp.readFile(path.join(base, 'module.json'), 'utf8'));
    } catch {
      continue;                          // a folder without a manifest is not a module
    }
    // The id must equal the folder name: the path /modules/<id>/ is built from
    // it, and once they drift you get a module whose client cannot be
    // downloaded.
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

// What goes to the client: only what it needs to build its imports.
export function moduleList() {
  return live().map(m => ({
    id: m.id,
    name: m.manifest.name || {},
    tier: m.manifest.tier || 'office',
    client: m.manifest.client || null,
    style: m.manifest.style || null
  }));
}

// The pieces of settings a module adds to the shared file.
export function moduleDefaults() {
  const out = {};
  for (const m of live()) {
    if (typeof m.server?.defaults !== 'function') continue;
    Object.assign(out, m.server.defaults());
  }
  return out;
}

// Merging settings. A module returns a fragment that is laid over the shared
// result: that is how the easel's token survived a save — the page never saw
// it and would have wiped it with the first patch.
export function moduleMerge(prev, patch) {
  const out = {};
  for (const m of live()) {
    if (typeof m.server?.merge !== 'function') continue;
    Object.assign(out, m.server.merge(prev, patch));
  }
  return out;
}

// What of a module's settings may be shown to the page. The answer is a
// fragment over the shared one: the module cuts its own secrets out, because it
// is the only one that knows where they are.
export function modulePublic(s) {
  const out = {};
  for (const m of live()) {
    if (typeof m.server?.publicView !== 'function') continue;
    Object.assign(out, m.server.publicView(s));
  }
  return out;
}

// Side effects on a settings save — drop a cache, forget a token.
export function moduleOnPatch(patch) {
  for (const m of live()) {
    if (typeof m.server?.onPatch !== 'function') continue;
    try { m.server.onPatch(patch); } catch (err) { console.log(`модуль ${m.id} споткнулся на настройках: ${err}`); }
  }
}

// Routes. The first to answer true takes the request.
export async function moduleRoute(url, req, res, send) {
  for (const m of live()) {
    if (typeof m.server?.route !== 'function') continue;
    if (await m.server.route(url, req, res, send)) return true;
  }
  return false;
}

// Watching the office snapshot. The core builds it once every POLL_MS and
// hands it to the clients; a module that keeps a journal or counts something
// needs that same snapshot on the server. The client-side `tick` point will not
// do: it is about a frame in the browser, and the browser is often closed while
// the office keeps running.
//
// Observers are awaited rather than fired and forgotten: a journal needs
// order, and the tick already waits on the snapshot, the weather and the
// settings. An observer that throws neither stops the tick nor stays silent —
// as everywhere else in this loader.
export async function moduleObserve(now, prev) {
  const seen = live().filter((m) => typeof m.server?.observe === 'function');
  if (!seen.length) return;
  const done = await Promise.allSettled(seen.map((m) => m.server.observe(now, prev)));
  done.forEach((r, i) => {
    if (r.status === 'rejected') console.log(`модуль ${seen[i].id} споткнулся на снимке: ${r.reason}`);
  });
}

// A module that failed to load must not stay quiet: otherwise "the feature is
// gone" gets investigated by eye instead of by one line in the log.
export function moduleErrors() {
  return loaded.filter(m => m.error).map(m => ({ id: m.id, error: m.error }));
}
