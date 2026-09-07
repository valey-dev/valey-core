// node tools/test-release-nudge.mjs — when the office nudges about the release
// video. The decision is what is checked, not the layout: git and a filesystem
// are not needed here, all the logic sits in the pure nudgeFrom.

import { nudgeFrom, parseChecklist } from '../server/release.js';

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const DAY = 86400000;
const now = Date.parse('2026-09-01T12:00:00Z');
const draft = (open, done = 0) => ({ exists: true, open, done, total: open + done });

// --- 1. silence where there is nothing to nudge about ---
check('without tags is silent', nudgeFrom(null, now) === null, nudgeFrom(null, now));
check('silent without version', nudgeFrom({ tag: '' }, now) === null, 'что-то вернул');
check('closed checklist is silent',
  nudgeFrom({ tag: 'v0.2.0', taggedAt: now - 3 * DAY, draft: draft(0, 5) }, now) === null, 'пинает зря');

// --- 2. the nudge, when there is something ---
// The path arrives with the info and is only echoed: since 5 September 2026 the
// drafts live next to the settings, and this function must not know where that
// is — it decides whether to nudge, not where anything lies.
const DRAFT = '/home/somebody/.config/valey/scripts/v0.3.0.md';
const n = nudgeFrom({ tag: 'v0.3.0', taggedAt: now - 3 * DAY, draft: draft(4, 1), draftPath: DRAFT }, now);
check('unclosed checklist kicks', !!n, n);
check('the version is the same', n.tag === 'v0.3.0', n.tag);
check('days are counting', n.days === 3, n.days);
check('the path to the draft is given as is', n.draft === DRAFT, n.draft);
check('without a path, the card is empty, not a fictitious file',
  nudgeFrom({ tag: 'v0.3.0', taggedAt: now, draft: draft(1) }, now).draft === null);
check('draft found', n.hasDraft === true, n.hasDraft);
check('points left', n.open === 4, n.open);

// --- 3. no draft — nudge harder rather than stay quiet ---
// The release may predate the generator, or the file was deleted. That is one
// more step to the video, and silence here would be the worst of the answers.
const nd = nudgeFrom({ tag: 'v0.4.0', taggedAt: now - DAY, draft: { exists: false, open: null, total: 0 } }, now);
check('without a draft it still kicks', !!nd, nd);
check('and says there is no draft', nd.hasDraft === false, nd.hasDraft);
check('remaining items unknown', nd.open === null, nd.open);

// --- 4. the day it went out ---
check('on release day zero days, not minus', nudgeFrom({ tag: 'v0.5.0', taggedAt: now - 1000, draft: null }, now).days === 0, 'иначе');
check('clocks ahead do not give negative', nudgeFrom({ tag: 'v0.5.0', taggedAt: now + DAY, draft: null }, now).days === 0, 'отрицательные дни');
check('without date tag days unknown', nudgeFrom({ tag: 'v0.6.0', taggedAt: null, draft: null }, now).days === null, 'что-то насчитал');

// --- 5. parsing the checklist ---
// A script is full of square brackets — count the list items, not every bracket.
const md = `# v0.3.0
- [ ] проход снят
- [x] сценарий дописан
-  [ ]  войсовер записан
текст со [ссылкой](x) и [ ] не в списке
  - [X] обложка собрана`;
const c = parseChecklist(md);
check('open two', c.open === 2, c);
check('closed two', c.done === 2, c);
check('item with extra spaces counted', c.open === 2, c.open);
check('parentheses in the text do not count', c.total === 4, c.total);

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
