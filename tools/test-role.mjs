// node tools/test-role.mjs — the trade on an agent's card.
//
// What is checked is not "can it count" but exactly what the logic was rewritten
// for: code accumulated over a session outweighed everything, and the office
// consisted of developers alone. Plus two quiet breakages: a designer who read
// ten files has to stay a designer (reading weighs little), and the trade must
// not flicker until a new line of work has pulled noticeably ahead.
globalThis.document = { documentElement: {}, title: '' };
import { readFileSync } from 'node:fs';
import { inferRole, describeTool, ROLES, ROLE_WINDOW_MS, ROLE_STALE_MS } from '../server/agents.js';
import { t, setLang, LANGS } from '../web/i18n.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const now = Date.now();
const acts = (spec, from = 0) =>
  spec.flatMap(([mood, n], i) => Array.from({ length: n }, () => ({ mood, ts: now - from + i })));
const st = (spec, role = '', from = 0) => ({ acts: acts(spec, from), role });

// --------------------------------------------------- a window, not the whole session

const longCode = st([['code', 40]], '', ROLE_WINDOW_MS + 60_000);
longCode.acts.push(...acts([['design', 12]]));
ok('час кода не держит дизайнера в разработчиках', inferRole(longCode).short === 'design', longCode.role);

const stale = st([['code', 40]], '', ROLE_WINDOW_MS + 60_000);
stale.acts.push(...acts([['design', 3]]));
ok('трёх свежих макетов хватает против сорока старых правок',
   inferRole(stale).short === 'design', stale.role);

// A slow session: the last action is outside the window but not yet stale.
const slow = st([['plan', 4]], 'code', ROLE_WINDOW_MS + 5 * 60_000);
ok('пауза в полчаса — профессия по хвосту, а не по всей истории',
   inferRole(slow).short === 'plan', slow.role);

// And silence that is truly old does not revisit the trade.
const ancient = st([['design', 5]], 'code', ROLE_STALE_MS + 60_000);
ok('протухшие действия не считаются', inferRole(ancient).short === 'code', ancient.role);

// --------------------------------------------------- reading does not make a coder

const reader = st([['design', 6], ['read', 8]]);
ok('дизайнер, читающий файлы, остаётся дизайнером', inferRole(reader).short === 'design', reader.role);

const digging = st([['read', 14]]);
ok('одно чтение всё же читается как код', inferRole(digging).short === 'code', digging.role);

// --------------------------------------------------------------- hysteresis

const nose = st([['code', 7], ['plan', 6]], 'code');
ok('ноздря в ноздрю — профессия не мигает', inferRole(nose).short === 'code', nose.role);

const moved = st([['code', 3], ['plan', 11]], 'code');
ok('оторвался — профессия меняется', inferRole(moved).short === 'plan', moved.role);

// ------------------------------------------ an empty session remembers the past

const quiet = { acts: [], role: 'design' };
ok('без действий держим последнюю профессию', inferRole(quiet).short === 'design');
ok('без действий и без прошлого — разработчик', inferRole({ acts: [], role: '' }).short === 'code');

// ------------------------------------------- the tester and the release engineer

const tester = st([['test', 8], ['code', 3]]);
ok('тесты — это тестировщик, а не разработчик', inferRole(tester).short === 'qa', tester.role);

const releaser = st([['build', 4], ['ship', 5], ['code', 3]]);
ok('сборка и коммиты — релиз-инженер', inferRole(releaser).short === 'release', releaser.role);

// The tester and the release engineer are different trades, and lumping them
// together is not on: otherwise a test run before a rollout would always read as
// a release.
const both = st([['test', 6], ['build', 3]]);
ok('тесты и сборка не суммируются в одну роль', inferRole(both).short === 'qa', both.role);

// Editing code between test runs must not outweigh the run itself.
const mixed = st([['code', 6], ['test', 9]]);
ok('правки между прогонами не отбирают тестировщика', inferRole(mixed).short === 'qa', mixed.role);

// ---------------------------------------- the moods everything is counted from

ok('Figma → дизайн', describeTool('mcp__figma__use_figma', {}).mood === 'design');
ok('git commit → ship', describeTool('Bash', { command: 'git commit -m x' }).mood === 'ship');
ok('grep → чтение', describeTool('Grep', {}).mood === 'read');
ok('npm test → тесты', describeTool('Bash', { command: 'npm test' }).mood === 'test');
ok('npm run build → сборка', describeTool('Bash', { command: 'npm run build' }).mood === 'build');

// -------------------------------- a new trade with no label and no colour

// A trade lives in three places at once, and forgetting two of them costs
// nothing: the server hands out a key, the office looks up its translation and a
// CSS class by it. A miss is visible only by eye and only in one locale — so we
// check it against a list.
const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');
for (const key of Object.keys(ROLES)) {
  for (const l of LANGS) {
    setLang(l);
    const word = t('role.' + key);
    ok(`${l}: у роли ${key} есть подпись`, word && word !== 'role.' + key, word);
  }
  ok(`у роли ${key} есть свой цвет чипа`, css.includes('.role.r-' + key + '{'));
}
setLang('ru');

process.exit(bad ? 1 : 0);
