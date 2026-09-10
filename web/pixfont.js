// A 3×5 pixel font for the smallest text in the office — the text that is drawn
// in world pixels and then stretched by whole pixels along with the canvas.
//
// Why it exists at all. The canvas is 400×225, `imageSmoothingEnabled = false`,
// css `image-rendering: pixelated`. The browser's `fillText` at seven pixels
// draws a letter in grey half-tones — a stem is thinner than a pixel — and the
// office then blows every grey pixel up into a square. On 29 August 2026 the
// plaque was photographed with F9: it says "v0.1.0 · Node", it reads "v8.1.8 ·
// Mode". For a line that is entirely about an exact version number that is not
// "soapy", it is wrong. A larger size does not help: six to seven got slightly
// better and stopped, because the matter is not the size but the letter not lying
// on the pixel grid.
//
// Here it lies on it: every glyph is a 3×5 mask, drawn with rectangles, like all
// the other furniture of the office. Pure colours, and at any magnification it
// stays itself.

export const GLYPH_W = 3, GLYPH_H = 5, ADVANCE = 4;

// The zero is square, the O is rounded, the eight has a waist. Three glyphs that
// have to differ: in 3×5 there is no room for a diagonal inside the zero, and
// without that difference "v0.1.0" and "vO.1.O" are the same picture.
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['#.#', '##.', '###', '.##', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '.#.', '..#'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '.#.', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],

  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '##.', '#.#', '.#.'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['.#.', '#.#', '.#.', '#.#', '.#.'], 9: ['.#.', '#.#', '.##', '..#', '##.'],

  ' ': ['...', '...', '...', '...', '...'], '-': ['...', '...', '###', '...', '...'],
  '_': ['...', '...', '...', '...', '###'], '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'], '·': ['...', '...', '.#.', '...', '...'],
  ':': ['...', '.#.', '...', '.#.', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'],
  '+': ['...', '.#.', '###', '.#.', '...'], '=': ['...', '###', '...', '###', '...'],
  '@': ['.#.', '#.#', '###', '#..', '.##'], '#': ['#.#', '###', '#.#', '###', '#.#'],
  '(': ['..#', '.#.', '.#.', '.#.', '..#'], ')': ['#..', '.#.', '.#.', '.#.', '#..'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'],
  '*': ['#.#', '.#.', '#.#', '...', '...'], '…': ['...', '...', '...', '...', '#.#'],
  "'": ['.#.', '.#.', '...', '...', '...'],
};

// A second face, 5×5. Started for the caption «офис агентов» on the plaque over
// the door: the browser's fillText at five points turned it into grey porridge,
// and there is no Cyrillic in the face above and cannot be. Two letters of that
// phrase do not fit into three columns: «И» has nowhere to put its diagonal —
// what is left is a crossbar, and «ИН» becomes a pair of nearly identical
// pictures — while «Ф» without a fifth column turns into a blot. Both troubles go
// away at five.
//
// This is a SEPARATE face, not a replacement: the room plaques stay on 3×5, and
// not one already drawn glyph changes. There are exactly five Latin letters here
// — the ones VALEY is made of. That is neither forgetfulness nor half the job:
// somebody has to look at the letters with their eyes, and these are the ones
// that were looked at. Everything else honestly fails canDraw and goes the spare
// way — to 3×5, where the Latin alphabet is complete.
const FONT_WIDE = {
  V: ['#...#', '#...#', '#...#', '.#.#.', '..#..'], A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#####'], E: ['#####', '#....', '####.', '#....', '#####'],
  Y: ['#...#', '#...#', '.###.', '..#..', '..#..'],

  'А': ['.###.', '#...#', '#####', '#...#', '#...#'], 'Б': ['#####', '#....', '####.', '#...#', '####.'],
  'В': ['####.', '#...#', '####.', '#...#', '####.'], 'Г': ['#####', '#....', '#....', '#....', '#....'],
  'Д': ['..##.', '.#.#.', '.#.#.', '#####', '#...#'], 'Е': ['#####', '#....', '####.', '#....', '#####'],
  'Ж': ['#.#.#', '#.#.#', '#####', '#.#.#', '#.#.#'], 'З': ['####.', '....#', '..##.', '....#', '####.'],
  'И': ['#...#', '#..##', '#.#.#', '##..#', '#...#'], 'К': ['#...#', '#..#.', '###..', '#..#.', '#...#'],
  'Л': ['..###', '.#..#', '.#..#', '.#..#', '#...#'], 'М': ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  'Н': ['#...#', '#...#', '#####', '#...#', '#...#'], 'О': ['.###.', '#...#', '#...#', '#...#', '.###.'],
  'П': ['#####', '#...#', '#...#', '#...#', '#...#'], 'Р': ['####.', '#...#', '####.', '#....', '#....'],
  'С': ['.###.', '#....', '#....', '#....', '.###.'], 'Т': ['#####', '..#..', '..#..', '..#..', '..#..'],
  'У': ['#...#', '#...#', '.####', '....#', '.###.'], 'Ф': ['..#..', '.###.', '#.#.#', '.###.', '..#..'],
  'Х': ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], 'Ц': ['#...#', '#...#', '#...#', '#####', '....#'],
  'Ч': ['#...#', '#...#', '.####', '....#', '....#'], 'Ш': ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'],
  'Щ': ['#.#.#', '#.#.#', '#.#.#', '#####', '....#'], 'Ъ': ['##...', '.#...', '.###.', '.#..#', '.###.'],
  'Ы': ['#...#', '#...#', '###.#', '#.#.#', '###.#'], 'Ь': ['#....', '#....', '####.', '#...#', '####.'],
  'Э': ['####.', '....#', '..###', '....#', '####.'], 'Ю': ['#..#.', '#.#.#', '###.#', '#.#.#', '#..#.'],
  'Я': ['.####', '#...#', '.####', '..#.#', '.#..#'],

  ' ': ['.....', '.....', '.....', '.....', '.....'],
};

