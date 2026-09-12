// node tools/test-nudge-switch.mjs — the owner can put the video nudge away.
//
// releaseNudge: false in the settings takes the card off the entrance without
// touching the drafts — on 12 September 2026 videos stopped being the focus,
// and ticking a draft's checklist by hand to silence the card would be exactly
// the lie server/release.js refuses to tell. Two offices with the same empty
// drafts folder: the ordinary one nudges, the switched-off one does not.
// A clone without a minor tag has nothing to nudge about and skips the first
// half out loud.
import { execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startOffice, ROOT } from './lib/office.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const scripts = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-scripts-'));
const env = { VALEY_SCRIPTS: scripts, VALEY_STAND: '' };

// The snapshot is assembled on the server's tick; `now` is 0 on the
// placeholder served before the first one.
async function state(base) {
  for (let i = 0; i < 60; i++) {
    const j = await fetch(base + '/api/state').then((r) => r.json()).catch(() => null);
    if (j && j.version && j.now) return j;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

let minor = '';
try { minor = execFileSync('git', ['-C', ROOT, 'tag', '-l', 'v[0-9]*.[0-9]*.0'], { encoding: 'utf8' }).trim(); } catch { /* not a repository */ }

try {
  if (minor) {
    const on = await startOffice({ claudeDir: '/nonexistent-claude-dir', env });
    try {
      const s = await state(on.base);
      ok('by default the owner is nudged about the video', s && s.release && !!s.release.tag, s && s.release);
    } finally { await on.stop(); }
  } else {
    console.log('skip  | no minor tag in this clone — the nudge has nothing to be about');
  }
  const off = await startOffice({ claudeDir: '/nonexistent-claude-dir', env, settings: { releaseNudge: false } });
  try {
    const s = await state(off.base);
    ok('releaseNudge: false puts the card away', s && s.release === null, s && s.release);
  } finally { await off.stop(); }
} finally {
  await fsp.rm(scripts, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
