// node tools/test-status.mjs — working, awaiting or asleep, read off the transcript.
//
// The transcript is silent while a step runs: a line lands when the tool
// returns, not while it works. So the question is not "how old is the last
// line" but "is the turn open" — a running tool, a pending permission prompt
// and a model composing its next step are all work, and an agent in the middle
// of one must not be drawn asleep. On 9 September 2026 two live agents sat
// under «z z» on the 410th and 428th second of a Bash call, because the rule
// was "younger than 90 seconds".
globalThis.document = { documentElement: {}, title: '' };
import { applyLine, emptyState, statusOf } from '../server/agents.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const T0 = Date.parse('2026-09-10T10:00:00Z');
const min = (n) => n * 60_000;
const at = (ms) => new Date(T0 + ms).toISOString();
const line = (o) => JSON.stringify(o);
const assistant = (ms, stop, content, extra = {}) => line({
  type: 'assistant', timestamp: at(ms), ...extra,
  message: { role: 'assistant', model: 'claude-fable-5-1', stop_reason: stop, content },
});
const user = (ms, content) => line({ type: 'user', timestamp: at(ms), message: { role: 'user', content } });
const feed = (...lines) => { const st = emptyState(); for (const l of lines) applyLine(st, l); return st; };

const bash = [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }];
const result = [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }];
const text = (s) => [{ type: 'text', text: s }];

// ------------------------------------------- a running tool is work, however long

const running = feed(user(0, 'run the tests'), assistant(min(1), 'tool_use', bash));
ok('a tool called two minutes ago: working', statusOf(running, T0 + min(3)) === 'working', statusOf(running, T0 + min(3)));
ok('a tool called seven minutes ago: working, not asleep', statusOf(running, T0 + min(8)) === 'working', statusOf(running, T0 + min(8)));
ok('a tool called 45 minutes ago: still working', statusOf(running, T0 + min(46)) === 'working', statusOf(running, T0 + min(46)));

// --------------------------------------- the model composing after a tool result

const thinking = feed(user(0, 'x'), assistant(min(1), 'tool_use', bash), user(min(2), result));
ok('a tool result five minutes ago with no reply yet: working', statusOf(thinking, T0 + min(7)) === 'working', statusOf(thinking, T0 + min(7)));

// ----------------------------------------------------------- end_turn is the rest

const done = feed(user(0, 'x'), assistant(min(1), 'end_turn', text('Done.')));
ok('end_turn a second ago: awaiting', statusOf(done, T0 + min(1) + 1000) === 'awaiting', statusOf(done, T0 + min(1) + 1000));
ok('end_turn an hour ago: still awaiting, not asleep', statusOf(done, T0 + min(90)) === 'awaiting', statusOf(done, T0 + min(90)));

// ----------------------------------- an hour of silence mid-turn is a hung step

ok('a tool called 61 minutes ago: asleep', statusOf(running, T0 + min(62)) === 'idle', statusOf(running, T0 + min(62)));

// ---------------------------------------------------- Esc is the end of the turn

const stopped = feed(user(0, 'x'), assistant(min(1), 'tool_use', bash),
  user(min(2), text('[Request interrupted by user for tool use]')));
ok('interrupted at a tool: awaiting', statusOf(stopped, T0 + min(3)) === 'awaiting', statusOf(stopped, T0 + min(3)));
ok('the marker is not remembered as the last prompt', stopped.lastUserPrompt === 'x', stopped.lastUserPrompt);
ok('nor as a line of the conversation', !stopped.recent.some((m) => m.text.startsWith('[Request interrupted')), stopped.recent);

const stoppedPlain = feed(user(0, 'x'), user(min(2), text('[Request interrupted by user]')));
ok('interrupted while answering: awaiting', statusOf(stoppedPlain, T0 + min(3)) === 'awaiting', statusOf(stoppedPlain, T0 + min(3)));

// -------------------------------------------------- an API error ends the turn

const errored = feed(user(0, 'x'),
  assistant(min(1), 'stop_sequence', text('API Error: 529 overloaded'), { isApiErrorMessage: true }));
ok('API error: awaiting', statusOf(errored, T0 + min(2)) === 'awaiting', statusOf(errored, T0 + min(2)));

// ------------------------------------------------ a fresh prompt reopens the turn

const again = feed(user(0, 'x'), assistant(min(1), 'end_turn', text('Done.')), user(min(2), 'and now the other one'));
ok('a new prompt: working', statusOf(again, T0 + min(3)) === 'working', statusOf(again, T0 + min(3)));
ok('and it is the last prompt', again.lastUserPrompt === 'and now the other one', again.lastUserPrompt);

// ----------------------------------------------------------- no transcript at all

ok('no lines: asleep', statusOf(emptyState(), T0) === 'idle', statusOf(emptyState(), T0));

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
