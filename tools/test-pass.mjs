// node tools/test-pass.mjs — every call to the office carries the pass.
//
// The office tells three kinds of caller apart by `x-valey-owner` and
// `x-valey-guest`. A private office admits everything from this machine, so a
// call that forgets them works perfectly until somebody switches to shared —
// and then it is refused, in a way that reads as a broken office rather than a
// missing header. On 5 September 2026 five of them were found in one evening:
// the transcript, a file from the board, the module list, the settings and
// presence itself, which is why the owner could not see a guest and the guest
// could not see anybody.
//
// This is a source check, not a run: it reads web/*.js and asks of every call
// to /api/ whether the pass is anywhere in it. Cheap, and it fails on the exact
// line where somebody forgot.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The doors: they are open on the server (OPEN in server/index.js) because a
// guest has to be able to show a code and to ask whether one is needed.
const NO_PASS_NEEDED = ['/api/enter', '/api/whoami', '/api/stand'];

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + got); }
};

const dir = path.join(process.cwd(), 'web');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
ok('client files found', files.length > 0, files.length);

const missing = [];
for (const file of files) {
  const lines = readFileSync(path.join(dir, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const call = /(?:fetch|sendBeacon)\(\s*['"`]([^'"`]*\/api\/[a-zA-Z/]*)/.exec(line)
      || /(?:fetch|sendBeacon)\(\s*['"`]([^'"`]*\/api\/[a-zA-Z/]*)['"`]\s*\+/.exec(line);
    if (!call) return;
    const url = call[1];
    if (NO_PASS_NEEDED.some((p) => url.startsWith(p))) return;
    // The call may spread over several lines, and the pass may be prepared just
    // above it — a query pass (?owner= / ?guest=) is the road for sendBeacon and
    // EventSource, which cannot set headers at all, and it is built before the
    // call rather than inside it. So the window looks both ways. passQuery() is
    // that query pass built in web/owned.js, both tokens at once.
    const window = lines.slice(Math.max(0, i - 4), i + 6).join('\n');
    if (/owned\(|passQuery\(/.test(window) || /owner=|guest=/.test(window)) return;
    missing.push(`${file}:${i + 1} ${url}`);
  });
}
ok('all calls to the office require a pass', missing.length === 0, missing.join(' · '));

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
