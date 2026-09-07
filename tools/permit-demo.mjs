#!/usr/bin/env node
// Ring the pager without waiting for a real request from Claude Code.
//
//   node tools/permit-demo.mjs                 # the office on 5177, one question
//   node tools/permit-demo.mjs --port 5189
//   node tools/permit-demo.mjs --n 2           # two ask in a row — a queue
//
// Why this exists. The `PermissionRequest` hook only fires when a dialog was
// about to appear in the terminal — and in auto mode almost nothing is asked, so
// there is no way to see the pager for real. On 5 September 2026 that cost an
// evening: the feature worked and could not be shown, and that read as "it does
// not work". The script does exactly what the hook would do, and prints what the
// office answered.
//
// This is NOT a faked answer: the office does not know who knocked and handles
// the request the usual way. The only difference is that no live agent is waiting
// at the other end.
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const PORT = arg('port', '5177');
const BASE = `http://127.0.0.1:${PORT}`;
const N = Math.max(1, Math.min(5, Number(arg('n', '1')) || 1));

// The commands are invented but plausible: the pager shows what the decision is
// made on, and there is no point looking at "echo hello".
const ASKS = [
  {
    command: 'git push -u origin HEAD 2>&1 | tail -5',
    description: 'Push the worktree branch and the private repository',
    rule: 'git push *',
  },
  {
    command: 'rm -rf node_modules && npm ci',
    description: 'Reinstall dependencies from scratch',
    rule: 'npm ci',
  },
  {
    command: 'psql $DATABASE_URL -c "delete from sessions where expired"',
    description: 'Clear expired sessions in the staging database',
    rule: 'psql *',
  },
];

async function agents() {
  try {
    const r = await fetch(BASE + '/api/state');
    if (!r.ok) return [];
    return (await r.json()).agents || [];
  } catch { return []; }
}

const list = await agents();
if (!list.length) {
  console.log(`The office on ${PORT} is not responding or is empty. Start it and try again.`);
  process.exit(1);
}

console.log(`Office on ${PORT}, agents: ${list.length}. Calling ${N === 1 ? 'once' : `${N} times`}.`);
console.log('Open the office in a browser and enter; without a viewer, the question returns immediately.\n');

const calls = [];
for (let i = 0; i < N; i++) {
  const who = list[i % list.length];
  const ask = ASKS[i % ASKS.length];
  console.log(`→ ${who.name} asks: ${ask.command}`);
  calls.push(fetch(BASE + '/api/permit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: who.id,
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: ask.command, description: ask.description },
      permission_suggestions: [{
        type: 'addRules', behavior: 'allow', destination: 'localSettings',
        rules: [{ toolName: 'Bash', ruleContent: ask.rule }],
      }],
    }),
  }).then((r) => r.json()).then((v) => ({ who: who.name, v })));
  // The second call comes slightly after the first: the queue must line up by
  // time rather than by whose request the server parsed first.
  if (i + 1 < N) await new Promise((r) => setTimeout(r, 400));
}

console.log('\nWaiting for an answer from the office…\n');
const WORD = {
  allow: 'allowed',
  deny: 'denied',
};
for (const done of calls) {
  const { who, v } = await done;
  if (!v || !v.decision) {
    console.log(`${who}: the office stepped aside—the answer stayed in the terminal, timed out, or nobody was watching.`);
    continue;
  }
  const always = (v.updatedPermissions || []).length ? ' and saved the rule permanently' : '';
  console.log(`${who}: ${WORD[v.decision] || v.decision}${always}.`
    + (v.message ? ` Note: “${v.message}”` : ''));
}
