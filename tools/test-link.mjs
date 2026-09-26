// node tools/test-link.mjs — the three phases of a lost office.
//
// The thing worth a stand here is the threshold, not the drawing. A blink of
// the network and a dead server look identical for the first two seconds, and
// the only thing that tells them apart is how many reconnects in a row failed.
// Get that number wrong in either direction and the feature turns into its own
// bug: too low and the floor goes black every time a terminal restarts, too
// high and the person sits in front of a frozen office wondering again.
import { LINK, DOWN_AFTER, linkSeen, linkLost, linkTrying, linkDown, linkRetrying } from '../web/link.js';

let failed = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { failed++; console.log('FAIL  |', name); if (got !== undefined) console.log('      |', JSON.stringify(got)); }
};

// Every case starts from a live office: the module holds one state for the page.
const reset = (now) => { linkSeen(now); };

const T0 = 1_700_000_000_000;

reset(T0);
ok('a fresh office is live', !linkDown() && !linkRetrying() && LINK.phase === 'live', LINK.phase);
ok('the snapshot is remembered by its time', LINK.lastSeen === T0, LINK.lastSeen);

// One failure is a blink. The chip lights, the lights stay on.
reset(T0);
const crossedOnce = linkLost(2000, T0 + 100);
ok('one failed reconnect is retrying, not down', linkRetrying() && !linkDown(), LINK.phase);
ok('a blink does not report a crossing', crossedOnce === false, crossedOnce);

// The third failure is the power cut, and it is reported exactly once: the
// sound and the darkness hang off that answer.
reset(T0);
linkLost(2000, T0 + 100);
linkLost(4000, T0 + 200);
const crossed = linkLost(8000, T0 + 300);
ok(`${DOWN_AFTER} failures in a row mean the office is gone`, linkDown(), LINK.phase);
ok('the crossing is reported on the failure that crosses', crossed === true, crossed);
const after = linkLost(16000, T0 + 400);
ok('and not again on the next one', after === false, after);

// The countdown counts to the retry the page actually scheduled.
reset(T0);
linkLost(2000, T0);
linkLost(4000, T0);
linkLost(8000, T0);
ok('the next attempt is the wait the caller passed', LINK.nextTry === T0 + 8000, LINK.nextTry);
linkTrying(T0 + 8000);
ok('while an attempt is in flight there is nothing to count to', LINK.nextTry === 0, LINK.nextTry);

// Coming back. Only a return from `down` is news — a reconnect after one blink
// must not turn the lights on with a sound, because they never went off.
reset(T0);
linkLost(2000, T0);
ok('a blink that heals is not a return', linkSeen(T0 + 1000) === false);
reset(T0);
linkLost(2000, T0); linkLost(4000, T0); linkLost(8000, T0);
ok('a return from the dark is news', linkSeen(T0 + 9000) === true);
ok('and the office is live again', LINK.phase === 'live' && LINK.fails === 0, LINK);

// The snapshot time is the one shown on the plaque, so it must not move while
// the office is gone: it is the age of what is on the screen.
reset(T0);
linkLost(2000, T0 + 500); linkLost(4000, T0 + 600); linkLost(8000, T0 + 700);
ok('a dead office does not touch the time of the last snapshot', LINK.lastSeen === T0, LINK.lastSeen);

console.log(failed ? `\nFAILED: ${failed}` : '\nall passed');
process.exit(failed ? 1 : 0);
