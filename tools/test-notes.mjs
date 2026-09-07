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
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};
const reset = () => ls.clear();

// ------------------------------------------------------------ the life cycle
reset();
const a = addNote('agent-1', 1000, '  идея про экран входа  ');
ok('note registered', a && a.text === 'идея про экран входа', a);
ok('edge spaces are trimmed', a && a.text[0] === 'и');
ok('the counter saw one', noteCount('agent-1') === 1, noteCount('agent-1'));
ok('empty note is not written', addNote('agent-1', 1000, '   ') === null);
ok('the counter has not grown from being empty', noteCount('agent-1') === 1);

const b = addNote('agent-1', 2000, 'вторая');
ok('order - by creation time', notesOf('agent-1').map((n) => n.text).join(',') === 'идея про экран входа,вторая');
ok('someone else\'s agent is empty', noteCount('agent-2') === 0);

editNote('agent-1', a.id, 'поправленная мысль');
const after = notesOf('agent-1').find((n) => n.id === a.id);
ok('edit preserved', after.text === 'поправленная мысль', after.text);
ok('edit marked with time', typeof after.edited === 'number', after.edited);
ok('the anchor did not move during editing', after.ts === 1000, after.ts);

ok('editing into the void deletes', editNote('agent-1', b.id, '  ') === 'removed');
ok('after removal there was only one left', noteCount('agent-1') === 1);
ok('deleting a non-existent one does not crash', removeNote('agent-1', 'нет-такой') === false);
removeNote('agent-1', a.id);
ok('an empty list is thrown out of storage', !JSON.parse(store['valey-chat-notes'] || '{}')['agent-1']);

// --------------------------------------------------- the anchor survives growth
// The tail reply gets longer while the agent types. If the anchor were the text
// or its hash, the note would come loose while it was being read.
reset();
addNote('agent-1', 5000, 'к растущему ответу');
const growing = (text) => [{ role: 'assistant', ts: 5000, text }];
const one = splitNotes('agent-1', growing('Сводка'));
const two = splitNotes('agent-1', growing('Сводка — вторник, и дальше ещё много текста'));
ok('the binding holds as long as the response grows', one.byTs.get(5000).length === 1 && two.byTs.get(5000).length === 1);
ok('does not become an orphan', two.orphans.length === 0, two.orphans.length);

// ------------------------------------------------ the reply left the window
reset();
addNote('agent-1', 100, 'к старой реплике');
addNote('agent-1', 900, 'к свежей реплике');
const win = splitNotes('agent-1', [{ role: 'user', ts: 900, text: 'свежая' }]);
ok('the note to the visible replica remains in place', win.byTs.get(900).length === 1);
ok('the note to the one who left was not lost', win.orphans.length === 1 && win.orphans[0].text === 'к старой реплике', win.orphans);
ok('there are still two notes in total', noteCount('agent-1') === 2);

// ------------------------------------------------------- broken storage
reset();
store['valey-chat-notes'] = '{это не json';
ok('broken json does not drop reading', notesOf('agent-1').length === 0);
ok('broken json does not drop the counter', noteCount('agent-1') === 0);
ok('you can write on top of the broken', addNote('agent-1', 1, 'заново') !== null);

// ----------------------------------------------------- a note with no anchor
reset();
const loose = addNote('agent-1', null, 'просто мысль');
const sp = splitNotes('agent-1', [{ role: 'user', ts: 42, text: 'что-то' }]);
ok('a note without an anchor goes into the general heap', sp.orphans.length === 1 && sp.orphans[0].id === loose.id);

// ------------------------------------------------- the context snapshot
// Sessions die and the notes remain: without a snapshot the shared list would
// keep a dangling id instead of the agent's name and what the person was reading.
reset();
const ctx = { agent: 'Тоня', project: 'carbonara-restaurant', title: 'Daily brief',
  quote: '  Сегодня   тебя нет — подтверждено\nс двух сторон  ' };
const withCtx = addNote('agent-1', 7, 'мысль', ctx);
ok('the photo was saved', withCtx.ctx && withCtx.ctx.agent === 'Тоня', withCtx.ctx);
ok('the quote has collapsed spaces and hyphenation', withCtx.ctx.quote === 'Сегодня тебя нет — подтверждено с двух сторон', withCtx.ctx.quote);
ok('long quote is cut off', addNote('agent-1', 8, 'x', { quote: 'я'.repeat(300) }).ctx.quote.length === 120);
ok('without ctx the note is still written', addNote('agent-2', 9, 'без контекста').ctx === undefined);

// ------------------------------------------------------- the shared list
reset();
addNote('agent-1', 1, 'первая', { project: 'alpha' });
addNote('agent-2', 2, 'вторая', { project: 'beta' });
addNote('agent-1', 3, 'третья', { project: 'alpha' });
const list = allNotes();
ok('All included in the general list', list.length === 3, list.length);
ok('fresh on top', list[0].text === 'третья', list.map((n) => n.text));
ok('agentId is nearby', list.every((n) => n.agentId), list[0]);
ok('notes from different agents are not mixed', list.filter((n) => n.agentId === 'agent-1').length === 2);

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
ok('other people\'s addresses and session are in the same list', mixed.length === 3, mixed.length);
ok('the view is taken from the first segment, and then the kernel does not read',
  mixed.map((n) => n.anchor.kind).sort().join(',') === 'agent,commit,file',
  mixed.map((n) => n.anchor.kind));
const foreign = mixed.find((n) => n.anchor.kind === 'commit');
ok('parts are given as is, without field names',
  Array.isArray(foreign.anchor.parts) && foreign.anchor.parts.join('|') === 'valey-core|018e39d', foreign.anchor);
ok('the kernel doesn\'t invent fields like hash or path',
  foreign.anchor.hash === undefined && foreign.anchor.path === undefined, foreign.anchor);
const sess = mixed.find((n) => n.anchor.kind === 'agent');
ok('the key without a colon is a session, and it remains itself',
  sess.anchor.agent === 'sess-77' && sess.agentId === 'sess-77', sess.anchor);
ok('notes are delivered to your address',
  notesOf(A).length === 1 && notesOf(B).length === 1 && notesOf(A)[0].text === 'первая');

// The line of context is written by the owner of the address; the core only
// keeps it and shows it. Without it a note on a foreign address would be
// unreadable in a build where that module is not installed at all.
ok('context string saved as is', foreign.ctx.line === 'коммит 018e39d · тема', foreign.ctx);
ok('there was nothing left but her from someone else’s photo',
  foreign.ctx.hash === undefined && foreign.ctx.subject === undefined && foreign.ctx.path === undefined, foreign.ctx);

// A colon inside a part would break parsing if the parts were merely joined.
const weird = addr('poem', 'a:b', 'src/x:y.js');
addNote(weird, null, 'странный адрес');
const w = allNotes().find((n) => n.text === 'странный адрес');
ok('colon inside parts does not confuse parsing',
  w.anchor.kind === 'poem' && w.anchor.parts.join('|') === 'a:b|src/x:y.js', w.anchor);
ok('an unfamiliar species does not get lost and does not pretend to be a session',
  w.anchor.kind === 'poem' && notesOf(weird).length === 1, w.anchor);

console.log(bad ? `\nfailed checks: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
