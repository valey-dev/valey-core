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
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
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
ok('image editing by a designer, although the tool is the same',
  feed([['Write', { file_path: '/p/logo.png' }]]).skills.design === 1);

// ------------------------------------------------------------ the sum is not trimmed

const long = feed(Array.from({ length: 200 }, () => ['Read', { file_path: '/p/a.js' }]));
ok('two hundred readings are all counted', long.skills.archive === 200, long.skills.archive);
ok('the profession window is cut off at sixty', long.acts.length === 60, long.acts.length);

// ----------------------------------------------------------------- small things

const fresh = emptyState();
ok('the new session has all seven branches at zero',
  SKILL_BRANCHES.every((b) => fresh.skills[b] === 0) && Object.keys(fresh.skills).length === 7, fresh.skills);

const mixed = feed([
  ['Read', { file_path: '/p/a.js' }], ['Read', { file_path: '/p/b.js' }],
  ['Edit', { file_path: '/p/a.js' }], ['Bash', { command: 'npm test' }],
]);
ok('mixed work is laid out on branches',
  mixed.skills.archive === 2 && mixed.skills.code === 1 && mixed.skills.qa === 1, mixed.skills);

// A reply with no tool calls belongs to no branch: a grade is about what was
// done, not about what was said.
const talk = emptyState();
applyLine(talk, JSON.stringify({
  type: 'assistant', timestamp: new Date().toISOString(),
  message: { content: [{ type: 'text', text: 'готово' }] },
}));
ok('conversation doesn\'t download anything', Object.values(talk.skills).every((n) => n === 0), talk.skills);

// --------------------------------------------------------------- the shift
//
// Three numbers next to the grades: replies, characters and the gaps between
// them. The gap is the delicate one — it is counted from the stamps, and a
// pause of ten minutes is the border. What breaks quietly here is the clock:
// the tail and the deep pass walk one file from two ends, and a shared
// last-seen stamp would turn the head's older stamps into negative gaps.

const spoke = (text, ts) => JSON.stringify({
  type: 'assistant', timestamp: new Date(ts).toISOString(),
  message: { model: 'claude-opus-5', content: [{ type: 'text', text }] },
});
const shiftOf = (lines) => { const st = emptyState(); for (const l of lines) applyLine(st, l); return st.shift; };

const T0 = Date.parse('2026-09-06T10:00:00Z');
const MIN = 60000;
const said = shiftOf([spoke('раз', T0), spoke('два', T0 + MIN), spoke('три', T0 + 2 * MIN)]);
ok('entries are counted based on replicas', said.turns === 3, said);
ok('signs add up', said.chars === 'раз'.length + 'два'.length + 'три'.length, said.chars);
ok('short pauses are not considered downtime', said.idleN === 0, said);

const paused = shiftOf([spoke('до', T0), spoke('после', T0 + 40 * MIN), spoke('и ещё', T0 + 41 * MIN)]);
ok('a pause longer than ten minutes is a simple one', paused.idleN === 1, paused);
ok('and it is counted in minutes, not in replicas', Math.round(paused.idleMs / MIN) === 40, paused.idleMs);

const edge = shiftOf([spoke('a', T0), spoke('b', T0 + 10 * MIN)]);
ok('exactly ten minutes is not easy yet', edge.idleN === 0, edge);

// A message with no text is a tool call: it adds no reply to the count, though
// it does carry a stamp, so a gap is measured across it.
const toolOnly = shiftOf([spoke('слово', T0), line('Read', { file_path: '/p/a.js' })]);
ok('calling a tool is not considered an entry', toolOnly.turns === 1, toolOnly);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
