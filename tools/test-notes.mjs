// node tools/test-notes.mjs — заметки к репликам, без браузера.
//
// Проверяется не вёрстка, а то, что ломается тихо: переживает ли заметка рост
// хвостовой реплики, не пропадает ли, когда её сообщение уехало за окно, и что
// остаётся в хранилище после правок. Всё это чистая логика над localStorage.

let store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const { notesOf, noteCount, addNote, editNote, removeNote, splitNotes, allNotes } =
  await import('../web/notes.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};
const reset = () => { store = {}; };

// ------------------------------------------------------------ круг жизни
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

// --------------------------------------------------- якорь переживает рост
// Хвостовая реплика удлиняется, пока агент печатает. Если бы якорем был текст
// или его хеш, заметка отвязалась бы прямо во время чтения.
reset();
addNote('agent-1', 5000, 'к растущему ответу');
const growing = (text) => [{ role: 'assistant', ts: 5000, text }];
const one = splitNotes('agent-1', growing('Сводка'));
const two = splitNotes('agent-1', growing('Сводка — вторник, и дальше ещё много текста'));
ok('привязка держится, пока ответ растёт', one.byTs.get(5000).length === 1 && two.byTs.get(5000).length === 1);
ok('в сироты при этом не уходит', two.orphans.length === 0, two.orphans.length);

// ------------------------------------------------ реплика уехала за окно
reset();
addNote('agent-1', 100, 'к старой реплике');
addNote('agent-1', 900, 'к свежей реплике');
const win = splitNotes('agent-1', [{ role: 'user', ts: 900, text: 'свежая' }]);
ok('заметка к видимой реплике осталась на месте', win.byTs.get(900).length === 1);
ok('заметка к уехавшей не потерялась', win.orphans.length === 1 && win.orphans[0].text === 'к старой реплике', win.orphans);
ok('всего заметок по-прежнему две', noteCount('agent-1') === 2);

// ------------------------------------------------------- битое хранилище
reset();
store['valey-chat-notes'] = '{это не json';
ok('битый json не роняет чтение', notesOf('agent-1').length === 0);
ok('битый json не роняет счётчик', noteCount('agent-1') === 0);
ok('поверх битого можно писать', addNote('agent-1', 1, 'заново') !== null);

// ----------------------------------------------------- заметка без якоря
reset();
const loose = addNote('agent-1', null, 'просто мысль');
const sp = splitNotes('agent-1', [{ role: 'user', ts: 42, text: 'что-то' }]);
ok('заметка без якоря идёт в общую кучу', sp.orphans.length === 1 && sp.orphans[0].id === loose.id);

// ------------------------------------------------- снимок контекста
// Сессии умирают, а заметки остаются: без снимка в общем списке останется
// висящий id вместо имени агента и того, что человек читал.
reset();
const ctx = { agent: 'Тоня', project: 'carbonara-restaurant', title: 'Daily brief',
  quote: '  Сегодня   тебя нет — подтверждено\nс двух сторон  ' };
const withCtx = addNote('agent-1', 7, 'мысль', ctx);
ok('снимок сохранился', withCtx.ctx && withCtx.ctx.agent === 'Тоня', withCtx.ctx);
ok('в цитате схлопнуты пробелы и перенос', withCtx.ctx.quote === 'Сегодня тебя нет — подтверждено с двух сторон', withCtx.ctx.quote);
ok('длинная цитата обрезается', addNote('agent-1', 8, 'x', { quote: 'я'.repeat(300) }).ctx.quote.length === 120);
ok('без ctx заметка всё равно пишется', addNote('agent-2', 9, 'без контекста').ctx === undefined);

// ------------------------------------------------------- общий список
reset();
addNote('agent-1', 1, 'первая', { project: 'alpha' });
addNote('agent-2', 2, 'вторая', { project: 'beta' });
addNote('agent-1', 3, 'третья', { project: 'alpha' });
const list = allNotes();
ok('в общий список попали все', list.length === 3, list.length);
ok('свежие сверху', list[0].text === 'третья', list.map((n) => n.text));
ok('agentId идёт рядом', list.every((n) => n.agentId), list[0]);
ok('заметки разных агентов не смешались', list.filter((n) => n.agentId === 'agent-1').length === 2);

console.log(bad ? `\nупало проверок: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
