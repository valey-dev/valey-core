// The polaroid's arithmetic, with no browser in it: where the side table stands,
// where you sit and where you get up, and which agents have just come free. The
// client draws and opens windows; this file is what the stand can check.
//
// Frame: WIP — Polaroid in the lounge, v2 (section #polaroid). The table stands
// between the kicker and the sofa, not right of the sand bin as v1 drew it: v1
// was drawn on an old lounge, and that spot has held the hookah and two smokers'
// places since 10 September 2026.

// The table's footprint on the floor, in office pixels: ten wide, twelve tall,
// the bottom edge on the line of the sofa's legs.
export const TABLE = { w: 10, h: 12 };

// Where everything goes, measured from the lounge and the kicker the layout
// already has. Null when the floor has no lounge — the module then simply is not
// there, rather than guessing a spot.
export function placeFor(L) {
  const lo = L && L.lounge;
  if (!lo || !lo.seats || !lo.seats.length) return null;
  // Two office pixels clear of the sofa's left armrest (it starts at lo.x - 29),
  // so the table reads as standing beside the sofa rather than stuck to it.
  const x = lo.x - 36;
  const y = lo.y + 9;
  // The seat is the one nearest the table: the left place on the sofa.
  const seat = lo.seats.reduce((a, s) => (Math.abs(s.x - x) < Math.abs(a.x - x) ? s : a));
  // You stand, and get up, in front of the table: people get up onto a point in
  // front of the furniture rather than inside it, like from a bench.
  const out = { x, y: y + 14 };
  return { table: { x, y }, seat: { x: seat.x, y: seat.y }, out };
}

// The prop that makes the table an obstacle. blocked() in the core reads w and h
// off the prop itself, which is exactly so a module can put furniture of its own
// into the corridor.
export function tableProp(place) {
  return { kind: 'polaroid-table', x: place.table.x, y: place.table.y, w: TABLE.w, h: TABLE.h - 2 };
}

// Where the Instagram window goes: over the office's own window, pressed to its
// right edge, as tall as the page, phone-wide. instagram.com answers
// X-Frame-Options: DENY, so a panel inside the office is not an option — the
// nearest thing is a separate window laid over the office where a side panel
// would be. The owner asked for exactly that on 12 September 2026, after the
// first version opened the window wherever the browser chose.
//
// `w` is what the office window knows about itself: screenX/Y, outer and inner
// sizes. The difference between outer and inner height is the browser's own
// tabs and address bar; the window starts below them. `chrome` is the height a
// popup's own title and address bar take, so the popup's outer edge ends at
// the office's bottom rather than past it.
export const PHONE = { w: 390, minH: 480, gap: 12, chrome: 64 };
export function dockRect(w) {
  const top = Math.round(w.screenY + Math.max(0, w.outerHeight - w.innerHeight));
  const left = Math.round(w.screenX + w.outerWidth - PHONE.w - PHONE.gap);
  const height = Math.max(PHONE.minH, Math.round(w.innerHeight - PHONE.chrome - PHONE.gap));
  return { left: Math.max(w.screenX, left), top, width: PHONE.w, height };
}

// Who has just come free: the same transition the core toasts on — working, then
// awaiting you (toast.freed in web/main.js). `seen` is the module's own memory of
// statuses, so the polaroid calls on exactly the occasions the toast appears.
export function freed(seen, agents) {
  const out = [];
  for (const a of agents || []) {
    const was = seen.get(a.id);
    if (was === 'working' && a.status === 'awaiting') out.push(a);
    seen.set(a.id, a.status);
  }
  return out;
}
