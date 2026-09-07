// node tools/test-keymap.mjs — the key registry.
//
// A stand with no browser and no DOM: the registry is pure functions on purpose,
// because until 5 September 2026 nothing checked the key parsing at all —
// `onKey()` lives in the entry point, which cannot be imported, and its seventeen
// comparisons rested on somebody walking the office by hand.
//
// The point here is not "N opens the notes" but the two things the whole idea
// stands on: one physical key under both layouts, and no silent clashes.
import { define, all, has, codesOf, groupOf, clashes, codeOf, actionOf, isAction, labelFor, labelsOf, reset, GROUPS } from '../web/keymap.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// ------------------------------------------------------------------ the core
ok('kernel declared import actions', all().length > 15, all().length);
ok('there are no collisions in the core', clashes().length === 0, clashes());
ok('each action has a known group', all().every((a) => GROUPS.includes(a.group)), all().filter((a) => !GROUPS.includes(a.group)));
ok('id are unique', new Set(all().map((a) => a.id)).size === all().length, all().length);

// ------------------------------------------------- one key, two layouts
// What this was all for: `code` does not depend on the layout, so pairs like
// `k === 'n' || k === 'т'` are no longer needed — it is one and the same KeyN.
ok('Latin N - notes', isAction({ code: 'KeyN', key: 'n' }, 'panel.notes'), actionOf({ code: 'KeyN' }));
ok('Russian T - the same notes, because the key is the same',
  isAction({ code: 'KeyN', key: 'т' }, 'panel.notes'), actionOf({ code: 'KeyN', key: 'т' }));
ok('and B, and I - skate', actionOf({ code: 'KeyB', key: 'b' }) === 'act.skate'
  && actionOf({ code: 'KeyB', key: 'и' }) === 'act.skate', actionOf({ code: 'KeyB', key: 'и' }));
ok('a symbol without a code does not argue with the code', actionOf({ code: 'KeyH', key: 'р' }) === 'panel.pager', actionOf({ code: 'KeyH', key: 'р' }));

// ------------------------------------------------------------ keys with no code
// The gamepad sends key names: it has no codes and nowhere to get them from.
ok('spacebar from gamepad', codeOf({ key: ' ' }) === 'Space', codeOf({ key: ' ' }));
ok('letter from gamepad', codeOf({ key: 'k' }) === 'KeyK', codeOf({ key: 'k' }));
ok('Tab from gamepad', codeOf({ key: 'Tab' }) === 'Tab', codeOf({ key: 'Tab' }));
ok('Shift from a gamepad', codeOf({ key: 'Shift' }) === 'ShiftLeft', codeOf({ key: 'Shift' }));
ok('plus and equal - one key', codeOf({ key: '+' }) === 'Equal' && codeOf({ key: '=' }) === 'Equal', codeOf({ key: '+' }));
ok('minus and underscore - one key', codeOf({ key: '-' }) === 'Minus' && codeOf({ key: '_' }) === 'Minus', codeOf({ key: '_' }));
ok('number from gamepad', codeOf({ key: '0' }) === 'Digit0', codeOf({ key: '0' }));
// Cyrillic without a code is deliberately not parsed: guessing a position from a
// character is exactly what this file removes. A real event always brings a code.
ok('Cyrillic alphabet can\'t be guessed without code', codeOf({ key: 'т' }) === null, codeOf({ key: 'т' }));
ok('empty event doesn\'t crash', codeOf(null) === null && actionOf(null) === null, 'упало');
ok('unfamiliar key - no action', actionOf({ code: 'F7' }) === null, actionOf({ code: 'F7' }));

// ------------------------------------------------------------------ the scale
ok('Equal - bring closer', actionOf({ code: 'Equal' }) === 'zoom.in', actionOf({ code: 'Equal' }));
ok('NumpadAdd - aka', actionOf({ code: 'NumpadAdd' }) === 'zoom.in', actionOf({ code: 'NumpadAdd' }));
ok('Digit0 - reset', actionOf({ code: 'Digit0' }) === 'zoom.reset', actionOf({ code: 'Digit0' }));

