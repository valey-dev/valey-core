// node tools/test-pager-keys.mjs — the pager: the ring, the deferral, the return.
//
// The DOM is a stand-in, as in every keyboard stand: the layout has nothing to do
// with it, what is checked is the behaviour — who gets called, what Enter and Esc
// do, and whether a deferred request survives being answered somewhere else.
//
// The sound is checked separately: the pager is the only thing that calls you to
// the screen, and it must ring exactly once per request. A pager that rings again
// is an alarm clock.
// The import is dynamic for a reason: sound.js reads localStorage right at load
// time, and pager.js pulls it in. A static import would run before the stand-ins
// below and fail over nothing.

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

// --------------------------------------------------------------- the stand-in DOM
const buttons = new Map();
const pager = {
  hidden: true, innerHTML: '',
  querySelector: () => null,
};
globalThis.document = {
  documentElement: {},
  querySelector: (sel) => {
    if (sel === '#pager') return pager;
    if (sel === '#pAnswer' || sel === '#pLater') {
      if (!buttons.has(sel)) buttons.set(sel, { onclick: null });
      return buttons.get(sel);
    }
    return null;
  },
};

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// The sound is counted, not listened to: what matters is how many times it called, not how it sounded.
let beeps = 0;
const { sound } = await import('../web/sound.js');
sound.pager = () => { beeps += 1; };

const { initPager, seePermits, pagerKey, recall, waitingCount, pagerOpen, forgetPermit } =
  await import('../web/pager.js');

const state = { permits: [], agents: [{ id: 's1', name: 'Тоня' }, { id: 's2', name: 'Пётр' }], soundOn: true };
const opened = [];
const toasts = [];
let hudTicks = 0;
initPager(state, {
  openPermit: (p) => opened.push(p.id),
  toast: (text, kind) => toasts.push({ text, kind }),
  hudChanged: () => { hudTicks += 1; },
});

const P = (id, agentId, command = 'git push') => ({
  id, agentId, tool: 'Bash', command, description: 'Push the branch',
  rule: 'Bash(git push *)', at: Date.now(), until: Date.now() + 60000,
});

// ------------------------------------------------------------------ the ring
seePermits([P('a', 's1')]);
ok('пейджер выехал', pagerOpen(), pager.hidden);
ok('и позвонил один раз', beeps === 1, beeps);
ok('на экране команда просящего', pager.innerHTML.includes('git push') && pager.innerHTML.includes('ТОНЯ'), pager.innerHTML.slice(0, 80));

// The same list arrived again — the snapshot goes out every 2.5 seconds, and
// none of them is a reason to ring.
seePermits([P('a', 's1')]);
ok('повторный снимок не звонит второй раз', beeps === 1, beeps);

// ------------------------------------------------------------------- Enter
ok('Enter отвечает', pagerKey('Enter') === true, null);
ok('и открывает карточку того, кто спросил', opened.length === 1 && opened[0] === 'a', opened);
ok('пейджер уехал — вопрос теперь в карточке', !pagerOpen(), pager.hidden);
ok('закрытый пейджер клавиш не берёт', pagerKey('Enter') === false, null);

// -------------------------------------------------------------------- Esc
forgetPermit('a');
beeps = 0;
seePermits([P('b', 's1', 'npm publish')]);
ok('новый запрос — новый звонок', beeps === 1 && pagerOpen(), { beeps, hidden: pager.hidden });
ok('Esc откладывает', pagerKey('Escape') === true, null);
ok('и пейджер уезжает', !pagerOpen(), pager.hidden);
ok('в шапке остаётся счётчик', waitingCount() === 1, waitingCount());
ok('шапку попросили перерисоваться', hudTicks === 1, hudTicks);
ok('и сказали словами, кто ждёт', toasts.length === 1 && toasts[0].text.includes('Тоня'), toasts);

// A deferred one does not ring on every snapshot — otherwise "later" means nothing.
seePermits([P('b', 's1', 'npm publish')]);
ok('отложенный молчит и не показывается', beeps === 1 && !pagerOpen(), { beeps, hidden: pager.hidden });

// --------------------------------------------------------------------- H
ok('H возвращает пейджер', recall() === true, null);
ok('и он снова на экране', pagerOpen(), pager.hidden);
ok('счётчик обнулился', waitingCount() === 0, waitingCount());
ok('возвращать нечего — H не тратится', recall() === false, null);

// --------------------------------------------------- a second asks while the first waits
beeps = 0;
seePermits([P('b', 's1', 'npm publish'), P('c', 's2', 'rm -rf tmp')]);
ok('первым показан тот, кто спросил первым', pager.innerHTML.includes('ТОНЯ'), pager.innerHTML.slice(0, 60));
ok('и видно, что он не один', pager.innerHTML.includes('1/2'), pager.innerHTML.slice(0, 200));
// The first of these two rang before the deferral and never left the list: one
// signal per question is counted by the question, not by its appearing on screen.
ok('уже звонивший не звонит снова', beeps === 0, beeps);

pagerKey('Escape');                                   // the first one was deferred
ok('следующий выходит сам', pagerOpen() && pager.innerHTML.includes('ПЁТР'), pager.innerHTML.slice(0, 60));
// The queue moved by hand rather than by a snapshot — and it still rings:
// otherwise it "beeps every other time, depending on where it came from".
ok('и звонит, потому что его ещё не звали', beeps === 1, beeps);

// ------------------------------------------- answered somewhere else
// The request left the list while it lay deferred: it was answered from another
// tab, or it expired. The counter has to notice, or an eternal "1" stays in the
// header.
seePermits([P('c', 's2', 'rm -rf tmp')]);
ok('исчезнувший отложенный уходит из счётчика', waitingCount() === 0, waitingCount());

// And if it comes back with the same id, it is the same question, and there is no
// point ringing again until it has disappeared: rung is cleared only along with
// the list.
seePermits([]);
ok('пустой список гасит пейджер', !pagerOpen(), pager.hidden);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
