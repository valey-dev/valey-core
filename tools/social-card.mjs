#!/usr/bin/env node
// The picture a shared link unfolds into: 1280×640, uploaded by hand in the
// repository's Settings → Social preview (GitHub has no API for it).
//
//   node tools/social-card.mjs                 # into docs/social-preview.png
//   node tools/social-card.mjs --out /tmp/card.png
//
// Approved frame, variant A v2:
// https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=1867-661
//
// Until 11 September 2026 the repository had neither a description nor a
// picture, and a link to it in a messenger read «Contribute to valey-dev/
// valey-core development by creating an account on GitHub» over a tile of zero
// stars and zero forks — the first thing a person saw was an empty project.
//
// The card is assembled from the live canvas, not exported from Figma. The
// mock-up holds a ×4 frame shrunk by half, and Figma smooths it; here every
// game pixel is drawn as a whole square, ×2 for the floor and ×4 for the sign.
// Re-run it when the office changes and the card goes stale.
//
// The floor is invented at the source, like every picture that goes public:
// invented people on invented projects. A photograph of a real office is a
// photograph of real project and branch names.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, startOffice, fakeClaudeDir, waitForAgent } from './lib/office.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const out = path.resolve(arg('out', path.join(ROOT, 'docs', 'social-preview.png')));
const die = (m) => { console.error('social-card: ' + m); process.exit(1); };

// Six people, because a card with one person reads as an empty office. Three
// projects give the floor its rooms; the crop below is tuned to this cast.
const P = '/Users/kolya/Projects/';
const CAST = [
  ['a', 'rocket-shop', 'feature/cart-discount', 'Calculate the discount in the cart', 'Done: the cart calculates the discount.'],
  ['b', 'tide-charts', 'fix/timezone-drift', 'The chart is an hour off', 'Found it: local time against UTC.'],
  ['c', 'paper-radio', 'feature/sleep-timer', 'Add a sleep timer', 'The timer is in.'],
  ['d', 'rocket-shop', 'feature/checkout-flow', 'Split checkout into steps', 'Three steps, tests green.'],
  ['e', 'moss-garden', 'feature/watering-log', 'Log every watering', 'The log is written.'],
  ['f', 'tide-charts', 'refactor/axis', 'Tidy up the axis code', 'The axis code is one module now.'],
];

// The office lights itself by the clock, and a card cut in the evening came out
// nearly black. The browser is given a time zone where it is early afternoon
// right now, so the floor is always in daylight whenever this runs.
const noonZone = Intl.supportedValuesOf('timeZone').find((z) =>
  Number(new Date().toLocaleString('en-GB', { timeZone: z, hour: '2-digit', hour12: false })) === 13);
if (!noonZone) die('found no time zone where it is 13:00 now');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-card-'));
let claudeDir;
for (const [slot, project, branch, asked, said] of CAST) {
  claudeDir = (await fakeClaudeDir(tmp, {
    slot, sessionId: `aaaaaaaa-0000-4000-8000-00000000000${slot}`, cwd: P + project,
    branch, asked, said, file: P + project + '/src/index.js',
  })).dir;
}
// No stand plaque: the card goes to a public page.
const office = await startOffice({ claudeDir, env: { VALEY_STAND: '' } });
const shotTool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shot.mjs');

// The canvas itself, 1:1, read out of the page — the panels and the HUD are
// DOM over it and stay out, exactly as with F9.
function canvasOf(keys, viewport) {
  const r = spawnSync(process.execPath, [shotTool, '--url', office.base + '/', '--viewport', viewport,
    '--keys', keys, '--out', path.join(tmp, 'page.png'),
    '--eval', "document.getElementById('game').toDataURL('image/png')"],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, TZ: noonZone } });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('--eval: '));
  if (r.status !== 0 || !line) throw new Error('the canvas was not read:\n' + (r.stderr || r.stdout));
  const url = JSON.parse(line.slice(8));
  if (typeof url !== 'string' || !url.startsWith('data:image/png')) throw new Error('--eval returned no picture');
  return url;
}

let floor, title;
try {
  await waitForAgent(async () => (await fetch(office.base + '/api/state')).json());
  // The entrance screen is where the sign hangs; 400×225 world pixels.
  title = canvasOf('wait:2500', '1280,640');
  // Through the door and two steps down the scale to ×2, the smallest the
  // office allows: 1600×900 then holds 792×415 world pixels of floor.
  floor = canvasOf('Enter,wait:3000,-,-,wait:1200', '1600,900');
} catch (err) {
  await office.stop();
  die(err.message);
}
await office.stop();

// The card's colours are the office's own, read from :root rather than typed
// here, so a palette change reaches the card on the next run.
const css = fs.readFileSync(path.join(ROOT, 'web', 'tokens.css'), 'utf8');
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) die(`--${name} is not in web/tokens.css`);
  return m[1];
};
const font = fs.readFileSync(path.join(ROOT, 'web', 'fonts', 'JetBrainsMono-Bold.woff2')).toString('base64');

// Geometry of the approved frame. The crops are world pixels: the sign on the
// entrance screen, and the floor window with both rooms and the corridor.
const SIGN = { sx: 148, sy: 72, w: 104, h: 28, scale: 4, x: 52, y: 150 };
const FLOOR = { sx: 45, sy: 20, w: 380, h: 320, scale: 2, x: 520, y: 0 };

const html = `<!doctype html><meta charset="utf-8">
<style>
@font-face { font-family: 'JB'; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 700; }
html, body { margin: 0; width: 1280px; height: 640px; overflow: hidden; background: ${token('bg-deep')}; }
canvas { position: absolute; left: 0; top: 0; }
p { position: absolute; left: 52px; top: 310px; width: 420px; margin: 0;
    font: 700 36px/1.3 'JB', monospace; color: ${token('ink')}; }
p b { color: ${token('accent')}; }
</style>
<canvas id="c" width="1280" height="640"></canvas>
<p>The pixel way to bring your Claude Code chats <b>to life.</b></p>
<script>
const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
(async () => {
  const [title, floor] = await Promise.all([load(${JSON.stringify(title)}), load(${JSON.stringify(floor)})]);
  const g = document.getElementById('c').getContext('2d');
  g.imageSmoothingEnabled = false;
  const put = (img, c) => g.drawImage(img, c.sx, c.sy, c.w, c.h, c.x, c.y, c.w * c.scale, c.h * c.scale);
  put(floor, ${JSON.stringify(FLOOR)});
  put(title, ${JSON.stringify(SIGN)});
  g.fillStyle = ${JSON.stringify(token('frame'))};
  g.fillRect(516, 0, 4, 640);
})();
</script>`;
const page = path.join(tmp, 'card.html');
fs.writeFileSync(page, html);

const r = spawnSync(process.execPath, [shotTool, '--url', 'file://' + page, '--viewport', '1280,640',
  '--wait', '1500', '--out', out], { cwd: ROOT, encoding: 'utf8' });
fs.rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0) die('the card was not captured:\n' + (r.stderr || r.stdout));
console.log(`card: ${path.relative(process.cwd(), out)} (daylight from ${noonZone})`);
console.log('Look at it before committing, then upload it in Settings → Social preview.');
