// node tools/test-places.mjs — places, and what a key means in each of them.
//
// No browser and no DOM: like the key registry, this is pure functions on
// purpose. What is checked is not "N is the notes" but the claim the contextual
// keyboard rests on — a panel takes the keys it needs and the floor answers the
// rest, except on the two screens that hear nothing at all.
//
// The expensive mistake this guards against is the quiet one: a place that lights
// a key the office will not answer. A board that lies is worse than no board,
// because the reader believes it.
import { define, all_, get, has, keyIn, litCodes, reset, ALWAYS } from '../web/places.js';
import { reset as resetKeys, codesOf } from '../web/keymap.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

resetKeys();
reset();

// ------------------------------------------------------------------ the core
ok('kernel declared places upon import', all_().length >= 8, all_().length);
ok('id are unique', new Set(all_().map((p) => p.id)).size === all_().length, all_().length);
ok('each place has a signature', all_().every((p) => !!p.title), all_().filter((p) => !p.title));
ok('there is a floor and carries a register', get('floor').registry === true, get('floor'));

// ------------------------------------------------- the floor carries the registry
// The point of `registry: true`: a key that moves in web/keymap.js moves here
// too, without this file being edited. So the caption is the action's own hint.
ok('on floor C - these are clothes', keyIn('floor', 'KeyC').caption === 'hint.bag', keyIn('floor', 'KeyC'));
ok('and it\'s burning', keyIn('floor', 'KeyC').lit === true, keyIn('floor', 'KeyC'));
ok('the free letter on the floor is not lit', keyIn('floor', 'KeyA').lit === false, keyIn('floor', 'KeyA'));
// Esc and the digits belong to panels; on the floor they are not from here.
ok('Esc on the floor is not lit', keyIn('floor', 'Escape').lit === false, keyIn('floor', 'Escape'));
ok('the number on the floor is not lit', keyIn('floor', 'Digit1').lit === false, keyIn('floor', 'Digit1'));
// T cycles the cameras and nothing else, and only with the cameras on: onKey
// reaches cams.auto inside the cctv branch alone. Until 12 September 2026 the
// floor's board still captioned it «смена камер» — a key that did nothing there.
ok('T on the floor is dark: the cameras are the control room’s',
  keyIn('floor', 'KeyT').lit === false && keyIn('floor', 'KeyT').caption === null, keyIn('floor', 'KeyT'));
ok('and the floor does not count it among its keys', !litCodes('floor').includes('KeyT'), litCodes('floor'));
ok('nor does a panel opened on the floor', keyIn('card', 'KeyT').lit === false, keyIn('card', 'KeyT'));

// ------------------------------------------------------ standing at something
// The cooler keeps the floor and renames one key. If it stopped carrying the
// registry, walking away from the cooler would look like walking into a panel.
ok('at the cooler SPACE - drink', keyIn('cooler', 'Space').caption === 'place.cooler.space', keyIn('cooler', 'Space'));
ok('and C still has clothes at the cooler', keyIn('cooler', 'KeyC').caption === 'hint.bag', keyIn('cooler', 'KeyC'));

// -------------------------------------------------------------- inside a panel
// The claim, corrected on 6 September 2026: an open panel takes the keys it needs
// and lets the rest through. The first cut dimmed the whole floor here — wrong in
// the honest direction, and still wrong: B really does put you on a skateboard
// with the card open, and a board that denies it stops being believed.
ok('the floor letter on the card is lit: the panel did not pick it up',
  keyIn('card', 'KeyC').lit === true && keyIn('card', 'KeyC').caption === 'hint.bag', keyIn('card', 'KeyC'));
ok('and what is taken away by the panel - in its own way', keyIn('card', 'Digit1').caption === 'tab.talk', keyIn('card', 'Digit1'));
ok('and Esc is named the same as the button', keyIn('card', 'Escape').caption === 'tab.close', keyIn('card', 'Escape'));

// The one the owner named: C is the wardrobe in the office and copying here.
ok('in transcript C - copy, not clothes',
  keyIn('transcript', 'KeyC').caption === 'place.copy', keyIn('transcript', 'KeyC'));
ok('and B is still a skateboard there', keyIn('transcript', 'KeyB').caption === 'hint.skate', keyIn('transcript', 'KeyB'));
ok('and SPACE - page, not action',
  keyIn('transcript', 'Space').caption === 'place.transcript.page', keyIn('transcript', 'Space'));
ok('in the Z viewer - magnifying glass', keyIn('viewer', 'KeyZ').caption === 'place.viewer.loupe', keyIn('viewer', 'KeyZ'));
ok('in the elevator the number is floor', keyIn('lift', 'Digit2').caption === 'place.lift.floor', keyIn('lift', 'Digit2'));
ok('in the control room T - auto-bypass, not a general change of cameras',
  keyIn('cctv', 'KeyT').caption === 'place.cctv.auto', keyIn('cctv', 'KeyT'));

