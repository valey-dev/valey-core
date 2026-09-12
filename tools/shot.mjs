#!/usr/bin/env node
// A frame of the office from the terminal, hands off. Needed because small text
// cannot be judged from a mock-up: the 400×225 canvas is stretched by whole
// pixels, and a real letter is only visible on a real frame.
//
//   node tools/shot.mjs                        # the whole frame, into .shots/shot.png
//   node tools/shot.mjs --port 5179            # an office on another port
//   node tools/shot.mjs --keys Enter,hold-w:1500,shift-F9
//   node tools/shot.mjs --out /tmp/office.png --wait 6000
//   node tools/shot.mjs --url .../soon.html --viewport 390,900   # a phone's width
//   node tools/shot.mjs --eval "document.title"   # look inside the live page
//   node tools/shot.mjs --setup "fetch(...)"      # prepare the page before the keys
//   node tools/shot.mjs --video .shots/v0.2.0.mp4 --keys Enter,hold-w:4000
//   node tools/shot.mjs --help                 # this text, down to the traps
//
// --keys walks the office through CDP, step by step, to reach the right place:
//   Enter        press and release
//   Space        the space bar; a literal space between commas works too
//   ArrowUp      arrows; Up/Down/Left/Right are synonyms
//   hold-w:1500  hold W for a second and a half (walking)
//   wait:800     simply wait
//   F9           the office's own 1:1 canvas shot into .shots (written by the office)
//   shift-F9     the same, but ×4 with no smoothing
//   ?            the keyboard panel; shift-<key> works for anything else too
//   tap:.tchmenu a click on the first node matching a selector (no colons in it)
// --touch makes the page report a coarse pointer, as a tablet does.
// An ordinary --out captures the whole page with the panels; F9 inside the
// office captures the canvas alone, but pixel for pixel.
//
// --video records that same walk whole rather than as one frame: it is the
// source for a release video. The point is that the walk is written down in a
// --keys string, so after a change it is re-shot with the same command instead
// of by hand.
//
// -------------------------------------------------------------------- traps
//
// Two of these cost two hours on 29 August 2026, and both were silent:
//
// 1. Without a --user-data-dir of its own, Chrome runs into the browser the
//    person already has open, prints "Failed to create a ProcessSingleton for
//    your profile directory" and exits having captured nothing. The same
//    refusal comes from reusing a directory where a live process remains. So a
//    fresh temporary profile is made every time.
//
// 2. `chrome --headless --screenshot` NEVER works on this page: the office keeps
//    /api/stream open, the load event never fires, and Chrome waits forever. The
//    only working path is to raise --remote-debugging-port and call
//    Page.captureScreenshot on a timer, which is what happens below. No
//    dependencies needed: Node 22 has a global WebSocket.
// 3. Screencast frames arrive unevenly: Chrome sends them when the picture
//    changes rather than on a timer, and each one has to be acknowledged with
//    screencastFrameAck. Without the acknowledgement the stream stops after the
//    very first frame, and exactly one picture lands on disk instead of a video.
//    So each frame's duration is taken from its own timestamp rather than
//    computed as 1/30: otherwise the walk down the corridor runs faster and
//    slower than it was recorded.
// 4. A killed run leaves a live Chrome behind. Until 6 September 2026 it held
//    port 9222 and the next run hung in silence, which looked like "the office
//    broke" rather than "the screenshot broke" — two runs in a row on
//    2 September. The port is free now, so the orphan only wastes memory and a
//    profile in the temp folder, and since 12 September Ctrl-C and SIGTERM put
//    Chrome away too: only SIGKILL still leaves one. Cured by hand:
//        pgrep -f 'user-data-dir=/var/folders/.*/T/valey-shot-' | xargs kill
//    The whole pattern is mandatory: `pkill -f chrome` takes the user's browser
//    with it.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cdp } from './cdp.mjs';

