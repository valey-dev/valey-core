#!/usr/bin/env node
// Позвонить в пейджер, не дожидаясь настоящего запроса из Claude Code.
//
//   node tools/permit-demo.mjs                 # офис на 5177, один вопрос
//   node tools/permit-demo.mjs --port 5189
//   node tools/permit-demo.mjs --n 2           # двое просят подряд — очередь
//
// Зачем это есть. Хук `PermissionRequest` срабатывает только тогда, когда в
// терминале должен был появиться диалог, — а в auto-режиме почти ничего не
// спрашивают, и увидеть пейджер живьём нечем. 5 сентября 2026 на этом ушёл
// вечер: фича работала, а показать её было нельзя, и это читалось как «не
// работает». Скрипт делает ровно то же, что сделал бы хук, и печатает, что
// ответил офис.
//
// Это НЕ подделка ответа: офис не знает, кто постучался, и обрабатывает запрос
// обычным путём. Разница только в том, что на том конце не ждёт живой агент.
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const PORT = arg('port', '5177');
const BASE = `http://127.0.0.1:${PORT}`;
const N = Math.max(1, Math.min(5, Number(arg('n', '1')) || 1));

// Команды выдуманные, но правдоподобные: пейджер показывает то, по чему решают,
// и на «echo привет» смотреть незачем.
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
  console.log(`Офис на ${PORT} не отвечает или в нём никого. Запусти его и попробуй снова.`);
  process.exit(1);
}

console.log(`Офис на ${PORT}, агентов: ${list.length}. Звоню ${N === 1 ? 'один раз' : `${N} раза`}.`);
console.log('Открой офис в браузере и войди — без зрителя вопрос уйдёт обратно сразу.\n');

const calls = [];
for (let i = 0; i < N; i++) {
  const who = list[i % list.length];
  const ask = ASKS[i % ASKS.length];
  console.log(`→ ${who.name} спрашивает: ${ask.command}`);
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
  // Второй звонок чуть позже первого: очередь должна выстроиться по времени,
  // а не по тому, чей запрос сервер разобрал первым.
  if (i + 1 < N) await new Promise((r) => setTimeout(r, 400));
}

console.log('\nЖду ответа из офиса…\n');
const WORD = {
  allow: 'разрешил',
  deny: 'отказал',
};
for (const done of calls) {
  const { who, v } = await done;
  if (!v || !v.decision) {
    console.log(`${who}: офис отошёл в сторону — «в терминале», истекло время или в офисе никого не было.`);
    continue;
  }
  const always = (v.updatedPermissions || []).length ? ' и записал правило навсегда' : '';
  console.log(`${who}: ${WORD[v.decision] || v.decision}${always}.`
    + (v.message ? ` Записка: «${v.message}»` : ''));
}
