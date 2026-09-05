// node tools/test-notes.mjs — notes on replies, without a browser.
//
// What is checked is not the layout but what breaks quietly: does a note survive
// the tail reply growing, does it vanish when its message scrolls out of the
// window, and what stays in storage after edits. All of it is pure logic over
// localStorage.

import { memoryStorage } from './lib/dom.mjs';

// The storage here is not a stub but a participant in the check: the stand both
// writes into it behind notes.js and reads the result. The shared machine hands
// its map outward — it is the same map the code sees.
const ls = memoryStorage();
globalThis.localStorage = ls;
const store = ls.store;

const { notesOf, noteCount, addNote, editNote, removeNote, splitNotes, allNotes,
  addr, parseAddr } = await import('../web/notes.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};
const reset = () => ls.clear();

// ------------------------------------------------------------ the life cycle
reset();
const a = addNote('agent-1', 1000, '  идея про экран входа  ');
ok('заметка записалась', a && a.text === 'идея про экран входа', a);
ok('обрезаются пробелы по краям', a && a.text[0] === 'и');
ok('счётчик увидел одну', noteCount('agent-1') === 1, noteCount('agent-1'));
ok('пустая заметка не пишется', addNote('agent-1', 1000, '   ') === null);
ok('счётчик не вырос от пустой', noteCount('agent-1') === 1);

const b = addNote('agent-1', 2000, 'вторая');
ok('порядок — по времени создания', notesOf('agent-1').map((n) => n.text).join(',') === 'идея про экран входа,вторая');
ok('у чужого агента пусто', noteCount('agent-2') === 0);

editNote('agent-1', a.id, 'поправленная мысль');
const after = notesOf('agent-1').find((n) => n.id === a.id);
ok('правка сохранилась', after.text === 'поправленная мысль', after.text);
ok('правка помечена временем', typeof after.edited === 'number', after.edited);
ok('якорь при правке не съехал', after.ts === 1000, after.ts);

ok('правка в пустоту удаляет', editNote('agent-1', b.id, '  ') === 'removed');
ok('после удаления осталась одна', noteCount('agent-1') === 1);
ok('удаление несуществующей не падает', removeNote('agent-1', 'нет-такой') === false);
removeNote('agent-1', a.id);
ok('пустой список выкидывается из хранилища', !JSON.parse(store['valey-chat-notes'] || '{}')['agent-1']);

// --------------------------------------------------- the anchor survives growth
// The tail reply gets longer while the agent types. If the anchor were the text
// or its hash, the note would come loose while it was being read.
reset();
addNote('agent-1', 5000, 'к растущему ответу');
const growing = (text) => [{ role: 'assistant', ts: 5000, text }];
const one = splitNotes('agent-1', growing('Сводка'));
const two = splitNotes('agent-1', growing('Сводка — вторник, и дальше ещё много текста'));
ok('привязка держится, пока ответ растёт', one.byTs.get(5000).length === 1 && two.byTs.get(5000).length === 1);
ok('в сироты при этом не уходит', two.orphans.length === 0, two.orphans.length);

// ------------------------------------------------ the reply left the window
reset();
addNote('agent-1', 100, 'к старой реплике');
addNote('agent-1', 900, 'к свежей реплике');
const win = splitNotes('agent-1', [{ role: 'user', ts: 900, text: 'свежая' }]);
ok('заметка к видимой реплике осталась на месте', win.byTs.get(900).length === 1);
ok('заметка к уехавшей не потерялась', win.orphans.length === 1 && win.orphans[0].text === 'к старой реплике', win.orphans);
ok('всего заметок по-прежнему две', noteCount('agent-1') === 2);

// ------------------------------------------------------- broken storage
reset();
store['valey-chat-notes'] = '{это не json';
ok('битый json не роняет чтение', notesOf('agent-1').length === 0);
ok('битый json не роняет счётчик', noteCount('agent-1') === 0);
ok('поверх битого можно писать', addNote('agent-1', 1, 'заново') !== null);

// ----------------------------------------------------- a note with no anchor
reset();
const loose = addNote('agent-1', null, 'просто мысль');
const sp = splitNotes('agent-1', [{ role: 'user', ts: 42, text: 'что-то' }]);
ok('заметка без якоря идёт в общую кучу', sp.orphans.length === 1 && sp.orphans[0].id === loose.id);

// ------------------------------------------------- the context snapshot
// Sessions die and the notes remain: without a snapshot the shared list would
// keep a dangling id instead of the agent's name and what the person was reading.
reset();
const ctx = { agent: 'Тоня', project: 'carbonara-restaurant', title: 'Daily brief',
  quote: '  Сегодня   тебя нет — подтверждено\nс двух сторон  ' };
const withCtx = addNote('agent-1', 7, 'мысль', ctx);
ok('снимок сохранился', withCtx.ctx && withCtx.ctx.agent === 'Тоня', withCtx.ctx);
ok('в цитате схлопнуты пробелы и перенос', withCtx.ctx.quote === 'Сегодня тебя нет — подтверждено с двух сторон', withCtx.ctx.quote);
ok('длинная цитата обрезается', addNote('agent-1', 8, 'x', { quote: 'я'.repeat(300) }).ctx.quote.length === 120);
ok('без ctx заметка всё равно пишется', addNote('agent-2', 9, 'без контекста').ctx === undefined);

// ------------------------------------------------------- the shared list
reset();
addNote('agent-1', 1, 'первая', { project: 'alpha' });
addNote('agent-2', 2, 'вторая', { project: 'beta' });
addNote('agent-1', 3, 'третья', { project: 'alpha' });
const list = allNotes();
ok('в общий список попали все', list.length === 3, list.length);
ok('свежие сверху', list[0].text === 'третья', list.map((n) => n.text));
ok('agentId идёт рядом', list.every((n) => n.agentId), list[0]);
ok('заметки разных агентов не смешались', list.filter((n) => n.agentId === 'agent-1').length === 2);

// ------------------------------------------------- addresses beyond a session
//
// Since 5 September 2026 a note hangs on an address, and the core reads only
// its first segment: a key with no colon is a session, anything else belongs to
// whoever built it. What is checked here is exactly that border — the core must
// not start understanding somebody else's address, and must not lose a note
// whose owner is not installed.
reset();
const A = addr('commit', 'valey-core', '018e39d');
const B = addr('file', 'valey-core', 'f185691', 'web/main.js');
addNote(A, null, 'первая', { project: 'valey-core', line: 'коммит 018e39d · тема' });
addNote(B, null, 'вторая', { project: 'valey-core', line: 'файл web/main.js' });
addNote('sess-77', 5, 'третья', { project: 'valey-core' });
const mixed = allNotes();
ok('чужие адреса и сессия лежат в одном списке', mixed.length === 3, mixed.length);
ok('вид берётся из первого сегмента, а дальше ядро не читает',
  mixed.map((n) => n.anchor.kind).sort().join(',') === 'agent,commit,file',
  mixed.map((n) => n.anchor.kind));
const foreign = mixed.find((n) => n.anchor.kind === 'commit');
ok('части отданы как есть, без имён полей',
  Array.isArray(foreign.anchor.parts) && foreign.anchor.parts.join('|') === 'valey-core|018e39d', foreign.anchor);
ok('ядро не выдумывает полей вроде hash или path',
  foreign.anchor.hash === undefined && foreign.anchor.path === undefined, foreign.anchor);
const sess = mixed.find((n) => n.anchor.kind === 'agent');
ok('ключ без двоеточия — это сессия, и она осталась собой',
  sess.anchor.agent === 'sess-77' && sess.agentId === 'sess-77', sess.anchor);
ok('заметки достаются по своему адресу',
  notesOf(A).length === 1 && notesOf(B).length === 1 && notesOf(A)[0].text === 'первая');

// The line of context is written by the owner of the address; the core only
// keeps it and shows it. Without it a note on a foreign address would be
// unreadable in a build where that module is not installed at all.
ok('строка контекста сохранена как есть', foreign.ctx.line === 'коммит 018e39d · тема', foreign.ctx);
ok('ничего кроме неё из чужого снимка не осталось',
  foreign.ctx.hash === undefined && foreign.ctx.subject === undefined && foreign.ctx.path === undefined, foreign.ctx);

// A colon inside a part would break parsing if the parts were merely joined.
const weird = addr('poem', 'a:b', 'src/x:y.js');
addNote(weird, null, 'странный адрес');
const w = allNotes().find((n) => n.text === 'странный адрес');
ok('двоеточие внутри частей не сбивает разбор',
  w.anchor.kind === 'poem' && w.anchor.parts.join('|') === 'a:b|src/x:y.js', w.anchor);
ok('незнакомый вид не теряется и не притворяется сессией',
  w.anchor.kind === 'poem' && notesOf(weird).length === 1, w.anchor);

console.log(bad ? `\nупало проверок: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
