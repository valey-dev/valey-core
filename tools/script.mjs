#!/usr/bin/env node
// Заготовка сценария выпуска из того, что влито в main. Смысл один: убрать
// чистый лист. Сценарий пишется по фичам релиза, а фичи уже перечислены в
// коммитах — значит черновик можно собрать, и править его куда легче, чем
// начинать с пустого файла.
//
//   node tools/script.mjs              # для версии из package.json
//   node tools/script.mjs v0.3.0       # для конкретной
//
// Файл не перезаписывается: черновик, который ты уже правил, дороже свежего.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', cwd: ROOT }).trim();
const gitQuiet = (...a) =>
  execFileSync('git', a, { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const die = (m) => { console.error('script: ' + m); process.exit(1); };

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const tag = process.argv[2] || 'v' + pkg.version;
if (!/^v\d+\.\d+\.\d+$/.test(tag)) die(`не похоже на версию: ${tag}`);

// Патчи не снимаются — правило из media/README.md, и напомнить о нём дешевле,
// чем потом объяснять, почему ролика к v0.2.1 никто не ждал.
const patch = Number(tag.split('.')[2]);
if (patch !== 0) console.warn(`внимание: ${tag} — патч, а ролики снимаются на миноры`);

// Диапазон: от прошлой версии до этой. Ищем только теги вида v*, иначе
// ближайшим окажется тег журнала и диапазон выйдет пустым.
const known = git('tag', '-l', 'v[0-9]*').split('\n').filter(Boolean);
const here = known.includes(tag) ? tag : 'HEAD';
let from = '';
try { from = gitQuiet('describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0', `${here}^`); } catch { /* первый релиз */ }
const range = from ? `${from}..${here}` : here;

const commits = git('log', range, '--no-merges', '--format=%h%x00%s')
  .split('\n').filter(Boolean)
  .map((l) => { const [hash, subject] = l.split('\0'); return { hash, subject }; });
if (!commits.length) die(`в ${range} нет коммитов — нечего показывать`);

const RE = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;
const feats = [], fixes = [];
for (const c of commits) {
  const m = RE.exec(c.subject);
  if (!m) continue;
  if (m[1] === 'feat') feats.push({ ...c, scope: m[2] || '', text: m[3] });
  else if (m[1] === 'fix') fixes.push({ ...c, scope: m[2] || '', text: m[3] });
}

const out = path.join(ROOT, 'media', `${tag}.md`);
if (existsSync(out)) die(`${path.relative(ROOT, out)} уже есть — переписывать не буду`);

const show = feats.slice(0, 3);
const rest = feats.slice(3);
const L = [];
L.push(`# ${tag} — <одно слово для обложки>`, '');
L.push(`Черновик, собран из ${commits.length} коммитов диапазона \`${range}\`.`);
L.push('Правь свободно: генератор знает, что влито, но не знает, что смешно.', '');

L.push('## Что показываем', '');
if (!show.length) L.push('_Ни одного `feat` в этом релизе — показывать нечего, и это повод не снимать._', '');
for (const f of show) {
  L.push(`### ${f.scope ? f.scope + ': ' : ''}${f.text}`);
  L.push(`- коммит: \`${f.hash}\``);
  L.push('- где в офисе: <куда идти, какие клавиши>');
  L.push('- что говорит ведущий: <реплика>');
  L.push('');
}
if (rest.length) {
  L.push(`_Не влезло в три бита (${rest.length}) — либо в следующий выпуск, либо одной строкой в описании:_`, '');
  for (const f of rest) L.push(`- ${f.scope ? f.scope + ': ' : ''}${f.text} (\`${f.hash}\`)`);
  L.push('');
}

L.push('## Три бита', '');
L.push('1. **Зашёл и раздал задание.** <кому и какое>');
L.push('2. **По дороге показал новое.** Порядок обхода: ' + (show.map((f) => f.scope || 'фича').join(' → ') || '<…>'));
L.push('3. **Финальный гэг.** <обычно за счёт агента, который занят не тем>', '');

L.push('## Проход', '');
L.push('Снимается одной командой, поэтому после правки фичи переснимается тоже одной.');
L.push('Координаты мест считаются, а не подбираются: `#x=` и `#y=` в адресе.', '');
L.push('```bash');
L.push(`node tools/shot.mjs --port 5183 --video .shots/${tag}.mp4 \\`);
L.push('  --keys "wait:1500,Space,wait:7000,<дальше по местам>"');
L.push('```', '');
L.push('Звука в файле нет — войсовер единственная дорожка.', '');

if (fixes.length) {
  L.push(`## Починено (${fixes.length}) — в описание, не в кадр`, '');
  for (const f of fixes) L.push(`- ${f.scope ? f.scope + ': ' : ''}${f.text}`);
  L.push('');
}

L.push('## Чек-лист', '');
for (const s of ['проход снят', 'сценарий дописан', 'войсовер записан', 'обложка собрана', 'залито на канал']) {
  L.push(`- [ ] ${s}`);
}
L.push('');

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, L.join('\n'));
console.log(`черновик: ${path.relative(ROOT, out)}`);
console.log(`фич ${feats.length}, из них в кадр ${show.length}; починок ${fixes.length}`);
