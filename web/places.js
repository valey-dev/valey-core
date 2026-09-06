// Where you are standing, and what the keyboard means there.
//
// The keys panel used to draw one board for the whole office: every key with the
// one thing it does on the floor. That board is true in the corridor and wrong
// everywhere else. Inside an open agent card the fourteen letters of the floor
// do nothing at all — the panel has them — and the board went on promising that
// C changes your clothes. The worst case is the conversation: the cursor sits in
// a text field, so every letter types itself, and nothing on the screen said so.
//
// So a place is a first-class thing here. It names itself, and it says which
// physical keys are alive in it and what they are called there. Everything else
// on the board is drawn dim: not "unknown", but "not from here".
//
// Two kinds of place, and the difference is the whole design:
//
// **The floor and the things you stand next to** carry the registry — every
// action in web/keymap.js works, with the caption it always has. A place like
// this only overrides the odd key: at the cooler SPACE is «попить» rather than
// the general «действие».
//
// **An open panel** carries nothing of the registry. The office is not
// listening: the panel is. Such a place lists its keys and nothing else is lit.
//
// Drawn from the approved frame «Контекстная клавиатура», nine boards, one per
// place. The captions here are the captions there, which is why they are i18n
// keys rather than words: the frame is Russian, the office is not only Russian.
import { all, codesOf } from './keymap.js';

// The keys panel opens from anywhere — that is the whole point of it — so its
// own key is never dimmed and never needs listing in a place.
export const ALWAYS = 'service.keys';

const PLACES = [
  // ------------------------------------------------------------- the floor
  { id: 'floor', title: 'place.floor', registry: true },
  // Standing at something. The floor still answers; only the thing under your
  // hand renames SPACE.
  { id: 'cooler', title: 'place.cooler', registry: true, caps: { Space: 'place.cooler.space' } },

  // ------------------------------------------------------- panels of the core
  {
    id: 'card',
    title: 'place.card',
    caps: {
      // The card's own tabs, by the names the buttons print — see web/ui.js.
      Digit1: 'tab.talk', Digit2: 'tab.work', Digit3: 'tab.task', Escape: 'tab.close',
      Enter: 'place.press', Space: 'place.press', KeyN: 'place.card.note',
      ArrowUp: 'place.focus', ArrowDown: 'place.focus', ArrowLeft: 'place.focus', ArrowRight: 'place.focus',
    },
  },
  {
    // The conversation is the reason this feature exists. The cursor is in the
    // field, so the letters of the floor are not merely inactive — they type.
    id: 'talk',
    title: 'place.talk',
    caps: {
      Escape: 'place.close', Enter: 'place.talk.send',
      ShiftLeft: 'place.talk.shift', ShiftRight: 'place.talk.shift',
      KeyN: 'place.card.note',
      ArrowUp: 'place.talk.reply', ArrowDown: 'place.talk.reply',
    },
  },
  {
    id: 'round',
    title: 'place.round',
    caps: {
      Escape: 'place.close', Tab: 'place.close',
      Enter: 'place.round.go', Space: 'place.round.go',
      ArrowUp: 'place.round.row', ArrowDown: 'place.round.row',
    },
  },
  {
    id: 'viewer',
    title: 'place.viewer',
    caps: {
      Escape: 'place.viewer.back', KeyR: 'place.viewer.reread', KeyZ: 'place.viewer.loupe',
      Enter: 'place.press', Space: 'place.press',
      ArrowUp: 'place.viewer.buttons', ArrowDown: 'place.viewer.buttons',
      ArrowLeft: 'place.viewer.file', ArrowRight: 'place.viewer.file',
    },
  },
  {
    // Looking, not walking. F9 is here because a shot of a camera view is the
    // one frame the control room is illustrated with.
    id: 'cctv',
    title: 'place.cctv',
    caps: {
      Escape: 'place.cctv.away', Enter: 'place.cctv.away', Space: 'place.cctv.away',
      KeyT: 'place.cctv.auto', F9: 'hint.shot',
      ArrowLeft: 'place.cctv.cam', ArrowRight: 'place.cctv.cam',
    },
  },
  {
    // The panel with no board of its own. Every panel in this office is walked the
    // same way — arrows for focus, ENTER to press, digits to pick, ESC one step
    // back — and that is what the layout frame's «В панелях» table says. A screen
    // the frame does not name gets this rather than the floor: showing the floor's
    // letters over an open panel is exactly the lie this feature removes.
    id: 'panel',
    title: 'place.panel',
    caps: {
      Escape: 'place.close', Enter: 'place.press', Space: 'place.press',
      ArrowUp: 'place.focus', ArrowDown: 'place.focus', ArrowLeft: 'place.focus', ArrowRight: 'place.focus',
      Digit1: 'place.item', Digit2: 'place.item', Digit3: 'place.item', Digit4: 'place.item',
      Digit5: 'place.item', Digit6: 'place.item', Digit7: 'place.item', Digit8: 'place.item',
      Digit9: 'place.item',
    },
  },
  {
    id: 'lift',
    title: 'place.lift',
    caps: {
      Escape: 'place.close', Enter: 'place.lift.go', Space: 'place.lift.go',
      Digit1: 'place.lift.floor', Digit2: 'place.lift.floor', Digit3: 'place.lift.floor',
      ArrowUp: 'place.lift.floor', ArrowDown: 'place.lift.floor',
    },
  },
];

