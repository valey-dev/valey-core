// The trade's pixel icon, 7×7, drawn before its name in place of the old border.
// The border could not sit on the text's baseline — a box around the text puts
// either the box or the text above the line — and the name row read as two
// heights. Frame: Role badge, Look=Icon, on System; #model-card on WIP.
//
// Every icon ends on its bottom row: the SVG stands on the baseline as an
// inline box does, so an empty last row lifts the drawing a pixel above the
// letters. tools/test-model-card.mjs holds that.
export const ROLE_ICONS = {
  code:     ['.......', '.......', '#......', '.#.....', '..#....', '.#.....', '#..####'],
  design:   ['.....#.', '....###', '...###.', '..###..', '.###...', '.##....', '#......'],
  research: ['.###...', '#...#..', '#...#..', '#...#..', '.###...', '....##.', '.....##'],
  plan:     ['.......', '.......', '#.#####', '.......', '#.#####', '.......', '#.###..'],
  qa:       ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
  release:  ['...#...', '..###..', '.#.#.#.', '...#...', '...#...', '.......', '#######'],
};

// Inline SVG in the text's colour: one path, a square per pixel, crisp edges.
// Exported for the modules' own icons — the feature board draws the side of a
// release with it — so a second way to draw a pixel icon does not appear.
export function pixelIcon(rows) {
  if (!rows) return '';
  let d = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg class="ricon" viewBox="0 0 7 7" width="7" height="7" aria-hidden="true"><path d="${d}"/></svg>`;
}

export const roleIcon = (key) => pixelIcon(ROLE_ICONS[key]);
