// node tools/test-tokens.mjs — the colours of the office live in :root.
//
// The rule has a date (5 September 2026) and a count. That day web/style.css
// held 92 hex literals: 22 in :root, where the palette is declared and
// documented, and 70 scattered down the file. Picking a colour therefore meant
// grepping for a neighbour and copying it, and that is how #ff9b8f (the QA
// role) and #ff9f8f (a broken module) came to sit one digit apart, and how two
// #ffd166 came to be hand-written next to a --warn that already held it.
//
// So the check is not about tidiness. A literal outside :root is a colour with
// no name, and a colour with no name is one nobody can repaint: theme.js turns
// the whole brown palette by variable, and whatever was copied by hand stays
// behind while its neighbours move. The three literals that are still in the
// file are exactly that bug, standing still and named in ALLOWED below.
//
// A rule in AGENTS.md works on whoever opened AGENTS.md. This works on
// everyone: it runs in `npm test`, in CI and in the pre-commit hook.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = 'web/style.css';
const css = fs.readFileSync(path.join(ROOT, FILE), 'utf8');

// The literals that stay, each with the reason it stays. This is not a "we will
// get to it" list: every line here has to say why the colour cannot simply
// become a var(), because the day it can, the line goes and the stand says so.
const ALLOWED = [
  { sel: '.invbody input', hex: '#1f150f',
    why: 'застывший двойник --field: var() здесь не переименование, а смена цвета' },
  { sel: '.invbody input', hex: '#6b4a2e',
    why: 'застывший двойник --wood-lit, там же и по той же причине' },
  { sel: '.tally', hex: '#8c7660',
    why: 'застывший двойник --muted; починка сдвинет цвет — пункт в BACKLOG.md' },
];

// Variables that come from outside this file, so a var() on them is not a typo:
// --ui is set by theme.js on every zoom step, --mono is the landing page's font
// stack and in the office falls through to the fallback on purpose, and --c is
// written per element by ui.js — it is the tone of one node of the tree, and
// there is no one value for it to have here.
//
// The keys panel adds three of the same kind, all geometry rather than colour.
// --cap is the width of a key cap, solved from the panel's width by keys.js so
// the keyboard fills it; --u is how many caps wide one key is, written into each
// key's style attribute; --edge is the colour of the bar under a bound key,
// taken from the group and written per key for the same reason --c is.
const OUTSIDE = new Set(['--ui', '--mono', '--c', '--cap', '--u', '--edge']);

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + JSON.stringify(got)); }
};

// ------------------------------------------------------------- the machinery
// Comments go first, and they are blanked rather than cut: a hex quoted in a
// comment is documentation, not a colour, and the line numbers have to survive
// for the report to be useful.
const blank = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

// Every hex literal with the selector whose block it sits in. Two things the
// naive grep gets wrong and this does not: a hex inside a comment, and an id
// selector spelled in hex letters — `.facetext #facealbum` is a real one in
// this file, and `#facea` reads as a colour to anything that only looks at
// characters.
function literals(src) {
  const text = blank(src);
  const blocks = [];
  const stack = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      const b = { sel: text.slice(from, i).trim().replace(/\s+/g, ' '), start: i, end: text.length };
      blocks.push(b); stack.push(b); from = i + 1;
    } else if (c === '}') {
      const b = stack.pop(); if (b) b.end = i;
      from = i + 1;
    } else if (c === ';') from = i + 1;
  }
  const out = [];
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const inside = blocks.filter((b) => b.start < m.index && m.index < b.end);
    // outside every block it is a selector, not a colour
    if (!inside.length) continue;
    const sel = inside[inside.length - 1].sel;
    const line = text.slice(0, m.index).split('\n').length;
    out.push({ hex: m[0], sel, line });
  }
  return out;
}

ok('the literal is visible in the rule', literals('.a{color:#fff}').length === 1);
ok('and knows his rule', literals('.a{color:#fff}')[0].sel === '.a');
ok('nested rule returns internal selector',
  literals('@media (min-width:1px){.b{color:#abcdef}}')[0].sel === '.b');
ok('the color in the comment is not the color', literals('/* #c39bff */ .a{color:var(--x)}').length === 0);
ok('id from hex letters - not color', literals('.facetext #facealbum{color:var(--x)}').length === 0);
ok('line number is real', literals('.a{\n  color:#fff}')[0].line === 2);
ok('several colors in a line are counted one at a time',
  literals('.a{color:#fff;border-color:#000}').length === 2);

// -------------------------------------------------------------------- :root
const root = css.match(/:root\{([\s\S]*?)\n\}/);
ok('the :root block is in place', !!root);
const declared = new Set([...(root ? root[1] : '').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
ok(`${declared.size} variables are declared in :root`, declared.size > 20, declared.size);

// ---------------------------------------------------------------- the check
const found = literals(css).filter((h) => h.sel !== ':root');
const spare = [];
const left = found.filter((h) => {
  const i = ALLOWED.findIndex((a) => a.sel === h.sel && a.hex === h.hex);
  if (i < 0) return true;
  spare.push(i);
  return false;
});

if (left.length) {
  bad += 1;
console.log(`FAIL  | ${FILE}: color is outside :root; name it there (AGENTS.md, 5 September 2026)`);
  for (const h of left.slice(0, 10)) console.log(`      | ${FILE}:${h.line}  ${h.sel} → ${h.hex}`);
if (left.length > 10) console.log(`      | …and ${left.length - 10} more`);
} else {
  ok(`${FILE}: no hex literals past :root`, true);
}

// An exception that is no longer needed is a lie of the same size as a missing
// one: it says a bug is still there when somebody has already fixed it.
for (let i = 0; i < ALLOWED.length; i++) {
  const a = ALLOWED[i];
  ok(`exception ${a.sel} → ${a.hex} still needed (${a.why})`, spare.includes(i));
}

// ------------------------------------------------------- var() without a name
// A typo in a variable name is silent in CSS: the declaration is simply dropped
// and the element keeps the colour it inherited, which looks like a design
// decision rather than a mistake.
const used = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
const unknown = [...used].filter((n) => !declared.has(n) && !OUTSIDE.has(n));
ok('each var() points to :root or to a known list outside', unknown.length === 0, unknown);

// ------------------------------------------------------------------ theme.js
// The office turns its whole brown palette from one hue, and it does it by
// name: theme.js writes the variables straight onto the root element, so a name
// that has drifted apart in the two files is not an error anywhere — the office
// simply stops repainting that one place and nobody notices until a screenshot
// in another tone.
const js = fs.readFileSync(path.join(ROOT, 'web/theme.js'), 'utf8');
const painted = [
  ...[...js.matchAll(/\['(--[\w-]+)',/g)].map((m) => m[1]),
  ...[...js.matchAll(/setProperty\('(--[\w-]+)'/g)].map((m) => m[1]),
];
ok(`theme.js paints ${new Set(painted).size} variables`, painted.length > 15, painted.length);
const orphans = [...new Set(painted)].filter((n) => !declared.has(n) && !OUTSIDE.has(n));
ok('and each of them is declared in :root', orphans.length === 0, orphans);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
