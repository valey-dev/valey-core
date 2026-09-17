// node tools/test-ui-api.mjs — every callback a page module calls is one it was
// given.
//
// `ui.js`, `pager.js` and `title.js` are handed an object of callbacks by
// main.js and keep it as `api`. Nothing checks that the two sides agree, and a
// name that is not there fails only when the button is pressed: on 16 September
// 2026 answering an agent's question called `api.toast`, which main.js never
// passed, and the handler died on that line — after the answer had reached the
// agent and before the card was returned to «what are you working on». The
// person saw «this question is already closed», and the same line sat in the
// four other answers: allow, always, deny, terminal. The comment in modules.js
// about `api.saveSettings` from a scope where `api` did not exist is the same
// class of bug, caught by hand a week earlier.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { code, argsAt, keysOf } from './lib/jsscan.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + JSON.stringify(got)); }
};

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const host = read('web/main.js');
const hostCode = code(host);

// Who is handed what: the call in main.js, and the module that keeps it.
const PAIRS = [
  { call: 'UI.initUI', module: 'web/ui.js' },
  { call: 'initPager', module: 'web/pager.js' },
  { call: 'initTitle', module: 'web/title.js' },
];

for (const { call, module } of PAIRS) {
  const at = hostCode.indexOf(call + '(');
  if (at < 0) { ok(`${call} is called in main.js`, false); continue; }
  // Over the blanked source: a comment inside the object carries unbalanced
  // brackets — «(see updateSettings)» — and reading the raw text ends the
  // argument list there, with the callbacks never seen.
  const args = argsAt(hostCode, at + call.length);
  // The callbacks are the last argument — `initUI(state, { … })`.
  const given = new Set(keysOf(args[args.length - 1] || ''));
  ok(`${call} hands over a set of callbacks`, given.size > 0, [...given].slice(0, 5));

  const used = new Set();
  for (const m of code(read(module)).matchAll(/\bapi\.([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
  const missing = [...used].filter((name) => !given.has(name));
  ok(`${module} calls only what ${call} gives it`, missing.length === 0, missing);
}

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
