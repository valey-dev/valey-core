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
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

// ------------------------------------------------------------------ the core
ok('ядро объявило действия при импорте', all().length > 15, all().length);
ok('столкновений в ядре нет', clashes().length === 0, clashes());
ok('у каждого действия известная группа', all().every((a) => GROUPS.includes(a.group)), all().filter((a) => !GROUPS.includes(a.group)));
ok('id уникальны', new Set(all().map((a) => a.id)).size === all().length, all().length);

// ------------------------------------------------- one key, two layouts
// What this was all for: `code` does not depend on the layout, so pairs like
// `k === 'n' || k === 'т'` are no longer needed — it is one and the same KeyN.
ok('латинская N — заметки', isAction({ code: 'KeyN', key: 'n' }, 'panel.notes'), actionOf({ code: 'KeyN' }));
ok('русская Т — те же заметки, потому что клавиша та же',
  isAction({ code: 'KeyN', key: 'т' }, 'panel.notes'), actionOf({ code: 'KeyN', key: 'т' }));
ok('и B, и И — скейт', actionOf({ code: 'KeyB', key: 'b' }) === 'act.skate'
  && actionOf({ code: 'KeyB', key: 'и' }) === 'act.skate', actionOf({ code: 'KeyB', key: 'и' }));
ok('символ без кода не спорит с кодом', actionOf({ code: 'KeyH', key: 'р' }) === 'panel.pager', actionOf({ code: 'KeyH', key: 'р' }));

// ------------------------------------------------------------ keys with no code
// The gamepad sends key names: it has no codes and nowhere to get them from.
ok('пробел с геймпада', codeOf({ key: ' ' }) === 'Space', codeOf({ key: ' ' }));
ok('буква с геймпада', codeOf({ key: 'k' }) === 'KeyK', codeOf({ key: 'k' }));
ok('Tab с геймпада', codeOf({ key: 'Tab' }) === 'Tab', codeOf({ key: 'Tab' }));
ok('Shift с геймпада', codeOf({ key: 'Shift' }) === 'ShiftLeft', codeOf({ key: 'Shift' }));
ok('плюс и равно — одна клавиша', codeOf({ key: '+' }) === 'Equal' && codeOf({ key: '=' }) === 'Equal', codeOf({ key: '+' }));
ok('минус и подчёркивание — одна клавиша', codeOf({ key: '-' }) === 'Minus' && codeOf({ key: '_' }) === 'Minus', codeOf({ key: '_' }));
ok('цифра с геймпада', codeOf({ key: '0' }) === 'Digit0', codeOf({ key: '0' }));
// Cyrillic without a code is deliberately not parsed: guessing a position from a
// character is exactly what this file removes. A real event always brings a code.
ok('кириллица без кода не угадывается', codeOf({ key: 'т' }) === null, codeOf({ key: 'т' }));
ok('пустое событие не падает', codeOf(null) === null && actionOf(null) === null, 'упало');
ok('незнакомая клавиша — не действие', actionOf({ code: 'F7' }) === null, actionOf({ code: 'F7' }));

// ------------------------------------------------------------------ the scale
ok('Equal — приблизить', actionOf({ code: 'Equal' }) === 'zoom.in', actionOf({ code: 'Equal' }));
ok('NumpadAdd — он же', actionOf({ code: 'NumpadAdd' }) === 'zoom.in', actionOf({ code: 'NumpadAdd' }));
ok('Digit0 — сброс', actionOf({ code: 'Digit0' }) === 'zoom.reset', actionOf({ code: 'Digit0' }));

// -------------------------------------------------------------------- walking
// Walking is the arrows only: WASD was removed on 5 September 2026 and the four
// letters went back to the free ones. Both sides are checked: the arrow walks,
// the letter no longer does.
ok('стрелка — это ходьба', actionOf({ code: 'ArrowLeft' }) === 'move.left', actionOf({ code: 'ArrowLeft' }));
ok('а буква под ней свободна', actionOf({ code: 'KeyA' }) === null, actionOf({ code: 'KeyA' }));
ok('и остальные три тоже', ['KeyW', 'KeyS', 'KeyD'].every((c) => actionOf({ code: c }) === null),
  ['KeyW', 'KeyS', 'KeyD'].map((c) => actionOf({ code: c })));
ok('бег помечен как удерживаемый', all().find((a) => a.id === 'move.run').held === true, all().find((a) => a.id === 'move.run'));

// -------------------------------------------------------------------- labels
ok('буква печатается буквой', labelFor('KeyK') === 'K', labelFor('KeyK'));
ok('пробел — словом', labelFor('Space') === 'SPACE', labelFor('Space'));
ok('стрелка — стрелкой', labelFor('ArrowUp') === '↑', labelFor('ArrowUp'));
ok('у действия все его подписи', labelsOf('move.left').join(' ') === '←', labelsOf('move.left'));
ok('неизвестный код печатается как есть', labelFor('IntlBackslash') === 'IntlBackslash', labelFor('IntlBackslash'));

// -------------------------------------------------------- a module takes a key
define([{ id: 'plan.toggle', codes: ['KeyK'], group: 'panel' }]);
ok('модуль объявил своё действие', has('plan.toggle'), all().map((a) => a.id));
ok('и клавиша ведёт к нему', actionOf({ code: 'KeyK' }) === 'plan.toggle', actionOf({ code: 'KeyK' }));
ok('группа модуля читается', groupOf('plan.toggle') === 'panel', groupOf('plan.toggle'));
ok('коды отдаются копией, а не ссылкой', (() => {
  const c = codesOf('plan.toggle'); c.push('KeyZ');
  return codesOf('plan.toggle').length === 1;
})(), codesOf('plan.toggle'));

// ------------------------------------------------------------- a clash
// A second module asks for a key that is taken. This used to be settled by load
// order — alphabetical by folder name — and nobody was told.
define([{ id: 'other.toggle', codes: ['KeyK', 'KeyQ'], group: 'panel' }]);
const clash = clashes();
ok('столкновение записано, а не проглочено', clash.length === 1, clash);
ok('и названо поимённо', clash[0] && clash[0].code === 'KeyK' && clash[0].kept === 'plan.toggle' && clash[0].dropped === 'other.toggle', clash[0]);
ok('первый объявивший держит клавишу', actionOf({ code: 'KeyK' }) === 'plan.toggle', actionOf({ code: 'KeyK' }));
ok('вторая клавиша опоздавшего работает', actionOf({ code: 'KeyQ' }) === 'other.toggle', actionOf({ code: 'KeyQ' }));

// ---------------------------------------------------------------- refusals
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
ok('действие без codes отвергается', throws(() => define([{ id: 'x.y', group: 'panel' }])), 'приняли');
ok('пустой список кодов отвергается', throws(() => define([{ id: 'x.z', codes: [], group: 'panel' }])), 'приняли');
ok('незнакомая группа отвергается', throws(() => define([{ id: 'x.w', codes: ['KeyY'], group: 'выдумка' }])), 'приняли');
ok('повторный id отвергается', throws(() => define([{ id: 'plan.toggle', codes: ['KeyY'], group: 'panel' }])), 'приняли');

// ------------------------------------------------------------------- reset
reset();
ok('после сброса остаётся только ядро', !has('plan.toggle') && has('panel.notes'), all().map((a) => a.id));
ok('и столкновения забыты', clashes().length === 0, clashes());

console.log(bad ? `\n${bad} ПРОВАЛ(ов)` : '\nвсё зелено');
process.exit(bad ? 1 : 0);