// ------------------------------------------------------------------ swallowed
// The viewer answers `true` for every key in its own list, handled or not. Those
// reach nobody, so the board must not offer them: lighting ← «ходить» in the
// transcript is a promise nothing keeps, and that is worse than a dim working key.
ok('in the transcript ← eaten and does not burn', keyIn('transcript', 'ArrowLeft').lit === false, keyIn('transcript', 'ArrowLeft'));
ok('and ↑ works there', keyIn('transcript', 'ArrowUp').lit === true, keyIn('transcript', 'ArrowUp'));
ok('in the gallery R is not on, although there is a radio on the floor',
  keyIn('gallery', 'KeyR').lit === false, keyIn('gallery', 'KeyR'));
ok('what is eaten is not included in the burning list',
  !litCodes('transcript').includes('ArrowLeft'), litCodes('transcript').filter((c) => c.startsWith('Arrow')));

// ----------------------------------------------------------------- the deaf one
// One screen hears nothing below its own keys: the control room's branch in onKey
// ends in a return.
ok('control room marked deaf', get('cctv').deaf === true, get('cctv'));
ok('and the floor letter there is dead', keyIn('cctv', 'KeyB').lit === false, keyIn('cctv', 'KeyB'));
// Typing in a field is not a place. It had one for a day, and it could never be
// shown: to see a board you press «?», and in a field that types a slash. What is
// true there is a line on the card's board.
ok('there is no more room for “conversation”', !has('talk'), all_().map((p) => p.id));

// --------------------------------------------------------- the key that opens this
// «?» answers wherever the office is listening at all — and nowhere it is not.
// Claiming it works in a text field would send somebody pressing it.
const opener = codesOf(ALWAYS)[0];
for (const p of all_()) {
  const want = !p.deaf;
  const got = keyIn(p.id, opener).lit;
if (got !== want) { bad += 1; console.log('FAIL  | “/” at place', p.id, '→ lit', got, ', expected', want); }
}
ok('“/” lights up everywhere except in blind places', true, opener);
ok('and signed with his signature', keyIn('card', opener).caption === 'hint.keys', keyIn('card', opener));

// ------------------------------------------------------------------ the counts
// A place carrying the registry lights the floor plus what it took; a deaf one
// lights only what it took. Equal counts would mean `deaf` stopped working.
ok('a remote place is burning less than a floor', litCodes('cctv').length < litCodes('floor').length,
  [litCodes('cctv').length, litCodes('floor').length]);
ok('the control room lights up exactly as announced',
  litCodes('cctv').length === Object.keys(get('cctv').caps).length, litCodes('cctv').length);
ok('the card shows the floor plus her own',
  litCodes('card').length > litCodes('floor').length, [litCodes('card').length, litCodes('floor').length]);

// ------------------------------------------------------------- a place nobody knows
// The office asks for a place it has not declared — a module that failed to come
// up, say. Better a full board than a dark one: nothing is claimed to be off.
ok('an unfamiliar place does not extinguish everything', keyIn('выдумка', 'KeyC').lit === true, keyIn('выдумка', 'KeyC'));
ok('and does not invent signatures', keyIn('выдумка', 'KeyC').caption === null, keyIn('выдумка', 'KeyC'));
ok('the unfamiliar location has no lit keys in the list', litCodes('выдумка').length === 0, litCodes('выдумка'));

// -------------------------------------------------------- a module takes a place
define([{ id: 'mod.map', title: 'mod.title', caps: { KeyK: 'mod.close' } }]);
ok('the module announced its place', has('mod.map'), all_().map((p) => p.id));
ok('and his signature reads', keyIn('mod.map', 'KeyK').caption === 'mod.close', keyIn('mod.map', 'KeyK'));
ok('caps are given as a copy, not a link', (() => {
  const p = get('mod.map'); p.caps.KeyX = 'подмена';
  return keyIn('mod.map', 'KeyX').lit === false;
})(), get('mod.map').caps);

// ---------------------------------------------------------------- refusals
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
ok('place without id is rejected', throws(() => define([{ title: 'x' }])), 'приняли');
ok('place without signature is rejected', throws(() => define([{ id: 'x.y' }])), 'приняли');
ok('repeated id is rejected', throws(() => define([{ id: 'mod.map', title: 'x' }])), 'приняли');

// ------------------------------------------------------------------- reset
reset();
ok('after the reset, only the core remains', !has('mod.map') && has('floor'), all_().map((p) => p.id));

console.log(bad ? `\n${bad} failures` : '\nall green');
process.exit(bad ? 1 : 0);
