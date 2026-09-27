// node tools/test-guest-modules.mjs — a guest's page catches up with the
// modules the owner left shown, even after sleeping through the switch.
//
// 26 September 2026: the owner opened the radio to a guest and the guest never
// got it. The office used to send «reload» once, at the switch; a phone whose
// stream was down then reconnected later without reloading and kept the old
// set. Now the office sends the set on every connect and the page compares.
import { installDom } from './lib/dom.mjs';

let reloads = 0;
installDom({ location: { reload: () => { reloads += 1; } } });
let answer = [];
globalThis.fetch = async () => ({ json: async () => answer });
const { loadModules, guestModules } = await import('../web/modules.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// The stream opens before the modules load: a set that arrives first waits.
guestModules(['polaroid', 'radio']);
ok('a set that arrives before the boot does not reload an empty page', reloads === 0, reloads);

// The page was served the polaroid alone — it slept through the radio.
answer = [{ id: 'polaroid', client: null }];
await loadModules();
ok('once loaded, a page missing a module reloads', reloads === 1, reloads);

// After that reload the page carries both, and the same set says nothing.
reloads = 0;
answer = [{ id: 'radio', client: null }, { id: 'polaroid', client: null }];
await loadModules();
guestModules(['polaroid', 'radio']);
ok('the same set in another order is not a change', reloads === 0, reloads);

guestModules(['polaroid']);
ok('a module taken away reloads too', reloads === 1, reloads);

reloads = 0;
guestModules({ error: 'junk' });
ok('anything but a list is ignored', reloads === 0, reloads);

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