// -------------------------------------------------------------------- walking
// Walking is the arrows only: WASD was removed on 5 September 2026 and the four
// letters went back to the free ones. Both sides are checked: the arrow walks,
// the letter no longer does.
ok('arrow is walking', actionOf({ code: 'ArrowLeft' }) === 'move.left', actionOf({ code: 'ArrowLeft' }));
ok('and the letter below it is free', actionOf({ code: 'KeyA' }) === null, actionOf({ code: 'KeyA' }));
ok('and the other three too', ['KeyW', 'KeyS', 'KeyD'].every((c) => actionOf({ code: c }) === null),
  ['KeyW', 'KeyS', 'KeyD'].map((c) => actionOf({ code: c })));
ok('run marked as held', all().find((a) => a.id === 'move.run').held === true, all().find((a) => a.id === 'move.run'));

// -------------------------------------------------------------------- labels
ok('the letter is printed as a letter', labelFor('KeyK') === 'K', labelFor('KeyK'));
ok('space - in a word', labelFor('Space') === 'SPACE', labelFor('Space'));
ok('arrow - arrow', labelFor('ArrowUp') === '↑', labelFor('ArrowUp'));
ok('the action has all its signatures', labelsOf('move.left').join(' ') === '←', labelsOf('move.left'));
ok('unknown code is printed as is', labelFor('IntlBackslash') === 'IntlBackslash', labelFor('IntlBackslash'));

// -------------------------------------------------------- a module takes a key
define([{ id: 'plan.toggle', codes: ['KeyK'], group: 'panel' }]);
ok('the module declared its action', has('plan.toggle'), all().map((a) => a.id));
ok('and the key leads to it', actionOf({ code: 'KeyK' }) === 'plan.toggle', actionOf({ code: 'KeyK' }));
ok('module group read', groupOf('plan.toggle') === 'panel', groupOf('plan.toggle'));
ok('codes are given as a copy, not as a link', (() => {
  const c = codesOf('plan.toggle'); c.push('KeyZ');
  return codesOf('plan.toggle').length === 1;
})(), codesOf('plan.toggle'));

// ------------------------------------------------------------- a clash
// A second module asks for a key that is taken. This used to be settled by load
// order — alphabetical by folder name — and nobody was told.
define([{ id: 'other.toggle', codes: ['KeyK', 'KeyQ'], group: 'panel' }]);
const clash = clashes();
ok('the collision is recorded, not swallowed', clash.length === 1, clash);
ok('and named by name', clash[0] && clash[0].code === 'KeyK' && clash[0].kept === 'plan.toggle' && clash[0].dropped === 'other.toggle', clash[0]);
ok('the first person to announce holds the key', actionOf({ code: 'KeyK' }) === 'plan.toggle', actionOf({ code: 'KeyK' }));
ok('the second latecomer key works', actionOf({ code: 'KeyQ' }) === 'other.toggle', actionOf({ code: 'KeyQ' }));

// ---------------------------------------------------------------- refusals
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
ok('action without codes is rejected', throws(() => define([{ id: 'x.y', group: 'panel' }])), 'приняли');
ok('empty codelist is rejected', throws(() => define([{ id: 'x.z', codes: [], group: 'panel' }])), 'приняли');
ok('unfamiliar group is rejected', throws(() => define([{ id: 'x.w', codes: ['KeyY'], group: 'выдумка' }])), 'приняли');
ok('repeated id is rejected', throws(() => define([{ id: 'plan.toggle', codes: ['KeyY'], group: 'panel' }])), 'приняли');

// ------------------------------------------------------------------- reset
reset();
ok('after the reset, only the core remains', !has('plan.toggle') && has('panel.notes'), all().map((a) => a.id));
ok('and the clashes are forgotten', clashes().length === 0, clashes());

console.log(bad ? `\n${bad} failures` : '\nall green');
process.exit(bad ? 1 : 0);
