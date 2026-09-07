// node tools/test-panels.mjs — every panel is placed somewhere.
//
// The panels are centred by one rule in style.css, where they are listed by
// name. A panel forgotten in that list does not break visibly: it simply lies as
// an ordinary block at the end of the page and slides below the bottom edge of
// the screen. On 30 August 2026 the invitation arrived that way, and a person saw
// it rather than a stand — not one test here looks at layout.
//
// So what is checked is not the picture but the decision: for every panel in the
// markup it must be stated whether it is centred by the shared rule or places
// itself. There must be no third option — "nobody thought about it".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// The panels that place themselves and are left out of the shared list by
// design. The list is short and deliberate: if a panel is here, it has a rule of
// its own in style.css — which is what is checked below.
const OWN = ['dialog', 'viewer', 'title', 'pager'];

const hidden = [...html.matchAll(/<div id="([\w-]+)" hidden><\/div>/g)].map((m) => m[1]);
ok('panels were found in the markup', hidden.length >= 8, hidden);

// the rule line where the centred ones are listed
const rule = (css.match(/^#[^{]*\{position:fixed; inset:0; z-index:28;[^}]*\}/m) || [''])[0];
const centred = [...rule.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
ok('centering rule found', centred.length >= 7, centred);

const forgotten = hidden.filter((id) => !centred.includes(id) && !OWN.includes(id));
ok('not a single panel is forgotten: either as a general rule, or sets itself',
  forgotten.length === 0, forgotten);

// Hiding goes by the same list: without [hidden] the display:flex rule beats the
// attribute, and a hidden panel stays on the screen. There are several [hidden]
// rules in the file — panels that place themselves have their own — so we collect
// them all rather than the first one that turns up: the stand tripped over that
// itself when it caught the #dialog rule instead of the long list.
const hiddenListed = [...css.matchAll(/#([\w-]+)\[hidden\]/g)].map((m) => m[1]);
const notHidden = centred.filter((id) => !hiddenListed.includes(id));
ok('and each centered one knows how to hide', notHidden.length === 0, notHidden);

// The other way round: the rule must hold no names that are absent from the
// markup — such a name means a panel renamed or deleted.
const ghosts = centred.filter((id) => !hidden.includes(id));
ok('there are no ghosts in the rule - all names are in the markup', ghosts.length === 0, ghosts);

for (const id of OWN) {
  ok(`${id} sets itself - it has its own rule`, new RegExp('#' + id + '\\b').test(css), id);
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
