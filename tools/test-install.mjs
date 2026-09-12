#!/usr/bin/env node
// install.sh is the one piece of this project that runs on a stranger's machine
// before they have read anything, so its failure modes matter more than its
// happy path. The stand serves a fake release over http and drives the real
// script against it: a good archive, a tampered one, a missing checksum.
import { createServer } from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import assert from 'node:assert';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const SCRIPT = path.join(ROOT, 'install.sh');

// The pack's path is a path. Until 12 September 2026 it went through `eval
// echo`, and a pack named `$(cmd).zip` — quoted correctly by the person who
// typed it — ran cmd. place() is what expands ~ now, and nothing else moves.
{
  const text = readFileSync(SCRIPT, 'utf8');
  assert.ok(!/^[^#\n]*\beval\b/m.test(text), 'install.sh must not eval anything');
  const fn = text.match(/^place\(\) \{[\s\S]*?^\}/m)[0];
  const place = (arg) => execFileSync('sh', ['-c', fn + '\nplace "$1"', '_', arg], { encoding: 'utf8' });
  const tricky = '$(printf AUDIT_COMMAND_EXECUTED).zip';
  assert.strictEqual(place(tricky), process.cwd() + '/' + tricky, 'a $(…) in the name stays literal');
  assert.strictEqual(place('a b;c`d`.zip'), process.cwd() + '/a b;c`d`.zip', 'spaces, ; and backticks stay literal');
  assert.strictEqual(place('~/Downloads/x.zip'), process.env.HOME + '/Downloads/x.zip', '~ still expands');
  console.log('ok    | the pack path is a path, not a shell program');
}
const work = mkdtempSync(path.join(tmpdir(), 'valey-install-'));

// A fake release: one file is enough — the stand is about the script, not the
// office. `--strip-components=1` means the tarball carries a top folder.
const src = path.join(work, 'valey-9.9.9');
mkdirSync(src, { recursive: true });
writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: 'valey', version: '9.9.9' }) + '\n');
const tgz = path.join(work, 'valey-9.9.9.tar.gz');
execFileSync('tar', ['-czf', tgz, '-C', work, 'valey-9.9.9']);
const bytes = readFileSync(tgz);
const digest = createHash('sha256').update(bytes).digest('hex');

