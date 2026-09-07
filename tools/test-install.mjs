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
const server = createServer((req, res) => {
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

const run = (dir, extra = []) => new Promise((resolve) => {
  execFile('sh', [SCRIPT, `--dir=${dir}`, '--version=9.9.9', ...extra],
    { env: { ...process.env, VALEY_BASE: BASE }, encoding: 'utf8' },
    (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, out: stdout + stderr }));
});

try {
  // Happy path: the office lands and the script does not start it unasked.
  const good = path.join(work, 'office');
  let r = await run(good);
  assert.equal(r.code, 0, `установка упала: ${r.out}`);
  assert.ok(existsSync(path.join(good, 'package.json')), 'офис не распакован');
  assert.match(r.out, /cd .*office && npm start/, 'не сказано, чем запускать');
  assert.doesNotMatch(r.out, /Запускаю/, 'запустил офис, хотя --run не просили');

  // Refuses to write into a place that already has something in it.
  r = await run(good);
  assert.notEqual(r.code, 0, 'перезаписал непустую папку');
  assert.match(r.out, /уже что-то лежит/);

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

  console.log('установщик: 12 проверок прошли');
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}
