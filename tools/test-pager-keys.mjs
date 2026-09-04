// node tools/test-pager-keys.mjs — пейджер: звонок, отсрочка, возврат.
//
// DOM подставной, как и в остальных клавиатурных стендах: вёрстка тут ни при
// чём, проверяется поведение — кому звонят, что происходит по Enter и Esc, и
// переживает ли отложенный запрос то, что его ответили в другом месте.
//
// Отдельно проверяется звук: пейджер — единственное, что зовёт к экрану, и
// звонить он должен ровно один раз на запрос. Пейджер, зовущий повторно, —
// это будильник.
// Импорт динамический и не просто так: sound.js читает localStorage прямо при
// загрузке, а pager.js тянет его за собой. Статический import выполнился бы
// раньше подставок ниже и упал бы на пустом месте.

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

// --------------------------------------------------------------- подставной DOM
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

// Звук считаем, а не слушаем: важно сколько раз позвали, а не как это звучит.
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

// ------------------------------------------------------------------ звонок
seePermits([P('a', 's1')]);
ok('пейджер выехал', pagerOpen(), pager.hidden);
ok('и позвонил один раз', beeps === 1, beeps);
ok('на экране команда просящего', pager.innerHTML.includes('git push') && pager.innerHTML.includes('ТОНЯ'), pager.innerHTML.slice(0, 80));

// Тот же список пришёл снова — снимок ходит раз в 2.5 секунды, и каждый из них
// не повод звонить.
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

// Отложенный не звонит на каждом снимке — иначе «перезвоню» ничего не значит.
seePermits([P('b', 's1', 'npm publish')]);
ok('отложенный молчит и не показывается', beeps === 1 && !pagerOpen(), { beeps, hidden: pager.hidden });

// --------------------------------------------------------------------- H
ok('H возвращает пейджер', recall() === true, null);
ok('и он снова на экране', pagerOpen(), pager.hidden);
ok('счётчик обнулился', waitingCount() === 0, waitingCount());
ok('возвращать нечего — H не тратится', recall() === false, null);

// --------------------------------------------------- второй просит, пока ждёт первый
beeps = 0;
seePermits([P('b', 's1', 'npm publish'), P('c', 's2', 'rm -rf tmp')]);
ok('первым показан тот, кто спросил первым', pager.innerHTML.includes('ТОНЯ'), pager.innerHTML.slice(0, 60));
ok('и видно, что он не один', pager.innerHTML.includes('1/2'), pager.innerHTML.slice(0, 200));
// Первый из этих двоих звонил ещё до отсрочки и из списка не уходил: один
// сигнал на вопрос считается по вопросу, а не по появлению его на экране.
ok('уже звонивший не звонит снова', beeps === 0, beeps);

pagerKey('Escape');                                   // отложили первого
ok('следующий выходит сам', pagerOpen() && pager.innerHTML.includes('ПЁТР'), pager.innerHTML.slice(0, 60));
// Очередь сдвинулась не снимком, а руками — и всё равно звонит: иначе
// «пищит через раз, смотря откуда пришло».
ok('и звонит, потому что его ещё не звали', beeps === 1, beeps);

// ------------------------------------------- ответили в другом месте
// Запрос ушёл из списка, пока лежал отложенным: ответили с другой вкладки или
// он истёк. Счётчик обязан это заметить, иначе в шапке остаётся вечное «1».
seePermits([P('c', 's2', 'rm -rf tmp')]);
ok('исчезнувший отложенный уходит из счётчика', waitingCount() === 0, waitingCount());

// А если он вернётся с тем же id — это тот же вопрос, и звонить снова незачем
// до тех пор, пока он не исчезал: rung чистится только вместе со списком.
seePermits([]);
ok('пустой список гасит пейджер', !pagerOpen(), pager.hidden);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