// A face is the data plus its step. The caller passes a face rather than a width:
// otherwise the step and the table drift apart at the first edit.
export const SMALL = { FONT, W: GLYPH_W, ADVANCE };
export const WIDE = { FONT: FONT_WIDE, W: 5, ADVANCE: 6 };

// There are no lower-case letters here: 3×5 does not hold them, and everything
// drawn in this font is upper-cased. A folder name changes its look because of it
// — "wallet-app" on the plaque becomes "WALLET-APP" — and that is the conscious
// price of the option. «Ё» folds into «Е» and «Й» into «И»: the dots and the
// breve ask for a sixth row, and a sixth row means a different height for every
// plaque in the office. The price is known and was accepted along with the frame.
export const upper = (str) => String(str).toUpperCase().replace(/Ё/g, 'Е').replace(/Й/g, 'И');

// There is no Cyrillic in the font, and that is not forgetfulness: it would have
// to be drawn whole, while project names are almost always Latin. The caller
// decides for itself what to do with a string that cannot be drawn here — the
// office falls back to fillText, because a soapy name is better than a missing one.
export const canDraw = (str, face = SMALL) => [...upper(str)].every((c) => c in face.FONT);

// The width of a line without the last inter-letter space: exactly that many
// pixels is what the drawing will take.
export const textWidth = (str, face = SMALL, scale = 1) => Math.max(0, (str.length * face.ADVANCE - 1) * scale);

// Draws a line from the top left corner of the first letter. Pixels adjacent
// horizontally are merged into one fillRect — on a line of sixteen glyphs that is
// three times fewer calls, and the same picture.
export function drawText(ctx, str, x, y, color, face = SMALL, scale = 1) {
  const s = upper(str);
  const { FONT: table, W, ADVANCE: step } = face;
  ctx.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const g = table[s[i]];
    if (!g) continue;
    for (let row = 0; row < GLYPH_H; row++) {
      let run = 0;
      for (let col = 0; col <= W; col++) {
        const on = col < W && g[row][col] === '#';
        if (on) { run++; continue; }
        if (run) {
          ctx.fillRect((x + (i * step + col - run) * scale) | 0, (y + row * scale) | 0, run * scale, scale);
          run = 0;
        }
      }
    }
  }
}

export { FONT, FONT_WIDE };
