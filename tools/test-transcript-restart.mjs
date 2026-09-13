// node tools/test-transcript-restart.mjs — the conversation survives a restart.
//
// After a restart the office reads the last megabyte of a transcript and knows
// nothing older. A screenshot handed back by a tool is one line of 1.1–1.3 MB,
// so one screenshot is the whole megabyte: on 13 September 2026 three of
// fourteen live sessions on this machine had no reply in it against 48–123 in
// the file, and their transcript opened empty although the conversation was
// there. The deep pass over the head of the file now hands its replies over.
//
// The file here is built the way those were: the talk first, a screenshot last.
globalThis.document = { documentElement: {}, title: '' };
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { follow, deepSkills, applyLine, emptyState } from '../server/agents.js';

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('FAIL  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valey-restart-'));
let clock = Date.parse('2026-09-13T10:00:00Z');
const at = () => new Date((clock += 1000)).toISOString();
const user = (text) => JSON.stringify({ type: 'user', timestamp: at(), message: { role: 'user', content: text } });
const said = (text) => JSON.stringify({ type: 'assistant', timestamp: at(),
  message: { model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text }] } });
const tool = () => JSON.stringify({ type: 'assistant', timestamp: at(),
  message: { model: 'claude-opus-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/p/shot.png' } }] } });
// A screenshot as a tool hands it back: one user line, a base64 PNG inside.
const shot = () => JSON.stringify({ type: 'user', timestamp: at(), message: { role: 'user',
  content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'image', source: { type: 'base64', data: 'A'.repeat(1200 * 1024) } }] }] } });

const REPORT = 'Готово.\n\n**Текущая фича/задача** — транскрипт после перезапуска.\n**Статус** — built.\n**Что нужно от меня** — Ничего.';
const talk = [];
for (let i = 1; i <= 20; i++) talk.push(user(`вопрос ${i}`), said(i === 20 ? REPORT : `ответ ${i}`));

const write = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.join('\n') + '\n'); return f; };
const settle = async (st) => { for (let i = 0; i < 60 && !st.recent.length; i++) await new Promise((r) => setTimeout(r, 50)); return st; };

{
  const file = write('a.jsonl', [...talk, tool(), shot(), tool()]);
  ok('the file is built as the broken ones were: its last megabyte holds no reply',
    fs.statSync(file).size > 1024 * 1024);
  const st = await settle(await follow('restart-a', file, applyLine, emptyState, deepSkills));
  ok('the transcript is not empty after a restart', st.recent.length > 0, st.recent.length);
  ok('it holds the last sixteen replies, oldest first',
    st.recent.length === 16 && st.recent[0].text === 'вопрос 13' && st.recent[15].text === REPORT,
    st.recent.map((m) => m.text.slice(0, 12)));
  ok('the screenshot is not a reply', !st.recent.some((m) => m.text.startsWith('AAAA')));
  ok('what he said last comes back too', st.lastAssistantText === REPORT, st.lastAssistantText.slice(0, 40));
  ok('and the task in the head of his card', st.task?.what === 'транскрипт после перезапуска.', st.task);
}

{
  // Replies after the screenshot are in the tail: they stay the newest, and the
  // head's go in front of them instead of over them.
  const file = write('b.jsonl', [...talk, tool(), shot(), user('а теперь?'), said('теперь видно')]);
  const st = await settle(await follow('restart-b', file, applyLine, emptyState, deepSkills));
  await new Promise((r) => setTimeout(r, 300));
  const texts = st.recent.map((m) => m.text);
  ok('the tail keeps the last word', texts.at(-1) === 'теперь видно' && texts.at(-2) === 'а теперь?', texts.slice(-3));
  ok('the head fills in before it, in order, still sixteen in all',
    texts.length === 16 && texts[13] === REPORT && texts[0] === 'вопрос 14', texts.map((t) => t.slice(0, 12)));
  ok('the last reply is the tail’s, not overwritten by the head', st.lastAssistantText === 'теперь видно', st.lastAssistantText);
}

{
  // A short file is read whole as the tail and never gets a deep pass: nothing
  // may be counted twice.
  const file = write('c.jsonl', talk.slice(0, 6));
  const st = await follow('restart-c', file, applyLine, emptyState, deepSkills);
  await new Promise((r) => setTimeout(r, 200));
  ok('a file under a megabyte is not doubled', st.recent.length === 6, st.recent.map((m) => m.text));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : '\nall intact');
process.exit(bad ? 1 : 0);
