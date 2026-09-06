// node tools/test-standup.mjs — the standup panel's two decisions.
//
// The markup is not judged here; two pure functions are, because both of them
// break silently and neither shows up in a screenshot taken at a good moment.
//
// **standupTeams** decides the order. A board that reshuffles itself every two
// seconds is unreadable, and the office refreshes at exactly that rate — so the
// teams stand where their rooms stand on the floor, and inside a team only one
// thing moves anybody: waiting for you.
//
// **standupCard** decides what stands where the task should be when the agent
// never named one. It has to say "no report" rather than borrow a sentence and
// pass it off as a task: the task is the only reason this panel exists.
import { installDom, node } from './lib/dom.mjs';

installDom({ byId: { roster: node(), dialog: node(), viewer: node(), bag: node(), toasts: node() } });
const UI = await import('../web/ui.js');
const { setLang } = await import('../web/i18n.js');
setLang('ru');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, got === undefined ? '' : '→ ' + JSON.stringify(got)); }
};

const agent = (o) => ({
  id: o.id, name: o.name || o.id, project: o.project || 'p', seat: o.seat || 0,
  status: o.status || 'working', idleFor: o.idleFor == null ? 10 : o.idleFor,
  title: o.title || '', lastSaid: o.lastSaid || '', task: o.task || null, roleKey: 'code',
  act: { key: 'edit', arg: 'ui.js' },
});
const names = (teams) => teams.map((t) => [t.project, t.list.map((a) => a.id)]);

// ------------------------------------------------------------- the order

const floor = [{ key: 'zebra' }, { key: 'alpha' }];   // rooms as the layout put them
const cast = [
  agent({ id: 'a1', project: 'alpha' }),
  agent({ id: 'z1', project: 'zebra' }),
  agent({ id: 'n1', project: 'nomad' }),             // a project with no room yet
];
ok('команды идут в порядке комнат на этаже, а не по алфавиту',
  UI.standupTeams(cast, floor).map((t) => t.project).join(',') === 'zebra,alpha,nomad',
  UI.standupTeams(cast, floor).map((t) => t.project));
ok('проект без комнаты уходит в конец, а не пропадает',
  UI.standupTeams(cast, floor).length === 3, names(UI.standupTeams(cast, floor)));
ok('без раскладки вовсе — по алфавиту, и это тоже порядок',
  UI.standupTeams(cast, []).map((t) => t.project).join(',') === 'alpha,nomad,zebra',
  UI.standupTeams(cast, []).map((t) => t.project));

// Inside a team the seat decides — it belongs to the session and does not move
// between snapshots. Sorting by name or by the last word said would reshuffle
// the column under a reading person.
const team = [
  agent({ id: 'third', project: 'p', seat: 3 }),
  agent({ id: 'first', project: 'p', seat: 1 }),
  agent({ id: 'second', project: 'p', seat: 2 }),
];
ok('внутри команды порядок по местам за столами',
  UI.standupTeams(team, [])[0].list.map((a) => a.id).join(',') === 'first,second,third',
  UI.standupTeams(team, [])[0].list.map((a) => a.id));

const mixed = [
  agent({ id: 'works', project: 'p', seat: 1, status: 'working' }),
  agent({ id: 'idles', project: 'p', seat: 2, status: 'idle' }),
  agent({ id: 'waits', project: 'p', seat: 3, status: 'awaiting' }),
];
ok('ждущий поднимается наверх, остальные держат места',
  UI.standupTeams(mixed, [])[0].list.map((a) => a.id).join(',') === 'waits,works,idles',
  UI.standupTeams(mixed, [])[0].list.map((a) => a.id));
ok('и счётчик ждущих у команды свой', UI.standupTeams(mixed, [])[0].waiting === 1);

// ------------------------------------------------------------- the card

const reported = UI.standupCard(agent({
  id: 'r', status: 'working',
  task: { what: 'Планёрка: колонки по командам', status: 'код пишется', need: '' },
}));
ok('задача берётся из хвоста отчёта', reported.task === 'Планёрка: колонки по командам', reported);
ok('и помечена как настоящая', reported.reported === true && reported.cold === false, reported);
ok('у работающего под задачей стоит, чем он занят сейчас', reported.now !== '', reported.now);
ok('статус из отчёта доехал', reported.status === 'код пишется', reported.status);

const silent = UI.standupCard(agent({ id: 's', status: 'idle', idleFor: 300, title: 'Отладка курсов', lastSaid: 'посмотрю' }));
ok('без хвоста вместо задачи имя чата', silent.task === 'Отладка курсов', silent);
ok('и это честно названо не задачей', silent.reported === false, silent);
ok('такая строка приглушена сразу, а не через час', silent.cold === true, silent);
ok('и статуса у неё нет — выдумывать его неоткуда', silent.status === '' && silent.need === '', silent);

const nothing = UI.standupCard(agent({ id: 'n', status: 'idle', lastSaid: 'просто реплика' }));
ok('нет и имени чата — берётся последняя реплика', nothing.task === 'просто реплика', nothing);

// An hour of silence is the line: what was said before it is no longer "now".
// A working agent never goes cold, however long the task has been named — he is
// visibly doing it.
const hour = { what: 'Импорт выписки', status: 'готово', need: '' };
ok('задача остывает через час молчания',
  UI.standupCard(agent({ id: 'c', status: 'idle', idleFor: 3601, task: hour })).cold === true);
ok('и не остывает раньше',
  UI.standupCard(agent({ id: 'c', status: 'idle', idleFor: 3599, task: hour })).cold === false);
ok('у работающего не остывает вовсе',
  UI.standupCard(agent({ id: 'c', status: 'working', idleFor: 999999, task: hour })).cold === false);

// «Что нужно от меня» is the flag on the card, and «Ничего» must not raise it —
// the server already empties that field, and the panel must not invent one.
ok('⚑ поднимается только когда в отчёте есть нужда',
  UI.standupCard(agent({ id: 'f', task: { what: 'x', status: '', need: 'подтвердить мерж' } })).need === 'подтвердить мерж'
  && UI.standupCard(agent({ id: 'f', task: { what: 'x', status: '', need: '' } })).need === '');

// States: the card's stripe and its token are chosen from this one word.
ok('состояние карточки — ждёт, работает, отошёл',
  UI.standupCard(agent({ id: 'w', status: 'awaiting' })).state === 'wait'
  && UI.standupCard(agent({ id: 'w', status: 'working' })).state === 'work'
  && UI.standupCard(agent({ id: 'w', status: 'idle' })).state === 'idle');

console.log(bad ? `\nПЛОХО: ${bad}` : '\nвсё сошлось');
process.exit(bad ? 1 : 0);
