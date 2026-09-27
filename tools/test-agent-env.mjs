// node tools/test-agent-env.mjs — a session the office starts does not live in
// the office's configuration.
//
// Delivery and hiring start a real session of the owner's, and until 15 September
// 2026 both gave it process.env whole: VALEY_SETTINGS, VALEY_STAND, PORT and the
// rest went along. On 13 September 2026 a stand of another branch delivered a
// task, and an `npm start` in that session would have taken the stand's
// settings and plaque for its own. The stand starts both paths with a fake
// `claude` that writes down the environment it was given, and checks it against
// a list of its own: a stand that reads what it checks from the code under test
// proves only that the code agrees with itself.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 300) : JSON.stringify(got)); }
};
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (cond()) return true; await nap(40); } return false; };

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-agent-env-'));
process.env.VALEY_DELIVER_DIR = path.join(dir, 'runs');

// What a stand's office is started with, and what a person's shell had anyway.
const OFFICE = {
  VALEY_SETTINGS: path.join(dir, 'stand-settings.json'),
  VALEY_STAND: 'someone else\'s branch',
  VALEY_CLAUDE_DIR: path.join(dir, 'claude'),
  VALEY_PICTURE: '1',
  VALEY_NUDGE: 'off',
  AI_VALEY_WEATHER: '55.75,37.62',
  PORT: '5188',
  HOST: '0.0.0.0',
};
const SHELL = { VALEY_URL: 'http://127.0.0.1:5177', EDITOR: 'vim' };
Object.assign(process.env, OFFICE, SHELL);

const { deliver, forgetCli } = await import('../server/deliver.js');
const { hire, _resetHires } = await import('../server/hire.js');

// Writes down its environment and leaves; the office's side of the run is not
// what is checked here.
const script = async (name, out) => {
  const p = path.join(dir, name);
  await fsp.writeFile(p, `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.env));\n`, { mode: 0o755 });
  return p;
};
const check = (who, file) => {
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  const left = Object.keys(OFFICE).filter((k) => k in env);
  ok(`${who}: nothing the office was started with reaches the session`, left.length === 0, left);
  ok(`${who}: VALEY_URL, the hook's address from the person's shell, is kept`, env.VALEY_URL === SHELL.VALEY_URL, env.VALEY_URL);
  ok(`${who}: the rest of the environment is the session's as it was`, env.EDITOR === 'vim' && env.PATH === process.env.PATH && env.HOME === process.env.HOME, { EDITOR: env.EDITOR, PATH: !!env.PATH, HOME: !!env.HOME });
};

// --- delivery ---------------------------------------------------------------
const delivered = path.join(dir, 'delivered.json');
forgetCli();
process.env.CLAUDE_BIN = await script('claude-deliver', delivered);
const task = { text: 'hello' };
await deliver(task, { id: 'env', name: 'env', cwd: dir }, 'default');
if (await until(() => fs.existsSync(delivered))) check('delivery', delivered);
else ok('delivery: the fake CLI ran', false, task);
delete process.env.CLAUDE_BIN;
forgetCli();

// --- hiring -----------------------------------------------------------------
const hired = path.join(dir, 'hired.json');
_resetHires();
const bin = await script('claude-hire', hired);
await hire({ project: 'p', cwd: dir, task: 't' }, { cli: async () => ({ checked: true, path: bin, error: null, errorKey: null, at: Date.now() }) });
if (await until(() => fs.existsSync(hired))) check('hiring', hired);
else ok('hiring: the fake CLI ran', false, 'no environment written');

// --- the office itself keeps what it was started with -------------------------
ok('the office\'s own process.env is not touched', Object.entries(OFFICE).every(([k, v]) => process.env[k] === v));

await fsp.rm(dir, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall ok');
process.exit(bad ? 1 : 0);
