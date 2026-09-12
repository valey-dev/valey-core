// node tools/test-promote.mjs — what may be published, and what a publication carries.
//
// promote.mjs is the one command that reaches outside: the public core and the
// buyers' shop front. Its mistakes are the expensive kind — a public main moved
// backwards under everybody who pulled, a version published that the owner never
// released to staging, a shop page that names one version while three went out,
// modules on the shelf that need core the public does not have. Each is a rule
// in promote-plan.mjs, and each is checked here without git or network.
import { decide, carried, compare, newest, coreOf } from './promote-plan.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const staged = ['v0.37.0', 'v0.38.0', 'v0.38.1', 'v0.39.0', 'v0.40.0', 'logseq-log/2026-09-11'];

ok('versions compare by number, not by string', compare('v0.10.0', 'v0.9.0') > 0);
ok('the newest ignores tags that are not versions', newest(staged) === 'v0.40.0', newest(staged));

const two = decide({ tag: 'v0.40.0', staged, published: ['v0.37.0'] });
ok('a staged version newer than the published one may go', two.ok, two);
ok('and it carries every version since, patches included',
  JSON.stringify(two.carries) === JSON.stringify(['v0.38.0', 'v0.38.1', 'v0.39.0', 'v0.40.0']), two.carries);
ok('the page is built since the last published', two.since === 'v0.37.0', two.since);

const mid = decide({ tag: 'v0.38.1', staged, published: ['v0.37.0'] });
ok('an older staged version may go too, and carries only up to itself',
  mid.ok && JSON.stringify(mid.carries) === JSON.stringify(['v0.38.0', 'v0.38.1']), mid);

const first = decide({ tag: 'v0.38.0', staged, published: [] });
ok('the very first publication carries the whole history of versions', first.ok && first.since === null && first.carries.length === 2, first);

const unstaged = decide({ tag: 'v0.41.0', staged, published: ['v0.37.0'] });
ok('a version not on the staging origin is refused', !unstaged.ok && /not on origin/.test(unstaged.note), unstaged);

const again = decide({ tag: 'v0.37.0', staged, published: ['v0.37.0'] });
ok('the published version is not published again', !again.ok && /already published/.test(again.note), again);

const back = decide({ tag: 'v0.38.0', staged, published: ['v0.37.0', 'v0.39.0'] });
ok('publishing never goes backwards', !back.ok && /forward only/.test(back.note), back);

ok('a branch name is not a version', !decide({ tag: 'main', staged, published: [] }).ok);

ok('carried() is inclusive of the tag and exclusive of since',
  JSON.stringify(carried(staged, 'v0.38.1', 'v0.40.0')) === JSON.stringify(['v0.39.0', 'v0.40.0']));

const sha = 'a'.repeat(40);
ok('a modules release records the core it ran against', coreOf({ valey: { core: { commit: sha, described: 'v0.37.0-2-gabc' } } }).described === 'v0.37.0-2-gabc');
ok('a release without that record has no core — promote refuses it', coreOf({ version: '0.7.1' }) === null);
ok('a record that is not a full commit does not count', coreOf({ valey: { core: { commit: 'abc123' } } }) === null);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
