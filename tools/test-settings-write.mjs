// node tools/test-settings-write.mjs — settings are lost neither in a race nor
// in a broken file.
//
// The office tick and the request handlers save settings independently; until
// 4 September 2026 two writes into one file directly interleaved bytes, and
// broken JSON quietly became defaults at the next start — together with the
// agents' names, the owner token and the invitations. The file here is its own,
// in a temp directory: the real one must not be touched, the working office's
// token lives in it.
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 300) : JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-settings-'));
try {
  // ------------------------------------------------------------- the race
  // The module reads VALEY_SETTINGS on import, so the variable comes first.
  const file = path.join(dir, 'race.json');
  process.env.VALEY_SETTINGS = file;
  const { getSettings, patchSettings, warnIfSharedSettingsWorktree } = await import('../server/settings.js');
  await getSettings();
  const N = 25;
  await Promise.all(Array.from({ length: N }, (_, i) => patchSettings({ lang: 'v' + i })));
  const onDisk = JSON.parse(await fsp.readFile(file, 'utf8'));
  ok('after 25 simultaneous saves the file is read', !!onDisk, onDisk);
  ok('and the last one on the disk', onDisk.lang === 'v' + (N - 1), onDisk.lang);
  const left = (await fsp.readdir(dir)).filter((f) => f.includes('.tmp-'));
  ok('no temporary files left', left.length === 0, left);
  ok('cache matches disk', (await getSettings()).lang === onDisk.lang, null);

  // ------------------------------------------- another process changed it
  const external = { lang: 'en', names: { outside: 'Kept' }, dress: { code: 'casual' } };
  await fsp.writeFile(file, JSON.stringify(external, null, 2));
  const conflicts = await Promise.allSettled([
    patchSettings({ dress: { code: 'office' } }),
    patchSettings({ lang: 'stale-queued-write' }),
  ]);
  const conflict = conflicts[0].status === 'rejected' ? conflicts[0].reason : null;
  const afterConflict = JSON.parse(await fsp.readFile(file, 'utf8'));
  ok('a newer file is not overwritten by the stale cache',
    afterConflict.names.outside === 'Kept' && afterConflict.dress.code === 'casual', afterConflict);
  ok('all writes already queued from the stale cache are refused',
    conflicts.every((result) => result.status === 'rejected') && afterConflict.lang === 'en', conflicts);
  ok('the refused save explains how to recover',
    conflict && /changed after this process read it.*Reload and try again/.test(conflict.message), conflict && conflict.message);
  const refreshed = await getSettings();
  ok('after a conflict the next read reloads the external settings',
    refreshed.lang === 'en' && refreshed.names.outside === 'Kept', refreshed);
  await patchSettings({ dress: { code: 'office' } });
  const afterRetry = JSON.parse(await fsp.readFile(file, 'utf8'));
  ok('a retry after reload preserves the external data',
    afterRetry.names.outside === 'Kept' && afterRetry.dress.code === 'office', afterRetry);

  // ------------------------------------------------ worktree startup warning
  const warnings = [];
  const warning = warnIfSharedSettingsWorktree({
    cwd: path.join(dir, '.claude', 'worktrees', 'stand'), env: {}, warn: (m) => warnings.push(m),
  });
  ok('a Claude worktree using personal settings warns at startup',
    warnings.length === 1 && warning === warnings[0] && /VALEY_SETTINGS/.test(warning), warnings);
  const isolated = warnIfSharedSettingsWorktree({
    cwd: path.join(dir, '.claude', 'worktrees', 'stand'), env: { VALEY_SETTINGS: file }, warn: (m) => warnings.push(m),
  });
  ok('an explicitly isolated worktree stays quiet', isolated === null && warnings.length === 1, warnings);
  const isolatedDir = warnIfSharedSettingsWorktree({
    cwd: path.join(dir, '.claude', 'worktrees', 'stand'), env: { VALEY_CONFIG_DIR: dir }, warn: (m) => warnings.push(m),
  });
  ok('a worktree with an isolated config directory stays quiet',
    isolatedDir === null && warnings.length === 1, warnings);

  // ---------------------------------------------------- the broken file
  // A separate process: the settings cache lives in the module and is not read twice.
  const broken = path.join(dir, 'broken.json');
  await fsp.writeFile(broken, '{"access":{"token":"precious"},"names":{"s1":"Костя"}, oops');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const m = await import('./server/settings.js');
    const s = await m.getSettings();
    const before = await import('node:fs/promises').then((f) => f.readFile(process.env.VALEY_SETTINGS, 'utf8'));
    await m.patchSettings({ lang: 'en' });
    console.log(JSON.stringify({ lang: s.lang, token: s.access.token, untouchedUntilSave: before.includes('oops') }));
  `], { cwd: ROOT, env: { ...process.env, VALEY_SETTINGS: broken }, encoding: 'utf8' });
  ok('a broken file does not drop the start', r.status === 0, r.stderr || r.stdout);
  let out = null;
  try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* below */ }
  ok('office starts from defaults, not from half the file', out && out.token === '' , out);
  ok('the file is not touched until the first save', out && out.untouchedUntilSave === true, out);
  ok('and this is said out loud, with a copy', /moved to .*broken\.json\.broken-/.test(r.stderr), r.stderr);
  const copies = (await fsp.readdir(dir)).filter((f) => f.startsWith('broken.json.broken-'));
  ok('the broken file is put into a copy', copies.length === 1, copies);
  if (copies.length) {
    const kept = await fsp.readFile(path.join(dir, copies[0]), 'utf8');
    ok('in the copy - the original bytes, with token and names', kept.includes('precious') && kept.includes('Костя') && kept.includes('oops'), kept);
  }
  const rewritten = JSON.parse(await fsp.readFile(broken, 'utf8'));
  ok('after saving the file in place - valid JSON', rewritten.lang === 'en', rewritten);
} catch (e) {
  bad += 1;
  console.log('FAIL  | test did not complete →', e.stack);
} finally {
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
