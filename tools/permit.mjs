#!/usr/bin/env node
// Хук `PermissionRequest`: относит вопрос «можно выполнить?» в офис и приносит
// оттуда ответ. Ставится в `~/.claude/settings.json`:
//
//   "hooks": {
//     "PermissionRequest": [
//       { "hooks": [{ "type": "command", "command": "node ~/…/valey-core/tools/permit.mjs" }] }
//     ]
//   }
//
// Всё, что здесь есть, подчинено одному правилу: **офис не имеет права мешать
// работать**. Он выключен, занят, отвечает ерундой, сломан — хук молчит и
// выходит с нулём, а Claude Code показывает свой обычный диалог. Молчание и
// есть «спроси сам»: пустой ответ пропускает вопрос дальше по штатному пути.
//
// Поэтому здесь нет ни одного throw наружу и ни одной ветки, которая печатает
// что-то, кроме готового вердикта. Ошибка в хуке — это чужой сеанс, замерший
// на вопросе, которого человек не видит.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_BASE = (process.env.VALEY_URL || 'http://127.0.0.1:5177').replace(/\/+$/, '');

// Токен хозяина лежит в том же файле, что и весь остальной офис. В private он
// не нужен — петля и так своя, — но в shared без него офис ответит «смотреть
// можно, командовать нельзя», и вопрос вернётся в терминал молча.
function ownerToken() {
  const file = process.env.VALEY_SETTINGS
    || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'valey', 'settings.json');
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (s && s.access && s.access.token) || '';
  } catch { return ''; }
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// Пустой ответ = «спрашивай сам». Печатаем ничего и уходим с нулём: код выхода
// 2 у этого события ничего не блокирует, а единица читается как поломка хука.
const passThrough = () => process.exit(0);

const payload = JSON.parse(await readStdin().catch(() => '')) || null;
if (!payload || !payload.tool_name) passThrough();

let answer = null;
try {
  const token = ownerToken();
  const res = await fetch(URL_BASE + '/api/permit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-valey-owner': token } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) answer = await res.json();
} catch {
  // Офиса нет на этом порту — самый обычный случай: он и не обязан быть
  // запущен. Соединение отказывают мгновенно, задержки для человека нет.
}

if (!answer || !answer.decision) passThrough();

// Вердикт офиса — в форму, которую ждёт Claude Code. Правила для «всегда
// разрешать» едут теми же объектами, какими пришли в permission_suggestions:
// офис их не сочиняет, а возвращает, — и записывает их сам Claude Code, туда
// же, куда записала бы кнопка «Always allow».
const out = {
  hookEventName: 'PermissionRequest',
  decision: answer.decision,
};
if (answer.decision === 'allow' && (answer.updatedPermissions || []).length) {
  out.updatedPermissions = answer.updatedPermissions;
}
if (answer.decision === 'deny') out.message = answer.message || 'отказано в офисе';

process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
process.exit(0);
