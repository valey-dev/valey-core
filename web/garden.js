// Оранжерея: что стало с горшком и что делает полив. Отдельным модулем ровно
// потому, что всё это — время, а время в тестах не подождёшь: часы сюда
// приходят числом, и «прошли сутки» пишется одной строкой.
//
// Правило одно и оно честное: состояние горшка — это время с последнего
// полива, и ничего больше. Никаких очков и никакого прогресса.
//
// Принятые кадры — Prod, секция «16 · Оранжерея на крыше»:
// https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=940-2

export const HOUR = 3600e3;
// Сохнет за восемнадцать часов: зашёл утром — застал вчерашнее политым, ушёл
// на сутки — вернулся к повешенным листьям.
export const DRY_AFTER = 18 * HOUR;
// Полить только что политое можно, но это не считается вторым днём. Иначе
// «три дня подряд» набиваются тремя нажатиями за минуту, и цветение перестаёт
// что-либо означать.
export const REWATER = 8 * HOUR;
export const BLOOM_AT = 3;
export const CAN_FULL = 4;

export const EMPTY = { wateredAt: 0, streak: 0 };

// dry — листья вниз, wet — политое, bloom — цветёт. Цветение держится, пока
// горшок не забыли: пересох — и оно кончилось вместе со счётом.
export function potState(pot, now) {
  const p = pot || EMPTY;
  if (!p.wateredAt || now - p.wateredAt > DRY_AFTER) return 'dry';
  return (p.streak || 0) >= BLOOM_AT ? 'bloom' : 'wet';
}

// Полив. Три случая, и они разные:
//   пересох      — счёт начинается заново;
//   только полит — воду принял, но день не засчитан;
//   пора         — засчитан.
export function water(pot, now) {
  const p = pot || EMPTY;
  const age = p.wateredAt ? now - p.wateredAt : Infinity;
  if (age > DRY_AFTER) return { wateredAt: now, streak: 1 };
  if (age < REWATER) return { wateredAt: now, streak: p.streak || 0 };
  return { wateredAt: now, streak: (p.streak || 0) + 1 };
}

// Сад целиком: сколько полито из скольких — это вторая строка таблички.
export function tally(garden, pots, now) {
  const g = (garden && garden.pots) || {};
  let wet = 0;
  for (const p of pots) if (potState(g[p.i], now) !== 'dry') wet++;
  return { wet, total: pots.length };
}
