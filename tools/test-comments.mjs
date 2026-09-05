// node tools/test-comments.mjs — the comments in the code are in English.
//
// The rule has a date (5 September 2026) and a reason: the repository is meant
// to be public, and the README invites a reader to read the server before
// running it. A comment nobody can read is a comment nobody read.
//
// A rule in AGENTS.md only works on whoever opened AGENTS.md, and four of the
// nine working trees on this machine did not even have the file. This stand
// works on everyone: it runs in `npm test`, in CI and in the pre-commit hook.
//
// TODO is the half that has not been translated yet, file by file. It is the
// point of the whole thing: a translated file can never go back, and the list
// shrinking is the progress. An empty file in the list is an error too —
// otherwise the list outlives the work and stops meaning anything.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { russianComments } from './lib/comments.mjs';

// Still Russian. Delete a line when the file is translated; never add one.
const TODO = new Set([
  'modules/plan/client.js',
  'modules/plan/test-keys.mjs',
  'modules/radio/client.js',
]);

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, got === undefined ? '' : '→ ' + got); }
};

// The machine itself first: a checker that says "clean" about everything is
// worse than none, and this one is easy to break — it has to tell a comment
// from a string that merely looks like one.
ok('русский комментарий виден', russianComments('// заметка\n').length === 1);
ok('английский — нет', russianComments('// a note\n').length === 0);
ok('строка, которую офис говорит вслух, — не комментарий',
  russianComments("console.log('Гоша освободилась');\n").length === 0);
ok('адрес со слэшами внутри строки — не комментарий',
  russianComments("const u = 'http://x/y'; // ссылка\n").length === 1);
ok('цитата-улика внутри английского комментария остаётся',
  russianComments('// the office wrote "Гоша освободилась" that day\n').length === 0);
ok('блочный комментарий тоже считается', russianComments('/* уже мёртв */\n').length === 1);
ok('многострочный блок отдаёт номер строки', russianComments('let a;\n/* one\n два */\n')[0].line === 3);
ok('шаблонная строка с русским текстом — не комментарий',
  russianComments('const h = `<b>Кто внутри</b>`;\n').length === 0);

// ------------------------------------------------------------------ the code
const files = execSync('git ls-files "*.js" "*.mjs"', { encoding: 'utf8' })
  .trim().split('\n').filter((f) => f && !f.startsWith('.claude/') && fs.existsSync(f));
ok('файлы вообще нашлись', files.length > 50, files.length);

const left = [];
for (const f of files) {
  const hits = russianComments(fs.readFileSync(f, 'utf8'));
  if (TODO.has(f)) {
    if (hits.length) left.push([f, hits.length]);
    else ok(`${f}: переведён — убери его из списка TODO в этом стенде`, false);
    continue;
  }
  if (hits.length) {
    bad += 1;
    console.log(`УПАЛ  | ${f}: комментарии в коде на английском с 5 сентября 2026 (AGENTS.md)`);
    for (const h of hits.slice(0, 5)) console.log(`      | ${f}:${h.line}  ${h.text.slice(0, 88)}`);
    if (hits.length > 5) console.log(`      | …и ещё ${hits.length - 5}`);
  }
}
ok(`переведено: ${files.length - left.length} файлов из ${files.length}`, true);
if (left.length) {
  const total = left.reduce((n, [, c]) => n + c, 0);
  console.log(`      | осталось ${total} строк в ${left.length} файлах, крупнейшие: `
    + left.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f} (${n})`).join(', '));
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
