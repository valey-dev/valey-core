#!/usr/bin/env node
// The `PermissionRequest` hook: it carries the question "may I run this?" into
// the office and brings the answer back. Installed in `~/.claude/settings.json`:
//
//   "hooks": {
//     "PermissionRequest": [
//       { "hooks": [{ "type": "command", "command": "node ~/…/valey-core/tools/permit.mjs" }] }
//     ]
//   }
//
// Everything here obeys one rule: **the office has no right to get in the way of
// work**. It is off, it is busy, it answers nonsense, it is broken — the hook
// stays quiet and exits with zero, and Claude Code shows its usual dialog.
// Silence is "ask for yourself": an empty answer lets the question continue down
// the normal path.
//
// So there is not one throw out of here and not one branch that prints anything
// but a finished verdict. An error in the hook is somebody's session frozen on a
// question they cannot see.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hookOutput } from './lib/permit-verdict.mjs';

// Which office the questions go to. VALEY_URL wins — that is how a stand or a
// second machine is pointed somewhere else on purpose — then the canonical port
// from the settings, and 5177 only if the settings say nothing. Several offices
// run on this machine at once, and asking all of them would mean the question is
// answered by whichever tab happened to be open.
const canonicalPort = () => {
  const file = process.env.VALEY_SETTINGS
    || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'valey', 'settings.json');
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    const p = s && s.network && s.network.port;
    return Number.isInteger(p) && p > 0 ? p : 5177;
  } catch { return 5177; }
};
const URL_BASE = (process.env.VALEY_URL || `http://127.0.0.1:${canonicalPort()}`).replace(/\/+$/, '');

// The owner token lives in the same file as the rest of the office. In private
// it is not needed — loopback is our own anyway — but in shared, without it, the
// office answers "watching is allowed, commanding is not", and the question
// returns to the terminal in silence.
function ownerToken() {
  const file = process.env.VALEY_SETTINGS
    || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'valey', 'settings.json');
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (s && s.access && s.access.token) || '';
  } catch { return ''; }
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// An empty answer = "ask for yourself". We print nothing and leave with zero:
// exit code 2 blocks nothing for this event, and a 1 reads as a broken hook.
const passThrough = () => process.exit(0);

const payload = JSON.parse(await readStdin().catch(() => '')) || null;
if (!payload || !payload.tool_name) passThrough();

let answer = null;
try {
  const token = ownerToken();
  const res = await fetch(URL_BASE + '/api/permit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-valey-owner': token } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) answer = await res.json();
} catch {
  // There is no office on this port — the most ordinary case: it is not obliged
  // to be running. The connection is refused instantly, with no delay for the
  // person.
}

const out = hookOutput(payload, answer);
if (!out) passThrough();
process.stdout.write(JSON.stringify(out));
process.exit(0);
