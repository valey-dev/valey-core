// The office's keys, in one place, as actions rather than letters.
//
// Until 5 September 2026 there was no list. `onKey()` in main.js compared
// letters seventeen times, walking polled `keys.has('d') || keys.has('в')`
// every frame, and each module tested its own letter privately — so the only
// complete list of what the office answers to was a Figma frame, kept in step
// by hand. It drifted: the help strip at the bottom of the screen did not know
// about E or F9, and the README did not know about B, I or T.
//
// Two ideas, and everything else follows from them.
//
// **Actions, not letters.** Code asks "was this the action `panel.notes`?",
// never "was this the letter N?". The letter becomes data, which is what makes
// it changeable later without touching a single branch.
//
// **Physical keys, not characters.** A binding is `KeyN` — the key in the N
// position — not the character it produces. This is why the twenty hand-written
// pairs like `k === 'n' || k === 'т'` are gone: on "ЙЦУКЕН" that same physical key
// produces `т`, and `event.code` says `KeyN` under both layouts. It fixes every
// other layout at the same time, not just Russian, and it closes a leak in the
// held-key set: press a key under one layout, switch, release, and the old
// character-keyed entry never came out of the set — the office kept walking.
//
// Panel keys are deliberately absent. Arrows, Enter, Esc and the digits inside
// an open panel are structure, not preference: one way to walk a panel is the
// rule everywhere in this office, and a second way would be a second office.

// The colour groups on the layout frame, and what they mean here.
export const GROUPS = ['move', 'act', 'panel', 'zoom', 'service'];

// Declaration order is display order: this is the order the help strip and the
// keys panel will read.
const CORE = [
  // Arrows, and no WASD. WASD is built for a hand that lives on the keyboard —
  // it is worth its four letters in a game, where the hand never leaves. Here
  // people come back to the office between other things, from the mouse, and
  // they find the arrows without looking because the arrows sit apart. The four
  // letters bought a habit almost nobody in this audience has, and letters are
  // the scarce thing: giving them back leaves thirteen free for panels.
  //
  // Removed 5 September 2026 by the owner, knowing it takes walking away from
  // anyone who learned WASD here. It comes back the day keys are configurable —
  // by their own hand, which is the right way round.
  { id: 'move.up', codes: ['ArrowUp'], group: 'move', hint: 'hint.walk' },
  { id: 'move.left', codes: ['ArrowLeft'], group: 'move', hint: 'hint.walk' },
  { id: 'move.down', codes: ['ArrowDown'], group: 'move', hint: 'hint.walk' },
  { id: 'move.right', codes: ['ArrowRight'], group: 'move', hint: 'hint.walk' },
  { id: 'move.run', codes: ['ShiftLeft', 'ShiftRight'], group: 'move', held: true, hint: 'hint.run' },
  // Space alone. E was the second key here because a hand resting on WASD can
  // reach it without moving — which assumes a hand that rests on WASD, and this
  // office is used by people working with agents, not by people holding a
  // gaming grip. The thumb finds the space bar without being told, and a letter
  // spent on a duplicate is a letter a panel cannot have.
  { id: 'act.interact', codes: ['Space'], group: 'act', hint: 'hint.interact', more: 'hint.interactMore' },
  { id: 'act.skate', codes: ['KeyB'], group: 'act', hint: 'hint.skate' },
  { id: 'act.sound', codes: ['KeyM'], group: 'act', hint: 'hint.sound' },
  { id: 'panel.round', codes: ['Tab'], group: 'panel', hint: 'hint.round' },
  { id: 'panel.notes', codes: ['KeyN'], group: 'panel', hint: 'hint.notes' },
  { id: 'panel.bag', codes: ['KeyC'], group: 'panel', hint: 'hint.bag' },
  { id: 'panel.invite', codes: ['KeyI'], group: 'panel', hint: 'hint.invite', more: 'hint.inviteMore' },
  { id: 'panel.sky', codes: ['KeyP'], group: 'panel', hint: 'hint.sky' },
  { id: 'panel.skin', codes: ['KeyU'], group: 'panel', hint: 'hint.skin' },
  { id: 'panel.pager', codes: ['KeyH'], group: 'panel', hint: 'hint.pager' },
  // The cameras reuse left and right rather than binding their own: "previous
  // camera" is the same intent as "left", and a person who moves left onto
  // another key expects the cameras to follow. Only the cycling switch is the
  // control room's own.
  { id: 'cams.auto', codes: ['KeyT'], group: 'panel', hint: 'hint.cams', more: 'hint.camsMore' },
  { id: 'zoom.in', codes: ['Equal', 'NumpadAdd'], group: 'zoom', hint: 'hint.zoomIn' },
  { id: 'zoom.out', codes: ['Minus', 'NumpadSubtract'], group: 'zoom', hint: 'hint.zoomOut' },
  { id: 'zoom.reset', codes: ['Digit0', 'Numpad0'], group: 'zoom', hint: 'hint.zoomFit' },
  // The keys panel sits on the key where QWERTY prints «?». Under "ЙЦУКЕН" that
  // same key prints a full stop, which is the honest cost of a physical
  // binding — the panel shows the engraving when the browser knows it.
  { id: 'service.keys', codes: ['Slash'], group: 'service', hint: 'hint.keys' },
  // `more` is what does not fit on a cap and lives in the tooltip instead. A cap
  // holds about ten characters, and "с SHIFT — ×4" is a footnote rather than the
  // name of the action.
  { id: 'service.shot', codes: ['F9'], group: 'service', hint: 'hint.shot', more: 'hint.shotMore' },
];

