#!/usr/bin/env node
// Прогон всех стендов: node tools/run-tests.mjs [подстрока]
//
// Раньше это был цикл в package.json, и у него было две беды: `|| exit 1`
// останавливал прогон на первом упавшем файле, а несовпавший glob
// `modules/*/test-*.mjs` под sh оставался строкой — то есть `npm test` падал
// ровно в бесплатной сборке, где папки `modules/` нет, и которую защищает
// test-modules.
//
// Встроенный `node --test` тут не подошёл, и это выяснилось прогоном:
// на Node 20 он принимает каталоги и не понимает шаблоны, на Node 22 —
// наоборот, понимает шаблоны и пытается загрузить каталог как файл. Одной
// команды на матрицу 18/20/22 нет, а сорок строк своего кода — есть.
//
// Стенды остаются как были: каждый печатает свои проверки и выходит с кодом.
// Здесь только обход файлов, счёт и вывод — упавшие показываются целиком, в
// конце сводка. Прогон идёт до конца: один упавший файл не должен прятать
// остальные тридцать восемь.
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const only = process.argv[2] || '';

const isTest = (f) => f.startsWith('test-') && f.endsWith('.mjs');
const ls = async (dir) => { try { return await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; } };

const files = [];
for (const e of await ls(path.join(ROOT, 'tools'))) {
  if (e.isFile() && isTest(e.name)) files.push(path.join('tools', e.name));
}
// Модули приносят свои стенды и ставятся поштучно: папки может не быть вовсе.
for (const m of await ls(path.join(ROOT, 'modules'))) {
  for (const e of await ls(path.join(ROOT, 'modules', m.name))) {
    if (e.isFile() && isTest(e.name)) files.push(path.join('modules', m.name, e.name));
  }
}
files.sort();

const picked = only ? files.filter((f) => f.includes(only)) : files;
if (!picked.length) {
  console.error(only ? `нет стендов по «${only}»` : 'стендов не найдено');
  process.exit(2);
}

const run = (file) => new Promise((resolve) => {
  const started = Date.now();
  const p = spawn(process.execPath, [file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (c) => { out += c; });
  p.stderr.on('data', (c) => { out += c; });
  p.on('close', (code) => resolve({ file, code, out, ms: Date.now() - started }));
});

const failed = [];
for (const file of picked) {
  const r = await run(file);
  // Стенды писались в разное время и метят удачную проверку по-разному:
  // «ok    |», «  ок  », а test-look — одной итоговой строкой. Считаем все
  // формы, а когда не нашли ни одной — молчим, вместо «0 проверок»: это
  // сказало бы, что стенд ничего не проверил, а он проверил по-своему.
  const checks = (r.out.match(/^(?:ok +\||\s*ок\s)/gm) || []).length;
  const mark = r.code === 0 ? '  ok  ' : 'УПАЛ  ';
  const count = checks ? `${String(checks).padStart(3)} проверок` : '   свой счёт';
  console.log(`${mark}| ${file.padEnd(38)} ${count} · ${r.ms} мс`);
  if (r.code !== 0) { failed.push(r); }
}

if (failed.length) {
  for (const r of failed) {
    console.log(`\n──── ${r.file} ────`);
    console.log(r.out.trimEnd());
  }
}
console.log(`\n${picked.length} стендов, упало ${failed.length}`);
process.exit(failed.length ? 1 : 0);
