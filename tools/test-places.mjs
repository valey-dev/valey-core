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
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

resetKeys();
reset();

// ------------------------------------------------------------------ the core
ok('ядро объявило места при импорте', all_().length >= 8, all_().length);
ok('id уникальны', new Set(all_().map((p) => p.id)).size === all_().length, all_().length);
ok('у каждого места есть подпись', all_().every((p) => !!p.title), all_().filter((p) => !p.title));
ok('этаж есть и несёт реестр', get('floor').registry === true, get('floor'));

// ------------------------------------------------- the floor carries the registry
// The point of `registry: true`: a key that moves in web/keymap.js moves here
// too, without this file being edited. So the caption is the action's own hint.
ok('на этаже C — это одежда', keyIn('floor', 'KeyC').caption === 'hint.bag', keyIn('floor', 'KeyC'));
ok('и она горит', keyIn('floor', 'KeyC').lit === true, keyIn('floor', 'KeyC'));
ok('свободная буква на этаже не горит', keyIn('floor', 'KeyA').lit === false, keyIn('floor', 'KeyA'));
// Esc and the digits belong to panels; on the floor they are not from here.
ok('Esc на этаже не горит', keyIn('floor', 'Escape').lit === false, keyIn('floor', 'Escape'));
ok('цифра на этаже не горит', keyIn('floor', 'Digit1').lit === false, keyIn('floor', 'Digit1'));

// ------------------------------------------------------ standing at something
// The cooler keeps the floor and renames one key. If it stopped carrying the
// registry, walking away from the cooler would look like walking into a panel.
ok('у кулера ПРОБЕЛ — попить', keyIn('cooler', 'Space').caption === 'place.cooler.space', keyIn('cooler', 'Space'));
ok('а C у кулера всё ещё одежда', keyIn('cooler', 'KeyC').caption === 'hint.bag', keyIn('cooler', 'KeyC'));

// -------------------------------------------------------------- inside a panel
// The claim, corrected on 6 September 2026: an open panel takes the keys it needs
// and lets the rest through. The first cut dimmed the whole floor here — wrong in
// the honest direction, and still wrong: B really does put you on a skateboard
// with the card open, and a board that denies it stops being believed.
ok('в карточке буква этажа горит: панель её не забрала',
  keyIn('card', 'KeyC').lit === true && keyIn('card', 'KeyC').caption === 'hint.bag', keyIn('card', 'KeyC'));
ok('а забранное панелью — по-своему', keyIn('card', 'Digit1').caption === 'tab.talk', keyIn('card', 'Digit1'));
ok('и Esc назван так же, как кнопка', keyIn('card', 'Escape').caption === 'tab.close', keyIn('card', 'Escape'));

// The one the owner named: C is the wardrobe in the office and copying here.
ok('в транскрипте C — скопировать, а не одежда',
  keyIn('transcript', 'KeyC').caption === 'place.copy', keyIn('transcript', 'KeyC'));
ok('а B там всё ещё скейт', keyIn('transcript', 'KeyB').caption === 'hint.skate', keyIn('transcript', 'KeyB'));
ok('и ПРОБЕЛ — страница, а не действие',
  keyIn('transcript', 'Space').caption === 'place.transcript.page', keyIn('transcript', 'Space'));
ok('в просмотрщике Z — лупа', keyIn('viewer', 'KeyZ').caption === 'place.viewer.loupe', keyIn('viewer', 'KeyZ'));
ok('в лифте цифра — этаж', keyIn('lift', 'Digit2').caption === 'place.lift.floor', keyIn('lift', 'Digit2'));
ok('в пультовой T — автообход, а не общая смена камер',
  keyIn('cctv', 'KeyT').caption === 'place.cctv.auto', keyIn('cctv', 'KeyT'));

// ------------------------------------------------------------------ swallowed
// The viewer answers `true` for every key in its own list, handled or not. Those
// reach nobody, so the board must not offer them: lighting ← «ходить» in the
// transcript is a promise nothing keeps, and that is worse than a dim working key.
ok('в транскрипте ← съедена и не горит', keyIn('transcript', 'ArrowLeft').lit === false, keyIn('transcript', 'ArrowLeft'));
ok('а ↑ там работает', keyIn('transcript', 'ArrowUp').lit === true, keyIn('transcript', 'ArrowUp'));
ok('в галерее R не горит, хотя на этаже это радио',
  keyIn('gallery', 'KeyR').lit === false, keyIn('gallery', 'KeyR'));
