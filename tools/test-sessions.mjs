// node tools/test-sessions.mjs — выбор одной записи на сессию.
// Каталог ~/.claude/sessions ключуется по pid, поэтому одна сессия иногда
// лежит в двух файлах и офис ставит одного человека двумя телами. Здесь
// проверяется только выбор: файловая система не нужна.

import { dedupeSessions } from '../server/agents.js';

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', JSON.stringify(got)); }
};

const s = (sessionId, pid, startedAt, extra = {}) => ({ sessionId, pid, startedAt, ...extra });

// --- 1. без дублей ничего не теряется ---
const three = [s('a', 1, 100), s('b', 2, 200), s('c', 3, 300)];
check('три разные сессии остаются тремя', dedupeSessions(three).length === 3, dedupeSessions(three).length);
check('и в том же порядке', dedupeSessions(three).map((x) => x.sessionId).join() === 'a,b,c', dedupeSessions(three).map((x) => x.sessionId));

// --- 2. дубль схлопывается в свежайшую по старту ---
const twins = [s('a', 10, 100, { cwd: 'старая' }), s('a', 20, 500, { cwd: 'новая' })];
check('дубль схлопывается в одну запись', dedupeSessions(twins).length === 1, dedupeSessions(twins).length);
check('и остаётся свежайшая по startedAt', dedupeSessions(twins)[0].cwd === 'новая', dedupeSessions(twins)[0]);

// порядок чтения каталога решать не должен
const reversed = [s('a', 20, 500, { cwd: 'новая' }), s('a', 10, 100, { cwd: 'старая' })];
check('порядок файлов на выбор не влияет', dedupeSessions(reversed)[0].cwd === 'новая', dedupeSessions(reversed)[0]);

// --- 3. одинаковый startedAt: решает pid, но решает одинаково ---
// Важно не «какая правильнее», а чтобы выбор не менялся от тика к тику: иначе
// человек прыгает между двумя столами.
const tie = [s('a', 7, 100, { cwd: 'меньший pid' }), s('a', 42, 100, { cwd: 'больший pid' })];
const tieBack = [s('a', 42, 100, { cwd: 'больший pid' }), s('a', 7, 100, { cwd: 'меньший pid' })];
check('при равном старте выбор устойчив', dedupeSessions(tie)[0].cwd === dedupeSessions(tieBack)[0].cwd, [dedupeSessions(tie)[0].cwd, dedupeSessions(tieBack)[0].cwd]);
check('и это запись с большим pid', dedupeSessions(tie)[0].pid === 42, dedupeSessions(tie)[0].pid);

// --- 4. startedAt может отсутствовать у старого файла ---
// Тогда запись с временем должна выигрывать у записи без него, а не наоборот.
const noStamp = [s('a', 5, undefined, { cwd: 'без метки' }), s('a', 6, 10, { cwd: 'с меткой' })];
check('запись без startedAt проигрывает записи с ним', dedupeSessions(noStamp)[0].cwd === 'с меткой', dedupeSessions(noStamp)[0]);

// --- 5. тройной дубль и смесь ---
const messy = [s('a', 1, 10), s('b', 2, 20), s('a', 3, 30), s('a', 4, 20), s('b', 5, 5)];
const out = dedupeSessions(messy);
check('из пяти записей остаются две сессии', out.length === 2, out.length);
check('у a побеждает pid 3 (startedAt 30)', out.find((x) => x.sessionId === 'a').pid === 3, out.find((x) => x.sessionId === 'a'));
check('у b побеждает pid 2 (startedAt 20)', out.find((x) => x.sessionId === 'b').pid === 2, out.find((x) => x.sessionId === 'b'));

// --- 6. пустой список ---
check('пустой список остаётся пустым', dedupeSessions([]).length === 0, dedupeSessions([]).length);

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
