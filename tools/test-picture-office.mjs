// node tools/test-picture-office.mjs — an office raised for public pictures
// says nothing to its owner.
//
// Release notes and the social card photograph a demo office, and twice a thing
// meant for the owner went out with the picture: the yellow stand plaque on
// 10 September 2026, the release-video nudge — «v0.39.0 — not shot» and a path
// on the owner's disk — on the entrance frame of the public v0.40.0 note on
// 12 September 2026. Both are switched off by PICTURE_ENV in lib/office.mjs;
// this stand raises an office with it and asks the server what it would draw.
//
// The first half proves the second is not vacuous: the same office without
// PICTURE_ENV does carry the nudge. It needs a minor tag to nudge about, so a
// clone without tags (a shallow CI checkout) skips that half and says so.
import { execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startOffice, PICTURE_ENV, ROOT } from './lib/office.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

// No draft anywhere: an empty scripts directory of its own, so the owner's real
// drafts neither hide the nudge nor get read by a stand.
const scripts = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-scripts-'));

// The snapshot is assembled on the server's tick, not on start: wait for one.
async function state(base) {
  for (let i = 0; i < 60; i++) {
    const j = await fetch(base + '/api/state').then((r) => r.json()).catch(() => null);
    // `now` is 0 on the placeholder the office answers with before its first
    // tick; a real snapshot is the first that carries a time. The version alone
    // is on the placeholder too, and waiting for it caught an office that had
    // not looked at its tags yet.
    if (j && j.version && j.now) return j;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

let minor = '';
try {
  minor = execFileSync('git', ['-C', ROOT, 'tag', '-l', 'v[0-9]*.[0-9]*.0'], { encoding: 'utf8' }).trim();
} catch { /* not a repository */ }

try {
  if (minor) {
    const plain = await startOffice({ claudeDir: '/nonexistent-claude-dir', env: { VALEY_SCRIPTS: scripts, VALEY_STAND: '' } });
    try {
      const s = await state(plain.base);
      ok('an ordinary office nudges its owner about the video', s && s.release && !!s.release.tag, s && s.release);
    } finally { await plain.stop(); }
  } else {
    console.log('skip  | no minor tag in this clone — the nudge has nothing to be about');
  }

  // A stand plaque left in the caller's shell is exactly what PICTURE_ENV is for.
  const leftover = process.env.VALEY_STAND;
  process.env.VALEY_STAND = 'a stand left over in the shell';
  const pic = await startOffice({ claudeDir: '/nonexistent-claude-dir', env: { ...PICTURE_ENV, VALEY_SCRIPTS: scripts } });
  if (leftover === undefined) delete process.env.VALEY_STAND; else process.env.VALEY_STAND = leftover;
  try {
    const s = await state(pic.base);
    ok('an office for pictures carries no release nudge', s && s.release === null, s && s.release);
    const stand = await fetch(pic.base + '/api/stand').then((r) => r.json()).catch(() => null);
    ok('and no stand plaque, even with one in the shell', stand && stand.text === null, stand);
  } finally { await pic.stop(); }
} finally {
  await fsp.rm(scripts, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