ok('съеденное не попадает и в список горящих',
  !litCodes('transcript').includes('ArrowLeft'), litCodes('transcript').filter((c) => c.startsWith('Arrow')));

// ----------------------------------------------------------------- the deaf one
// One screen hears nothing below its own keys: the control room's branch in onKey
// ends in a return.
ok('пультовая помечена глухой', get('cctv').deaf === true, get('cctv'));
ok('и буква этажа там мертва', keyIn('cctv', 'KeyB').lit === false, keyIn('cctv', 'KeyB'));
// Typing in a field is not a place. It had one for a day, and it could never be
// shown: to see a board you press «?», and in a field that types a slash. What is
// true there is a line on the card's board.
ok('места «разговор» больше нет', !has('talk'), all_().map((p) => p.id));

// --------------------------------------------------------- the key that opens this
// «?» answers wherever the office is listening at all — and nowhere it is not.
// Claiming it works in a text field would send somebody pressing it.
const opener = codesOf(ALWAYS)[0];
for (const p of all_()) {
  const want = !p.deaf;
  const got = keyIn(p.id, opener).lit;
  if (got !== want) { bad += 1; console.log('УПАЛ  | «/» в месте', p.id, '→ горит', got, ', а надо', want); }
}
ok('«/» горит везде, кроме глухих мест', true, opener);
ok('и подписана своей подписью', keyIn('card', opener).caption === 'hint.keys', keyIn('card', opener));

// ------------------------------------------------------------------ the counts
// A place carrying the registry lights the floor plus what it took; a deaf one
// lights only what it took. Equal counts would mean `deaf` stopped working.
ok('глухое место горит меньше этажа', litCodes('cctv').length < litCodes('floor').length,
  [litCodes('cctv').length, litCodes('floor').length]);
ok('в пультовой горит ровно объявленное',
  litCodes('cctv').length === Object.keys(get('cctv').caps).length, litCodes('cctv').length);
ok('в карточке горит этаж плюс её собственное',
  litCodes('card').length > litCodes('floor').length, [litCodes('card').length, litCodes('floor').length]);

// ------------------------------------------------------------- a place nobody knows
// The office asks for a place it has not declared — a module that failed to come
// up, say. Better a full board than a dark one: nothing is claimed to be off.
ok('незнакомое место не гасит всё подряд', keyIn('выдумка', 'KeyC').lit === true, keyIn('выдумка', 'KeyC'));
ok('и не выдумывает подписи', keyIn('выдумка', 'KeyC').caption === null, keyIn('выдумка', 'KeyC'));
ok('у незнакомого места нет горящих клавиш в списке', litCodes('выдумка').length === 0, litCodes('выдумка'));

// -------------------------------------------------------- a module takes a place
define([{ id: 'mod.map', title: 'mod.title', caps: { KeyK: 'mod.close' } }]);
ok('модуль объявил своё место', has('mod.map'), all_().map((p) => p.id));
ok('и его подпись читается', keyIn('mod.map', 'KeyK').caption === 'mod.close', keyIn('mod.map', 'KeyK'));
ok('caps отдаются копией, а не ссылкой', (() => {
  const p = get('mod.map'); p.caps.KeyX = 'подмена';
  return keyIn('mod.map', 'KeyX').lit === false;
})(), get('mod.map').caps);

// ---------------------------------------------------------------- refusals
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
ok('место без id отвергается', throws(() => define([{ title: 'x' }])), 'приняли');
ok('место без подписи отвергается', throws(() => define([{ id: 'x.y' }])), 'приняли');
ok('повторный id отвергается', throws(() => define([{ id: 'mod.map', title: 'x' }])), 'приняли');

// ------------------------------------------------------------------- reset
reset();
ok('после сброса остаётся только ядро', !has('mod.map') && has('floor'), all_().map((p) => p.id));

console.log(bad ? `\n${bad} ПРОВАЛ(ов)` : '\nвсё зелено');
process.exit(bad ? 1 : 0);
