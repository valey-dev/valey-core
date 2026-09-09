// node tools/test-git-retry.mjs — surviving a fetch somebody else is doing.
//
// The incident this defends against, 9 September 2026: `npm run land` merged
// PR #29 and then died on its next line, `git fetch origin --tags`, with
// «cannot lock ref 'refs/remotes/origin/main'». The release was not cut and had
// to be finished by hand — in the exact gap between merge and tag that land was
// written to close.
//
// The other writer was this project's own deferred branch cleanup: a previous
// land leaves it running for five minutes and it fetches every two seconds, so
// two landings inside five minutes collide by construction. Landings here come
// in a row, so this is ordinary rather than unlucky.
import { isFetchRace, retryFetch } from './lib/git-retry.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', String(got).slice(0, 300)); }
};
const err = (stderr) => Object.assign(new Error('Command failed'), { stderr });
const nap = () => {};

// --- what counts as a race ----------------------------------------------
ok('the exact message from the incident is recognised',
  isFetchRace("error: cannot lock ref 'refs/remotes/origin/main': is at 3481e12 but expected 88a3eee"));
ok('so are the neighbouring ones git uses',
  isFetchRace('error: unable to update local ref') && isFetchRace('Unable to create /x/.git/refs/remotes/origin/main.lock'));
// A wrong remote and a dead network are not races. Retrying them turns a clear
// failure into the same failure four seconds later.
ok('a missing repository is not a race', !isFetchRace("fatal: repository 'x' does not exist"));
ok('no network is not a race', !isFetchRace('fatal: unable to access: Could not resolve host: github.com'));
ok('an empty failure is not a race', !isFetchRace('') && !isFetchRace(null));

// --- the retry -----------------------------------------------------------
let calls = 0;
const flaky = () => { calls += 1; if (calls < 3) throw err("cannot lock ref 'refs/remotes/origin/main'"); return 'fetched'; };
ok('a fetch that loses the lock twice still succeeds',
  retryFetch(flaky, { sleep: nap }) === 'fetched' && calls === 3, calls);

calls = 0;
const never = () => { calls += 1; throw err('cannot lock ref'); };
let thrown = null;
try { retryFetch(never, { tries: 4, sleep: nap }); } catch (e) { thrown = e; }
// Giving up has to look like the original failure: a retry that swallows the
// message leaves whoever reads the log with «land failed» and nothing else.
ok('it gives up after the tries and rethrows the real error',
  calls === 4 && thrown && /cannot lock ref/.test(thrown.stderr), { calls, thrown: thrown && thrown.stderr });

calls = 0;
thrown = null;
try { retryFetch(() => { calls += 1; throw err('fatal: repository does not exist'); }, { sleep: nap }); }
catch (e) { thrown = e; }
ok('anything that is not a race fails on the first try', calls === 1 && !!thrown, calls);

calls = 0;
ok('a fetch that works is not retried', retryFetch(() => { calls += 1; return 1; }, { sleep: nap }) === 1 && calls === 1, calls);

console.log(bad ? `\nFAILED: ${bad}` : '\nall green');
process.exit(bad ? 1 : 0);
