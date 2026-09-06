// node tools/test-places.mjs — places, and what a key means in each of them.
//
// No browser and no DOM: like the key registry, this is pure functions on
// purpose. What is checked is not "N is the notes" but the two claims the
// contextual keyboard rests on — the floor still carries the registry, and an
// open panel carries none of it.
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
// The claim the whole feature makes: over an open panel the floor is silent.
ok('в карточке буква этажа не горит', keyIn('card', 'KeyC').lit === false, keyIn('card', 'KeyC'));
ok('в карточке цифра — вкладка, по имени кнопки', keyIn('card', 'Digit1').caption === 'tab.talk', keyIn('card', 'Digit1'));
ok('и Esc назван так же, как кнопка', keyIn('card', 'Escape').caption === 'tab.close', keyIn('card', 'Escape'));
ok('в разговоре SHIFT — это перевод строки, а не бег',
  keyIn('talk', 'ShiftLeft').caption === 'place.talk.shift', keyIn('talk', 'ShiftLeft'));
ok('в разговоре стрелка ведёт к ответу, а не ходит',
  keyIn('talk', 'ArrowUp').caption === 'place.talk.reply', keyIn('talk', 'ArrowUp'));
ok('в пультовой T — автообход, а не общая смена камер',
  keyIn('cctv', 'KeyT').caption === 'place.cctv.auto', keyIn('cctv', 'KeyT'));
ok('в просмотрщике Z — лупа', keyIn('viewer', 'KeyZ').caption === 'place.viewer.loupe', keyIn('viewer', 'KeyZ'));
ok('в лифте цифра — этаж', keyIn('lift', 'Digit2').caption === 'place.lift.floor', keyIn('lift', 'Digit2'));

// --------------------------------------------------------- the key that always works
// The panel opens from anywhere; a place that dimmed its own key would be a
// board nobody could have opened.
const opener = codesOf(ALWAYS)[0];
for (const p of all_()) {
  const r = keyIn(p.id, opener);
  if (!r.lit) { bad += 1; console.log('УПАЛ  | «/» погашена в месте', p.id); }
}
ok('«/» горит во всех местах', true, opener);
ok('и подписана своей подписью', keyIn('card', opener).caption === 'hint.keys', keyIn('card', opener));

// ------------------------------------------------------------------ the counts
// A panel place lights only what it named plus the opener; the floor lights the
// whole registry. If these two ever came out equal, `registry` stopped working.
ok('на этаже горит больше, чем в карточке', litCodes('floor').length > litCodes('card').length,
  [litCodes('floor').length, litCodes('card').length]);
ok('в карточке горит ровно объявленное плюс «/»',
  litCodes('card').length === Object.keys(get('card').caps).length + codesOf(ALWAYS).length,
  litCodes('card').length);

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
