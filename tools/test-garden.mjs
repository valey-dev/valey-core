// node tools/test-garden.mjs — оранжерея: сохнет ли горшок и что считает полив.
// Часы здесь числом, поэтому «прошли сутки» проверяется мгновенно, а не сутки.
import { potState, water, tally, HOUR, DRY_AFTER, REWATER, BLOOM_AT, CAN_FULL, EMPTY } from '../web/garden.js';

let failed = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { failed++; console.log('ПЛОХО |', name, '→', got); }
};

const T0 = 1_700_000_000_000;

// ---- пустой горшок сухой, и это не ошибка, а начальное состояние
ok('горшок без истории — сухой', potState(undefined, T0) === 'dry', potState(undefined, T0));
ok('EMPTY тоже сухой', potState(EMPTY, T0) === 'dry', potState(EMPTY, T0));

// ---- полив и высыхание
const justWatered = water(undefined, T0);
ok('политый — политый', potState(justWatered, T0) === 'wet', potState(justWatered, T0));
ok('через 17 часов ещё политый', potState(justWatered, T0 + 17 * HOUR) === 'wet');
ok('через 19 часов уже сухой', potState(justWatered, T0 + 19 * HOUR) === 'dry');
ok('ровно на границе ещё держится', potState(justWatered, T0 + DRY_AFTER) === 'wet');

// ---- счёт дней: три подряд дают цветение
let p = water(undefined, T0);
ok('первый полив — счёт 1', p.streak === 1, p.streak);
p = water(p, T0 + 10 * HOUR);
ok('второй через десять часов — счёт 2', p.streak === 2, p.streak);
ok('но ещё не цветёт', potState(p, T0 + 10 * HOUR) === 'wet', potState(p, T0 + 10 * HOUR));
p = water(p, T0 + 20 * HOUR);
ok('третий — счёт 3', p.streak === BLOOM_AT, p.streak);
ok('и вот теперь цветёт', potState(p, T0 + 20 * HOUR) === 'bloom', potState(p, T0 + 20 * HOUR));

// ---- цветение держится, пока поливают, и кончается вместе с засухой
ok('цветёт и через 17 часов', potState(p, T0 + 37 * HOUR) === 'bloom');
ok('пересохло — цветение кончилось', potState(p, T0 + 40 * HOUR) === 'dry');
const after = water(p, T0 + 40 * HOUR);
ok('после засухи счёт начинается заново', after.streak === 1, after.streak);

// ---- «три нажатия за минуту» не считаются тремя днями
let spam = water(undefined, T0);
for (let i = 1; i <= 5; i++) spam = water(spam, T0 + i * 1000);
ok('пять поливов подряд — счёт всё ещё 1', spam.streak === 1, spam.streak);
ok('и цветения нет', potState(spam, T0 + 6000) === 'wet', potState(spam, T0 + 6000));
// но воду горшок принял: время последнего полива подвинулось
ok('время полива обновилось', spam.wateredAt === T0 + 5000, spam.wateredAt);

// ---- граница «пора поливать»
const due = water(water(undefined, T0), T0 + REWATER);
ok('ровно через восемь часов день засчитан', due.streak === 2, due.streak);
const early = water(water(undefined, T0), T0 + REWATER - 1000);
ok('за секунду до — не засчитан', early.streak === 1, early.streak);

// ---- табличка над дверью
const pots = [{ i: 0 }, { i: 1 }, { i: 2 }];
const g = { pots: { 0: water(undefined, T0), 1: water(undefined, T0 - 40 * HOUR) } };
const t = tally(g, pots, T0);
ok('полито 1 из 3', t.wet === 1 && t.total === 3, JSON.stringify(t));
ok('пустой сад — ноль из трёх', tally(null, pots, T0).wet === 0);

ok('в лейке четыре полива', CAN_FULL === 4, CAN_FULL);

console.log(failed ? `\nпровалено: ${failed}` : '\nвсё сошлось');
process.exit(failed ? 1 : 0);
