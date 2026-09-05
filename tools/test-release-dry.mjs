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

// No digit is passed on purpose: the range picks it since 5 September 2026, and
// a hardcoded one turns this stand into an argument about semver instead of
// about the cwd. It was `patch` for a day, and the day the check became
// mechanical the stand went red three times over — the script was refusing a
// digit too low for a range with a feature in it, which is exactly what it is
// supposed to do.
const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/release.mjs'), '--dry'],
  { cwd: os.tmpdir(), encoding: 'utf8' });
// Three answers are correct here, and all three prove the same thing: the script
// looked at THIS repository and not at the temp directory it was called from.
// A section means the range had something; «нет коммитов» is right after a
// release; «выпускать нечего» is a range of refactors and chores only. The first
// of those used to fail the stand for a reason that had nothing to do with its
// subject — found 5 September 2026, when v0.4.0 was cut and main went red on the
// spot.
const empty = /нет коммитов|выпускать нечего/.test(r.stderr + r.stdout);
const spoke = /^## v\d+\.\d+\.\d+/m.test(r.stdout) || empty;
ok('сухой прогон из чужой папки не падает', r.status === 0 || empty, r.stderr || r.stdout);
ok('и говорит о своём репозитории, а не о чужой папке', spoke, r.stdout + r.stderr);
ok('и ничего не записывает', /--dry: ничего не записано/.test(r.stdout) || empty, r.stdout);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
