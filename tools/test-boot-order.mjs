// node tools/test-boot-order.mjs — what has to happen before the entrance is drawn.
//
// #title is positioned from the canvas box, and the canvas gets its size in fit().
// Draw the menu first and it lands on a canvas that is still the wrong size, then
// jumps the moment fit() runs — the flash on the way into the office, reported on
// 6 September 2026. The HUD comes first for the same reason: fit() measures it to
// decide how much room is left for the office.
//
// Order in a startup file is exactly the kind of thing a later edit reshuffles
// without noticing, and the cost lands on the first screen anybody sees. There is
// no DOM here to observe it, so the source is read instead.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../web/main.js', import.meta.url), 'utf8');
let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('FAIL  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};

// The first occurrence of each is the one that runs at startup, not inside a handler.
const call = (needle) => src.indexOf(needle);
const hud = call('\nUI.renderHud();');
const fit = call('\nrefit();');
const title = call('\nrenderTitle();');

ok('the office calls renderHud at the start', hud > 0, hud);
ok('the office calls for refit at the start', fit > 0, fit);
ok('the office calls renderTitle at start', title > 0, title);
ok('the canvas is counted before the login menu is drawn', fit < title, { fit, title });
ok('and the HUD is drawn before the canvas is considered', hud < fit, { hud, fit });

console.log(bad ? `\n${bad} упало` : '\nall intact');
process.exit(bad ? 1 : 0);
