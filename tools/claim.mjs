#!/usr/bin/env node
// Taking a backlog item and giving it back — the «В работе» section of the
// core's BACKLOG.md, from any working tree.
//
//   node tools/claim.mjs                         # what is taken, by which branch, and whether it moves
//   node tools/claim.mjs take "radio: stations"  # claim it for the current branch
//   node tools/claim.mjs take "…" --branch <b> --repo <name>
//   node tools/claim.mjs drop radio              # give back what matches (item or branch)
//   node tools/claim.mjs drop radio --all        # when more than one line matches
//
// Why a tool. The rule «взял пункт — заяви» (AGENTS.md) puts every claim of
// both backlogs into one section of the core's BACKLOG.md, which lives outside
// git in the main checkout so every session sees it at once. A session isolated
// in its own worktree cannot edit that file with its editor — the owner ended
// up writing claims by hand for the agents, three times on 12 September 2026,
// and once a replacement of «(пусто)» silently did nothing because another
// session had filled the section in between. So the claim is a command, run
// from wherever the work is.
//
// What it guards:
// - A claim that is already taken is refused, and the refusal names the line.
//   Two sessions took the same bug within an hour on 12 September 2026 and fixed
//   it twice; the section exists to prevent exactly that.
// - Two sessions claiming at once do not overwrite each other: the section is
//   read, changed and written under a lock, and written by rename, so the file
//   on disk is always one version or the other.
// - The repository, the branch and the date are filled in, not typed: they are
//   the part people get wrong («ядро» and «valey-core» both stood in the list).
// - A claim says whether it is alive. The list reads the branch behind every
//   line — its own commits, the tree it is checked out in, edits nobody has
//   committed — and names a claim that has not moved for a week. On
//   26 September 2026 all ten claims in the section were 9 to 14 days old, and
//   one of them, reply-image, was a finished feature lying uncommitted in a tree
//   whose session had ended on the 21st. Nothing said so: a claim looked the same
//   on its first day and its ninth, so an abandoned one kept the item locked.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, openSync, closeSync, readFileSync, renameSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HEADING = '## В работе';
export const EMPTY = '(пусто)';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const dateOf = (d = new Date()) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

// ------------------------------------------------------------------ the text
// The section runs from its heading to the next "## ". Claims are its "- "
// lines, in the order they were written; everything else in it — the rule, the
// format line — is left exactly as it is.
export function parse(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === HEADING);
  if (start < 0) throw new Error(`no "${HEADING}" section in the backlog`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  const claims = [];
  for (let i = start + 1; i < end; i++) if (lines[i].startsWith('- ')) claims.push({ at: i, line: lines[i], ...fields(lines[i]) });
  return { lines, start, end, claims };
}

// "- repo · item · branch · date". The item may itself contain " · ", so the
// first field is the repository and the last two are branch and date.
export function fields(line) {
  const parts = line.replace(/^- /, '').split(' · ');
  if (parts.length < 4) return { repo: parts[0] || '', item: parts.slice(1).join(' · '), branch: '', date: '' };
  return { repo: parts[0], item: parts.slice(1, -2).join(' · '), branch: parts.at(-2), date: parts.at(-1) };
}

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}#]+/gu, ' ').trim();

// Whether a new claim is the same work as an existing one: the same branch, or
// one item's words contained in the other's. Deliberately generous — a false
// "taken" costs a look at the list, a missed one costs an afternoon twice.
export function clash(claims, { item, branch }) {
  const n = norm(item);
  return claims.find((c) => (branch && c.branch === branch) || (n && (norm(c.item).includes(n) || n.includes(norm(c.item)))));
}

export function take(text, claim) {
  const p = parse(text);
  const hit = clash(p.claims, claim);
  if (hit) return { ok: false, taken: hit };
  const line = `- ${claim.repo} · ${claim.item} · ${claim.branch} · ${claim.date}`;
  const lines = [...p.lines];
  const placeholder = lines.findIndex((l, i) => i > p.start && i < p.end && l.trim() === EMPTY);
  if (placeholder >= 0) lines[placeholder] = line;
  else if (p.claims.length) lines.splice(p.claims.at(-1).at + 1, 0, line);
  else {
    // No claims and no placeholder: after the last non-empty line of the section.
    let at = p.end - 1;
    while (at > p.start && !lines[at].trim()) at--;
    lines.splice(at + 1, 0, '', line);
  }
  return { ok: true, line, text: lines.join('\n') };
}

// Gives back every claim whose item or branch matches. More than one match is
// refused unless asked for, so "drop radio" cannot take two people's lines.
export function drop(text, what, { all = false } = {}) {
  const p = parse(text);
  const n = norm(what);
  const hits = p.claims.filter((c) => c.branch === what || (n && norm(c.item).includes(n)));
  if (!hits.length) return { ok: false, none: true };
  if (hits.length > 1 && !all) return { ok: false, many: hits };
  const gone = new Set(hits.map((h) => h.at));
  let lines = p.lines.filter((_, i) => !gone.has(i));
  // The last claim gone: the placeholder comes back, so the section still says
  // "nothing" in words rather than by a missing line.
  if (hits.length === p.claims.length) {
    const q = parse(lines.join('\n'));
    let at = q.end - 1;
    while (at > q.start && !lines[at].trim()) at--;
    lines = [...lines.slice(0, at + 1), '', EMPTY, ...lines.slice(at + 1)];
  }
  return { ok: true, dropped: hits, text: lines.join('\n') };
}

