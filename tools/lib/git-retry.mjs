// Fetching in a repository somebody else is also fetching in.
//
// `git fetch` updates refs/remotes/* under a lock, and a second fetch that wants
// the same ref while it moves does not wait — it fails:
//
//   error: cannot lock ref 'refs/remotes/origin/main': is at 3481e12 but expected 88a3eee
//
// On 9 September 2026 that killed a landing one line after the merge: PR #29 was
// merged, the release was not cut, and the operator finished it by hand. The
// other writer was not a stranger — it was this project's own deferred branch
// cleanup, which a previous `land` leaves running for five minutes and which
// fetches every two seconds. Two landings inside five minutes therefore collide
// by construction, and landings here come in a row.
//
// The contention is not an error about the repository. The ref moved, which is
// what fetching is for; the only thing wrong is the timing. So it is retried.
const RACE = /cannot lock ref|unable to update local ref|reference already exists|Unable to create .*\.lock/i;

export const isFetchRace = (text) => RACE.test(String(text || ''));

/**
 * Runs `attempt` until it stops failing on a ref that somebody else is moving.
 * Anything else fails on the spot: a wrong URL and no network are not races, and
 * retrying them only turns a clear failure into a slow one.
 */
export function retryFetch(attempt, { tries = 5, pause = 400, sleep = null } = {}) {
  const nap = sleep || ((ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); });
  for (let i = 1; ; i++) {
    try { return attempt(); } catch (err) {
      const text = [err.stderr, err.message].map((v) => (v ? v.toString() : '')).join('\n');
      if (i >= tries || !isFetchRace(text)) throw err;
      nap(pause * i);
    }
  }
}
