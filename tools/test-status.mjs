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

// ------------------------------------ an interrupt is «stopped», not «awaiting»
// Cut off mid-step, the agent will not go on by itself, but it asks for nothing:
// it has a state of its own and stays out of «! N» and the pager. 20 of 21
// interrupts in four days were followed by the app's resume line — a restart
// the person never saw.

const stopped = feed(user(0, 'x'), assistant(min(1), 'tool_use', bash),
  user(min(2), text('[Request interrupted by user for tool use]')));
ok('interrupted at a tool: stopped', statusOf(stopped, T0 + min(3)) === 'stopped', statusOf(stopped, T0 + min(3)));
ok('…and still stopped an hour later', statusOf(stopped, T0 + min(90)) === 'stopped', statusOf(stopped, T0 + min(90)));
ok('the marker is not remembered as the last prompt', stopped.lastUserPrompt === 'x', stopped.lastUserPrompt);
ok('nor as a line of the conversation', !stopped.recent.some((m) => m.text.startsWith('[Request interrupted')), stopped.recent);

const stoppedPlain = feed(user(0, 'x'), user(min(2), text('[Request interrupted by user]')));
ok('interrupted while answering: stopped', statusOf(stoppedPlain, T0 + min(3)) === 'stopped', statusOf(stoppedPlain, T0 + min(3)));

const resumedAfterStop = feed(user(0, 'x'), user(min(2), text('[Request interrupted by user]')), user(min(5), 'продолжай'));
ok('a prompt after the interrupt: working again', statusOf(resumedAfterStop, T0 + min(6)) === 'working', statusOf(resumedAfterStop, T0 + min(6)));

// -------------------------------------------------- an API error ends the turn

const errored = feed(user(0, 'x'),
  assistant(min(1), 'stop_sequence', text('API Error: 529 overloaded'), { isApiErrorMessage: true }));
ok('API error: awaiting', statusOf(errored, T0 + min(2)) === 'awaiting', statusOf(errored, T0 + min(2)));

// ------------------------------------------------ a fresh prompt reopens the turn

const again = feed(user(0, 'x'), assistant(min(1), 'end_turn', text('Done.')), user(min(2), 'and now the other one'));
ok('a new prompt: working', statusOf(again, T0 + min(3)) === 'working', statusOf(again, T0 + min(3)));
ok('and it is the last prompt', again.lastUserPrompt === 'and now the other one', again.lastUserPrompt);

// ------------------------------------- the report's last line decides the rest
// «Awaiting» is for an agent that has done its part and needs the person. Until
// 13 September 2026 every end_turn rang it, «Что нужно от меня — Ничего»
// included: 52 of 695 turn ends in four days.

const report = (need) => text(`Готово.\n\n**Текущая фича/задача** — этаж.\n**Статус** — built.\n**Что нужно от меня** — ${need}`);

const nothing = feed(user(0, 'x'), assistant(min(1), 'end_turn', report('Ничего.')));
ok('a report that needs nothing: at rest, not awaiting', statusOf(nothing, T0 + min(2)) === 'idle', statusOf(nothing, T0 + min(2)));
ok('…an hour later too', statusOf(nothing, T0 + min(90)) === 'idle', statusOf(nothing, T0 + min(90)));

const needs = feed(user(0, 'x'), assistant(min(1), 'end_turn', report('утвердить кадр')));
ok('a report that asks for something: awaiting', statusOf(needs, T0 + min(2)) === 'awaiting', statusOf(needs, T0 + min(2)));

const reopened = feed(user(0, 'x'), assistant(min(1), 'end_turn', report('Ничего')), user(min(2), 'and the next one'));
ok('a new prompt after a finished report: working again', statusOf(reopened, T0 + min(3)) === 'working', statusOf(reopened, T0 + min(3)));

// The report only counts on the line that ends the turn: a tail said mid-turn
// and then a bare question means the question is what the person owes.
const askedAfter = feed(user(0, 'x'), assistant(min(1), 'tool_use', [...report('Ничего'), ...bash]),
  user(min(2), result), assistant(min(3), 'end_turn', text('Which of the two do you want?')));
ok('a bare question after an earlier report: awaiting', statusOf(askedAfter, T0 + min(4)) === 'awaiting', statusOf(askedAfter, T0 + min(4)));

// ------------------------------------------ background work is the agent's own
// The agent may end its turn right after starting a background command or a
// subagent. It is not waiting for anybody: the job wakes it with a
// <task-notification>. Formats read off live transcripts on 13 September 2026.

const bgBash = [{ type: 'tool_use', id: 'bg1', name: 'Bash', input: { command: 'npm test', run_in_background: true } }];
const bgStarted = [{ type: 'tool_result', tool_use_id: 'bg1', content: 'Command running in background with ID: b0fw8e773. Output is being written to: /tmp/x.output' }];
const bgAgent = [{ type: 'tool_use', id: 'ag1', name: 'Agent', input: { prompt: 'look around' } }];
const agStarted = [{ type: 'tool_result', tool_use_id: 'ag1', content: [{ type: 'text', text: 'Async agent launched successfully.\nagentId: a1b2' }] }];
const notified = (id) => user(0, `<task-notification> <task-id>b0fw8e773</task-id> <tool-use-id>${id}</tool-use-id> <status>completed</status> <summary>done</summary> </task-notification>`);

