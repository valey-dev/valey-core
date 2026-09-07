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
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
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
ok('pager went off', pagerOpen(), pager.hidden);
ok('and called once', beeps === 1, beeps);
ok('the requester\'s command appears on the screen', pager.innerHTML.includes('git push') && pager.innerHTML.includes('ТОНЯ'), pager.innerHTML.slice(0, 80));

// The same list arrived again — the snapshot goes out every 2.5 seconds, and
// none of them is a reason to ring.
seePermits([P('a', 's1')]);
ok('re-shot doesn\'t ring a second time', beeps === 1, beeps);

// ------------------------------------------------------------------- Enter
ok('Enter answers', pagerKey('Enter') === true, null);
ok('and opens the card of the one who asked', opened.length === 1 && opened[0] === 'a', opened);
ok('the pager has left - the question is now on the card', !pagerOpen(), pager.hidden);
ok('the closed pager does not accept keys', pagerKey('Enter') === false, null);

// -------------------------------------------------------------------- Esc
forgetPermit('a');
beeps = 0;
seePermits([P('b', 's1', 'npm publish')]);
ok('new request - new call', beeps === 1 && pagerOpen(), { beeps, hidden: pager.hidden });
ok('Esc postpone', pagerKey('Escape') === true, null);
ok('and the pager goes away', !pagerOpen(), pager.hidden);
ok('the counter remains in the header', waitingCount() === 1, waitingCount());
ok('the hat was asked to be redrawn', hudTicks === 1, hudTicks);
ok('and said in words who is waiting', toasts.length === 1 && toasts[0].text.includes('Тоня'), toasts);

// A deferred one does not ring on every snapshot — otherwise "later" means nothing.
seePermits([P('b', 's1', 'npm publish')]);
ok('deferred is silent and does not appear', beeps === 1 && !pagerOpen(), { beeps, hidden: pager.hidden });

// --------------------------------------------------------------------- H
ok('H returns pager', recall() === true, null);
ok('and he\'s on the screen again', pagerOpen(), pager.hidden);
ok('the counter has reset to zero', waitingCount() === 0, waitingCount());
ok('there is nothing to return - H is not spent', recall() === false, null);

// --------------------------------------------------- a second asks while the first waits
beeps = 0;
seePermits([P('b', 's1', 'npm publish'), P('c', 's2', 'rm -rf tmp')]);
ok('The one who asked first is shown first', pager.innerHTML.includes('ТОНЯ'), pager.innerHTML.slice(0, 60));
ok('and it\'s clear that he\'s not alone', pager.innerHTML.includes('1/2'), pager.innerHTML.slice(0, 200));
// The first of these two rang before the deferral and never left the list: one
// signal per question is counted by the question, not by its appearing on screen.
ok('already called does not call again', beeps === 0, beeps);

pagerKey('Escape');                                   // the first one was deferred
ok('the next one comes out on its own', pagerOpen() && pager.innerHTML.includes('ПЁТР'), pager.innerHTML.slice(0, 60));
// The queue moved by hand rather than by a snapshot — and it still rings:
// otherwise it "beeps every other time, depending on where it came from".
ok('and calls because he hasn’t been called yet', beeps === 1, beeps);

// ------------------------------------------- answered somewhere else
// The request left the list while it lay deferred: it was answered from another
// tab, or it expired. The counter has to notice, or an eternal "1" stays in the
// header.
seePermits([P('c', 's2', 'rm -rf tmp')]);
ok('disappeared deferred leaves the counter', waitingCount() === 0, waitingCount());

// And if it comes back with the same id, it is the same question, and there is no
// point ringing again until it has disappeared: rung is cleared only along with
// the list.
seePermits([]);
ok('empty list turns off the pager', !pagerOpen(), pager.hidden);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
