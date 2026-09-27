#!/usr/bin/env node
// npm run update — the office tab's «update» button, from a terminal.
//
// With the office running under `npm start`, this asks it to update itself:
// the same /api/update the button uses, so the office pulls the core and the
// Modules and hands itself over to the new version without stopping — guests,
// notes and agents' held questions come along (server/swap.js). The steps are
// printed as they land.
//
// With no office running there is nothing to hand over: the code is pulled
// and the next `npm start` runs it.
//
// Replaces the ritual it was written for: Ctrl-C, git pull, cd modules,
// git pull, cd .., npm start — the Ctrl-C that, until v0.52.3, interrupted
// every turn sent through the office.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pullUpdate } from '../server/update.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settingsFile = process.env.VALEY_SETTINGS
  || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'valey', 'settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { /* defaults */ }
const port = Number(process.env.PORT) || Number((settings.network || {}).port) || 5177;
const base = `http://127.0.0.1:${port}`;
const token = (settings.access || {}).token || '';
const headers = { 'content-type': 'application/json', ...(token ? { 'x-valey-owner': token } : {}) };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const WHY = {
  dirty: (u) => `uncommitted changes in ${u.repo === 'modules' ? 'the Modules' : 'the core'} (${u.detail}) — commit or clear them`,
  diverged: (u) => `${u.repo === 'modules' ? 'the Modules have' : 'the core has'} commits of its own that upstream does not — it cannot be fast-forwarded`,
  noUpstream: (u) => `the branch in ${u.repo === 'modules' ? 'the Modules' : 'the core'} has no upstream`,
  notGit: () => 'this office was installed from an archive — update it with install.sh',
  fetch: (u) => `could not reach the repository: ${u.detail}`,
  newServer: (u) => `the code was pulled, but the new server did not start; the old one keeps running. ${u.detail || ''}`,
  noSupervisor: () => 'the office runs without a supervisor (npm run dev) — stop it and start it with npm start',
};
const why = (u) => (WHY[u.reason] ? WHY[u.reason](u) : `git said: ${u.detail || u.reason}`);

// Is an office listening, and is it ours to ask?
let running = null;
try {
  const r = await fetch(`${base}/api/update`, { headers });
  if (r.status === 403) { console.error(`The office on ${port} does not take this machine's owner token.`); process.exit(1); }
  if (r.ok) running = await r.json();
} catch { /* nobody listening */ }

if (!running) {
  console.log(`No office is running on ${port}: pulling the code only.`);
  const r = await pullUpdate(ROOT, { step: (k) => console.log(`  ${k === 'modules' ? 'Modules' : 'core'} ✓`) });
  if (!r.ok) { console.error(`Not updated: ${why(r)}. Nothing was touched.`); process.exit(1); }
  console.log(r.from === r.to ? `Already at v${r.to}.` : `v${r.from} → v${r.to}. Start it with npm start.`);
  process.exit(0);
}

console.log(`The office on ${port} runs v${running.running}. Asking it to update…`);
let u = await (await fetch(`${base}/api/update/run`, { method: 'POST', headers, body: '{}' })).json();
const shown = new Set();
const deadline = Date.now() + 5 * 60_000;
while (Date.now() < deadline) {
  for (const s of u.steps || []) {
    if (shown.has(s)) continue;
    shown.add(s);
    console.log(`  ${{ core: 'core ✓', modules: 'Modules ✓', server: 'new server…' }[s] || s}`);
  }
  if (u.state === 'failed') { console.error(`Not updated: ${why(u)}. The office keeps running v${u.running || running.running}.`); process.exit(1); }
  if (u.state === 'latest') { console.log(`Already at the latest version, v${u.running || running.running}.`); process.exit(0); }
  await nap(500);
  let next = null;
  try { next = await (await fetch(`${base}/api/update`, { headers })).json(); } catch { continue; /* mid-swap */ }
  // A fresh office answers «idle»: the one that was asked never goes back to it
  // on its own, so «idle» is its successor. Not «idle after the server step»:
  // on a fast machine the whole swap fits between two polls, and the first
  // version of this waited the full five minutes for a step it never saw.
  if (next.state === 'idle') {
    console.log(`Updated: v${running.running} → v${next.running}, without stopping. Open pages reloaded themselves.`);
    process.exit(0);
  }
  u = next;
}
console.error('The update did not finish within five minutes; look at the office terminal.');
process.exit(1);
