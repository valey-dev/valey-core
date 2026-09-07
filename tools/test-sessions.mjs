// node tools/test-sessions.mjs — picking one record per session.
// The ~/.claude/sessions directory is keyed by pid, so one session sometimes
// sits in two files and the office gives one person two bodies. Only the choice
// is checked here: no filesystem needed.

import { dedupeSessions } from '../server/agents.js';

let failed = 0;
const check = (name, ok, got) => {
  if (ok) console.log('ok    |', name);
  else { failed++; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const s = (sessionId, pid, startedAt, extra = {}) => ({ sessionId, pid, startedAt, ...extra });

// --- 1. with no duplicates nothing is lost ---
const three = [s('a', 1, 100), s('b', 2, 200), s('c', 3, 300)];
check('three different sessions remain three', dedupeSessions(three).length === 3, dedupeSessions(three).length);
check('and in the same order', dedupeSessions(three).map((x) => x.sessionId).join() === 'a,b,c', dedupeSessions(three).map((x) => x.sessionId));

// --- 2. a duplicate collapses into the newest by start time ---
const twins = [s('a', 10, 100, { cwd: 'старая' }), s('a', 20, 500, { cwd: 'новая' })];
check('the double collapses into one record', dedupeSessions(twins).length === 1, dedupeSessions(twins).length);
check('and the latest one remains according to startedAt', dedupeSessions(twins)[0].cwd === 'новая', dedupeSessions(twins)[0]);

// the order the directory was read in must not decide
const reversed = [s('a', 20, 500, { cwd: 'новая' }), s('a', 10, 100, { cwd: 'старая' })];
check('The order of the files does not affect the selection', dedupeSessions(reversed)[0].cwd === 'новая', dedupeSessions(reversed)[0]);

// --- 3. equal startedAt: the pid decides, but decides consistently ---
// What matters is not "which is more correct" but that the choice does not
// change from tick to tick: otherwise a person jumps between two desks.
const tie = [s('a', 7, 100, { cwd: 'меньший pid' }), s('a', 42, 100, { cwd: 'больший pid' })];
const tieBack = [s('a', 42, 100, { cwd: 'больший pid' }), s('a', 7, 100, { cwd: 'меньший pid' })];
check('with equal starting the choice is stable', dedupeSessions(tie)[0].cwd === dedupeSessions(tieBack)[0].cwd, [dedupeSessions(tie)[0].cwd, dedupeSessions(tieBack)[0].cwd]);
check('and this is a record with a large pid', dedupeSessions(tie)[0].pid === 42, dedupeSessions(tie)[0].pid);

// --- 4. an old file may have no startedAt ---
// Then the record with a time must beat the one without, and not the other way.
const noStamp = [s('a', 5, undefined, { cwd: 'без метки' }), s('a', 6, 10, { cwd: 'с меткой' })];
check('recording without startedAt plays recordings with it', dedupeSessions(noStamp)[0].cwd === 'с меткой', dedupeSessions(noStamp)[0]);

// --- 5. a triple duplicate and a mixture ---
const messy = [s('a', 1, 10), s('b', 2, 20), s('a', 3, 30), s('a', 4, 20), s('b', 5, 5)];
const out = dedupeSessions(messy);
check('out of five recordings, two sessions remain', out.length === 2, out.length);
check('a wins pid 3 (startedAt 30)', out.find((x) => x.sessionId === 'a').pid === 3, out.find((x) => x.sessionId === 'a'));
check('b wins pid 2 (startedAt 20)', out.find((x) => x.sessionId === 'b').pid === 2, out.find((x) => x.sessionId === 'b'));

// --- 6. an empty list ---
check('an empty list remains empty', dedupeSessions([]).length === 0, dedupeSessions([]).length);

console.log(failed ? `\nfailed: ${failed}` : '\nall matched');
process.exit(failed ? 1 : 0);
