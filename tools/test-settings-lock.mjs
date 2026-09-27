// node tools/test-settings-lock.mjs — two offices saving one settings file do
// not lose each other's writes.
//
// Every office on a machine reads and writes the same ~/.config/valey
// settings. Until 13 September 2026 a save compared the file's revision and
// then renamed its copy over it, and between the comparison and the rename a
// neighbour could rename its own: both saves reported success and one of them
// was gone — a name, a seat, a guest's pass. A stress run lost about a hundred
// keys a run, three runs out of three. Now the check, the rename and reading
// the new revision happen under a lock file every office takes.
//
// Here several processes save their own keys into one file in a temp
// directory, retrying a save the office refuses (that is the office saying so
// out loud, which is allowed). At the end every key whose save succeeded must
// be on the disk. The real settings file is not touched.
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 400) : JSON.stringify(got)); }
};

const WRITERS = 4;
const SAVES = 120;

// One office: saves `<who>_<n>` for every n and re-reads the file when a save
// is refused because a neighbour changed it. Two lanes at once, as an office
// serves two requests at once: the live run of 13 September 2026 lost a key
// inside one office after the lock was in — two requests re-read the file
// after a refusal, and the second read replaced the cache the first had
// already put its change into.
const writer = `
  const m = await import('./server/settings.js');
  const who = process.env.WHO, saves = Number(process.env.SAVES);
  let refused = 0;
  const lane = async (from) => {
    for (let n = from; n < saves; n += 2) {
      for (;;) {
        try { await m.getSettings(); await m.patchSettings({ [who + '_' + n]: n }); break; } catch (e) {
          if (!/changed after this process read it/.test(e.message)) throw e;
          refused += 1;
        }
      }
    }
  };
  await Promise.all([lane(0), lane(1)]);
  console.log(JSON.stringify({ who, refused }));
`;

const run = (file, who) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', writer], {
    cwd: ROOT, env: { ...process.env, VALEY_SETTINGS: file, WHO: who, SAVES: String(SAVES) },
  });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => resolve({ code, out, err }));
});

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-settings-lock-'));
try {
  const file = path.join(dir, 'settings.json');
  await fsp.writeFile(file, '{}\n', { mode: 0o600 });
  const who = Array.from({ length: WRITERS }, (_, i) => 'w' + i);
  const results = await Promise.all(who.map((w) => run(file, w)));
  ok('every office finished its saves', results.every((r) => r.code === 0),
    results.map((r) => r.err || r.out).join('\n'));
  const onDisk = JSON.parse(await fsp.readFile(file, 'utf8'));
  const lost = [];
  for (const w of who) for (let n = 0; n < SAVES; n += 1) if (onDisk[w + '_' + n] !== n) lost.push(w + '_' + n);
  ok(`no saved key is lost (${WRITERS} offices × ${SAVES} saves)`, lost.length === 0,
    `${lost.length} lost, e.g. ${lost.slice(0, 5).join(', ')}`);
  const refused = results.map((r) => { try { return JSON.parse(r.out.trim().split('\n').pop()).refused; } catch { return '?'; } });
  console.log('      | refused and retried:', refused.join(' / '));
  const left = (await fsp.readdir(dir)).filter((f) => f !== 'settings.json');
  ok('no lock or temporary file is left behind', left.length === 0, left);

  // ------------------------------------------- offices started together
  // On a file without an owner token every office makes one at start. The
  // second save is refused — the first changed the file — and until 13
  // September 2026 that refusal took the office down before it opened its
  // port. Now it reads the file again and takes the token already there.
  const fresh = path.join(dir, 'fresh.json');
  await fsp.writeFile(fresh, '{}\n', { mode: 0o600 });
  const boot = await Promise.all(Array.from({ length: WRITERS }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e',
      "const m = await import('./server/settings.js'); console.log(await m.ownerToken());"],
    { cwd: ROOT, env: { ...process.env, VALEY_SETTINGS: fresh } });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, token: out.trim().split('\n').pop(), err }));
  })));
  ok(`${WRITERS} offices started at once on a file without a token all start`,
    boot.every((b) => b.code === 0), boot.map((b) => b.err).join('\n'));
  const freshToken = JSON.parse(await fsp.readFile(fresh, 'utf8')).access.token;
  ok('and all of them use the one token on the disk',
    !!freshToken && boot.every((b) => b.token === freshToken), boot.map((b) => b.token));

  // ------------------------------------------------ a lock nobody releases
  // A save that dies halfway leaves its lock behind. Waiting for it forever
  // would stop every office on the machine from saving, so a lock whose
  // holder is gone, or which is too old, is removed — out loud.
  const own = path.join(dir, 'own.json');
  const lock = own + '.lock';
  await fsp.writeFile(own, '{}\n', { mode: 0o600 });
  process.env.VALEY_SETTINGS = own;
  const { getSettings, patchSettings } = await import('../server/settings.js');
  await getSettings();
  const said = [];
  const log = console.log;
  console.log = (...a) => { said.push(a.join(' ')); };
  const quiet = async (fn) => { try { return await fn(); } finally { console.log = log; } };

  const dead = spawn(process.execPath, ['-e', '']);
  const deadPid = await new Promise((resolve) => dead.on('close', () => resolve(dead.pid)));
  await fsp.writeFile(lock, `${deadPid} left-behind\n`);
  await quiet(() => patchSettings({ lang: 'after-dead' }));
  ok('a lock whose process is gone is removed and the save goes through',
    JSON.parse(await fsp.readFile(own, 'utf8')).lang === 'after-dead', await fsp.readFile(own, 'utf8'));
  ok('and the office says so', said.some((l) => l.includes(`process ${deadPid}, which is gone`)), said);

  // Alive but ten seconds old: a save stuck on a hung disk.
  said.length = 0;
  console.log = (...a) => { said.push(a.join(' ')); };
  await fsp.writeFile(lock, `${process.pid} stuck\n`);
  const past = new Date(Date.now() - 60_000);
  await fsp.utimes(lock, past, past);
  await quiet(() => patchSettings({ lang: 'after-old' }));
  ok('a lock older than ten seconds is removed too',
    JSON.parse(await fsp.readFile(own, 'utf8')).lang === 'after-old' && said.some((l) => l.includes('never finished')), said);

  // Alive and fresh: another office is saving right now, and the save waits
  // for it rather than going around it.
  await fsp.writeFile(lock, `${process.pid} busy\n`);
  let saved = false;
  const pending = patchSettings({ lang: 'after-wait' }).then(() => { saved = true; });
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  ok('a live, fresh lock is waited for', !saved && JSON.parse(await fsp.readFile(own, 'utf8')).lang === 'after-old', saved);
  await fsp.rm(lock);
  await pending;
  ok('and the save goes through once it is released',
    JSON.parse(await fsp.readFile(own, 'utf8')).lang === 'after-wait', await fsp.readFile(own, 'utf8'));
  ok('the lock is gone after the save', !(await fsp.readdir(dir)).includes('own.json.lock'), await fsp.readdir(dir));
} catch (e) {
  bad += 1;
  console.log('FAIL  | test did not complete →', e.stack);
} finally {
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
