// node tools/test-module-styles.mjs — a module's stylesheet cannot repaint the office.
//
// A module's style.css is loaded into the office page after the core's, so a
// rule in it wins wherever its selector matches — and a selector made only of
// names the core also uses matches the core's own elements. That is how, on
// 13 September 2026, mail's `.mwho` gave every transcript's speaker line a 12px
// margin and a scrollbar, the radio set `zoom` on the core's viewer and roster
// panels (`.vwrap, .rwrap`, a copied core line), and gittree's bare `.add` and
// `.del` coloured anything in the office that carried them.
//
// The rule is simple on purpose: every selector in a module's stylesheet has
// to name something the module owns — a class or an id the core does not use.
// `.gitwrap .dl` is fine, `.dl` is not; `.keydetail:has(.feedask)` is fine
// (it only matches a card holding the module's own element). A name inside
// :not() narrows nothing: `:not(.x)` matches more, not less.
//
// It reads the module folders present on this disk: the free ones always, the
// paid ones when the Modules repository is mounted next to them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + JSON.stringify(got)); }
};

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule of a stylesheet: its selectors, one per comma, and its body. The
// text before each `{` is a prelude: an at-rule's is skipped and its block is
// still walked, which is what @media needs; a keyframe's steps (from, to, 40%)
// are not selectors.
export function rules(css) {
  const out = [];
  const src = stripComments(css);
  let prelude = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      const p = prelude.trim();
      prelude = '';
      if (!p || p.startsWith('@') || /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(p)) continue;
      const end = src.indexOf('}', i);
      const body = src.slice(i + 1, end < 0 ? src.length : end);
      out.push({ sels: p.split(',').map((s) => s.trim()).filter(Boolean), body });
    } else if (ch === '}' || ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return out;
}
export const selectors = (css) => rules(css).flatMap((r) => r.sels);

// The custom properties a stylesheet declares: `--paper:` and the like.
const customProps = (body) => [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);

// The classes and ids a selector names, leaving out whatever sits inside :not().
export function names(sel) {
  let s = sel;
  // :not() may nest (:not(:has(.x))); strip innermost first until none are left.
  for (let i = 0; i < 5 && /:not\(/.test(s); i++) s = s.replace(/:not\(([^()]*)\)/g, '');
  return {
    classes: [...s.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]),
    ids: [...s.matchAll(/#([a-zA-Z_][\w-]*)/g)].map((m) => m[1]),
  };
}

// What the core uses: every class and id its stylesheets style, and every one
// its pages and scripts write into markup. Both, because a module painting a
// class the core styles is a collision even where no markup of it was found.
export function coreNames() {
  const classes = new Set(), ids = new Set(), vars = new Set();
  for (const file of fs.readdirSync(path.join(ROOT, 'web'))) {
    if (!/\.(css|js|html)$/.test(file)) continue;
    const src = fs.readFileSync(path.join(ROOT, 'web', file), 'utf8');
    if (file.endsWith('.css')) {
      for (const r of rules(src)) {
        customProps(r.body).forEach((v) => vars.add(v));
        for (const sel of r.sels) {
          const n = names(sel);
          n.classes.forEach((c) => classes.add(c));
          n.ids.forEach((i) => ids.add(i));
        }
      }
    }
    if (!file.endsWith('.js') && !file.endsWith('.html')) continue;
    // class="a b${x ? ' c' : ''}" — the literal part; an interpolation stops it.
    for (const [, list] of src.matchAll(/class="([^"$]*)/g)) list.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    for (const [, id] of src.matchAll(/id="([^"$\s]+)"/g)) ids.add(id);
    for (const [, c] of src.matchAll(/classList\.(?:add|toggle|contains)\(\s*'([\w-]+)'/g)) classes.add(c);
    for (const [, list] of src.matchAll(/className\s*=\s*'([^'$]*)'/g)) list.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
  }
  return { classes, ids, vars };
}

// The selectors of one stylesheet that name nothing of their own. The one
// exception is a rule on :root that only declares variables the core does not
// have — the bible's paper tones: that adds names and paints nothing. The day
// the core grows a variable of the same name, that rule starts overriding the
// core's, and it turns up here.
export function leaks(css, core) {
  const out = [];
  for (const r of rules(css)) {
    const onRoot = r.sels.every((s) => s === ':root');
    const props = r.body.split(';').map((d) => d.trim()).filter(Boolean);
    if (onRoot && props.every((d) => d.startsWith('--')) && !customProps(r.body).some((v) => core.vars.has(v))) continue;
    for (const sel of r.sels) {
      const n = names(sel);
      if (!n.classes.some((c) => !core.classes.has(c)) && !n.ids.some((i) => !core.ids.has(i))) out.push(sel);
    }
  }
  return out;
}

// ------------------------------------------------------------ the parser itself
const toy = { classes: new Set(['dl', 'vwrap', 'keydetail', 'bykeys', 'mwho']), ids: new Set(['dialog']), vars: new Set(['--ink']) };
ok('a :root rule of new variables leaks nothing', leaks(':root{ --paper:#ded2b8; --gilt:#c9a06a }', toy).length === 0);
ok('a :root rule that redefines a core variable leaks', leaks(':root{ --paper:#ded2b8; --ink:#000 }', toy).length === 1);
ok('a :root rule that sets a property leaks', leaks(':root{ --paper:#ded2b8; color:red }', toy).length === 1);
ok('a comment is not a selector', selectors('/* about .dl here */\n.own{color:red}').join() === '.own');
ok('a comma makes two selectors', selectors('.a, .b .c{x:1}').length === 2);
ok('rules inside @media are read', selectors('@media (max-width:600px){ .a{x:1} .b{y:2} }').join() === '.a,.b');
ok('keyframe steps are not selectors', selectors('@keyframes k{ from{a:1} 50%{a:2} to{a:3} } .z{b:1}').join() === '.z');
ok('a bare core class leaks', leaks('.dl{x:1}', toy).length === 1);
ok('a core class under the module\'s own leaks nothing', leaks('.gitwrap .dl{x:1}', toy).length === 0);
ok('a core id leaks', leaks('#dialog, .vwrap, .radiowrap{zoom:1}', toy).join() === '#dialog,.vwrap');
ok('the module\'s own id narrows', leaks('#mailbox .mwho{x:1}', toy).length === 0);
ok(':has() of the module\'s own narrows', leaks('.keydetail:has(.feedask){x:1}', toy).length === 0);
ok(':not() of the module\'s own does not', leaks('.dl:not(.mine){x:1}', toy).length === 1);
ok('a keyboard-mode hover on a core class still leaks', leaks(':where(body:not(.bykeys)) .dl:hover{x:1}', toy).length === 1);
ok('an element alone leaks', leaks('button{x:1}', toy).length === 1);

// ------------------------------------------------------------ the modules on disk
const CORE = coreNames();
ok('the core\'s names were gathered', CORE.classes.size > 200 && CORE.ids.size > 20, [CORE.classes.size, CORE.ids.size]);

const dir = path.join(ROOT, 'modules');
const mods = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((m) => fs.existsSync(path.join(dir, m, 'style.css')))
  : [];
console.log(`      | module stylesheets on this disk: ${mods.length}${mods.length ? ' — ' + mods.join(', ') : ''}`);
for (const mod of mods) {
  const found = leaks(fs.readFileSync(path.join(dir, mod, 'style.css'), 'utf8'), CORE);
  ok(`${mod}: every selector names something of its own`, found.length === 0, found);
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
