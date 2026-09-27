#!/usr/bin/env node
// The product demo, 20–30 seconds, shot from an invented office.
//
//   node tools/demo-video.mjs                    # .shots/demo-en.mp4 and .shots/demo-en.gif
//   node tools/demo-video.mjs --lang ru          # the office speaking Russian
//   node tools/demo-video.mjs --keep             # raise the demo office and stay up, for probing
//   node tools/demo-video.mjs --keys "..."       # a different walk, same office
//
// The story is the one the first post is about: three projects at work, one
// agent finishes and waits on you, you open its result and leave a note, then
// another one asks a question and you answer it from the office. Everything on
// the floor is invented at the source — people, projects, branches, files — by
// the rule about anything that ends up on a public page.
//
// Two things the picture office needs that a stand does not. The agents must
// look busy first and free up during the take, so every transcript is seeded
// with an open turn and one of them is closed on a timer while the camera runs
// — «free — waiting on you» only fires on that change. And the files an agent
// names must exist on disk: the card lists only what it can open, so the
// invented projects are written under a temporary home with real bytes in them.
//
// The walk is a --keys string for tools/shot.mjs, and the timer here is wall
// clock from the moment the camera starts: shot.mjs launches Chrome, waits
// `settle` and only then presses the first key, so the offsets below count from
// that. Re-shoot after a change with the same command rather than by hand.
import { spawn, spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, startOffice, fakeClaudeDir, waitForAgent, PICTURE_ENV } from './lib/office.mjs';

const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const keep = argv.includes('--keep');
const lang = arg('lang', 'en');
const out = path.resolve(arg('out', path.join(ROOT, '.shots', `demo-${lang}.mp4`)));
const die = (m) => { console.error('demo-video: ' + m); process.exit(1); };

// ------------------------------------------------------------------ the cast
// Six people in three projects, the same invented company the release notes use.
// `asked`/`said` is the turn already closed when the office opens; `next` is
// the turn left open so everyone is typing; `done` closes it for the one who
// frees up on camera. `src` is what the file on disk says.
const HOME = 'kolya';
const CAST = [
  { slot: 'a', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000a', project: 'rocket-shop',
    branch: 'feature/cart-discount', asked: 'Calculate the discount in the cart',
    said: 'Done: the cart calculates the discount and its test is green.',
    next: 'Round the discounted total to whole cents', file: 'src/cart.js',
    done: 'Done: the total is rounded to cents after the discount, and the test covers a 33% coupon.',
    src: `// The cart: lines, a coupon, a total.
export function total(lines, coupon) {
  const sum = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const off = coupon ? Math.round(sum * coupon.percent) / 100 : 0;
  return Math.round((sum - off) * 100) / 100;
}
` },
  { slot: 'b', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000b', project: 'tide-charts',
    branch: 'fix/timezone-drift', asked: 'The chart is an hour off after the clocks change',
    said: 'Found it: the chart was drawn in local time and the data comes in UTC.',
    next: 'Draw the chart in UTC and label the axis', file: 'src/chart.js',
    src: `// Tide heights over a day, one point per ten minutes.
export function draw(ctx, points) {
  for (const p of points) ctx.lineTo(x(p.at), y(p.height));
}
const x = (at) => (at.getUTCHours() * 60 + at.getUTCMinutes()) / 1440;
const y = (h) => 1 - h / 6;
` },
  { slot: 'c', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000c', project: 'paper-radio',
    branch: 'feature/sleep-timer', asked: 'Add a sleep timer',
    said: 'The timer is in. It fades the volume out over the last minute.',
    next: 'Remember the last timer length between sessions', file: 'src/timer.js',
    src: `// The sleep timer: minutes to play, then fade out over the last one.
export function start(minutes, player) {
  const end = Date.now() + minutes * 60_000;
  const tick = setInterval(() => {
    const left = end - Date.now();
    if (left < 60_000) player.volume = Math.max(0, left / 60_000);
    if (left <= 0) { clearInterval(tick); player.pause(); }
  }, 1000);
}
` },
  { slot: 'd', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000d', project: 'rocket-shop',
    branch: 'feature/checkout-address', asked: 'Check the delivery address before payment',
    said: 'The address form checks the postcode before it lets you pay.',
    next: 'Suggest the city from the postcode', file: 'src/checkout.js',
    src: `// The checkout: an address that is checked before the card is asked for.
export function valid(address) {
  return /^\\d{5}$/.test(address.postcode) && address.street.trim().length > 3;
}
` },
  { slot: 'e', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000e', project: 'rocket-shop',
    branch: 'feature/lazy-photos', asked: 'Load product photos as the page scrolls',
    said: 'Photos load as you scroll; the first screen is 40% lighter.',
    next: 'Blur-up placeholder while a photo loads', file: 'src/gallery.js',
    src: `// Product photos, loaded when they come into view.
export function lazy(img) {
  new IntersectionObserver((es, o) => {
    for (const e of es) if (e.isIntersecting) { img.src = img.dataset.src; o.disconnect(); }
  }).observe(img);
}
` },
  { slot: 'f', sessionId: 'aaaaaaaa-0000-4000-8000-00000000000f', project: 'rocket-shop',
    branch: 'fix/stock-after-refund', asked: 'Stock goes negative after a refund',
    said: 'A refund puts the item back once now, not twice.',
    next: 'Log every stock change with its order id', file: 'src/stock.js',
    src: `// Stock per item, moved by orders and refunds.
export function refund(stock, order) {
  for (const l of order.lines) stock[l.sku] = (stock[l.sku] || 0) + l.qty;
  return stock;
}
` },
];

