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
// Switched off for good, in the manifest: `"active": false`. Not a stand's
// simulation but the owner's decision — voice on 12 September 2026, a paid
// module not yet for sale — so the office does not run a line of it: its
// server file is never imported, its client never reaches the page, and the
// stand's switch cannot turn it back on. Only an edit to module.json can.
const inactive = (m) => m.manifest.active === false;
const live = () => loaded.filter((m) => !m.error && !off.has(m.id) && !inactive(m));

// What the stand's switches turned off, for the office that replaces this one
// on an update: an update is not a restart, and a switch must survive it.
export const modulesOff = () => [...off];

export function setModuleOff(id, value) {
  const m = loaded.find((x) => x.id === id);
  if (!m || inactive(m)) return false;
  if (value) off.add(id); else off.delete(id);
  return true;
}

// What a module may hand to the page: its client and its style, whatever those
// import or reference relative to themselves, and whatever the manifest lists
// under `assets` for what a static read cannot see. Nothing else — not the
// server, not the tests, not the manifest, and not a file of the repository the
// module happens to be linked in from. Until 12 September 2026 /modules/<path>
// read any file under modules/ for anyone past the network gate: the private
// repository's BACKLOG.md, its .git/HEAD, every server.js.
const IMPORT_RE = /(?:^|[\n;])\s*(?:import|export)\s[^;]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const URL_RE = /url\(\s*['"]?(?!data:|https?:|\/)([^'")]+)['"]?\s*\)/g;
async function clientAssets(base, manifest) {
  const seen = new Set();
  const queue = [];
  const push = (rel) => {
    const n = path.posix.normalize(String(rel)).replace(/^\.\//, '');
    if (!n || n.startsWith('../') || n.startsWith('/') || n.split('/').some((p) => p.startsWith('.'))) return;
    if (!seen.has(n)) { seen.add(n); queue.push(n); }
  };
  if (manifest.client) push(manifest.client);
  if (manifest.style) push(manifest.style);
  for (const a of Array.isArray(manifest.assets) ? manifest.assets : []) push(a);
  while (queue.length) {
    const rel = queue.shift();
    if (!/\.(m?js|css)$/.test(rel)) continue;
    let text;
    try { text = await fsp.readFile(path.join(base, rel), 'utf8'); } catch { continue; }
    const from = path.posix.dirname(rel);
    for (const m of text.matchAll(rel.endsWith('.css') ? URL_RE : IMPORT_RE)) {
      const ref = (m[1] || m[2] || '').split(/[?#]/)[0];
      if (ref) push(path.posix.join(from, ref));
    }
  }
  return seen;
}

// The file behind /modules/<id>/<rel>, or null. Guests get only modules shown to
// them; every request is checked against the module's asset list and then
// against the real path on disk — the module folder is usually a symlink into
// the other repository, so both ends are resolved before they are compared.
export async function moduleAsset(id, rel, forOwner = false) {
  const m = live().find((x) => x.id === id);
  if (!m || !(forOwner || shownToGuests(m))) return null;
  const n = path.posix.normalize(String(rel || '')).replace(/^\.\//, '');
  if (!m.assets.has(n)) return null;
  try {
    const root = await fsp.realpath(m.dir);
    const file = await fsp.realpath(path.join(m.dir, n));
    if (!file.startsWith(root + path.sep)) return null;
    return file;
  } catch { return null; }
}

// Who is allowed to see a module: `"guests": "shown"` in the manifest, and
// nothing else counts as yes.
//
// The default is «hidden», and that is the whole point. An invitation used to be
// all or nothing: admitted() asks whether you were invited and stops there, so a
// guest called in to watch the agents also got the easel with unreleased
// designs, the git tree with branch names and the personnel files. A module that
// forgets the line must not add itself to that list — the same reasoning that
// makes the lists in .gitignore named rather than «everything not ours».
const shownToGuests = (m) => m.manifest.guests === 'shown';

// Everything on disk, with its state — for the stand card. `guests` rides along
// so the office can say what an invited person sees without asking twice; a rule
// nobody can read is a rule nobody trusts.
export function moduleAll() {
  return loaded.map((m) => ({
    id: m.id, off: off.has(m.id) || inactive(m), inactive: inactive(m),
    broken: !!m.error, guests: shownToGuests(m) ? 'shown' : 'hidden',
  }));
}

export async function loadModules(root, ctx = null) {
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
    // A module switched off in its manifest gets no assets either: nothing of it
    // reaches the page, and its files are not even read.
    const mod = { id: manifest.id, manifest, dir: base, server: null, error: null,
      assets: manifest.active === false ? new Set() : await clientAssets(base, manifest) };
    if (manifest.server && !inactive(mod)) {
      try {
        mod.server = await import(pathToFileURL(path.join(base, manifest.server)).href);
      } catch (err) {
        mod.error = String((err && err.message) || err);
      }
    }
    loaded.push(mod);
  }
  // Handing the office's own capabilities down, once, after everything is on
  // disk. Optional on purpose: a module that draws a picture needs none of this,
  // and the seam stays "is the folder there" for it. A module that stumbles here
  // is marked broken rather than taking the office down with it — the same rule
  // the rest of this loader lives by.
  for (const m of loaded) {
    if (!ctx || typeof m.server?.setup !== 'function') continue;
    try { await m.server.setup(ctx); } catch (err) {
      m.error = String((err && err.message) || err);
      console.log(`module ${m.id} failed during setup: ${m.error}`);
    }
  }
  return loaded;
}

/**
 * What goes to the client: only what it needs to build its imports.
 *
 * `forOwner` defaults to false on purpose. A caller who forgets the argument
 * gets the guest's view — narrower than the truth, never wider.
 */
export function moduleList(forOwner = false) {
  return live().filter((m) => forOwner || shownToGuests(m)).map(m => ({
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
    try { m.server.onPatch(patch); } catch (err) { console.log(`module ${m.id} failed while applying settings: ${err}`); }
  }
}

// Routes. The first to answer true takes the request.
//
// The fifth argument is the office's own answer to «is this the owner», handed
// in as a function rather than a computed flag: most module routes never ask,
// and asking costs a read of the settings. A module that needs it awaits
// ctx.isOwner() and refuses on its own.
//
// It is handed over rather than left for a module to work out, because the
// office has exactly one such check and it is subtler than comparing a token:
// it knows about private mode, about the address being local, and about the
// middleman that makes a tunnel's guest look local. A copy of that inside a
// module would drift from the original, and the hole would open quietly.
// Added 6 September 2026 for the easel, which wanted to tell the owner — and
// only the owner — where on his disk the settings file lies.
//
// A module a guest may not see is not asked at all: the filtered list keeps its
// client off the page, and this keeps its data off the wire. Hiding only the
// list would be theatre — /api/wip can be typed by hand.
//
// Skipped rather than refused, so a guest cannot tell a hidden module from a
// module that is not installed. There is nothing to gain from telling them.
//
// Ownership is resolved at most once per request, and only when a hidden module
// is actually in the way — that keeps the laziness the argument was made lazy
// for. An office whose modules are all shown to guests never reads the settings
// here at all.
export async function moduleRoute(url, req, res, send, ctx = {}) {
  let owner = null;
  for (const m of live()) {
    if (typeof m.server?.route !== 'function') continue;
    if (!shownToGuests(m)) {
      if (owner === null) owner = ctx.isOwner ? await ctx.isOwner() : false;
      if (!owner) continue;
    }
    if (await m.server.route(url, req, res, send, ctx)) return true;
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
    if (r.status === 'rejected') console.log(`module ${seen[i].id} failed while taking a snapshot: ${r.reason}`);
  });
}

// A module that failed to load must not stay quiet: otherwise "the feature is
// gone" gets investigated by eye instead of by one line in the log.
export function moduleErrors() {
  return loaded.filter(m => m.error).map(m => ({ id: m.id, error: m.error }));
}
