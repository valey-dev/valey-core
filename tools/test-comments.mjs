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
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { russianComments } from './lib/comments.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + got); }
};

// The machine itself first: a checker that says "clean" about everything is
// worse than none, and this one is easy to break — it has to tell a comment
// from a string that merely looks like one.
ok('a Russian comment is detected', russianComments('// заметка\n').length === 1);
ok('an English comment is not', russianComments('// a note\n').length === 0);
ok('a string spoken by the office is not a comment',
  russianComments("console.log('Гоша освободилась');\n").length === 0);
ok('slashes inside a string are not a comment',
  russianComments("const u = 'http://x/y'; // ссылка\n").length === 1);
ok('quoted evidence inside an English comment may remain',
  russianComments('// the office wrote "Гоша освободилась" that day\n').length === 0);
ok('a block comment is checked', russianComments('/* уже мёртв */\n').length === 1);
ok('a multiline block reports its line number', russianComments('let a;\n/* one\n два */\n')[0].line === 3);
ok('a template string with Russian text is not a comment',
  russianComments('const h = `<b>Кто внутри</b>`;\n').length === 0);
ok('a comment after nested template literals is still checked',
  russianComments('const h = `${ok ? `<b>${name}</b>` : ""}`;\n// сломано\n').length === 1);
ok('a comment inside a template expression is checked',
  russianComments('const h = `${(() => { /* сломано */ return name; })()}`;\n').length === 1);
ok('a YAML hash comment is checked', russianComments('run: ok # сломано\n', 'hash').length === 1);
ok('an HTML comment is checked', russianComments('<p>Привет</p><!-- сломано -->\n', 'html').length === 1);
ok('an HTML text node is not a comment', russianComments('<p>Привет</p>\n', 'html').length === 0);
ok('a comment in a Markdown code fence is checked',
  russianComments('```sh\necho ok # сломано\n```\n', 'markdown').length === 1);
ok('Markdown prose is not a comment', russianComments('Русский текст.\n', 'markdown').length === 0);

// ------------------------------------------------------------------ the code
const files = execSync('git ls-files "*.js" "*.mjs" "*.css" "*.html" "*.svg" "*.yml" "*.yaml" "*.py" "*.md" ".gitignore"', { encoding: 'utf8' })
  .trim().split('\n').filter((f) => f && !f.startsWith('.claude/') && fs.existsSync(f));
ok('source files were found', files.length > 50, files.length);

for (const f of files) {
  const syntax = /\.(?:yml|yaml|py)$/.test(f) || f === '.gitignore' ? 'hash'
    : /\.md$/.test(f) ? 'markdown'
    : /\.(?:html|svg)$/.test(f) ? 'html' : 'slash';
  const hits = russianComments(fs.readFileSync(f, 'utf8'), syntax);
  if (hits.length) {
    bad += 1;
    console.log(`FAIL  | ${f}: code comments must be in English`);
    for (const h of hits.slice(0, 5)) console.log(`      | ${f}:${h.line}  ${h.text.slice(0, 88)}`);
    if (hits.length > 5) console.log(`      | …and ${hits.length - 5} more`);
  }
}
ok(`checked ${files.length} source files`, true);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