let places = [];

/**
 * Declare places. The core calls this at import; a module calls it through
 * `api.places()` with its own ids, prefixed with the module id — the same rule
 * the keys follow, and for the same reason.
 */
export function define(list) {
  for (const p of [].concat(list || [])) {
    if (!p || !p.id || !p.title) {
      throw new Error(`places: у места должны быть id и title — пришло ${JSON.stringify(p)}`);
    }
    if (places.some((x) => x.id === p.id)) throw new Error(`places: место ${p.id} уже объявлено`);
    places.push({ registry: false, caps: {}, ...p, caps: { ...(p.caps || {}) } });
  }
  return places.length;
}

// The lookup used inside this file: the live object, because keyIn() runs once per
// cap and copying a place sixty times a render buys nothing.
const find = (id) => places.find((p) => p.id === id) || null;

export function all_() { return places.map((p) => ({ ...p, caps: { ...p.caps } })); }
// What leaves this file is a copy. The stand found the leak: a caller held the
// registry's own object and could rename a key in it for everybody, which is the
// same class of bug codesOf() was given a copy for.
export function get(id) {
  const p = find(id);
  return p ? { ...p, caps: { ...p.caps } } : null;
}
export function has(id) { return places.some((p) => p.id === id); }
export function reset() { places = []; define(PLACES); }

/**
 * What the given key means in the given place, and whether it is lit at all.
 *
 * Returns `{ lit, caption }` where `caption` is an i18n key or null. A place
 * that carries the registry falls back to the action's own hint, so a key that
 * moves in the registry moves here too — the same reason the panel reads the
 * registry rather than a picture.
 */
export function keyIn(placeId, code) {
  const p = find(placeId);
  if (!p) return { lit: true, caption: null, action: null };
  const action = all().find((a) => a.codes.includes(code)) || null;
  if (action && action.id === ALWAYS) return { lit: true, caption: action.hint, action };
  if (Object.prototype.hasOwnProperty.call(p.caps, code)) {
    return { lit: true, caption: p.caps[code], action };
  }
  // Only the registry can light a key that the place did not name, and only
  // where the place says the floor is still listening.
  if (p.registry && action) return { lit: true, caption: action.hint || null, action };
  return { lit: false, caption: null, action };
}

/** Every code the place lights, for a stand to count without redrawing a board. */
export function litCodes(placeId) {
  const p = find(placeId);
  if (!p) return [];
  const out = new Set(Object.keys(p.caps));
  for (const c of codesOf(ALWAYS)) out.add(c);
  if (p.registry) for (const a of all()) for (const c of a.codes) out.add(c);
  return [...out];
}

reset();