// The question the second agent asks on camera. The pager shows the sentence
// under each option, and that is what the choice is made on.
const QUESTION = {
  question: 'The chart is drawn in UTC now. Convert the stored readings too?',
  header: 'Timezone',
  options: [
    { label: 'Yes, convert', description: 'One migration, the old readings become UTC as well' },
    { label: 'No, leave them', description: 'Convert on read; nothing on disk changes' },
  ],
};

// ------------------------------------------------------------- the office
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-demo-'));
const home = path.join(tmp, 'home', HOME);
const cast = new Map();
let claudeDir = null;
for (const who of CAST) {
  const cwd = path.join(home, 'Projects', who.project);
  const file = path.join(cwd, who.file);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, who.src);
  const made = await fakeClaudeDir(tmp, { slot: who.slot, sessionId: who.sessionId, cwd, branch: who.branch,
    asked: who.asked, said: who.said, file });
  cast.set(who.slot, { ...who, ...made });
  claudeDir = made.dir;
}
const stamp = () => new Date().toISOString();
const append = (who, o) => fsp.appendFile(who.transcript, JSON.stringify({ timestamp: stamp(), ...o }) + '\n');
// An open turn: the person asked, the agent is editing — «working» until it closes.
for (const who of cast.values()) {
  await append(who, { type: 'user', gitBranch: who.branch, message: { role: 'user', content: who.next } });
  await append(who, { type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'toolu_' + who.slot, name: 'Edit', input: { file_path: who.file } }] } });
}
const finish = (who) => append(who, { type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5',
  stop_reason: 'end_turn', content: [{ type: 'text', text: who.done }] } });

const office = await startOffice({ settings: { lang }, claudeDir, env: PICTURE_ENV });
console.log(`demo office on ${office.base}`);
try {
  await waitForAgent(async () => (await fetch(office.base + '/api/state')).json());
} catch (err) {
  await office.stop();
  die('the invented agents never appeared on the floor: ' + err.message);
}
// A question comes in through the PreToolUse door: under PermissionRequest the
// office hands it straight back (holdable in server/permit.js), and no pager rings.
const ask = (who) => fetch(office.base + '/api/permit', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ session_id: who.sessionId, hook_event_name: 'PreToolUse',
    tool_name: 'AskUserQuestion', tool_input: { questions: [QUESTION] } }),
}).then((r) => r.json()).catch((e) => ({ error: String(e) }));

