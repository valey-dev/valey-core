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
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + JSON.stringify(got)); }
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
ok('teams go in order of rooms on the floor, not alphabetically',
  UI.standupTeams(cast, floor).map((t) => t.project).join(',') === 'zebra,alpha,nomad',
  UI.standupTeams(cast, floor).map((t) => t.project));
ok('a project without a room goes to the end, not disappears',
  UI.standupTeams(cast, floor).length === 3, names(UI.standupTeams(cast, floor)));
ok('no layout at all - alphabetical, and this is also the order',
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
ok('within the team, order by place at the tables',
  UI.standupTeams(team, [])[0].list.map((a) => a.id).join(',') === 'first,second,third',
  UI.standupTeams(team, [])[0].list.map((a) => a.id));

const mixed = [
  agent({ id: 'works', project: 'p', seat: 1, status: 'working' }),
  agent({ id: 'idles', project: 'p', seat: 2, status: 'idle' }),
  agent({ id: 'waits', project: 'p', seat: 3, status: 'awaiting' }),
];
ok('the person waiting goes upstairs, the rest keep their seats',
  UI.standupTeams(mixed, [])[0].list.map((a) => a.id).join(',') === 'waits,works,idles',
  UI.standupTeams(mixed, [])[0].list.map((a) => a.id));
ok('and the team has its own counter of those waiting', UI.standupTeams(mixed, [])[0].waiting === 1);

// A stopped agent will not go on until somebody says so: second after the
// waiting ones, and not counted among them.
const withStopped = [...mixed, agent({ id: 'stops', project: 'p', seat: 4, status: 'stopped' })];
ok('the stopped come right after those waiting',
  UI.standupTeams(withStopped, [])[0].list.map((a) => a.id).join(',') === 'waits,stops,works,idles',
  UI.standupTeams(withStopped, [])[0].list.map((a) => a.id));
ok('…and are not counted as waiting', UI.standupTeams(withStopped, [])[0].waiting === 1);

// ------------------------------------------------------------- the card

const reported = UI.standupCard(agent({
  id: 'r', status: 'working',
  task: { what: 'Планёрка: колонки по командам', status: 'код пишется', need: '' },
}));
ok('the task is taken from the tail of the report', reported.task === 'Планёрка: колонки по командам', reported);
ok('and marked as real', reported.reported === true && reported.cold === false, reported);
ok('the person working has a task to determine what he is doing now', reported.now !== '', reported.now);
ok('status from the report arrived', reported.status === 'код пишется', reported.status);

const silent = UI.standupCard(agent({ id: 's', status: 'idle', idleFor: 300, title: 'Отладка курсов', lastSaid: 'посмотрю' }));
ok('without a tail instead of a task chat name', silent.task === 'Отладка курсов', silent);
ok('and this is honestly called not a task', silent.reported === false, silent);
ok('this line is muted immediately, not after an hour', silent.cold === true, silent);
ok('and she has no status - there’s nowhere to invent it from', silent.status === '' && silent.need === '', silent);

const nothing = UI.standupCard(agent({ id: 'n', status: 'idle', lastSaid: 'просто реплика' }));
ok('there is no chat name - the last replica is taken', nothing.task === 'просто реплика', nothing);

// An hour of silence is the line: what was said before it is no longer "now".
// A working agent never goes cold, however long the task has been named — he is
// visibly doing it.
const hour = { what: 'Импорт выписки', status: 'готово', need: '' };
ok('the task cools down after an hour of silence',
  UI.standupCard(agent({ id: 'c', status: 'idle', idleFor: 3601, task: hour })).cold === true);
ok('and doesn\'t cool down before',
  UI.standupCard(agent({ id: 'c', status: 'idle', idleFor: 3599, task: hour })).cold === false);
ok('the worker does not cool down at all',
  UI.standupCard(agent({ id: 'c', status: 'working', idleFor: 999999, task: hour })).cold === false);

// «Что нужно от меня» is the flag on the card, and «Ничего» must not raise it —
// the server already empties that field, and the panel must not invent one.
ok('⚑ raised only when there is a need for a report',
  UI.standupCard(agent({ id: 'f', task: { what: 'x', status: '', need: 'подтвердить мерж' } })).need === 'подтвердить мерж'
  && UI.standupCard(agent({ id: 'f', task: { what: 'x', status: '', need: '' } })).need === '');

// States: the card's stripe and its token are chosen from this one word.
ok('card status - waiting, working, gone',
  UI.standupCard(agent({ id: 'w', status: 'awaiting' })).state === 'wait'
  && UI.standupCard(agent({ id: 'w', status: 'working' })).state === 'work'
  && UI.standupCard(agent({ id: 'w', status: 'idle' })).state === 'idle'
  && UI.standupCard(agent({ id: 'w', status: 'stopped' })).state === 'stop');
const cutOff = { ...agent({ id: 'w', status: 'stopped' }), act: { key: 'stoppedAt', arg: 'web/ui.js' } };
ok('a stopped card says where it stopped', UI.standupCard(cutOff).now.includes('web/ui.js'), UI.standupCard(cutOff).now);

console.log(bad ? `\nFAILED: ${bad}` : '\nall matched');
process.exit(bad ? 1 : 0);
