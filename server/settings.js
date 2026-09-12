// Small persisted settings blob. Lives in the user's config directory, NOT next
// to the code.
//
// It sat next to the code until 30 August 2026, and that worked exactly as
// long as git clone was the only way to deliver it. The moment the office ships
// as an app or a package, the code directory becomes someone else's and
// replaceable: a version update swaps it whole. And this file holds the agents'
// names (session -> name), the seating and the keys of connected services. So
// an update would quietly rename the whole office and break the easel, while
// the secret stayed behind in a package manager's cache.
//
// A directory of its own, not `~/.claude`: the office reads state from there
// today, but that is a source of data, not our home, and the orchestrator may
// be a different one in time.
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { moduleDefaults, moduleMerge, modulePublic } from './modules.js';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The settings directory. VALEY_CONFIG_DIR is for the stands and for people
// who keep their configs somewhere other than XDG.
const CONFIG_DIR = process.env.VALEY_CONFIG_DIR
  || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'valey');
// VALEY_SETTINGS moves the whole file aside: that way a stand does not
// overwrite the settings of the office you work in — and it would, because the
// owner token is created on the very first start. Useful for a second office on
// one machine, too.
const FILE = process.env.VALEY_SETTINGS || path.join(CONFIG_DIR, 'settings.json');
// Drafts of the release scripts. They belong to whoever cuts the release —
// working papers, not code and not a module — so they live next to the settings
// and outside every git tree. In the repository the draft was untracked and
// unignored, which means the next release refused to start on a dirty tree
// until somebody deleted it by hand; that happened while cutting v0.3.0 on
// 5 September 2026. VALEY_SCRIPTS moves them aside for a stand.
export const SCRIPTS_DIR = process.env.VALEY_SCRIPTS || path.join(CONFIG_DIR, 'scripts');

// The file from the old place. It is NEVER deleted and never overwritten: for
// anyone who updates it is the only copy of the names and the token, and the
// cost of a mistake here is somebody else's data, not ours.
const LEGACY = path.join(ROOT, '.settings.json');

export const PATHS = { dir: CONFIG_DIR, file: FILE, legacy: LEGACY };

const exists = async (f) => { try { await fsp.access(f); return true; } catch { return false; } };

// A Claude worktree without its own settings file writes to the same personal
// config as the main office. That is occasionally intentional, but a stand
// changing shared names, seats, or dress by accident is much more common and
// much harder to spot than one explicit warning at startup.
export function warnIfSharedSettingsWorktree({
  cwd = process.cwd(), env = process.env, warn = console.warn,
} = {}) {
  const parts = path.resolve(cwd).split(path.sep);
  const insideClaudeWorktree = parts.some((part, i) =>
    part === '.claude' && parts[i + 1] === 'worktrees');
  if (!insideClaudeWorktree || env.VALEY_SETTINGS || env.VALEY_CONFIG_DIR) return null;
  const message = 'Settings warning: this .claude worktree is using the shared personal settings file. '
    + 'Set VALEY_SETTINGS to an isolated file before running a stand.';
  warn(message);
  return message;
}

// A one-time move: the old file is copied to the new place and stays where it
// was. If something is already at the new place, nothing is touched and it is
// said out loud: silently picking one of two files full of agent names means
// losing half the office without a single message.
export async function migrateSettings() {
  const hasNew = await exists(FILE);
  const hasOld = await exists(LEGACY);
  if (hasNew) return hasOld ? { done: false, reason: 'both', file: FILE, legacy: LEGACY } : { done: false, reason: 'new-only' };
  if (!hasOld) return { done: false, reason: 'nothing-to-move' };
  const raw = await fsp.readFile(LEGACY, 'utf8');
  JSON.parse(raw);                                   // a broken file is not moved
  await fsp.mkdir(path.dirname(FILE), { recursive: true, mode: 0o700 });
  await fsp.writeFile(FILE, raw, { flag: 'wx', mode: 0o600 });    // wx — do not let a race overwrite it
  return { done: true, reason: 'moved', file: FILE, legacy: LEGACY };
}