// --help prints the header above rather than a copy of it: two texts about the
// same flags drift apart on the first edit, and the header is the one people read.
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  const head = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
  const end = head.findIndex((l) => l.startsWith('// ---'));
  console.log(head.slice(0, end).map((l) => l.replace(/^\/\/ ?/, '')).join('\n').trimEnd());
  process.exit(0);
}

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// The debugging port is asked of the system, not fixed. It was 9222 until
// 6 September 2026, and a second shot taken while the first was still running
// did not raise a browser of its own at all: Chrome failed to bind the busy
// port, and the script then talked to the FIRST browser's endpoint — same
// profile, same localStorage, so the office saw one person where two were being
// staged. Three attempts to photograph two people in the meeting room came back
// showing one, and the feature looked broken when the camera was.
const PORT_CDP = await new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const port = arg('port', '5179');
const url = arg('url', `http://localhost:${port}/`);
const evalJs = arg('eval', '');
// --setup: script run in the page once it has loaded and before any key — the
// state a frame needs that no walk reaches, such as a request waiting in the
// pager. Unlike --eval it is part of the picture, so a failure stops the shot.
const setupJs = arg('setup', '');
const out = arg('out', path.join(process.cwd(), '.shots', 'shot.png'));
const settle = Number(arg('wait', 5000));
const video = arg('video', '');
// The window is wider than usual only for video: 1920×1080 is what a video is
// for, while a frame has its own settled size, and changing that after the fact
// means re-shooting everything.
const size = arg('size', video ? '1920,1080' : '1400,820');
const viewport = arg('viewport', '');
// --touch: the page sees a coarse pointer and no hover, as a tablet reports them,
// so whatever wakes on (pointer: coarse) wakes here — the touch layer of the
// office cannot be photographed any other way, since keys are not fingers.
const touch = process.argv.includes('--touch');
const steps = arg('keys', '').split(',').filter(Boolean);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Chrome needs the codes: without windowsVirtualKeyCode the page gets an event
// that has a key but no keyCode, and the office does not recognise it.
// The arrows are needed to reach by keyboard the things that are checked by
// keyboard: the focus in an agent's card cannot be moved without them, and
// there is no mouse to walk with here.
// The office's letters, not only walking: B is the skateboard, N the notes,
// C the wardrobe, P the window on the world, U the office colour, R the radio,
// M the sound, T the camera round, Z the loupe in the viewer. Without them the
// strict check below rejects half of what this tool exists for.
// «/» opens the keys panel, and without it that panel could not be photographed
// at all — the one screen this tool is most often pointed at since 5 September 2026.
const VK = { Enter: 13, ' ': 32, Escape: 27, Tab: 9, F9: 120, '/': 191, '=': 187, '-': 189,
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
// Every letter, rather than the dozen somebody happened to need. The list was
// hand-picked and had grown holes: `h` opens the pager and `g` walks you to a
// desk, and neither could be photographed at all — the run refused with «unknown
// key», which at least said so, unlike the silent version before it. A letter
// costs one entry in a table; deciding which letters the office is allowed to
// have is not this file's business.
for (let c = 97; c <= 122; c++) VK[String.fromCharCode(c)] = c - 32;
// The digits: since 31 August 2026 they pick an item in an open panel — a tab
// of the inventory or of the card, a floor in the lift, a station on the radio.
// Without them those screens cannot be captured at all: the panel can be
// reached, but nothing in it can be switched.
for (let d = 0; d <= 9; d++) VK[String(d)] = 48 + d;
const CODE = { Enter: 'Enter', ' ': 'Space', Escape: 'Escape', Tab: 'Tab', F9: 'F9',
  '/': 'Slash', '=': 'Equal', '-': 'Minus',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
// The letters are listed once: a key in VK without a code here arrives at the page
// with an empty code, and a panel that reads event.code — the office plan does —
// never opens. That is how `i` sat here unusable, and `k` was missing outright.
for (const ch of Object.keys(VK).filter((c) => /^[a-z]$/.test(c))) CODE[ch] = 'Key' + ch.toUpperCase();
for (let d = 0; d <= 9; d++) CODE[String(d)] = 'Digit' + d;

// A space is written in --keys as a literal space between commas, which is
// awkward exactly enough that people write Space instead. Such a token used to
// fail in silence: VK/CODE did not know it, Chrome sent an event without a
// keyCode, and the office did not recognise that. On 30 August 2026 this cost
// four frames and the wrong conclusion "the press switched the cameras on and
// off" — neither had worked. The synonyms exist so that missing the name is a
// typo rather than silence.
const ALIAS = { Space: ' ', Spacebar: ' ', Esc: 'Escape', Slash: '/', Equal: '=', Minus: '-', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' };
// «?» is written as itself and sent as shift and slash, because that is how a
// person presses it and how the office asks for it.
const SHIFTED = { '?': '/' };
const alias = (k) => (Object.prototype.hasOwnProperty.call(ALIAS, k) ? ALIAS[k] : k);

// Extra flags for the browser, space separated, through the environment rather
// than the command line: they are rare, ugly and specific to one check. The one
// that earned this: a microphone. Chrome can be given a fake capture device that
// plays a tone — the only way to photograph anything that reacts to sound
// without a person and a real microphone in the room.
//
//   VALEY_SHOT_FLAGS="--use-fake-device-for-media-stream --use-fake-ui-for-media-stream"
const extraFlags = (process.env.VALEY_SHOT_FLAGS || '').split(' ').filter(Boolean);

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'valey-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  '--hide-scrollbars', `--remote-debugging-port=${PORT_CDP}`,
  `--window-size=${size}`, ...extraFlags, 'about:blank',
], { stdio: 'ignore', detached: true });
// A wrong CHROME_PATH is an 'error' event on the child, and unheard it killed the
// run with a Node stack trace — the hint below about CHROME_PATH never printed.
let chromeFailed = null;
chrome.on('error', (err) => { chromeFailed = err; });

let ws;
const exited = new Promise((r) => chrome.once('exit', r));
const bye = async (code) => {
  try { ws?.close(); } catch { /* already closed */ }
  try { process.kill(-chrome.pid); } catch { try { chrome.kill(); } catch { /* already dead */ } }
  // The profile goes only once Chrome is gone: a dying Chrome still writes into
  // it, and removed any earlier the folder came back. Every run left one in the
  // temp folder — 296 of them by 12 September 2026, five out of five runs.
  if (chrome.exitCode === null && chrome.signalCode === null && !chromeFailed) {
    await Promise.race([exited, wait(3000)]);
  }
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
};
// A run stopped by Ctrl-C or by a timeout's SIGTERM used to leave its Chrome
// and its profile behind: trap 4 above.
process.on('SIGINT', () => bye(130));
process.on('SIGTERM', () => bye(143));

try {
  // the port does not open instantly, and asking too early is an ECONNREFUSED
  let ready = false;
  for (let i = 0; i < 60 && !ready && !chromeFailed; i++) {
    try { await fetch(`http://127.0.0.1:${PORT_CDP}/json/version`); ready = true; } catch { await wait(250); }
  }
  if (chromeFailed) throw new Error(`Chrome did not start (${chromeFailed.code || chromeFailed.message}); check CHROME_PATH`);
  if (!ready) throw new Error('Chrome did not open its debugging port; check CHROME_PATH');
  // Node 22 has a global WebSocket, Node 18 and 20 do not; without this line
  // the run failed with a bare «WebSocket is not defined».
  if (typeof WebSocket === 'undefined') throw new Error(`no global WebSocket in Node ${process.versions.node}; shot.mjs needs Node 22`);

  // The tab opens blank and is sent to the address once, after the setup
  // below. It used to open on the address and then reload to apply that
  // setup, so the page loaded twice — and the first load had already done
  // what a page does once: taken #code= out of the address and spent it.
  // The reload came back with no code, and every frame of an invitation
  // showed «за дверью · пока никого» instead of its card.
  const target = await (await fetch(
    `http://127.0.0.1:${PORT_CDP}/json/new?about:blank`, { method: 'PUT' },
  )).json();

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  const { send, on } = cdp(ws);

  // the tab is reused between runs, and without this you can get a frame of the
  // old code — fresh-looking and in fact stale
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.enable');
  // The window size and the page size are not the same thing: with a 1920×1080
  // window the page area came out 1920×993, and h264 does not encode an odd
  // height — it fails at assembly, once every frame has been captured.
  // Subtracting the browser chrome by eye is pointless, it differs by version,
  // so the viewport is set explicitly.
  //
  // --viewport does the same for an ordinary frame, and it is needed because
  // Chrome will not make a window narrower than five hundred pixels: `--size
  // 390,1000` quietly gives five hundred, and the mobile layout is then shot at
  // a width it is not judged at. By default the flag is absent and the metrics
  // are left alone — otherwise every earlier frame of the office would change
  // height from ~733 to 820.
  if (touch) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
  }
  const forced = viewport || (video ? size : '');
  if (forced) {
    const [w, h] = forced.split(',').map(Number);
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: false,
    });
  }
  // The cache is already off, so the one navigation gets fresh files — what
  // the reload was here for.
  await send('Page.navigate', { url });
  await wait(settle);
  if (setupJs) {
    const r = await send('Runtime.evaluate', { expression: setupJs, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('--setup failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }

  // Recording starts before the keys: the first frame of the video is the office
  // at rest, not a person already stepping through the door.
  let frames = [];
  let framesDir = '';
  if (video) {
    framesDir = path.join(path.dirname(video), '.frames');
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(framesDir, { recursive: true });
    const writes = [];
    on('Page.screencastFrame', (p) => {
      const file = path.join(framesDir, `f${String(frames.length).padStart(5, '0')}.jpg`);
      frames.push({ file, at: p.metadata.timestamp });
      writes.push(fs.writeFile(file, Buffer.from(p.data, 'base64')));
      // Nobody awaits an acknowledgement: a late one refused after the stream
      // stopped must not become an unhandled rejection that ends the run.
      send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
    });
    frames.writes = writes;
    const [w, h] = size.split(',').map(Number);
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: w, maxHeight: h });
  }

  const key = (type, k, modifiers = 0) => send('Input.dispatchKeyEvent', {
    type, key: k, code: CODE[k] || k, windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k],
    modifiers, text: type === 'keyDown' && k.length === 1 ? k : undefined,
  });

  for (const step of steps) {
    const [what, ms] = step.split(':');
    if (what === 'wait') { await wait(Number(ms) || 500); continue; }
    // tap:<selector> — a click on a button of the page, for what no key reaches:
    // the ≡ of the touch layer has no key on purpose. The step is split on «:»
    // like the others, so the selector cannot carry one.
    if (what === 'tap') {
      const r = await send('Runtime.evaluate', { returnByValue: true, expression:
        `(function(){ const n = document.querySelector(${JSON.stringify(ms || '')}); if (!n) return 'no such node'; n.click(); return 'tapped'; })()` });
      const got = r.result && r.result.value;
      if (got !== 'tapped') throw new Error(`--keys: tap:${ms}: ${got || 'no answer'}`);
      await wait(400);
      continue;
    }
    // shift-<anything>, not just shift-F9. The office documents its help on «?»,
    // and «?» is shift and slash: until 9 September 2026 the one key every panel
    // tells you to press was the one the camera could not press.
    if (what.startsWith('shift-')) {
      const k = alias(what.slice(6));
      if (!VK[k]) throw new Error(`--keys: unknown key “${what.slice(6)}” in shift-`);
      await key('keyDown', k, 8); await key('keyUp', k, 8);
      await wait(Number(ms) || (k === 'F9' ? 600 : 400));
      continue;
    }
    if (what.startsWith('hold-')) {
      const k = alias(what.slice(5));
      if (!VK[k]) throw new Error(`--keys: unknown key “${what.slice(5)}” in hold-`);
      await key('keyDown', k); await wait(Number(ms) || 800); await key('keyUp', k); continue;
    }
    if (SHIFTED[what]) {
      const k = SHIFTED[what];
      await key('keyDown', k, 8); await key('keyUp', k, 8);
      await wait(Number(ms) || 400);
      continue;
    }
    const k = alias(what);
    // Sending an event without a keyCode in silence is a lie: the office will
    // not see it, and the frame comes out as if the key was pressed and changed
    // nothing.
    if (!VK[k]) throw new Error(`--keys: unknown key “${what}”. Known keys: ${Object.keys(VK).map((x) => (x === ' ' ? 'Space' : x)).join(', ')}`);
    await key('keyDown', k); await key('keyUp', k);
    await wait(Number(ms) || 400);
  }
  await wait(600);

  // --eval is for looking inside the live page when the office appears to work
  // and the thing is not there. Without it one is left guessing: the module did
  // not load, the point did not fire, or it draws off-screen. Printed before the
  // frame so the output comes in the order things are checked in.
  if (evalJs) {
    const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) console.log('--eval failed:', r.exceptionDetails.text || r.exceptionDetails.exception?.description);
    else console.log('--eval:', JSON.stringify(r.result?.value ?? r.result?.description ?? null));
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, Buffer.from(shot.data, 'base64'));
  console.log('captured:', out);

  if (video) {
    await send('Page.stopScreencast');
    await Promise.all(frames.writes);
    if (frames.length < 2) throw new Error(`the stream produced ${frames.length} frame(s); there is nothing to record`);

    // The list for the concat demuxer: every frame has its own duration, taken
    // from its timestamp. The last frame has no "until the next one", so it gets
    // the minimum and is repeated on the line below — without the repeat ffmpeg
    // cuts the tail off the video.
    const lines = [];
    for (let i = 0; i < frames.length; i++) {
      const dur = i + 1 < frames.length ? frames[i + 1].at - frames[i].at : 1 / 30;
      lines.push(`file '${path.basename(frames[i].file)}'`, `duration ${Math.max(dur, 1 / 120).toFixed(4)}`);
    }
    lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
    const list = path.join(framesDir, 'frames.txt');
    await fs.writeFile(list, lines.join('\n') + '\n');

    const secs = (frames[frames.length - 1].at - frames[0].at).toFixed(1);
    const ff = ['-y', '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
      // cropping to an even size is the guard against a custom --size: without
      // it the failure arrives after the shoot, when re-shooting is expensive
      '-vf', 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-pix_fmt', 'yuv420p', path.resolve(video)];
    const ok = await new Promise((res) => {
      const p = spawn('ffmpeg', ff, { cwd: framesDir, stdio: 'ignore' });
      p.on('error', () => res(false));
      p.on('exit', (c) => res(c === 0));
    });
    if (ok) {
      await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
      console.log(`recorded: ${video} — ${frames.length} frames, ${secs} s`);
    } else {
      // ffmpeg is a convenience here rather than a dependency of the project:
      // without it you are left with the frames and the line that assembles them
      // anywhere.
      console.log(`frames: ${framesDir} — ${frames.length}, ${secs} s`);
      console.log(`assemble:\n  cd ${framesDir} && ffmpeg -f concat -safe 0 -i frames.txt \\\n    -vf 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2' -c:v libx264 -crf 18 -pix_fmt yuv420p ${path.resolve(video)}`);
    }
  }
  await bye(0);
} catch (err) {
  console.error('capture failed:', err.message);
  await bye(1);
}
