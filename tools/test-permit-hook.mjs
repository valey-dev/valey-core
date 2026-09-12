// node tools/test-permit-hook.mjs — what the hook prints back to Claude Code.
//
// The office can decide perfectly and still be ignored if the answer arrives
// in the wrong shape: the client drops a malformed hook answer and asks for
// itself. Until 11 September 2026 that is exactly what happened to allow and
// deny — the verdict went out as a bare word where an object was expected — and
// nothing noticed, because every stand checked the office's answer and none
// checked what the hook made of it.
import { hookOutput } from './lib/permit-verdict.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const BASH = { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'git push' } };
const RULES = [{ type: 'addRules', behavior: 'allow', destination: 'localSettings',
  rules: [{ toolName: 'Bash', ruleContent: 'git push *' }] }];

// ------------------------------------------------------------ nothing to say
ok('no answer - nothing is printed', hookOutput(BASH, null) === null, hookOutput(BASH, null));
ok('an empty answer - nothing is printed', hookOutput(BASH, {}) === null, hookOutput(BASH, {}));

// ------------------------------------------------------- PermissionRequest
const allow = hookOutput(BASH, { decision: 'allow', updatedPermissions: [] });
const d = allow && allow.hookSpecificOutput && allow.hookSpecificOutput.decision;
ok('allow names its event', allow && allow.hookSpecificOutput.hookEventName === 'PermissionRequest', allow);
ok('allow is an object with behavior, not a bare word',
  d && typeof d === 'object' && d.behavior === 'allow', d);
ok('a plain allow writes no rules', d && !('updatedPermissions' in d), d);

const always = hookOutput(BASH, { decision: 'allow', updatedPermissions: RULES });
ok('always carries the rules as they came',
  always.hookSpecificOutput.decision.updatedPermissions === RULES, always.hookSpecificOutput.decision);

const deny = hookOutput(BASH, { decision: 'deny', message: 'сделай ветку' });
ok('deny is an object with its message',
  deny.hookSpecificOutput.decision.behavior === 'deny'
  && deny.hookSpecificOutput.decision.message === 'сделай ветку', deny.hookSpecificOutput.decision);
const bare = hookOutput(BASH, { decision: 'deny' });
ok('a deny without words still says something',
  !!bare.hookSpecificOutput.decision.message, bare.hookSpecificOutput.decision);

// An older hook sent no event name; the office read it as PermissionRequest.
const old = hookOutput({ tool_name: 'Bash' }, { decision: 'allow' });
ok('no event name is read as PermissionRequest',
  old && old.hookSpecificOutput.hookEventName === 'PermissionRequest', old);

// ---------------------------------------------------- PreToolUse: a question
// The shape is the hooks reference's, word for word: allow alone does not
// answer AskUserQuestion, it needs updatedInput with the questions echoed back
// and answers added. A live probe on 11 September 2026 returned exactly this
// and the agent got «Кит» with no picker drawn.
const QS = [{ question: 'Кого берём?', header: 'Зверь',
  options: [{ label: 'Кит', description: 'большой' }, { label: 'Слон' }], multiSelect: false }];
const ASK = { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: QS } };

const answered = hookOutput(ASK, { decision: 'answer', answers: { 'Кого берём?': 'Кит' } });
const h = answered && answered.hookSpecificOutput;
ok('an answer names PreToolUse', h && h.hookEventName === 'PreToolUse', answered);
ok('an answer is an allow', h && h.permissionDecision === 'allow', h);
ok('the questions go back as they came', h && h.updatedInput.questions === QS, h && h.updatedInput);
ok('and the answers ride with them', h && h.updatedInput.answers['Кого берём?'] === 'Кит', h && h.updatedInput);
ok('PreToolUse has no decision object', h && !('decision' in h), h);

const refused = hookOutput(ASK, { decision: 'deny', message: 'спроси потом' });
ok('a refusal is a deny with the words as its reason',
  refused.hookSpecificOutput.permissionDecision === 'deny'
  && refused.hookSpecificOutput.permissionDecisionReason === 'спроси потом', refused);

// An allow without answers would only draw the client's own picker — which is
// what printing nothing does too, without pretending to have decided.
ok('allow at PreToolUse prints nothing', hookOutput(ASK, { decision: 'allow' }) === null,
  hookOutput(ASK, { decision: 'allow' }));
ok('answer without answers prints nothing', hookOutput(ASK, { decision: 'answer' }) === null,
  hookOutput(ASK, { decision: 'answer' }));
ok('an unknown event prints nothing',
  hookOutput({ ...ASK, hook_event_name: 'PostToolUse' }, { decision: 'allow' }) === null, null);

console.log(bad ? `\n${bad} failures` : '\nall green');
process.exit(bad ? 1 : 0);