// Module defaults arrive here too, but as a function rather than a constant:
// modules load when the server starts, and a snapshot taken while the file is
// parsed would be empty. A module's keys live in the shared file next to the
// rest — a module gets no settings file of its own, or there would be as many
// as there are modules.
const withModules = () => ({ ...DEFAULTS, ...moduleDefaults() });

const DEFAULTS = {
  weather: { enabled: false, lat: null, lon: null, label: '' },
  // The card on the entrance about a release with no video yet. false puts it
  // away without touching the drafts: the owner said on 12 September 2026 that
  // videos are not in focus for now, and a checklist ticked by hand to silence
  // it would be the lie server/release.js was written to avoid.
  releaseNudge: true,
  // the interface language. Lives here rather than in the browser: the switch
  // stands in the corridor, and one click of it must reach every open tab.
  //
  // 'auto' means nobody has chosen yet — the first page to open resolves it from
  // the device and writes the answer back here. The server cannot do that
  // resolving itself: it has no device, and the name pack below follows the
  // office language, so the answer has to be a real language on disk rather than
  // a word each tab reads differently. An office already in use is unaffected —
  // the file it saved has a concrete language in it, and 'auto' is only ever the
  // state of a fresh install.
  lang: 'auto',
  // The name pack: 'auto' follows the office language, otherwise a pack id
  // ('ru', 'en'). One picked by hand survives switching the interface — that is
  // what "the names are unpinned from the language" means.
  namePack: 'auto',
  // Which pack the names sitting in `names` were issued with. Not a setting but
  // a mark: without it the server cannot tell "the pack was never touched" from
  // "the pack changed while the office was down", and the office would either
  // never rename or rename on every snapshot.
  namesPack: '',
  // how much a delivered task is allowed to do on its own
  delivery: { mode: 'acceptEdits' },
  // Who owns the office and whether it is open to the outside.
  //
  // token is the real secret of this file: it IS the right to hand out tasks.
  // It never goes out, see publicSettings below.
  //
  // mode: 'private' — the office is yours, and everything from this machine
  // counts as the owner's: that is how the office always behaved, and local
  // work does not change. 'shared' turns that shortcut off, and only whoever
  // presents the token is the owner. Switch BEFORE the office becomes visible
  // from outside: a tunnel runs from this same machine, and to the server its
  // guest looks like you.
  // invites — the invitations handed out: { code, name, from, at, usedAt,
  // guest }. They live on disk because the link is sent in a messenger and
  // opened later: an invitation that dies with a server restart is useless.
  access: { mode: 'private', token: '', invites: [] },
  // Which addresses the office answers at all. Off means loopback is listened
  // to, and that is not caution for its own sake: the office serves every
  // session transcript in full, so an open port equals an open correspondence.
  // The token is created at the moment it is switched on, see
  // server/network.js.
  // `port` is the office Claude Code talks to. The hook asks one office and only
  // one — several offices running at once is the normal state of this machine,
  // and a question sprayed at all of them would be answered by whichever tab was
  // left open. So the canonical port lives here, in one place both sides read.
  network: { external: false, token: '', port: 5177 },
  // The floor's dress code: 'casual' is how it was always drawn, 'office' is
  // light tops, ties, jackets and skirts. A setting of the office, not of the
  // browser: every tab changes clothes at once, as with the weather.
  dress: { code: 'casual' },
  // The greenhouse. Shared across the office, like the names and the seating:
  // you water it, everyone sees. pots: pot index -> { wateredAt, streak }. Four
  // waterings in the can — the same as CAN_FULL in web/garden.js; it cannot be
  // imported here, the server knows nothing about web/.
  garden: { pots: {}, can: { left: 4 } },
  // sessionId -> name, so an agent keeps the face and the name you learned
  names: {},
  // sessionId -> { project, i }: whose desk is whose. Lives on disk so a seat
  // survives a server restart and an F5 — while the agent is here, it sits in
  // the same place.
  seats: {},
};

let cache = null;
let diskRevision;
let writeGeneration = 0;

