// The office's own error journal: what broke, where, and on what machine.
//
// On 26 September 2026 the first outside tester hit two bugs and could pass on
// only what happened to be on his screen. The first came as a screenshot of the
// browser console, and that was enough — `main.js:1890` named the line. The
// second was one red line in a card, «No conversation found with session ID»,
// and nothing around it: which `claude` the office had called, which version,
// on which system. Nobody could say afterwards, and the bug was never found.
//
// So the office writes down its failures itself, on this machine, in a file
// next to its settings. Nothing is sent anywhere: the office promises that the
// only thing it says to the outside world is the weather, and a journal someone
// else collects would break that for every owner who never asked. Reading the
// journal and passing it on is the owner's step.
//
// What goes in: the page's uncaught errors, a task that failed to reach a chat,
// and the server's own unhandled rejections. Home directories are cut to «~»
// on the way in, so a journal pasted into an issue does not carry a user name.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { PATHS } from './settings.js';

// Beside the settings file rather than in the config directory: a stand moves
// its settings aside with VALEY_SETTINGS, and its failures must go with them
// instead of into the journal of the office the owner works in.
const defaultFile = () => (process.env.VALEY_SETTINGS
  ? PATHS.file.replace(/(\.json)?$/, '.errors.jsonl')
  : path.join(PATHS.dir, 'errors.jsonl'));
export const ERRORS_FILE = process.env.VALEY_ERRORS || defaultFile();

// A journal is read by a person, and two hundred lines is more than anyone
// reads; the cap is what keeps an error thrown every second from filling a disk.
export const KEEP = 200;
// The same failure again within this window adds to the count of the last line
// instead of writing a new one: a timer that throws every second is one line.
export const REPEAT_MS = 10 * 60_000;
const MAX_TEXT = 2000;

// «/Users/anna/Projects/x» → «~/Projects/x», and the office's own address out
// of page stacks: «http://localhost:5177/main.js:12» → «/main.js:12».
export function redact(text, home = os.homedir()) {
  let s = String(text ?? '');
  if (home && home.length > 1) s = s.split(home).join('~');
  s = s.replace(/https?:\/\/[^/\s)]+(?=\/)/g, '');
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '…' : s;
}

const clean = (entry) => {
  const out = {};
  for (const [k, v] of Object.entries(entry)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = typeof v === 'string' ? redact(v) : v;
  }
  return out;
};

async function readAll(file) {
  let raw = '';
  try { raw = await fsp.readFile(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a line cut by a crash mid-write */ }
  }
  return out;
}

// Writes go one after another: two failures in the same tick would otherwise
// both read the old file and the second would drop the first.
let queue = Promise.resolve();

// entry: { source: 'page' | 'deliver' | 'server', message, stack?, where?, ... }
export function recordError(entry, { file = ERRORS_FILE, now = Date.now() } = {}) {
  const e = clean({ ...entry, ts: now });
  const job = queue.then(async () => {
    const all = await readAll(file);
    const prev = all[all.length - 1];
    if (prev && prev.source === e.source && prev.message === e.message && now - (prev.last || prev.ts) < REPEAT_MS) {
      prev.count = (prev.count || 1) + 1;
      prev.last = now;
    } else {
      all.push(e);
    }
    const kept = all.slice(-KEEP);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, kept.map((x) => JSON.stringify(x)).join('\n') + '\n', { mode: 0o600 });
    await fsp.rename(tmp, file);
  });
  // A journal that cannot be written must not become a second failure.
  queue = job.catch((err) => console.error('[errors] could not write the journal:', err.message));
  return queue;
}

export async function readErrors({ file = ERRORS_FILE, limit = KEEP } = {}) {
  await queue;
  return (await readAll(file)).slice(-limit);
}

// Which `claude` the office calls and what it says about itself. The version is
// what the tester of 26 September could not tell us: the office continues chats
// with the CLI on PATH, the desktop app with its own, and the two can differ.
const cli = { path: null, version: null, at: 0 };
const CLI_TTL = 10 * 60_000;
export async function cliVersion(cliPath) {
  if (!cliPath) return null;
  if (cli.path === cliPath && Date.now() - cli.at < CLI_TTL) return cli.version;
  const version = await new Promise((resolve) => {
    execFile(cliPath, ['--version'], { timeout: 8000 }, (err, stdout) => {
      resolve(err ? null : (String(stdout).trim().split('\n')[0] || null));
    });
  });
  Object.assign(cli, { path: cliPath, version, at: Date.now() });
  return version;
}

// The machine a journal came from. Computed when the journal is read, not
// stored in every line: it is the same for all of them.
export function environment({ version, cliPath, cliVer } = {}) {
  return clean({
    office: version,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    node: process.version,
    cli: cliPath,
    cliVersion: cliVer,
  });
}