const waitingOnItself = feed(user(0, 'x'), assistant(min(1), 'tool_use', bgBash), user(min(1), bgStarted),
  assistant(min(2), 'end_turn', text('Tests are running, I will look when they finish.')));
ok('a turn ended on a running background command: working', statusOf(waitingOnItself, T0 + min(5)) === 'working', statusOf(waitingOnItself, T0 + min(5)));
ok('…even when the report needs nothing', statusOf(feed(user(0, 'x'), assistant(min(1), 'tool_use', bgBash), user(min(1), bgStarted),
  assistant(min(2), 'end_turn', report('Ничего'))), T0 + min(5)) === 'working');
ok('…but an explicit ask still awaits', statusOf(feed(user(0, 'x'), assistant(min(1), 'tool_use', bgBash), user(min(1), bgStarted),
  assistant(min(2), 'end_turn', report('ключ Figma'))), T0 + min(5)) === 'awaiting');
ok('…and a job silent for an hour hands the turn back to the person', statusOf(waitingOnItself, T0 + min(63)) === 'awaiting', statusOf(waitingOnItself, T0 + min(63)));

const agentBg = feed(user(0, 'x'), assistant(min(1), 'tool_use', bgAgent), user(min(1), agStarted),
  assistant(min(2), 'end_turn', text('A subagent is looking; I will report when it is back.')));
ok('a turn ended on a background subagent: working', statusOf(agentBg, T0 + min(5)) === 'working', statusOf(agentBg, T0 + min(5)));

const woke = feed(user(0, 'x'), assistant(min(1), 'tool_use', bgBash), user(min(1), bgStarted),
  assistant(min(2), 'end_turn', text('Running.')), notified('bg1'));
ok('the job reports back: the turn is open again', statusOf(woke, T0 + min(6)) === 'working', statusOf(woke, T0 + min(6)));
ok('…and the notification is not taken for a prompt', woke.lastUserPrompt === 'x', woke.lastUserPrompt);
ok('…and the job is crossed off', woke.background.size === 0, [...woke.background]);

const afterJob = feed(user(0, 'x'), assistant(min(1), 'tool_use', bgBash), user(min(1), bgStarted),
  assistant(min(2), 'end_turn', text('Running.')), notified('bg1'), assistant(min(7), 'end_turn', text('Green. Want me to merge?')));
ok('the job done and a bare question after it: awaiting', statusOf(afterJob, T0 + min(8)) === 'awaiting', statusOf(afterJob, T0 + min(8)));

// A job that finishes while the turn is still open is queued into it rather
// than sent as a user line: 9 of 37 jobs in one live transcript were reported
// that way and, read only off user lines, stayed «running» forever.
const queued = feed(user(0, 'x'), assistant(min(1), 'tool_use', bgBash), user(min(1), bgStarted),
  line({ type: 'queue-operation', operation: 'enqueue', timestamp: at(min(3)),
    content: '<task-notification>\n<task-id>b0fw8e773</task-id>\n<tool-use-id>bg1</tool-use-id>\n<status>completed</status>\n</task-notification>' }),
  assistant(min(4), 'end_turn', text('All green. Merge?')));
ok('a job reported into the open turn is crossed off too', queued.background.size === 0, [...queued.background.keys()]);
ok('…so the question after it awaits', statusOf(queued, T0 + min(5)) === 'awaiting', statusOf(queued, T0 + min(5)));

// Stopped by hand, a job never reports. It holds the agent for an hour from its
// start and no longer: past that, the question it ended on is the person's.
const stale = feed(user(0, 'x'), assistant(min(1), 'tool_use', bgBash), user(min(1), bgStarted),
  user(min(70), 'and now?'), assistant(min(71), 'end_turn', text('Which branch?')));
ok('a job started over an hour ago no longer holds the agent', statusOf(stale, T0 + min(72)) === 'awaiting', statusOf(stale, T0 + min(72)));

const foreground = feed(user(0, 'x'), assistant(min(1), 'tool_use', bash), user(min(2), result),
  assistant(min(3), 'end_turn', text('Done.')));
ok('an ordinary tool result is not background work', foreground.background.size === 0 && statusOf(foreground, T0 + min(4)) === 'awaiting');

// ----------------------------------------- the app's own line is not a reply

const resumed = feed(user(0, 'x'), assistant(min(1), 'end_turn', report('Ничего')),
  line({ type: 'assistant', timestamp: at(min(20)), message: { role: 'assistant', model: '<synthetic>', stop_reason: 'stop_sequence', content: text('No response requested.') } }));
ok('«No response requested.» on a resume changes nothing: still at rest', statusOf(resumed, T0 + min(21)) === 'idle', statusOf(resumed, T0 + min(21)));

// ----------------------------------------------------------- no transcript at all

ok('no lines: asleep', statusOf(emptyState(), T0) === 'idle', statusOf(emptyState(), T0));

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
