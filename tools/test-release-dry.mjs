// node tools/test-release-dry.mjs — release.mjs смотрит в свой репозиторий, а
// не в cwd. До 4 сентября 2026 git ходил туда, откуда позвали, а package.json и
// CHANGELOG брались от файла скрипта: из подкаталога или чужой папки выпуск
// применялся наполовину. Прогон из системной временной папки — самый чужой cwd,
// какой есть: там нет ни репозитория, ни package.json.
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', String(got).slice(0, 300)); }
};

const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/release.mjs'), 'patch', '--dry'],
  { cwd: os.tmpdir(), encoding: 'utf8' });
ok('сухой прогон из чужой папки не падает', r.status === 0, r.stderr || r.stdout);
ok('и печатает раздел changelog', /^## v\d+\.\d+\.\d+/m.test(r.stdout), r.stdout);
ok('и ничего не записывает', /--dry: ничего не записано/.test(r.stdout), r.stdout);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