let actions = [];
let byCode = new Map();
let failures = [];

function index() {
  byCode = new Map();
  failures = [];
  for (const a of actions) {
    for (const c of a.codes) {
      const taken = byCode.get(c);
      // First declaration wins, and the loser is recorded rather than
      // swallowed. Before this, two modules claiming one letter were settled
      // silently by load order — which is alphabetical by folder name, i.e. by
      // nothing at all.
      if (taken) { failures.push({ code: c, kept: taken, dropped: a.id }); continue; }
      byCode.set(c, a.id);
    }
  }
}

/**
 * Declare actions. The core calls this at import; a module calls it from
 * `register()` with its own ids, prefixed with its module id.
 */
export function define(list) {
  for (const a of [].concat(list || [])) {
    if (!a || !a.id || !Array.isArray(a.codes) || !a.codes.length) {
      throw new Error(`keymap: у действия должны быть id и codes — пришло ${JSON.stringify(a)}`);
    }
    if (!GROUPS.includes(a.group)) {
      throw new Error(`keymap: незнакомая группа «${a.group}» у ${a.id}`);
    }
    if (actions.some((x) => x.id === a.id)) throw new Error(`keymap: действие ${a.id} уже объявлено`);
    actions.push({ held: false, ...a, codes: a.codes.slice() });
  }
  index();
  return actions.length;
}

export function all() { return actions.map((a) => ({ ...a, codes: a.codes.slice() })); }
export function has(id) { return actions.some((a) => a.id === id); }
export function codesOf(id) { const a = actions.find((x) => x.id === id); return a ? a.codes.slice() : []; }
export function groupOf(id) { const a = actions.find((x) => x.id === id); return a ? a.group : null; }
/** Bindings that were asked for twice. Empty is the normal state. */
export function clashes() { return failures.slice(); }

// A synthetic event has no `code`: the gamepad in web/pad.js speaks key names,
// because that is what panels understand. Nothing here maps characters back to
// positions — a real keyboard event always carries `code`, and guessing a
// position from a character is exactly the thing this file removes.
const NAMED = new Set(['Tab', 'Enter', 'Escape', 'Backspace', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'F9']);

export function codeOf(ev) {
  if (!ev) return null;
  if (ev.code) return ev.code;
  const k = ev.key;
  if (!k) return null;
  if (k === ' ' || k === 'Spacebar') return 'Space';
  if (k === 'Shift') return 'ShiftLeft';
  if (NAMED.has(k)) return k;
  if (k.length === 1) {
    const c = k.toUpperCase();
    if (c >= 'A' && c <= 'Z') return 'Key' + c;
    if (c >= '0' && c <= '9') return 'Digit' + c;
    if (c === '+' || c === '=') return 'Equal';
    if (c === '-' || c === '_') return 'Minus';
  }
  return null;
}

/** The action this event asks for, or null when nothing is bound to it. */
export function actionOf(ev) {
  const code = codeOf(ev);
  return code ? (byCode.get(code) || null) : null;
}

/** True when the event asks for exactly this action — the shape call sites want. */
export function isAction(ev, id) { return actionOf(ev) === id; }

// What to print on a key. QWERTY is the assumption, and it is only an
// assumption: a browser that has `navigator.keyboard.getLayoutMap()` can say
// what the key is really engraved with, and the panel that shows the keyboard
// is where that belongs. Here it stays a pure function with no browser in it.
const SPECIAL = {
  Space: 'SPACE', Tab: 'TAB', Enter: 'ENTER', Escape: 'ESC',
  ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
  Equal: '+', Minus: '−', NumpadAdd: '+', NumpadSubtract: '−', Slash: '?',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
};

export function labelFor(code) {
  if (!code) return '';
  if (SPECIAL[code]) return SPECIAL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return code.slice(6);
  return code;
}

/** The keys of one action, printed: `['A', '←']`. */
export function labelsOf(id) { return codesOf(id).map(labelFor); }

/**
 * The bottom strip, as data: one entry per caption, with the keys that lead to
 * it. Actions that share a `hint` merge into one entry — walking is four
 * actions and one line. Only the first binding of each action is printed: the
 * arrows are a second way to walk and the strip is not a reference, it is a
 * reminder.
 *
 * The strip was a hand-written sentence in the dictionary until 5 September
 * 2026, and it lied in both languages: it never learned about E, F9 or H, and
 * every module had to remember to add its own line. Now a declared key is a
 * printed key, and forgetting is not possible.
 */
export function hints() {
  const out = [];
  const seen = new Map();
  for (const a of actions) {
    if (!a.hint) continue;
    const cap = labelFor(a.codes[0]);
    const at = seen.get(a.hint);
    if (at === undefined) { seen.set(a.hint, out.length); out.push({ hint: a.hint, caps: [cap], ids: [a.id] }); }
    else { out[at].caps.push(cap); out[at].ids.push(a.id); }
  }
  return out;
}

// Stands build a fresh registry per case; the office never calls this.
export function reset() { actions = []; failures = []; byCode = new Map(); define(CORE); }

define(CORE);