let mode = 'ok';
const asked = [];                      // every path the script requested
const server = createServer((req, res) => {
  asked.push(req.url);
  if (req.url.endsWith('.tar.gz')) {
    if (mode === 'no-archive') { res.writeHead(404); return res.end(); }
    res.writeHead(200); return res.end(mode === 'tampered' ? Buffer.concat([bytes, Buffer.from('x')]) : bytes);
  }
  if (req.url.endsWith('.sha256')) {
    if (mode === 'no-sum') { res.writeHead(404); return res.end(); }
    res.writeHead(200); return res.end(`${digest}  valey-9.9.9.tar.gz\n`);
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// `dir` null leaves --dir out, which is what makes the script ask where to go.
const run = (dir, extra = [], env = {}) => new Promise((resolve) => {
  execFile('sh', [SCRIPT, ...(dir ? [`--dir=${dir}`] : []), '--version=9.9.9', ...extra],
    // Pinned, not inherited: the stand must not pass or fail on whoever's
    // machine it runs on having a Russian locale. And no terminal by default —
    // run from a shell, the script would otherwise ask the person at it.
    { env: { ...process.env, VALEY_BASE: BASE, LC_ALL: 'ru_RU.UTF-8', LANG: 'ru_RU.UTF-8',
      VALEY_TTY: path.join(work, 'no-terminal'), ...env }, encoding: 'utf8' },
    (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
});
// A terminal that answers: one line per question, in order.
let answersN = 0;
const answers = (...lines) => {
  const file = path.join(work, `answers-${++answersN}`);
  writeFileSync(file, lines.map((l) => l + '\n').join(''));
  return file;
};
// An office already on disk: a version and, optionally, a paid module in it.
const office = (dir, version, modules = []) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'valey', version }) + '\n');
  for (const m of modules) {
    mkdirSync(path.join(dir, 'modules', m), { recursive: true });
    writeFileSync(path.join(dir, 'modules', m, 'module.json'), JSON.stringify({ id: m }) + '\n');
  }
  return dir;
};
const versionOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

try {
  // Happy path: the office lands and the script does not start it unasked.
  const good = path.join(work, 'office');
  let r = await run(good);
  assert.equal(r.code, 0, `установка упала: ${r.out}`);
  assert.ok(existsSync(path.join(good, 'package.json')), 'офис не распакован');
  assert.match(r.out, /cd .*office && npm start/, 'не сказано, чем запускать');
  assert.doesNotMatch(r.out, /Запускаю/, 'запустил офис, хотя --run не просили');
  // The path shape is a contract with the site's _redirects: the version is a
  // segment of its own, because a static host's redirect captures segments and
  // nothing finer. Change it here and the redirect on valey.dev stops matching.
  assert.deepEqual(asked, ['/dist/9.9.9/valey-9.9.9.tar.gz', '/dist/9.9.9/valey-9.9.9.tar.gz.sha256'],
    `скрипт ходит не по тем адресам: ${asked.join(' ')}`);

  // Without a terminal nobody can be asked, so a taken place is refused — and
  // an office there is named, with the flag that updates it.
  r = await run(good);
  assert.notEqual(r.code, 0, 'без терминала перезаписал офис');
  assert.match(r.out, /уже стоит офис v9\.9\.9.*--update/);
  const junk = path.join(work, 'junk');
  mkdirSync(junk); writeFileSync(path.join(junk, 'notes.txt'), 'mine\n');
  r = await run(junk);
  assert.notEqual(r.code, 0, 'перезаписал чужую непустую папку');
  assert.match(r.out, /уже что-то лежит/);
  assert.equal(readFileSync(path.join(junk, 'notes.txt'), 'utf8'), 'mine\n', 'тронул чужой файл');

  // --update: the old office moves aside, the new one takes its place, and a
  // module the archive does not carry — a paid one — comes across.
  const upd = office(path.join(work, 'upd'), '1.0.0', ['easel']);
  r = await run(upd, ['--update']);
  assert.equal(r.code, 0, `обновление упало: ${r.out}`);
  assert.equal(versionOf(upd), '9.9.9', 'версия не сменилась');
  assert.equal(versionOf(upd + '.v1.0.0'), '1.0.0', 'прежний офис не отложен в сторону');
  assert.ok(existsSync(path.join(upd, 'modules', 'easel', 'module.json')), 'платный модуль потерялся');
  assert.match(r.out, /Офис обновлён: v1\.0\.0 → v9\.9\.9/);
  assert.match(r.out, /Перенёс модули: easel/);

  // The same version is left alone: nothing to update, nothing moved aside.
  r = await run(upd, ['--update']);
  assert.equal(r.code, 0);
  assert.match(r.out, /эта же версия/);
  assert.ok(!existsSync(upd + '.v9.9.9'), 'отложил в сторону ту же версию');

  // In a terminal the place is asked, Enter meaning ~/valey.
  const home = path.join(work, 'home');
  mkdirSync(home);
  r = await run(null, [], { HOME: home, VALEY_TTY: answers('') });
  assert.equal(r.code, 0, `установка по Enter упала: ${r.out}`);
  assert.match(r.out, /Куда поставить офис\? Enter — ~\/valey/);
  assert.equal(versionOf(path.join(home, 'valey')), '9.9.9', 'Enter не поставил в ~/valey');
  // ~ in a typed answer is the home folder, not a folder called «~».
  r = await run(null, [], { HOME: home, VALEY_TTY: answers('~/elsewhere') });
  assert.equal(versionOf(path.join(home, 'elsewhere')), '9.9.9', '~/ в ответе не раскрылся');

  // An office in the way: 2 puts a second one beside it and leaves the first.
  const two = office(path.join(work, 'two'), '1.0.0');
  r = await run(two, [], { VALEY_TTY: answers('2') });
  assert.equal(r.code, 0, `установка рядом упала: ${r.out}`);
  assert.match(r.out, /уже стоит офис v1\.0\.0, а ставится v9\.9\.9/);
  assert.equal(versionOf(two), '1.0.0', 'первый офис тронут');
  assert.equal(versionOf(two + '-2'), '9.9.9', 'второй не встал рядом');
  // Enter is the first option, the update.
  r = await run(two, [], { VALEY_TTY: answers('') });
  assert.equal(versionOf(two), '9.9.9', 'Enter не обновил');
  // 3 leaves, and nothing on disk changes.
  const stay = office(path.join(work, 'stay'), '1.0.0');
  r = await run(stay, [], { VALEY_TTY: answers('3') });
  assert.equal(r.code, 0);
  assert.match(r.out, /Ничего не менял/);
  assert.equal(versionOf(stay), '1.0.0', 'выход тронул офис');

  // Something that is not an office: offered the next free place, yes by Enter.
  r = await run(junk, [], { VALEY_TTY: answers('') });
  assert.equal(r.code, 0, `установка мимо чужой папки упала: ${r.out}`);
  assert.match(r.out, /и это не офис/);
  assert.equal(versionOf(junk + '-2'), '9.9.9', 'не поставил в свободную рядом');

  // A tampered archive must leave nothing behind. This is the whole reason the
  // checksum is fetched at all, and the one case worth being loud about.
  mode = 'tampered';
  const bad = path.join(work, 'tampered');
  r = await run(bad);
  assert.notEqual(r.code, 0, 'принял архив с несошедшейся суммой');
  assert.match(r.out, /Контрольная сумма не сошлась/);
  assert.ok(!existsSync(bad), 'после плохой суммы на диске осталась папка');

  // No checksum published beside the archive is also a stop, not a shrug.
  mode = 'no-sum';
  const nosum = path.join(work, 'nosum');
  r = await run(nosum);
  assert.notEqual(r.code, 0, 'поставил офис без контрольной суммы');
  assert.match(r.out, /Нет контрольной суммы/);
  assert.ok(!existsSync(nosum), 'без суммы на диске осталась папка');

  mode = 'no-archive';
  r = await run(path.join(work, 'gone'));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /Не скачалось/);

  // An unknown flag is refused rather than silently ignored: a typo in --run
  // would otherwise look like the office simply chose not to start.
  r = await run(path.join(work, 'flag'), ['--rnu']);
  assert.notEqual(r.code, 0, 'проглотил неизвестный ключ');

  mode = 'ok';

  // Two languages, chosen by locale, English by default: the landing speaks
  // both and a buyer is not necessarily either.
  const en = await run(path.join(work, 'en'), [], { LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' });
  assert.equal(en.code, 0, `английская установка упала: ${en.out}`);
  assert.match(en.out, /Office assembled/, 'при английской локали говорит не по-английски');
  assert.doesNotMatch(en.out, /Офис собран/);

  // The paid modules ride in on the same command. This is the whole answer to
  // "two repositories?": two sources, one thing the buyer types.
  const packSrc = path.join(work, 'packsrc', 'valey-office', 'easel');
  mkdirSync(packSrc, { recursive: true });
  writeFileSync(path.join(packSrc, 'module.json'), JSON.stringify({ id: 'easel', tier: 'office' }) + '\n');
  writeFileSync(path.join(work, 'packsrc', 'valey-office', 'README.md'), 'not a module\n');
  const packZip = path.join(work, 'pack.zip');
  execFileSync('zip', ['-qr', packZip, 'valey-office'], { cwd: path.join(work, 'packsrc') });

  const withPack = path.join(work, 'withpack');
  const p = await run(withPack, [`--pack=${packZip}`]);
  assert.equal(p.code, 0, `установка с модулями упала: ${p.out}`);
  assert.ok(existsSync(path.join(withPack, 'modules', 'easel', 'module.json')), 'модуль не встал в modules/');
  assert.ok(!existsSync(path.join(withPack, 'modules', 'README.md')), 'в modules/ уехал не-модуль');
  assert.match(p.out, /Модули на месте: easel/);

  // A pack that is not there stops the install rather than finishing quietly
  // with an office the buyer paid to have modules in.
  const noPack = await run(path.join(work, 'nopack'), ['--pack=/nope/nothing.zip']);
  assert.notEqual(noPack.code, 0, 'проглотил отсутствующий пакет модулей');

  console.log('install.sh: 51 checks passed');
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}
