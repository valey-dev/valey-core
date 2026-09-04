// node tools/test-settings-write.mjs — настройки не теряются ни в гонке, ни в
// битом файле.
//
// Такт офиса и обработчики запросов сохраняют настройки независимо; до
// 4 сентября 2026 две записи в один файл напрямую перемешивали байты, а битый
// JSON при следующем старте молча становился умолчаниями — вместе с именами
// агентов, токеном хозяина и приглашениями. Файл здесь свой, во временной
// папке: настоящий трогать нельзя, там живёт токен рабочего офиса.
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
  // ------------------------------------------------------------- гонка
  // Модуль читает VALEY_SETTINGS на импорте, поэтому переменная — до импорта.
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

  // --------------------------------------------------------- битый файл
  // Отдельный процесс: кэш настроек живёт в модуле и второй раз не читается.
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
  try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* ниже */ }
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
