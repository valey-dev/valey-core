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

console.log(bad ? `\n${bad} failures` : '\nall green');
process.exit(bad ? 1 : 0);
