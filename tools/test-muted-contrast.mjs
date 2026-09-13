// node tools/test-muted-contrast.mjs — the office's service text passes AA.
//
// Key hints, dates, counters and captions are one tone, --muted, and it has to
// read at 4.5:1 on every surface such text sits on. On 13 September 2026 none
// of it did: --muted-dim gave 2.17–2.90 and --muted 3.26–4.47, measured text by
// text against the background each one actually stands on, over 15 screens of
// the demo office. Two steps of muted cannot both pass AA and still differ —
// between them there is 1.09:1 — so --muted-dim left text altogether and stays
// for borders and rules.
//
// The tone is not one colour: theme.js derives it from the office hue, like all
// the brown, so the check is on the formula — every preset, every hue and the
// saturation slider up to its top.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', got); }
};

const hsl2rgb = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
};
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// The table theme.js turns into colours, read as text: importing it would run
// its localStorage and document calls.
const theme = readFileSync(path.join(ROOT, 'web/theme.js'), 'utf8');
const TOKENS = Object.fromEntries([...theme.matchAll(/\['(--[\w-]+)', (-?\d+), (\d+), (\d+)\]/g)]
  .map((m) => [m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]));
const PRESETS = [...theme.matchAll(/key: '(\w+)', hue: (\d+), sat: (\d+)/g)]
  .map((m) => ({ key: m[1], hue: Number(m[2]), sat: Number(m[3]) }));
const tone = (name, hue, sat) => {
  const [dh, s, l] = TOKENS[name];
  return hsl2rgb((hue + dh + 360) % 360, Math.min(95, Math.round(s * sat / 100)), l);
};

// The surfaces service text was found on. --wood, the face of a button, is not
// here on purpose: no muted tone passes there, and a key hint on a button is
// --ink-dim instead.
const GROUNDS = ['--bg', '--bg-deep', '--field', '--wood-dark', '--wood-hi'];
const AA = 4.5;

ok('theme.js has a --muted and every ground', ['--muted', ...GROUNDS].every((t) => TOKENS[t]),
  Object.keys(TOKENS).join(' '));
ok('theme.js lists its six presets', PRESETS.length === 6, PRESETS.length);

for (const p of PRESETS) {
  const worst = Math.min(...GROUNDS.map((g) => contrast(tone('--muted', p.hue, p.sat), tone(g, p.hue, p.sat))));
  ok(`--muted in ${p.key} is ${worst.toFixed(2)}:1 at worst`, worst >= AA, worst.toFixed(2));
}

let worst = { c: 99 };
for (let hue = 0; hue < 360; hue += 1) {
  for (let sat = 0; sat <= 160; sat += 5) {
    for (const g of GROUNDS) {
      const c = contrast(tone('--muted', hue, sat), tone(g, hue, sat));
      if (c < worst.c) worst = { c, hue, sat, g };
    }
  }
}
ok(`--muted on any hue and saturation up to 160 is ${worst.c.toFixed(2)}:1 at worst`, worst.c >= AA,
  `${worst.c.toFixed(2)} at hue ${worst.hue}, saturation ${worst.sat}, on ${worst.g}`);

// The fallback in tokens.css is what the page shows before theme.js runs.
const tokens = readFileSync(path.join(ROOT, 'web/tokens.css'), 'utf8');
const fallback = Object.fromEntries([...tokens.matchAll(/(--[\w-]+):(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
for (const g of GROUNDS) {
  const c = contrast(hex2rgb(fallback['--muted']), hex2rgb(fallback[g]));
  ok(`fallback --muted ${fallback['--muted']} on ${g} is ${c.toFixed(2)}:1`, c >= AA, c.toFixed(2));
}

// --muted-dim is for what is not text. A `color:` on it anywhere in the
// office's own styles or the free modules' is the old second step coming back.
const sheets = ['web', ...readdirSync(path.join(ROOT, 'modules')).map((d) => path.join('modules', d))]
  .flatMap((dir) => (statSync(path.join(ROOT, dir)).isDirectory()
    ? readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.css')).map((f) => path.join(dir, f)) : []));
const dimText = sheets.flatMap((f) => (readFileSync(path.join(ROOT, f), 'utf8').match(/(?<![-\w])color:\s*var\(--muted-dim\)/g) || [])
  .map(() => f));
ok(`no text is --muted-dim (${sheets.length} style sheets)`, dimText.length === 0, dimText.join(', '));

if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall good');
