#!/usr/bin/env node
// Выпуск релиза: поднять версию, собрать раздел changelog из коммитов после
// прошлого тега, закоммитить, поставить тег. Пуш — отдельным шагом и руками:
// ушедшее в origin уже не переписать, и решает это пользователь, а не скрипт.
//
//   node tools/release.mjs minor
//   node tools/release.mjs patch --dry
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
// То же, но молча: до первого тега `git describe` кричит в stderr, и этот крик
// не про ошибку, а про «тегов ещё нет».
const gitQuiet = (...a) =>
  execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const die = (m) => { console.error('release: ' + m); process.exit(1); };

const kind = process.argv[2];
const dry = process.argv.includes('--dry');
if (!['major', 'minor', 'patch'].includes(kind))
  die('первым аргументом major, minor или patch');

// Грязное дерево — это чужие правки, попавшие в релизный коммит. Уж лучше стоп.
if (!dry && git('status', '--porcelain')) die('дерево грязное, сначала закоммить или спрячь');

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = pkg.version.split('.').map(Number);
const next = kind === 'major' ? `${maj + 1}.0.0`
  : kind === 'minor' ? `${maj}.${min + 1}.0`
  : `${maj}.${min}.${pat + 1}`;
const tag = 'v' + next;

if (git('tag', '-l', tag)) die(`тег ${tag} уже есть`);

// Прошлый тег может отсутствовать только до самого первого релиза.
// `--match` обязателен: в репозитории живут не только версии. Рутина repo-log
// вешает `logseq-log/<дата>` на текущий HEAD, и 30 августа 2026 `describe` без
// фильтра вернул именно его — диапазон вышел пустым, и релиз упал на «нет
// коммитов» при двадцати четырёх накопленных.
let range = 'HEAD';
try { range = gitQuiet('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*') + '..HEAD'; } catch {}

const commits = git('log', range, '--no-merges', '--format=%h%x00%s')
  .split('\n').filter(Boolean)
  .map((l) => { const [hash, subject] = l.split('\0'); return { hash, subject }; });
if (!commits.length) die(`после ${range.split('..')[0]} нет коммитов`);

const TYPES = [
  ['feat', 'Новое'], ['fix', 'Починено'], ['perf', 'Быстрее'],
];
const RE = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;
const groups = new Map(TYPES.map(([t]) => [t, []]));
const other = [];
for (const c of commits) {
  const m = RE.exec(c.subject);
  // Всё, что не разобралось или не из трёх видимых типов, идёт в «Прочее».
  // Молча терять коммит нельзя: раздел тогда врёт про объём релиза.
  if (m && groups.has(m[1])) groups.get(m[1]).push({ ...c, scope: m[2], text: m[3] });
  else other.push(c);
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const d = new Date(git('log', '-1', '--format=%cI'));
const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const lines = [`## ${tag} — ${date}`, ''];
for (const [type, title] of TYPES) {
  const items = groups.get(type);
  if (!items.length) continue;
  lines.push(`### ${title}`, '');
  for (const it of items)
    lines.push(`- ${it.scope ? `**${it.scope}:** ` : ''}${it.text} (${it.hash})`);
  lines.push('');
}
if (other.length) {
  lines.push('### Прочее', '');
  for (const c of other) lines.push(`- ${c.subject} (${c.hash})`);
  lines.push('');
}
const section = lines.join('\n');

console.log(section);
console.log(`— ${commits.length} коммитов, из них без раздела ${other.length}`);
if (dry) { console.log('--dry: ничего не записано'); process.exit(0); }

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const changelogPath = new URL('../CHANGELOG.md', import.meta.url);
const changelog = readFileSync(changelogPath, 'utf8');
const at = changelog.indexOf('\n## ');
if (at < 0) die('в CHANGELOG.md нет ни одного раздела ## — некуда вставлять');
writeFileSync(changelogPath,
  changelog.slice(0, at + 1) + section + changelog.slice(at + 1));

git('add', 'package.json', 'CHANGELOG.md');
git('commit', '-m', `chore(release): ${tag}`);
git('tag', '-a', tag, '-m', tag);
console.log(`\nготово: ${tag} на ${git('rev-parse', '--short', 'HEAD')}`);
console.log(`пуш — отдельно и по твоему решению:\n  git push origin main ${tag}`);
