// node tools/test-task.mjs — the "what he is working on" line in the head.
//
// What is parsed is the tail of the last answer: the three lines AGENTS.md
// requires at the end of every message. This checks not "does the regexp match"
// but the reasons the line exists and the ways it could lie: the tail taken is
// the last one, not the first found; «Ничего» does not turn into an ask; an
// agent whose repository has no report convention has no task at all, and the
// head must stay exactly as it was.
globalThis.document = { documentElement: {}, title: '' };
import { reportTail, applyLine, emptyState } from '../server/agents.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const tail = (what, status, need) =>
  `Сделал, проверил, запушил.\n\n**Текущая фича/задача** — ${what}\n**Статус** — ${status}\n**Что нужно от меня** — ${need}\n`;

// ------------------------------------------------------------ ordinary answer

const one = reportTail(tail('Вкладка «Ключи» в инвентаре', 'собрано, стенд на 5188', 'Ничего'));
ok('задача берётся из хвоста', one && one.what === 'Вкладка «Ключи» в инвентаре', one);
ok('статус берётся из хвоста', one && one.status === 'собрано, стенд на 5188', one);
ok('«Ничего» не становится просьбой', one && one.need === '', one);

const asked = reportTail(tail('Прайсинг на лендинге', 'нарисовано, ждёт утверждения', 'выбрать версию — v4 или v5'));
ok('просьба к человеку доезжает', asked && asked.need === 'выбрать версию — v4 или v5', asked);

// -------------------------------------------------------- no tail, no task

ok('без отчёта задачи нет', reportTail('Готово, всё работает.') === null);
ok('пустой ответ не падает', reportTail('') === null);
ok('undefined не падает', reportTail(undefined) === null);

// A report line named in prose but not filled in is not a task.
ok('одно упоминание правила задачей не считается',
   reportTail('Каждый ответ кончается строкой «Текущая фича/задача».') === null);

// -------------------------------------------- the last tail, not the first
//
// The whole conversation does not travel in the snapshot, but one answer can
// retell an earlier one — explaining what was done before, say. Taking the first
// match means showing the day-before-yesterday's work in the head and not
// noticing.
const twice = reportTail(tail('Старое дело', 'сдано', 'Ничего') + '\n' + tail('Новое дело', 'в работе', 'Ничего'));
ok('берётся последний хвост, а не первый', twice && twice.what === 'Новое дело', twice);

// --------------------------------------------------------- however it is written

ok('без звёздочек тоже читается',
   (reportTail('Текущая фича/задача — Разряды агентов\nСтатус — рисуется') || {}).what === 'Разряды агентов');
ok('двоеточие вместо тире',
   (reportTail('**Текущая задача**: Почтовая комната') || {}).what === 'Почтовая комната');
ok('разметка из значения снимается',
   (reportTail('**Текущая фича/задача** — `server/agents.js` и **шапка**') || {}).what === 'server/agents.js и шапка');
ok('строка в цитате читается',
   (reportTail('> **Текущая фича/задача** — Лифт') || {}).what === 'Лифт');

// «Ничего» gets written in several ways, and a full stop changes nothing.
for (const n of ['Ничего', 'ничего.', 'Нет', 'Nothing', '—']) {
  const r = reportTail(tail('Задача', 'статус', n));
  ok(`«${n}» — это не просьба`, r && r.need === '', r);
}

// -------------------------------------------------------------------- limits

// The value is capped but not lost: clipping a long line is the head's job.
const long = reportTail(tail('я'.repeat(500), 'ok', 'Ничего'));
ok('длинная задача обрезана потолком', long && long.what.length === 300, long && long.what.length);

// The tail sits at the end of an answer: there is no reason to look into the
// beginning of a long message, or a quoted report from somewhere else becomes
// the task.
const far = reportTail(tail('Далёкое дело', 'сдано', 'Ничего') + 'x'.repeat(4000));
ok('хвост ищется только в конце ответа', far === null);

// ----------------------------- the task does not go out while the agent answers
//
// Found on a live stand on 5 September 2026: the line was taken from the last
// answer, and while an agent works it says a dozen replies with no tail — so the
// head emptied during exactly the minutes it was built for. The task is held
// until the next one is named.
const say = (text) => JSON.stringify({
  type: 'assistant', timestamp: new Date().toISOString(),
  message: { model: 'claude', content: [{ type: 'text', text }] },
});

const st = emptyState();
ok('у сессии без отчёта задачи нет', st.task === null, st.task);
applyLine(st, say(tail('Разбор хвоста отчёта', 'пишу', 'Ничего')));
ok('задача запоминается из ответа', st.task && st.task.what === 'Разбор хвоста отчёта', st.task);
applyLine(st, say('Сейчас посмотрю, что в файле.'));
ok('реплика без хвоста не гасит задачу', st.task && st.task.what === 'Разбор хвоста отчёта', st.task);
applyLine(st, say(tail('Следующее дело', 'сдано', 'Ничего')));
ok('новый хвост заменяет прежнюю задачу', st.task && st.task.what === 'Следующее дело', st.task);

console.log(bad ? `\n${bad} УПАЛО` : '\nвсё зелено');
process.exit(bad ? 1 : 0);
