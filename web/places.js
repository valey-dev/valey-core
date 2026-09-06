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
// **Almost everywhere the floor still answers.** A panel takes the keys it needs
// and lets the rest fall through: onKey asks the panel first, and whatever the
// panel returns false for reaches the floor's dispatch below it. So with the
// transcript open B is still the skateboard — and C is not the wardrobe, because
// the transcript took it for copying. A place says what was taken; the registry
// says the rest, and a key that moves in web/keymap.js moves here with it.
//
// The first cut of this file had panels light nothing at all. It was wrong in
// the honest direction — it dimmed keys that work — but wrong is wrong: a board
// that says B does nothing, when B puts you on a skateboard, teaches the reader
// to stop believing it.
//
// **`mute` is for a key the panel swallows and does nothing with.** The viewer
// answers `true` for every key in its own list, whether it handled it or not — so
// in the transcript ← and → reach nobody: the office never sees them and the
// transcript ignores them. Without `mute` the registry would light them «ходить»,
// which is worse than dimming a working key: it is a promise that nothing keeps.
//
// **One place is genuinely deaf**, and it is marked so: the control room, whose
// branch in onKey ends in an unconditional return, so nothing below it runs.
//
// Typing in a field is not a place. It looked like one and had a board of its own
// for a day — but to see a board you press «?», and in a field that types a slash,
// so the board could never be reached. What is true there is one sentence, and it
// belongs on the card's board rather than on a screen nobody can open: while the
// cursor is in the field the keyboard belongs to the field. (The gamepad is not
// covered by that — it hands onKey a target of its own and is heard while typing.)
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
  //
  // Every one of these carries the registry: web/ui.js walks its panels through
  // one shared focusRing, and that ring takes the arrows, ENTER, SPACE and — where
  // the panel asked for them — the digits. It returns false for everything else,
  // and everything else is the floor.
  {
    id: 'card',
    title: 'place.card',
    registry: true,
    caps: {
      // The card's own tabs, by the names the buttons print — see web/ui.js.
      // While the cursor sits in the field none of this is heard; that is a line on
      // the board, not a place of its own — see the note at the top of this file.
      Digit1: 'tab.talk', Digit2: 'tab.work', Digit3: 'tab.task', Escape: 'tab.close',
      Enter: 'place.press', Space: 'place.press',
      ArrowUp: 'place.focus', ArrowDown: 'place.focus', ArrowLeft: 'place.focus', ArrowRight: 'place.focus',
    },
  },
  {
    // Reading the whole answer. C is the one that surprises: in the office it is
    // the wardrobe, here it copies the block you are reading, and a board that
    // still said «одежда» would be wrong in the way that costs a click.
    id: 'transcript',
    title: 'place.transcript',
    registry: true,
    caps: {
      KeyC: 'place.copy', KeyN: 'place.card.note', KeyR: 'place.viewer.reread',
      ArrowUp: 'place.transcript.scroll', ArrowDown: 'place.transcript.scroll',
      PageUp: 'place.transcript.page', PageDown: 'place.transcript.page', Space: 'place.transcript.page',
      Home: 'place.transcript.top', End: 'place.transcript.end',
      Escape: 'place.close',
    },
    // Swallowed by VIEWER_KEYS in web/ui.js and handled by nobody.
    mute: ['ArrowLeft', 'ArrowRight'],
  },
  {
    id: 'viewer',
    title: 'place.viewer',
    registry: true,
    caps: {
      Escape: 'place.viewer.back', KeyR: 'place.viewer.reread', KeyZ: 'place.viewer.loupe',
      KeyC: 'place.copy',
      Enter: 'place.press', Space: 'place.press',
      ArrowUp: 'place.viewer.buttons', ArrowDown: 'place.viewer.buttons',
      ArrowLeft: 'place.viewer.file', ArrowRight: 'place.viewer.file',
    },
  },
  {
    id: 'gallery',
    title: 'place.gallery',
    registry: true,
    caps: {
      Escape: 'place.close', KeyC: 'place.copy',
      Enter: 'place.gallery.open', Space: 'place.gallery.open',
      ArrowUp: 'place.gallery.pick', ArrowDown: 'place.gallery.pick',
      ArrowLeft: 'place.gallery.pick', ArrowRight: 'place.gallery.pick',
    },
    // R is the radio on the floor and Z is nothing here, but the viewer's own key
    // list eats both before the office can see them.
    mute: ['KeyR', 'KeyZ'],
  },
  {
    id: 'round',
    title: 'place.round',
    registry: true,
    caps: {
      Escape: 'place.close', Tab: 'place.close',
      Enter: 'place.round.go', Space: 'place.round.go',
      ArrowUp: 'place.round.row', ArrowDown: 'place.round.row',
      ArrowLeft: 'place.round.row', ArrowRight: 'place.round.row',
    },
  },
  {
    // Looking, not walking, and the only screen in the office that is deaf by
    // construction: its branch in onKey ends in a return, so the dispatch under
    // it never runs. F9 is above that branch, which is why it is here.
    id: 'cctv',
    title: 'place.cctv',
    deaf: true,
    caps: {
      Escape: 'place.cctv.away', Enter: 'place.cctv.away', Space: 'place.cctv.away',
      KeyT: 'place.cctv.auto', F9: 'hint.shot',
      ArrowLeft: 'place.cctv.cam', ArrowRight: 'place.cctv.cam',
    },
  },
  {
    // The panel with no board of its own. Every panel in this office is walked the
    // same way — arrows for focus, ENTER to press, digits to pick, ESC one step
    // back — and that is what the layout frame's «В панелях» table says.
    id: 'panel',
    title: 'place.panel',
    registry: true,
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
    registry: true,
    caps: {
      Escape: 'place.close', Enter: 'place.lift.go', Space: 'place.lift.go',
      Digit1: 'place.lift.floor', Digit2: 'place.lift.floor', Digit3: 'place.lift.floor',
      // All four: liftRing steps on left and right as well as up and down.
      ArrowUp: 'place.lift.floor', ArrowDown: 'place.lift.floor',
      ArrowLeft: 'place.lift.floor', ArrowRight: 'place.lift.floor',
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
    places.push({ registry: false, deaf: false, caps: {}, mute: [], ...p,
      caps: { ...(p.caps || {}) }, mute: [...(p.mute || [])] });
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
  // What the place took for itself wins over everything, including the opener:
  // in the control room «/» is dead, and saying otherwise would send somebody
  // pressing it.
  if (Object.prototype.hasOwnProperty.call(p.caps, code)) {
    return { lit: true, caption: p.caps[code], action };
  }
  // Eaten by the screen and handled by nobody: dark, like a key that is not here.
  if (p.mute.includes(code)) return { lit: false, caption: null, action };
  // «?» answers everywhere the office is still listening at all.
  if (action && action.id === ALWAYS) return { lit: !p.deaf, caption: p.deaf ? null : action.hint, action };
  // And the floor answers wherever the panel let the key through.
  if (p.registry && action) return { lit: true, caption: action.hint || null, action };
  return { lit: false, caption: null, action };
}

/** Every code the place lights, for a stand to count without redrawing a board. */
export function litCodes(placeId) {
  const p = find(placeId);
  if (!p) return [];
  const out = new Set(Object.keys(p.caps));
  if (!p.deaf) for (const c of codesOf(ALWAYS)) out.add(c);
  if (p.registry) for (const a of all()) for (const c of a.codes) out.add(c);
  for (const c of p.mute) out.delete(c);
  return [...out];
}

reset();
