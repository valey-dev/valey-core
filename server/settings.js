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
// The file from the old place. It is NEVER deleted and never overwritten: for
// anyone who updates it is the only copy of the names and the token, and the
// cost of a mistake here is somebody else's data, not ours.
const LEGACY = path.join(ROOT, '.settings.json');

export const PATHS = { dir: CONFIG_DIR, file: FILE, legacy: LEGACY };

const exists = async (f) => { try { await fsp.access(f); return true; } catch { return false; } };

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
  await fsp.mkdir(path.dirname(FILE), { recursive: true });
  await fsp.writeFile(FILE, raw, { flag: 'wx' });    // wx — do not let a race overwrite it
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
  // the interface language. Lives here rather than in the browser: the switch
  // stands in the corridor, and one click of it must reach every open tab
  lang: 'ru',
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
  network: { external: false, token: '' },
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

// The token is created once and lives in the file. Without it the office
// cannot tell an owner from a guest, so it must exist before the first request.
export async function ownerToken() {
  const s = await getSettings();
  if (!s.access.token) await patchSettings({ access: { ...s.access, token: crypto.randomUUID() } });
  return (await getSettings()).access.token;
}

export async function getSettings() {
  if (cache) return cache;
  try {
    const m = await migrateSettings();
    if (m.done) console.log(`Настройки переехали в ${m.file}; старый файл оставлен на месте.`);
    // Two files are the one case where the office can quietly lose half the
    // names. Saying it out loud is cheaper than guessing.
    if (m.reason === 'both') console.log(`Настройки есть и в ${m.file}, и в ${m.legacy}. Взят первый; второй не тронут.`);
  } catch (e) { console.log(`Настройки не переехали: ${e.message}. Старый файл цел.`); }
  // No file and a broken file are different cases. The first is an ordinary
  // first start. The second looked the same until 4 September 2026: the office
  // quietly started from defaults, and the next save overwrote the file — the
  // agents' names, the owner token and the invitations vanished without a line
  // in the log. Now a broken file is set aside as a copy next to it, and that
  // is said out loud.
  let raw = null;
  try { raw = await fsp.readFile(FILE, 'utf8'); } catch { /* first start */ }
  let saved = null;
  if (raw !== null) {
    try { saved = JSON.parse(raw); } catch (e) {
      const backup = `${FILE}.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try { await fsp.writeFile(backup, raw); } catch { /* at least say it */ }
      console.error(`Настройки не читаются: ${e.message}. Файл отложен в ${backup}; `
        + `офис стартует с умолчаний, и следующее сохранение перепишет ${FILE}. `
        + 'Имена, токен и приглашения — в отложенной копии.');
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
  const s = await getSettings();
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
  writing = writing.catch(() => {}).then(async () => {
    await fsp.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp-${process.pid}`;
    await fsp.writeFile(tmp, text);
    await fsp.rename(tmp, FILE);
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
