#!/usr/bin/env node
// Running every stand: node tools/run-tests.mjs [substring]
//
// This used to be a loop in package.json, and it had two troubles: `|| exit 1`
// stopped the run at the first failing file, and the unmatched glob
// `modules/*/test-*.mjs` stayed a literal string under sh — that is, `npm test`
// failed in exactly the free build, the one without a `modules/` folder, which
// test-modules defends.
//
// The built-in `node --test` did not fit here, and that was found by running it:
// on Node 20 it takes directories and does not understand globs, on Node 22 it
// is the other way round — it understands globs and tries to load a directory as
// a file. There is no single spelling for the 18/20/22 matrix, and forty lines of
// our own are.
//
// The stands stay as they were: each prints its checks and exits with a code.
// Only walking the files, counting and printing happen here — a failing stand is
// shown in full, with a summary at the end. The run goes to the end: one failing
// file must not hide the other thirty-eight.
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const only = process.argv[2] || '';

const isTest = (f) => f.startsWith('test-') && f.endsWith('.mjs');
const ls = async (dir) => { try { return await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; } };

const files = [];
for (const e of await ls(path.join(ROOT, 'tools'))) {
  if (e.isFile() && isTest(e.name)) files.push(path.join('tools', e.name));
}
// Modules bring their own stands and are installed one by one: the folder may not be there at all.
for (const m of await ls(path.join(ROOT, 'modules'))) {
  for (const e of await ls(path.join(ROOT, 'modules', m.name))) {
    if (e.isFile() && isTest(e.name)) files.push(path.join('modules', m.name, e.name));
  }
}
files.sort();

const picked = only ? files.filter((f) => f.includes(only)) : files;
if (!picked.length) {
  console.error(only ? `нет стендов по «${only}»` : 'стендов не найдено');
  process.exit(2);
}

const run = (file) => new Promise((resolve) => {
  const started = Date.now();
  const p = spawn(process.execPath, [file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (c) => { out += c; });
  p.stderr.on('data', (c) => { out += c; });
  p.on('close', (code) => resolve({ file, code, out, ms: Date.now() - started }));
});

const failed = [];
for (const file of picked) {
  const r = await run(file);
  // The stands were written at different times and mark a passing check
  // differently: "ok    |", "  ок  ", and test-look with a single closing line.
  // We count every form, and when none is found we stay quiet instead of saying
  // "0 checks": that would claim the stand checked nothing, while it checked in
  // its own way.
  const checks = (r.out.match(/^(?:ok +\||\s*ок\s)/gm) || []).length;
  const mark = r.code === 0 ? '  ok  ' : 'УПАЛ  ';
  const count = checks ? `${String(checks).padStart(3)} проверок` : '   свой счёт';
  console.log(`${mark}| ${file.padEnd(38)} ${count} · ${r.ms} мс`);
  if (r.code !== 0) { failed.push(r); }
}

if (failed.length) {
  for (const r of failed) {
    console.log(`\n──── ${r.file} ────`);
    console.log(r.out.trimEnd());
  }
}
console.log(`\n${picked.length} стендов, упало ${failed.length}`);
process.exit(failed.length ? 1 : 0);