if (keep) {
  console.log(`--keep: the demo office stays up on ${office.base}; everyone is working.`);
  console.log(`  free up a:  node -e "require('fs').appendFileSync('${cast.get('a').transcript}', ${JSON.stringify(JSON.stringify({ timestamp: stamp(), type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', stop_reason: 'end_turn', content: [{ type: 'text', text: cast.get('a').done }] } }) + '\n')})"`);
  console.log('  ask from b: curl -s -X POST ' + office.base + '/api/permit -H content-type:application/json -d ' +
    JSON.stringify(JSON.stringify({ session_id: cast.get('b').sessionId, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [QUESTION] } })));
  console.log('stop it with ctrl-c');
  process.on('SIGINT', async () => { await office.stop(); await fsp.rm(tmp, { recursive: true, force: true }); process.exit(0); });
  await new Promise(() => {});
}

// ----------------------------------------------------------------- the take
const SETTLE = 2500;
// The walk. The standup opens the card by ENTER where you stand — G only sets a
// waypoint and draws an arrow (guideTo in web/main.js), and on 16 September 2026
// the camera never arrived at the desk. The file is not opened on purpose: the
// viewer's footer prints its full path, and the invented projects live under a
// temporary home. The note lands on the top message of the conversation.
const keys = arg('keys',
  'Enter,wait:6500,'                       // in; the floor at work, A frees up and the toast says so
  + 'Tab,wait:2000,ArrowDown,wait:800,'    // the standup: «1 waiting for you», the arrow lands on A
  + 'Enter,wait:2000,'                     // A's card, opened from the standup without walking
  + 'ArrowUp,wait:400,Enter,wait:2000,'    // «read the whole thing»: the conversation
  + 'n,wait:600,l:70,o:70,o:70,k:70,s:70,Space:70,g:70,o:70,o:70,d:70,wait:600,Enter,wait:1500,'  // a note, saved
  + 'Escape,wait:500,Escape,wait:3500,'    // back on the floor; B rings
  + 'Enter,wait:2500,ArrowDown,wait:600,Enter,wait:2500');   // the request, the second answer
// Wall clock from the first key: Chrome start and `settle` come before it.
const FREE_AT = 3000;    // A frees up while the floor is being looked at
const ASK_AT = 24500;    // B asks once the note is saved and the card closed
await fsp.mkdir(path.dirname(out), { recursive: true });
const shotTool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shot.mjs');
const started = Date.now();
const shot = spawn(process.execPath, [shotTool, '--url', office.base + '/', '--wait', String(SETTLE),
  '--video', out, '--keys', keys], { cwd: ROOT, stdio: 'inherit' });
const firstKey = started + 2500 + SETTLE;    // ~2.5 s for Chrome to come up
const at = (ms, fn) => new Promise((r) => setTimeout(() => r(fn()), Math.max(0, firstKey + ms - Date.now())));
const cues = Promise.all([
  at(FREE_AT, () => finish(cast.get('a'))),
  at(ASK_AT, () => ask(cast.get('b')).then((v) => console.log('the office answered:', JSON.stringify(v)))),
]);
const code = await new Promise((r) => shot.on('exit', r));
await Promise.race([cues, new Promise((r) => setTimeout(r, 3000))]);
await office.stop();
await fsp.rm(tmp, { recursive: true, force: true });
if (code !== 0) die('shot.mjs failed');

// The GIF for the README: pixel art wants nearest-neighbour scaling and no
// dither, and 12 frames a second is enough for a walk.
const gif = out.replace(/\.mp4$/, '.gif');
const r = spawnSync('ffmpeg', ['-y', '-i', out, '-vf',
  'fps=12,scale=960:-1:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=none',
  gif], { stdio: 'ignore' });
if (r.status === 0) {
  const { size } = await fsp.stat(gif);
  console.log(`gif: ${gif} — ${(size / 1024 / 1024).toFixed(1)} MB`);
} else console.log('no gif: ffmpeg failed or is missing; the mp4 is there');