// ----------------------------------------------------------------- is it alive
// A week without a commit or an edit. Long enough for a feature waiting on a
// frame or a word from the owner; short enough that the ninth day of silence is
// said out loud.
export const QUIET_DAYS = 7;
const DAY = 86400_000;

// "12 сентября 2026" back into a date; null for anything else.
export function parseDate(s) {
  const m = /^(\d{1,2}) ([а-я]+) (\d{4})$/.exec(String(s || '').trim());
  const month = m ? MONTHS.indexOf(m[2]) : -1;
  return month < 0 ? null : new Date(Number(m[3]), month, Number(m[1]));
}

// What the branch behind a claim is doing, from facts gathered by probe():
//   exists   the branch is there, locally or on origin
//   ahead    commits of its own, not in main
//   commitAt when the last of them was made (ms), 0 if none
//   tree     the working tree it is checked out in, if any
//   dirty    files changed there and not committed
//   editAt   when the newest of those was last written (ms)
// The claim's own date counts as movement too: a claim taken yesterday on a
// branch with nothing in it yet is a start, not an abandonment.
export function vitality(claim, facts, now = Date.now()) {
  const taken = parseDate(claim.date)?.getTime() || 0;
  if (!facts) return { known: false, text: 'ветку не проверить: репозиторий не на этой машине' };
  if (!facts.exists) return { known: true, gone: true, stale: true, text: 'ветки нет — влита или брошена; заявку пора снять' };
  const moved = Math.max(taken, facts.commitAt || 0, facts.editAt || 0);
  const days = moved ? Math.floor((now - moved) / DAY) : null;
  const parts = [];
  parts.push(facts.ahead ? `${facts.ahead} ${plural(facts.ahead, 'коммит', 'коммита', 'коммитов')}, последний ${ago(facts.commitAt, now)}` : 'своих коммитов нет');
  if (facts.dirty) parts.push(`не закоммичено ${facts.dirty} ${plural(facts.dirty, 'файл', 'файла', 'файлов')}, правка ${ago(facts.editAt, now)}`);
  if (facts.tree) parts.push(facts.tree);
  const stale = days !== null && days >= QUIET_DAYS;
  return { known: true, stale, days, text: parts.join(' · ') + (stale ? ` · ⚠ ${days} ${plural(days, 'день', 'дня', 'дней')} без движения — похоже, ничья` : '') };
}

const plural = (n, one, few, many) => {
  const t = n % 100, u = n % 10;
  if (t >= 11 && t <= 14) return many;
  return u === 1 ? one : u >= 2 && u <= 4 ? few : many;
};
function ago(at, now) {
  if (!at) return 'неизвестно когда';
  const d = Math.floor((now - at) / DAY);
  return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
}

