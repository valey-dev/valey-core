#!/usr/bin/env node
// A draft of the release script out of what has landed in main. The point is
// one: remove the blank page. A script is written from the release's features,
// and the features are already listed in the commits — so a draft can be
// assembled, and editing it is far easier than starting from an empty file.
//
//   node tools/script.mjs                    # for the version in package.json
//   node tools/script.mjs v0.3.0             # for a particular one
//   node tools/script.mjs v0.3.0..v0.5.0     # one take over several versions
//   node tools/script.mjs --since v0.3.0     # the same, up to the current one
//   node tools/script.mjs --show 4           # how many features go on camera
//   node tools/script.mjs --force            # rewrite a draft already there
//
// A take is not obliged to match one version. Four minors can be a fortnight of
// work and one video, and cutting it into four is how none of them gets filmed.
// So a draft covers a range and is named after the version it ships with — the
// newest in the range. That name is what the office looks for when it nudges
// about an unfilmed release, so a wide draft closes the nudge the same way a
// narrow one does.
//
// The file is never overwritten: a draft you have already edited is worth more
// than a fresh one.
//
// It is written next to the settings — ~/.config/valey/scripts by default, and
// VALEY_SCRIPTS moves it — not into the repository. The draft belongs to
// whoever cuts the release and to no repository: while it sat in media/ it was
// untracked and unignored, so the next release refused to start on a dirty
// tree until it was deleted by hand.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCRIPTS_DIR } from '../server/settings.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', cwd: ROOT }).trim();
const gitQuiet = (...a) =>
  execFileSync('git', a, { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const die = (m) => { console.error('script: ' + m); process.exit(1); };

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const force = argv.includes('--force');
const shown = Math.max(1, Math.min(6, Number(flag('show', '3')) || 3));
const since = flag('since', '');
const positional = argv.find((a) => !a.startsWith('--') && a !== since && a !== flag('show', ''));

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VER = /^v\d+\.\d+\.\d+$/;

// Three ways to say the same thing, and the last version in the range is always
// the name of the draft: an explicit A..B, a --since A, or one version.
let spanFrom = '';
let tag;
if (positional && positional.includes('..')) {
  const [a, b] = positional.split('..');
  if (!VER.test(a) || !VER.test(b)) die(`не похоже на диапазон версий: ${positional}`);
  spanFrom = a; tag = b;
} else if (since) {
  if (!VER.test(since)) die(`не похоже на версию: ${since}`);
  spanFrom = since; tag = positional || 'v' + pkg.version;
} else {
  tag = positional || 'v' + pkg.version;
}
if (!VER.test(tag)) die(`не похоже на версию: ${tag}`);

// Patches get no video — the rule from media/README.md, and reminding of it is
// cheaper than explaining later why nobody expected a video for v0.2.1.
const patch = Number(tag.split('.')[2]);
if (patch !== 0) console.warn(`внимание: ${tag} — патч, а ролики снимаются на миноры`);

// The range: from the previous version to this one. Only v* tags are looked
// for, or the nearest one turns out to be a journal tag and the range comes out
// empty.
const known = git('tag', '-l', 'v[0-9]*').split('\n').filter(Boolean);
const here = known.includes(tag) ? tag : 'HEAD';
let from = spanFrom;
if (!from) {
  try { from = gitQuiet('describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0', `${here}^`); } catch { /* the first release */ }
}
const range = from ? `${from}..${here}` : here;

// Which versions the take covers. With a range of one that is the tag itself and
// the line below says nothing new; with four it is the whole point — whoever
// records needs to know what landed when, and the changelog is not open in front
// of them.
const covered = from
  ? git('tag', '-l', 'v[0-9]*', '--sort=creatordate').split('\n').filter(Boolean)
      .filter((t) => {
        try { return gitQuiet('merge-base', '--is-ancestor', t, here) === '' && t !== from
          && gitQuiet('rev-list', '--count', `${from}..${t}`) !== '0'; } catch { return false; }
      })
  : [tag];

// The release commit itself is not part of the release: `release.mjs` makes it
// after it has assembled the notes, so counting it here made the draft claim
// one commit more than the changelog section it describes — 101 against 99 on
// v0.3.0, and the two numbers are read side by side.
const commits = git('log', range, '--no-merges', '--format=%h%x00%s')
  .split('\n').filter(Boolean)
  .map((l) => { const [hash, subject] = l.split('\0'); return { hash, subject }; })
  .filter((c) => !/^chore\(release\): v\d+\.\d+\.\d+$/.test(c.subject));
if (!commits.length) die(`в ${range} нет коммитов — нечего показывать`);

const RE = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;
const feats = [], fixes = [];
for (const c of commits) {
  const m = RE.exec(c.subject);
  if (!m) continue;
  if (m[1] === 'feat') feats.push({ ...c, scope: m[2] || '', text: m[3] });
  else if (m[1] === 'fix') fixes.push({ ...c, scope: m[2] || '', text: m[3] });
}

// «101 коммитов» is not a typo but a missing set of forms. The language's own
// rules are in Intl, and the office already declines by it (web/i18n.js). The
// draft itself is Russian: it is read by whoever records the video.
const RU = new Intl.PluralRules('ru');
const plural = (n, one, few, many) => ({ one, few, many, other: many }[RU.select(n)] || many);

const out = path.join(SCRIPTS_DIR, `${tag}.md`);
// A draft you have already edited is worth more than a fresh one, so it is never
// overwritten by accident. --force is the deliberate exception: it is what you
// reach for when the auto-draft of one version is being widened into a take over
// four, and the automatic one has not been touched yet.
if (existsSync(out) && !force) die(`${out} уже есть — переписывать не буду (--force, если нарочно)`);

const show = feats.slice(0, shown);
const rest = feats.slice(shown);
const L = [];
L.push(`# ${tag} — <одно слово для обложки>`, '');
L.push(`Черновик, собран из ${commits.length} ${plural(commits.length, 'коммита', 'коммитов', 'коммитов')} диапазона \`${range}\`.`);
if (covered.length > 1) {
  L.push(`Один проход на ${covered.length} ${plural(covered.length, 'версию', 'версии', 'версий')}: ${covered.join(', ')}.`);
}
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

// The heading counts what actually goes on camera, not the cap: «Биты: 4» over
// two features is the draft lying about itself on its first line.
const WORDS = { 1: 'Один бит', 2: 'Два бита', 3: 'Три бита', 4: 'Четыре бита', 5: 'Пять битов', 6: 'Шесть битов' };
L.push(`## ${WORDS[show.length] || 'Биты'}`, '');
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
console.log(`черновик: ${out}`);
console.log(`фич ${feats.length}, из них в кадр ${show.length}; починок ${fixes.length}`);
