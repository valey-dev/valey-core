// node tools/test-skills.mjs — the grade counter in the transcript parser.
//
// Not "can it add up", but the three places where the count breaks quietly: an
// action goes to the wrong branch, an image edit counts as code instead of
// design, and the sum gets trimmed along with the profession window at sixty
// actions. The first two show only on the blank, the third only on a long
// session.
//
// The lines are real: the stand feeds the parser the same JSONL that sits in
// ~/.claude.
globalThis.document = { documentElement: {}, title: '' };
import { applyLine, emptyState, SKILL_BRANCHES } from '../server/agents.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const line = (name, input = {}) => JSON.stringify({
  type: 'assistant',
  timestamp: new Date().toISOString(),
  message: { model: 'claude-opus-5', content: [{ type: 'tool_use', name, input }] },
});

const feed = (calls) => {
  const st = emptyState();
  for (const [name, input] of calls) applyLine(st, line(name, input));
  return st;
};

// ------------------------------------------------ every action to its branch

const cases = [
  ['правка файла — разработчик', [['Edit', { file_path: '/p/a.js' }]], 'code'],
  ['запись файла — разработчик', [['Write', { file_path: '/p/a.js' }]], 'code'],
  ['чтение — архивариус', [['Read', { file_path: '/p/a.js' }]], 'archive'],
  ['grep — архивариус', [['Grep', { pattern: 'x' }]], 'archive'],
  ['git status — архивариус', [['Bash', { command: 'git status' }]], 'archive'],
  ['тесты — тестировщик', [['Bash', { command: 'npm test' }]], 'qa'],
  ['линтер — тестировщик', [['Bash', { command: 'npx eslint .' }]], 'qa'],
  ['сборка — релиз-инженер', [['Bash', { command: 'npm run build' }]], 'release'],
  ['коммит — релиз-инженер', [['Bash', { command: 'git commit -m x' }]], 'release'],
  ['поиск в вебе — исследователь', [['WebSearch', { query: 'x' }]], 'research'],
  ['todo — продакт', [['TodoWrite', {}]], 'plan'],
  ['подзадачи — продакт', [['Task', {}]], 'plan'],
  ['figma — дизайнер', [['mcp__figma__use_figma', {}]], 'design'],
  ['артефакт — дизайнер', [['Artifact', {}]], 'design'],
];
for (const [name, calls, branch] of cases) {
  const sk = feed(calls).skills;
  ok(name, sk[branch] === 1 && Object.values(sk).reduce((a, b) => a + b, 0) === 1, sk);
}

// An image written by an ordinary Write is design, not code. The rule lives in
// describeTool and is only checked here: without it every mock-up edit would go
// to the developer and the designer would always sit at a dash.
ok('правка картинки — дизайнер, хотя инструмент тот же',
  feed([['Write', { file_path: '/p/logo.png' }]]).skills.design === 1);

// ------------------------------------------------------------ the sum is not trimmed

const long = feed(Array.from({ length: 200 }, () => ['Read', { file_path: '/p/a.js' }]));
ok('двести чтений сосчитаны все', long.skills.archive === 200, long.skills.archive);
ok('окно профессии при этом обрезано на шестидесяти', long.acts.length === 60, long.acts.length);

// ----------------------------------------------------------------- small things

const fresh = emptyState();
ok('у новой сессии все семь веток на нуле',
  SKILL_BRANCHES.every((b) => fresh.skills[b] === 0) && Object.keys(fresh.skills).length === 7, fresh.skills);

const mixed = feed([
  ['Read', { file_path: '/p/a.js' }], ['Read', { file_path: '/p/b.js' }],
  ['Edit', { file_path: '/p/a.js' }], ['Bash', { command: 'npm test' }],
]);
ok('смешанная работа раскладывается по веткам',
  mixed.skills.archive === 2 && mixed.skills.code === 1 && mixed.skills.qa === 1, mixed.skills);

// A reply with no tool calls belongs to no branch: a grade is about what was
// done, not about what was said.
const talk = emptyState();
applyLine(talk, JSON.stringify({
  type: 'assistant', timestamp: new Date().toISOString(),
  message: { content: [{ type: 'text', text: 'готово' }] },
}));
ok('разговор не качает ничего', Object.values(talk.skills).every((n) => n === 0), talk.skills);

console.log(bad ? `\nПЛОХО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