// More than mtime alone: an atomic replacement changes the inode, while a
// direct edit changes its size or nanosecond timestamp. The value is only an
// equality token; no ordering between clocks is assumed.
const revisionOf = async (file) => {
  try {
    const s = await fsp.stat(file, { bigint: true });
    return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}`;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};

const readWithRevision = async (file) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await revisionOf(file);
    let raw = null;
    try { raw = await fsp.readFile(file, 'utf8'); } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const after = await revisionOf(file);
    if (before === after) return { raw, revision: after };
  }
  // Neighbours saving back to back can outpace three attempts: under a stress
  // run of four offices the read gave up and took the office down with it
  // (13 September 2026). Under the lock no office that takes it can save, so
  // one more read is a steady one.
  return withLock(async () => {
    let raw = null;
    try { raw = await fsp.readFile(file, 'utf8'); } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    return { raw, revision: await revisionOf(file) };
  });
};

// Every office on this machine saves into the same file, and a revision check
// alone could not keep them apart: between comparing the revision and the
// rename a neighbour could rename its own copy in, both saves reported success
// and one of them was gone — a name, a seat, a guest's pass. The same window
// sat between the rename and reading the new revision, and there the office
// took the neighbour's file for its own and dropped its keys on the next save.
// A stress run on 13 September 2026 lost about a hundred keys a run, three runs
// out of three. The file system has no compare-and-swap, so the check, the
// rename and the new revision happen under a lock file every office takes:
// created with `wx`, so exactly one creator wins.
const LOCK = `${FILE}.lock`;
// A save holds the lock for milliseconds. A lock whose holder is gone, or
// which is ten seconds old, was left by a save that died halfway, and waiting
// for it would stop every office on the machine from saving at all.
const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 5_000;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const holderAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

// True when the lock is gone or was removed as stale, so the caller tries
// again at once. The holder is read twice and removed only if it did not
// change in between: two offices meeting the same stale lock would otherwise
// let the second remove the fresh lock the first had just taken. A narrower
// window remains between the second read and the removal; it needs a crashed
// save and two offices at the same millisecond, and costs one save made
// without the lock — the revision check still stands behind it.
async function breakStaleLock() {
  let text, stat;
  try {
    [text, stat] = await Promise.all([fsp.readFile(LOCK, 'utf8'), fsp.stat(LOCK)]);
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
  // An empty lock is one being written this instant: judged by its age only.
  const pid = Number(text.split(' ')[0]);
  const gone = Number.isInteger(pid) && pid > 0 && !holderAlive(pid);
  const old = Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  if (!gone && !old) return false;
  try {
    if (await fsp.readFile(LOCK, 'utf8') !== text) return true;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
  await fsp.rm(LOCK, { force: true });
  console.log(`Settings lock ${LOCK} was left by ${gone ? `process ${pid}, which is gone` : 'a save that never finished'}; removed it.`);
  return true;
}

async function withLock(fn) {
  const mine = `${process.pid} ${crypto.randomUUID()}\n`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await fsp.writeFile(LOCK, mine, { flag: 'wx', mode: 0o600 });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    if (await breakStaleLock()) continue;
    if (Date.now() > deadline) {
      throw new Error(`Settings were not saved: another office has held ${LOCK} for over ${LOCK_WAIT_MS / 1000} s. `
        + 'Try again; if it stays, the office holding it is stuck.');
    }
    await sleep(2 + Math.random() * 8);
  }
  try {
    return await fn();
  } finally {
    // Only our own lock is removed. If it was taken for stale while we held
    // it, the one lying there now belongs to somebody else.
    try {
      if (await fsp.readFile(LOCK, 'utf8') === mine) await fsp.rm(LOCK, { force: true });
    } catch (e) {
      if (e.code !== 'ENOENT') console.log(`Settings lock ${LOCK} could not be released: ${e.message}`);
    }
  }
}

// A save refused because a neighbour changed the file first. The refusal is
// right for a request — the person is told to reload — but a save the office
// makes by itself has nobody to tell.
const staleError = () => Object.assign(
  new Error(`Settings were not saved because ${FILE} changed after this process read it. Reload and try again.`),
  { code: 'SETTINGS_STALE' },
);

// For the saves the office makes by itself at start: build the patch from the
// settings as they are now, and after a refusal read the file again and ask
// once more — a neighbour may have written exactly what was missing. Two
// offices started together on a file without an owner token both made one,
// the second save was refused, and the refusal took that office down before
// it had opened its port (13 September 2026). `make` returns null when there
// is nothing to save.
export async function patchFresh(make) {
  for (let attempt = 1; ; attempt += 1) {
    const patch = make(await getSettings());
    if (!patch) return getSettings();
    try {
      return await patchSettings(patch);
    } catch (e) {
      if (e.code !== 'SETTINGS_STALE' || attempt >= 5) throw e;
    }
  }
}

// The token is created once and lives in the file. Without it the office
// cannot tell an owner from a guest, so it must exist before the first request.
export async function ownerToken() {
  const s = await patchFresh((now) => (now.access.token ? null : { access: { ...now.access, token: crypto.randomUUID() } }));
  return s.access.token;
}

// One read at a time. After a refusal the cache is empty and every request
// arriving then reads the file; with a read each, a slower one could finish
// last and put an older file and its older revision over a newer cache, and
// the next save was refused for nothing. Everybody waiting for the same read
// gets the same object.
let loading = null;
export async function getSettings() {
  if (cache) return cache;
  if (!loading) loading = loadSettings().finally(() => { loading = null; });
  return loading;
}

async function loadSettings() {
  try {
    const m = await migrateSettings();
    if (m.done) console.log(`Settings moved to ${m.file}; the legacy file was left in place.`);
    // Two files are the one case where the office can quietly lose half the
    // names. Saying it out loud is cheaper than guessing.
    if (m.reason === 'both') console.log(`Settings exist in both ${m.file} and ${m.legacy}. Using the first; the second was not touched.`);
  } catch (e) { console.log(`Settings were not moved: ${e.message}. The legacy file is intact.`); }
  // No file and a broken file are different cases. The first is an ordinary
  // first start. The second looked the same until 4 September 2026: the office
  // quietly started from defaults, and the next save overwrote the file — the
  // agents' names, the owner token and the invitations vanished without a line
  // in the log. Now a broken file is set aside as a copy next to it, and that
  // is said out loud.
  const current = await readWithRevision(FILE);
  const raw = current.raw;
  diskRevision = current.revision;
  let saved = null;
  if (raw !== null) {
    try { saved = JSON.parse(raw); } catch (e) {
      const backup = `${FILE}.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try { await fsp.writeFile(backup, raw, { mode: 0o600 }); } catch { /* at least say it */ }
      console.error(`Settings could not be read: ${e.message}. The file was moved to ${backup}; `
        + `the office is starting with defaults, and the next save will overwrite ${FILE}. `
        + 'Names, the token, and invitations remain in the backup.');
    }
  }
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    // The merge is shallow exactly one level deep: a file written before a new
    // key appeared would otherwise hide that key entirely. The easel fell off
    // this in silence: half of its section sat in the file, and the room
    // decided the file was not configured for it. The easel has since left for
    // a module; the rule stayed, because it is about any section, not about
    // that one.
    const base = withModules();
    cache = { ...base, ...saved };
    for (const [k, v] of Object.entries(base)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) cache[k] = { ...v, ...(saved[k] || {}) };
    }
  } else {
    cache = structuredClone(withModules());
    // seed from the old env-var way, if it is still around
    const spec = process.env.AI_VALEY_WEATHER || '';
    const [lat, lon] = spec.split(',').map((v) => Number(v.trim()));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      cache.weather = { enabled: true, lat, lon, label: `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
    }
  }
  return cache;
}

export async function patchSettings(patch) {
  // The patch goes on top of the cache as it is at this instant, with no
  // await between reading it and replacing it. It used to go on top of what
  // getSettings() had returned before an await: two saves in one office took
  // the same snapshot, the second built its cache without the first one's
  // change, and wrote it with a revision that matched — so nothing refused it.
  // A stress run lost 26 to 41 saves a run this way with the lock already in
  // (13 September 2026), and one office alone was enough: the tick saving
  // names while a request saves the language.
  while (!cache) await getSettings();
  const s = cache;
  cache = {
    ...s, ...patch,
    weather: { ...s.weather, ...(patch.weather || {}) },
    delivery: { ...s.delivery, ...(patch.delivery || {}) },
    // The owner token, for the same reason: the page never saw it, and the
    // first settings save would have wiped the right to hand out tasks.
    access: {
      ...s.access, ...(patch.access || {}),
      token: (patch.access || {}).token || s.access.token,
      // The invitation list is replaced whole: a revoked one has to disappear,
      // and a key-wise merge cannot delete — the same reason as for names.
      invites: (patch.access || {}).invites || s.access.invites || [],
    },
    // The network token survives a patch that omits it for the same reason as
    // the owner token: the page sends the settings whole and has never seen it.
    network: {
      ...s.network, ...(patch.network || {}),
      token: (patch.network || {}).token || (s.network || {}).token || '',
    },
    // names and seats are replaced whole for one reason: a session that has
    // left must free both its desk and its name, and a key-wise merge cannot
    // delete entries. Names were merged until 30 August 2026 — which is how a
    // pool of fifty names ran out on the fifty-first session and never
    // recovered.
    names: patch.names || s.names,
    seats: patch.seats || s.seats,
    // The pack mark travels beside the names and is replaced the same way: it
    // describes them. An empty string is a legal value here ("nobody has been
    // handed a name yet"), so || will not do.
    namesPack: patch.namesPack !== undefined ? patch.namesPack : s.namesPack,
    // Modules last: their fragment goes on top, because they know things about
    // their own keys that the core does not.
    ...moduleMerge(s, patch),
  };
  await persist();
  return cache;
}

// Writes go through a temp file and a rename, and one at a time. The office
// tick and the request handlers save settings independently of each other; two
// writes into one file directly interleaved bytes, and the broken JSON that
// resulted quietly became defaults at the next start. rename on one disk is
// atomic: what lies on disk is always either the previous version whole or the
// new one. The queue writes the cache as it stood when it was called — whoever
// called last is what ends up on disk.
let writing = Promise.resolve();
function persist() {
  const text = JSON.stringify(cache, null, 2);
  const generation = writeGeneration;
  writing = writing.catch(() => {}).then(async () => {
    if (generation !== writeGeneration) {
      throw staleError();
    }
    const expected = diskRevision;
    const changed = async () => (await revisionOf(FILE)) !== expected;
    const refuseStaleWrite = () => {
      cache = null;
      writeGeneration += 1;
      throw staleError();
    };
    // The folder is made 0700 when it is made here; one that already exists is
    // left as its owner set it — tightening somebody's ~/.config from a save
    // would be a surprise, and the files inside are 0600 either way.
    await fsp.mkdir(path.dirname(FILE), { recursive: true, mode: 0o700 });
    await withLock(async () => {
      if (await changed()) refuseStaleWrite();
      const tmp = `${FILE}.tmp-${process.pid}`;
      try {
        // The file holds the owner token, the network token and the invitations.
        // A temporary file written with the default mode came out world-readable
        // wherever the umask allowed, and the rename carried that mode over the
        // file it replaced — found by the audit of 12 September 2026. 0600 on
        // every write here, the migration and the broken-file copy alike.
        await fsp.writeFile(tmp, text, { mode: 0o600 });
        // Offices take the lock; a hand edit or an older office does not, so
        // an edit made while the temporary file was being written is still
        // caught here.
        if (await changed()) refuseStaleWrite();
        await fsp.rename(tmp, FILE);
        diskRevision = await revisionOf(FILE);
      } finally {
        await fsp.rm(tmp, { force: true });
      }
    });
  });
  return writing;
}

// Everything that may be shown to the page. The token never gets in here: the
// settings go to the browser, and down the SSE stream every 2.5 seconds, and
// the page hosts foreign iframes — the radio module's player and the sandbox
// for foreign HTML.
export function publicSettings(s) {
  // Neither the owner token, nor invitation codes, nor the guest tokens handed
  // out: a guest's page reads these settings with the same request as the
  // owner's page. Only what is visible anyway goes out — the mode, and how many
  // invitations are still unclaimed.
  const { token: owner, invites = [], ...access } = s.access || {};
  // The network token is not shown even to our own: the settings go down the
  // SSE stream into a browser that hosts the radio iframe and the sandbox for
  // foreign HTML. It can only be read from disk — which is what the word
  // "secret" means.
  const { token: net, ...network } = s.network || {};
  return {
    ...s,
    ...modulePublic(s),
    access: { ...access, pending: invites.filter((i) => !i.usedAt).length },
    network: { ...network, hasToken: !!net },
  };
}
