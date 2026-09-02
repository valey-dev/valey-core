// node tools/test-role.mjs — профессия на карточке агента.
//
// Проверяется не «умеет ли считать», а ровно то, из-за чего логику переписали:
// накопленный за сессию код перевешивал всё, и офис состоял из одних
// разработчиков. Плюс два тихих слома: дизайнер, который прочитал десять
// файлов, обязан остаться дизайнером (чтение весит мало), и профессия не
// должна мигать, пока новый род занятий не оторвался заметно.
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

// --------------------------------------------------- окно, а не вся сессия

const longCode = st([['code', 40]], '', ROLE_WINDOW_MS + 60_000);
longCode.acts.push(...acts([['design', 12]]));
ok('час кода не держит дизайнера в разработчиках', inferRole(longCode).short === 'design', longCode.role);

const stale = st([['code', 40]], '', ROLE_WINDOW_MS + 60_000);
stale.acts.push(...acts([['design', 3]]));
ok('трёх свежих макетов хватает против сорока старых правок',
   inferRole(stale).short === 'design', stale.role);

// Медленная сессия: последнее действие вне окна, но ещё не протухло.
const slow = st([['plan', 4]], 'code', ROLE_WINDOW_MS + 5 * 60_000);
ok('пауза в полчаса — профессия по хвосту, а не по всей истории',
   inferRole(slow).short === 'plan', slow.role);

// А совсем старое молчание профессию не пересматривает.
const ancient = st([['design', 5]], 'code', ROLE_STALE_MS + 60_000);
ok('протухшие действия не считаются', inferRole(ancient).short === 'code', ancient.role);

// --------------------------------------------------- чтение не делает кодером

const reader = st([['design', 6], ['read', 8]]);
ok('дизайнер, читающий файлы, остаётся дизайнером', inferRole(reader).short === 'design', reader.role);

const digging = st([['read', 14]]);
ok('одно чтение всё же читается как код', inferRole(digging).short === 'code', digging.role);

// --------------------------------------------------------------- гистерезис

const nose = st([['code', 7], ['plan', 6]], 'code');
ok('ноздря в ноздрю — профессия не мигает', inferRole(nose).short === 'code', nose.role);

const moved = st([['code', 3], ['plan', 11]], 'code');
ok('оторвался — профессия меняется', inferRole(moved).short === 'plan', moved.role);

// ------------------------------------------ пустая сессия помнит прошлое

const quiet = { acts: [], role: 'design' };
ok('без действий держим последнюю профессию', inferRole(quiet).short === 'design');
ok('без действий и без прошлого — разработчик', inferRole({ acts: [], role: '' }).short === 'code');

// ------------------------------------------- тестировщик и релиз-инженер

const tester = st([['test', 8], ['code', 3]]);
ok('тесты — это тестировщик, а не разработчик', inferRole(tester).short === 'qa', tester.role);

const releaser = st([['build', 4], ['ship', 5], ['code', 3]]);
ok('сборка и коммиты — релиз-инженер', inferRole(releaser).short === 'release', releaser.role);

// Тестировщик и релиз-инженер — разные профессии, и складывать их в одну кучу
// нельзя: прогон тестов перед выкаткой иначе всегда читался бы как релиз.
const both = st([['test', 6], ['build', 3]]);
ok('тесты и сборка не суммируются в одну роль', inferRole(both).short === 'qa', both.role);

// Правка кода между прогонами теста не должна перебивать сам прогон.
const mixed = st([['code', 6], ['test', 9]]);
ok('правки между прогонами не отбирают тестировщика', inferRole(mixed).short === 'qa', mixed.role);

// ---------------------------------------- настроения, из которых всё считается

ok('Figma → дизайн', describeTool('mcp__figma__use_figma', {}).mood === 'design');
ok('git commit → ship', describeTool('Bash', { command: 'git commit -m x' }).mood === 'ship');
ok('grep → чтение', describeTool('Grep', {}).mood === 'read');
ok('npm test → тесты', describeTool('Bash', { command: 'npm test' }).mood === 'test');
ok('npm run build → сборка', describeTool('Bash', { command: 'npm run build' }).mood === 'build');

// -------------------------------- новая профессия без подписи и без цвета

// Профессия живёт в трёх местах сразу, и забыть два из них ничего не стоит:
// сервер отдаёт ключ, офис ищет по нему перевод и CSS-класс. Промах виден
// только глазами и только в одной локали — поэтому сверяем списком.
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
