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
  else { bad += 1; console.log('УПАЛ  |', name, '→', typeof got === 'string' ? got.slice(0, 300) : JSON.stringify(got)); }
};

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-settings-'));
try {
  // ------------------------------------------------------------- the race
  // The module reads VALEY_SETTINGS on import, so the variable comes first.
  const file = path.join(dir, 'race.json');
  process.env.VALEY_SETTINGS = file;
  const { getSettings, patchSettings } = await import('../server/settings.js');
  await getSettings();
  const N = 25;
  await Promise.all(Array.from({ length: N }, (_, i) => patchSettings({ lang: 'v' + i })));
  const onDisk = JSON.parse(await fsp.readFile(file, 'utf8'));
  ok('после 25 одновременных сохранений файл читается', !!onDisk, onDisk);
  ok('и на диске последнее', onDisk.lang === 'v' + (N - 1), onDisk.lang);
  const left = (await fsp.readdir(dir)).filter((f) => f.includes('.tmp-'));
  ok('временных файлов не осталось', left.length === 0, left);
  ok('кэш совпадает с диском', (await getSettings()).lang === onDisk.lang, null);

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
  ok('битый файл не роняет старт', r.status === 0, r.stderr || r.stdout);
  let out = null;
  try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* below */ }
  ok('офис стартует с умолчаний, а не с половины файла', out && out.token === '' , out);
  ok('до первого сохранения файл не тронут', out && out.untouchedUntilSave === true, out);
  ok('и об этом сказано вслух, с путём копии', /отложен в .*broken\.json\.broken-/.test(r.stderr), r.stderr);
  const copies = (await fsp.readdir(dir)).filter((f) => f.startsWith('broken.json.broken-'));
  ok('битый файл отложен в копию', copies.length === 1, copies);
  if (copies.length) {
    const kept = await fsp.readFile(path.join(dir, copies[0]), 'utf8');
    ok('в копии — исходные байты, с токеном и именами', kept.includes('precious') && kept.includes('Костя') && kept.includes('oops'), kept);
  }
  const rewritten = JSON.parse(await fsp.readFile(broken, 'utf8'));
  ok('после сохранения на месте файла — валидный JSON', rewritten.lang === 'en', rewritten);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.stack);
} finally {
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
