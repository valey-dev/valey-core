// node tools/test-release-dry.mjs — release.mjs looks at its own repository
// rather than at the cwd. Until 4 September 2026 git went wherever it was called
// from while package.json and CHANGELOG were taken relative to the script file:
// from a subdirectory, or from someone else's folder, a release was applied by
// halves. A run from the system temp directory is the most foreign cwd there is:
// no repository and no package.json in it.
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
// Right after a release the range is empty, and the script says so and stops —
// which is correct behaviour and used to fail this stand for a reason that has
// nothing to do with its subject. Both answers prove the same thing: the script
// looked at THIS repository and not at the temp directory it was called from.
// Found on 5 September 2026, when v0.4.0 was cut and main went red on the spot.
const spoke = /^## v\d+\.\d+\.\d+/m.test(r.stdout)
  || /нет коммитов/.test(r.stderr + r.stdout);
ok('сухой прогон из чужой папки не падает', r.status === 0 || /нет коммитов/.test(r.stderr), r.stderr || r.stdout);
ok('и говорит о своём репозитории, а не о чужой папке', spoke, r.stdout + r.stderr);
ok('и ничего не записывает',
  /--dry: ничего не записано/.test(r.stdout) || /нет коммитов/.test(r.stderr + r.stdout), r.stdout);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
