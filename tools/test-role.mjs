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
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const now = Date.now();
const acts = (spec, from = 0) =>
  spec.flatMap(([mood, n], i) => Array.from({ length: n }, () => ({ mood, ts: now - from + i })));
const st = (spec, role = '', from = 0) => ({ acts: acts(spec, from), role });

// --------------------------------------------------- a window, not the whole session

const longCode = st([['code', 40]], '', ROLE_WINDOW_MS + 60_000);
longCode.acts.push(...acts([['design', 12]]));
ok('an hour of code doesn\'t keep a designer from being a developer', inferRole(longCode).short === 'design', longCode.role);

const stale = st([['code', 40]], '', ROLE_WINDOW_MS + 60_000);
stale.acts.push(...acts([['design', 3]]));
ok('three fresh layouts are enough against forty old edits',
   inferRole(stale).short === 'design', stale.role);

// A slow session: the last action is outside the window but not yet stale.
const slow = st([['plan', 4]], 'code', ROLE_WINDOW_MS + 5 * 60_000);
ok('a pause of half an hour - a profession in the tail, not in the whole story',
   inferRole(slow).short === 'plan', slow.role);

// And silence that is truly old does not revisit the trade.
const ancient = st([['design', 5]], 'code', ROLE_STALE_MS + 60_000);
ok('rotten actions do not count', inferRole(ancient).short === 'code', ancient.role);

// --------------------------------------------------- reading does not make a coder

const reader = st([['design', 6], ['read', 8]]);
ok('a designer who reads files remains a designer', inferRole(reader).short === 'design', reader.role);

const digging = st([['read', 14]]);
ok('one reading still reads like code', inferRole(digging).short === 'code', digging.role);

// --------------------------------------------------------------- hysteresis

const nose = st([['code', 7], ['plan', 6]], 'code');
ok('neck and neck - the profession does not blink', inferRole(nose).short === 'code', nose.role);

const moved = st([['code', 3], ['plan', 11]], 'code');
ok('broke away - profession changes', inferRole(moved).short === 'plan', moved.role);

// ------------------------------------------ an empty session remembers the past

const quiet = { acts: [], role: 'design' };
ok('without action we keep the last profession', inferRole(quiet).short === 'design');
ok('no action and no past - developer', inferRole({ acts: [], role: '' }).short === 'code');

// ------------------------------------------- the tester and the release engineer

const tester = st([['test', 8], ['code', 3]]);
ok('tests are for the tester, not the developer', inferRole(tester).short === 'qa', tester.role);

const releaser = st([['build', 4], ['ship', 5], ['code', 3]]);
ok('build and commits - release engineer', inferRole(releaser).short === 'release', releaser.role);

// The tester and the release engineer are different trades, and lumping them
// together is not on: otherwise a test run before a rollout would always read as
// a release.
const both = st([['test', 6], ['build', 3]]);
ok('tests and build are not combined into one role', inferRole(both).short === 'qa', both.role);

// Editing code between test runs must not outweigh the run itself.
const mixed = st([['code', 6], ['test', 9]]);
ok('edits between runs do not select testers', inferRole(mixed).short === 'qa', mixed.role);

// ---------------------------------------- the moods everything is counted from

ok('Figma → design', describeTool('mcp__figma__use_figma', {}).mood === 'design');
ok('git commit → ship', describeTool('Bash', { command: 'git commit -m x' }).mood === 'ship');
ok('grep → read', describeTool('Grep', {}).mood === 'read');
ok('npm test → tests', describeTool('Bash', { command: 'npm test' }).mood === 'test');
ok('npm run build → build', describeTool('Bash', { command: 'npm run build' }).mood === 'build');

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
    ok(`${l}: role ${key} has a signature`, word && word !== 'role.' + key, word);
  }
  ok(`role ${key} has its own chip color`, css.includes('.role.r-' + key + '{'));
}
setLang('ru');

process.exit(bad ? 1 : 0);
