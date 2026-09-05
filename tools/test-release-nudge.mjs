// node tools/test-release-nudge.mjs — when the office nudges about the release
// video. The decision is what is checked, not the layout: git and a filesystem
// are not needed here, all the logic sits in the pure nudgeFrom.

import { nudgeFrom, parseChecklist } from '../server/release.js';

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', JSON.stringify(got)); }
};

const DAY = 86400000;
const now = Date.parse('2026-09-01T12:00:00Z');
const draft = (open, done = 0) => ({ exists: true, open, done, total: open + done });

// --- 1. silence where there is nothing to nudge about ---
check('без тегов молчит', nudgeFrom(null, now) === null, nudgeFrom(null, now));
check('без версии молчит', nudgeFrom({ tag: '' }, now) === null, 'что-то вернул');
check('закрытый чек-лист молчит',
  nudgeFrom({ tag: 'v0.2.0', taggedAt: now - 3 * DAY, draft: draft(0, 5) }, now) === null, 'пинает зря');

// --- 2. the nudge, when there is something ---
// The path arrives with the info and is only echoed: since 5 September 2026 the
// drafts live next to the settings, and this function must not know where that
// is — it decides whether to nudge, not where anything lies.
const DRAFT = '/home/somebody/.config/valey/scripts/v0.3.0.md';
const n = nudgeFrom({ tag: 'v0.3.0', taggedAt: now - 3 * DAY, draft: draft(4, 1), draftPath: DRAFT }, now);
check('незакрытый чек-лист пинает', !!n, n);
check('версия та самая', n.tag === 'v0.3.0', n.tag);
check('дни считаются', n.days === 3, n.days);
check('путь к черновику отдан как есть', n.draft === DRAFT, n.draft);
check('без пути в карточке стоит пусто, а не выдуманный файл',
  nudgeFrom({ tag: 'v0.3.0', taggedAt: now, draft: draft(1) }, now).draft === null);
check('черновик найден', n.hasDraft === true, n.hasDraft);
check('осталось пунктов', n.open === 4, n.open);

// --- 3. no draft — nudge harder rather than stay quiet ---
// The release may predate the generator, or the file was deleted. That is one
// more step to the video, and silence here would be the worst of the answers.
const nd = nudgeFrom({ tag: 'v0.4.0', taggedAt: now - DAY, draft: { exists: false, open: null, total: 0 } }, now);
check('без черновика всё равно пинает', !!nd, nd);
check('и говорит, что черновика нет', nd.hasDraft === false, nd.hasDraft);
check('осталось пунктов неизвестно', nd.open === null, nd.open);

// --- 4. the day it went out ---
check('в день релиза ноль дней, а не минус', nudgeFrom({ tag: 'v0.5.0', taggedAt: now - 1000, draft: null }, now).days === 0, 'иначе');
check('часы вперёд не дают отрицательных', nudgeFrom({ tag: 'v0.5.0', taggedAt: now + DAY, draft: null }, now).days === 0, 'отрицательные дни');
check('без даты тега дни неизвестны', nudgeFrom({ tag: 'v0.6.0', taggedAt: null, draft: null }, now).days === null, 'что-то насчитал');

// --- 5. parsing the checklist ---
// A script is full of square brackets — count the list items, not every bracket.
const md = `# v0.3.0
- [ ] проход снят
- [x] сценарий дописан
-  [ ]  войсовер записан
текст со [ссылкой](x) и [ ] не в списке
  - [X] обложка собрана`;
const c = parseChecklist(md);
check('незакрытых два', c.open === 2, c);
check('закрытых два', c.done === 2, c);
check('пункт с лишними пробелами посчитан', c.open === 2, c.open);
check('скобки в тексте не считаются', c.total === 4, c.total);

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
