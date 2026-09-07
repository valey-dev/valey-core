#!/usr/bin/env node
// node tools/dist.mjs <tag> — what install.sh downloads.
//
// The office ships as a tarball of a tag plus the checksum published beside it.
// The checksum is not decoration: install.sh refuses to unpack without it, and
// that refusal is the only thing standing between a piped-in installer and
// whatever a compromised mirror decides to serve.
//
// `latest` is written as a copy, not a symlink — static hosting serves a
// symlink as a text file containing a path.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('-'));
const outDir = (() => { const i = args.indexOf('--out'); return i < 0 ? path.join(ROOT, 'dist') : args[i + 1]; })();
if (!tag) { console.error('usage: node tools/dist.mjs <tag> [--out <dir>]'); process.exit(2); }
if (git('tag', '--list', tag) !== tag) { console.error(`«${tag}» не тег.`); process.exit(2); }

const sha = git('rev-parse', `${tag}^{commit}`);
mkdirSync(outDir, { recursive: true });
const tgz = path.join(outDir, `valey-${tag}.tar.gz`);

// The prefix is what install.sh strips, so it has to be a single top folder.
git('archive', '--format=tar.gz', `--prefix=valey-${tag}/`, '-o', tgz, tag);

const digest = createHash('sha256').update(readFileSync(tgz)).digest('hex');
writeFileSync(`${tgz}.sha256`, `${digest}  valey-${tag}.tar.gz\n`);

const latest = path.join(outDir, 'valey-latest.tar.gz');
copyFileSync(tgz, latest);
writeFileSync(`${latest}.sha256`, `${digest}  valey-latest.tar.gz\n`);

console.log(`${tgz}`);
console.log(`  тег ${tag} · ${sha.slice(0, 8)} · sha256 ${digest.slice(0, 16)}…`);
console.log(`  и то же под именем valey-latest.tar.gz`);