// ------------------------------------------------------------- the machine
const git = (cwd, ...a) => { try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

// The main checkout of the core this tool belongs to — not of wherever it is
// run from: a session standing in the Modules tree runs ../tools/claim.mjs and
// must still land in the core's backlog.
export function backlogPath() {
  if (process.env.VALEY_BACKLOG) return process.env.VALEY_BACKLOG;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const common = git(here, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  if (!common) throw new Error('not inside a git checkout of the core');
  return path.join(path.dirname(common), 'BACKLOG.md');
}

// The checkout a claim's repository lives in, from its name in the section:
// the core is the main checkout this backlog sits in, the Modules are its
// modules/. Any other name is a repository this tool cannot find, and says so.
export function repoDir(repo, backlog) {
  const core = path.dirname(backlog);
  // «valey-core» is how the section named the core before take() filled the name in.
  if (repo === 'ядро' || repo === 'valey-core') return core;
  if (repo === 'Модули') return path.join(core, 'modules');
  return null;
}

// The facts vitality() reads, gathered with git. Read-only: nothing is fetched,
// so a branch pushed from another machine and not fetched here reads as absent
// locally but is still found on origin if it was fetched once.
export function probe(dir, branch) {
  if (!dir || !existsSync(dir) || !git(dir, 'rev-parse', '--git-dir')) return null;
  const local = git(dir, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
  const remote = local ? '' : git(dir, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`);
  const ref = local ? branch : remote ? `origin/${branch}` : '';
  if (!ref) return { exists: false };
  const main = git(dir, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main') ? 'origin/main' : 'main';
  const ahead = Number(git(dir, 'rev-list', '--count', `${main}..${ref}`)) || 0;
  const commitAt = ahead ? Number(git(dir, 'log', '-1', '--format=%ct', ref)) * 1000 : 0;
  // The tree the branch is checked out in, and what is lying there uncommitted.
  let tree = '', dirty = 0, editAt = 0;
  for (const block of git(dir, 'worktree', 'list', '--porcelain').split('\n\n')) {
    if (!block.includes(`branch refs/heads/${branch}`)) continue;
    tree = /^worktree (.+)$/m.exec(block)?.[1] || '';
    const changed = git(tree, 'status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean);
    dirty = changed.length;
    // git() trims the output, which eats the leading space of the first status
    // code — so the path is what follows the code and its spaces, not column 3.
    for (const l of changed) {
      const file = l.replace(/^\s*\S+\s+/, '').replace(/^.* -> /, '').replace(/^"(.*)"$/, '$1');
      try { editAt = Math.max(editAt, statSync(path.join(tree, file)).mtimeMs); } catch { /* deleted */ }
    }
  }
  return { exists: true, ahead, commitAt, tree: tree ? tree.replace(process.env.HOME || '\0', '~') : '', dirty, editAt };
}

// Which repository the work is in, named the way the section names it.
export function repoOf(cwd) {
  const url = git(cwd, 'remote', 'get-url', 'origin');
  if (/valey-modules/.test(url)) return 'Модули';
  if (/valey-core/.test(url)) return 'ядро';
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  return top ? path.basename(top) : path.basename(cwd);
}

// A lock beside nothing: in the temp directory, keyed by the backlog's path, so
// no stray file ever shows up in a checkout's `git status`. A lock older than
// ten seconds is a crashed run and is taken over.
function withLock(file, fn) {
  const lock = path.join(tmpdir(), 'valey-claim-' + createHash('sha1').update(file).digest('hex').slice(0, 12) + '.lock');
  const until = Date.now() + 5000;
  for (;;) {
    try { closeSync(openSync(lock, 'wx')); break; } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 10000) { unlinkSync(lock); continue; } } catch { continue; }
      if (Date.now() > until) throw new Error('the backlog is locked by another claim; try again');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try { return fn(); } finally { try { unlinkSync(lock); } catch { /* already gone */ } }
}

function rewrite(file, change) {
  return withLock(file, () => {
    const before = readFileSync(file, 'utf8');
    const r = change(before);
    if (r.ok) {
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, r.text);
      renameSync(tmp, file);
    }
    return r;
  });
}

function main(argv) {
  // Options come out of argv first; what is left is the command and the words.
  // Taken the other way round, "--branch b" ended up inside the item's text.
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const flag = (name) => { const i = argv.indexOf(name); if (i >= 0) argv.splice(i, 1); return i >= 0; };
  const opts = { branch: opt('--branch'), repo: opt('--repo'), all: flag('--all') };
  const file = backlogPath();
  if (!existsSync(file)) throw new Error(`no backlog at ${file}`);
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === 'list') {
    const { claims } = parse(readFileSync(file, 'utf8'));
    if (!claims.length) { console.log('ничего не взято'); return 0; }
    let quiet = 0;
    claims.forEach((c, i) => {
      const v = vitality(c, probe(repoDir(c.repo, file), c.branch));
      if (v.stale) quiet++;
      console.log(`${i + 1}. ${c.repo} · ${c.item}\n   ${c.branch} · ${c.date}\n   ${v.text}`);
    });
    if (quiet) console.log(`\n${quiet} из ${claims.length} молчат неделю и дольше: спроси владельца ветки, а брошенную заявку сними — drop <ветка>`);
    return 0;
  }

  if (cmd === 'take') {
    const cwd = process.cwd();
    const branch = opts.branch || git(cwd, 'branch', '--show-current');
    const repo = opts.repo || repoOf(cwd);
    const item = rest.join(' ').trim();
    if (!item) { console.error('take: скажи, какой пункт — его первыми словами'); return 2; }
    if (!branch) { console.error('take: ветки нет (HEAD отсоединён) — назови её: --branch <имя>'); return 2; }
    const r = rewrite(file, (text) => take(text, { repo, item, branch, date: dateOf() }));
    if (!r.ok) {
      const v = vitality(r.taken, probe(repoDir(r.taken.repo, file), r.taken.branch));
      console.error(`уже взято:\n  ${r.taken.line}\n  ${v.text}\n${v.stale ? 'заявка молчит — спроси владельца; если бросил, сними её: drop ' + r.taken.branch : 'спроси владельца этой ветки или возьми другой пункт'}`);
      return 1;
    }
    console.log(`взято:\n  ${r.line}`);
    return 0;
  }

  if (cmd === 'drop') {
    const what = rest.join(' ').trim() || git(process.cwd(), 'branch', '--show-current');
    if (!what) { console.error('drop: скажи, что снять — пункт или ветку'); return 2; }
    const r = rewrite(file, (text) => drop(text, what, { all: opts.all }));
    if (r.none) { console.error(`drop: под «${what}» ничего не взято`); return 1; }
    if (r.many) { console.error(`drop: подходит несколько строк — уточни или добавь --all:\n${r.many.map((c) => '  ' + c.line).join('\n')}`); return 1; }
    console.log(`снято:\n${r.dropped.map((c) => '  ' + c.line).join('\n')}`);
    return 0;
  }

  console.error(`неизвестная команда «${cmd}»: list, take, drop`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { process.exit(main(process.argv.slice(2))); } catch (err) { console.error(String(err.message || err)); process.exit(2); }
}
