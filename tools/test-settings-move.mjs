// node tools/test-settings-move.mjs — settings moving from the code directory
// into the user's config.
//
// The settings sat next to the code until 30 August 2026. While the office was
// installed by git clone that went unnoticed; with delivery as an app the code
// directory becomes replaceable — a version update swaps it whole. And inside are
// the agents' names (157 of them in the live file), the seating and the Figma
// token. An update would silently rename the whole office, and that is exactly
// the sort of breakage nobody notices until the next visit.
//
// One thing is checked here: that the move loses NOTHING. The old file stays
// where it was, the new one is not overwritten, and when both exist neither is
// chosen in silence.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// VALEY_SETTINGS overrides VALEY_CONFIG_DIR and everything else: it is "the
// whole file aside" in one variable. The stand makes itself a temp directory,
// but if the variable came in from the environment — and it does, when an office
// was raised in a neighbouring worktree by its own command — the test checks
// somebody else's file and fails over nothing. Found on 2 September 2026: the
// move "did not happen", because the file at the new place belonged to another
// branch.
delete process.env.VALEY_SETTINGS;

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// fileURLToPath rather than url.pathname: the project path contains a space, and
// pathname leaves it as %20 — the file is then looked for next to a directory
// that does not exist.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LEGACY = path.join(ROOT, '.settings.json');
const legacyExisted = await fsp.readFile(LEGACY, 'utf8').catch(() => null);

// VALEY_SETTINGS moves the settings file aside whole — and AGENTS.md explicitly
// tells every worktree to set it. With the variable on, this stand checked
// somebody else's file and failed as if the move were broken: on 1 September 2026
// that cost time while the code had nothing to do with it. The stand answers for
// its own temp directories, so it takes the variable off itself.
delete process.env.VALEY_SETTINGS;

const fresh = async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-cfg-'));
  process.env.VALEY_CONFIG_DIR = dir;
  const mod = await import('../server/settings.js?' + Math.random());
  return { dir, mod };
};
const writeLegacy = (o) => fsp.writeFile(LEGACY, JSON.stringify(o, null, 2));

const SAMPLE = { lang: 'en', names: { 's1': 'Петя', 's2': 'Лиза' }, secrets: { token: 'СЕКРЕТ' } };

// ---------------------------------------------- the move from the old place
{
  await writeLegacy(SAMPLE);
  const { dir, mod } = await fresh();
  const r = await mod.migrateSettings();
  ok('the move took place', r.done === true, r);
  const moved = JSON.parse(await fsp.readFile(path.join(dir, 'settings.json'), 'utf8'));
  ok('the names arrived in full', JSON.stringify(moved.names) === JSON.stringify(SAMPLE.names), moved.names);
  ok('the token has arrived', moved.secrets.token === 'СЕКРЕТ');
  const still = await fsp.readFile(LEGACY, 'utf8').catch(() => null);
  ok('the old file remains in place', still !== null);
  const s = await mod.getSettings();
  ok('the office reads the transferred names', s.names.s1 === 'Петя', s.names);
}

// ------------------------------------- there is already data at the new place
{
  await writeLegacy(SAMPLE);
  const { dir, mod } = await fresh();
  const mine = { lang: 'ru', names: { 's9': 'Марк' }, secrets: { token: 'МОЙ' } };
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify(mine));
  const r = await mod.migrateSettings();
  ok('when there are both, the move is not made', r.done === false && r.reason === 'both', r);
  const after = JSON.parse(await fsp.readFile(path.join(dir, 'settings.json'), 'utf8'));
  ok('the existing config is not overwritten', after.secrets.token === 'МОЙ', after.secrets);
  ok('and his names are intact', after.names.s9 === 'Марк', after.names);
}

// ------------------------------------------------- nothing to move
{
  await fsp.rm(LEGACY, { force: true });
  const { mod } = await fresh();
  const r = await mod.migrateSettings();
  ok('without the old file the move is silent', r.done === false && r.reason === 'nothing-to-move', r);
  const s = await mod.getSettings();
  // 'auto' is the language of an office nobody has opened yet: since 6 September
  // 2026 the first page resolves it from the device and writes the answer back.
  // A concrete language here would mean the defaults had been chosen for the user.
  ok('and the settings are taken by default', s.lang === 'auto' && Object.keys(s.names).length === 0, s.lang);
}

// ------------------------------------------------------- a broken old file
{
  await fsp.writeFile(LEGACY, '{ это не json');
  const { dir, mod } = await fresh();
  let threw = false;
  try { await mod.migrateSettings(); } catch { threw = true; }
  ok('broken file is not transferred', threw === true);
  const made = await fsp.readFile(path.join(dir, 'settings.json'), 'utf8').catch(() => null);
  ok('and garbage is not created in the new place', made === null);
  const s = await mod.getSettings();
  ok('the office is raised by default', s.lang === 'auto', s.lang);
}

// put the tree back exactly as the test found it
await fsp.rm(LEGACY, { force: true });
if (legacyExisted !== null) await fsp.writeFile(LEGACY, legacyExisted);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
