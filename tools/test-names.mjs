// node tools/test-names.mjs — выдача имён агентам и род при имени.
//
// Проверяется то, из-за чего это переписали 30 августа 2026. Пул в пятьдесят
// имён кончился на пятьдесят первой сессии, потому что `taken` собирался из
// всех когда-либо выданных имён и ничего не возвращалось: в реестре было 152
// записи, 102 из них с номером. И род угадывался по последней букве, отчего
// офис писал «Гоша освободилась» на четырнадцати именах из пятидесяти.
//
// Обе поломки тихие: имя с номером выглядит как имя, чужой род — как опечатка.
import { assignNames, genderOf, NAME_POOL } from '../server/agents.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const ids = (n, from = 0) => Array.from({ length: n }, (_, i) => `session-${from + i}`);
const all = (arr) => new Set(arr);

// ------------------------------------------------------------------ словарь
const dup = NAME_POOL.filter((n, i) => NAME_POOL.indexOf(n) !== i);
ok('в словаре нет повторов', dup.length === 0, dup);
ok('у каждого имени есть род', NAME_POOL.every((n) => genderOf(n) === 'm' || genderOf(n) === 'f'));
ok('словарь заметно больше прежних пятидесяти', NAME_POOL.length > 150, NAME_POOL.length);

// Ровно те имена, на которых врала догадка по последней букве.
const wasWrong = ['Гоша', 'Тимка', 'Сеня', 'Гриша', 'Лёва', 'Стёпа', 'Кузя', 'Савва', 'Митя', 'Ося', 'Никита'];
ok('мужские имена на а/я больше не женские', wasWrong.every((n) => genderOf(n) === 'm'),
  wasWrong.filter((n) => genderOf(n) !== 'm'));
ok('женское имя осталось женским', genderOf('Марта') === 'f');
ok('номер на исчерпании пула рода не меняет', genderOf('Ося 51') === 'm' && genderOf('Марта 77') === 'f');
ok('имя не из словаря падает на догадку по букве', genderOf('Пелагея') === 'f' && genderOf('Аристарх') === 'm');

// ------------------------------------------------------------------ выдача
const first = assignNames({}, ids(3), all([]));
ok('новым сессиям выдаются разные имена', new Set(Object.values(first)).size === 3, first);

const again = assignNames(first, ids(3), all(ids(3)));
ok('имя не меняется на следующем тике', JSON.stringify(again) === JSON.stringify(first));

// Сессия ушла, но транскрипт на диске остался: --resume вернёт тот же
// sessionId, и агент обязан вернуться собой.
const resting = assignNames(first, [], all(ids(3)));
ok('имя ждёт вернувшуюся сессию', JSON.stringify(resting) === JSON.stringify(first));
const resumed = assignNames(resting, ['session-1'], all(ids(3)));
ok('--resume застаёт своё имя', resumed['session-1'] === first['session-1']);

// Транскрипта не стало — имя возвращается в пул.
const pruned = assignNames(first, [], all(['session-0']));
ok('имя ушедшего насовсем освобождается', Object.keys(pruned).length === 1, pruned);
const reused = assignNames(pruned, ['session-9'], all(['session-0', 'session-9']));
ok('освобождённое имя снова раздаётся',
  new Set(Object.values(reused)).size === 2 && Object.keys(reused).length === 2, reused);

// ------------------------------------------------- исчерпание и его отсутствие
const many = ids(NAME_POOL.length);
const full = assignNames({}, many, all(many));
ok('пул раздаётся целиком без номеров',
  Object.values(full).every((n) => !/\s\d+$/.test(n)), Object.values(full).filter((n) => /\s\d+$/.test(n)).length);
ok('на полном пуле имена не повторяются', new Set(Object.values(full)).size === NAME_POOL.length);

const over = assignNames(full, [...many, 'session-over'], all([...many, 'session-over']));
ok('за пулом имя всё-таки выдаётся, с номером', /\s\d+$/.test(over['session-over']), over['session-over']);

// Та самая поломка: пятьдесят сессий подряд, каждая уходит насовсем.
let carry = {};
let numbered = 0;
for (let i = 0; i < NAME_POOL.length * 3; i++) {
  const id = `wave-${i}`;
  carry = assignNames(carry, [id], all([id]));   // прошлой сессии на диске уже нет
  if (/\s\d+$/.test(carry[id])) numbered++;
}
ok('сессии подряд не упираются в стену', numbered === 0, numbered);

// ------------------------------------------- лечение имён с номером
// В настоящем реестре 30 августа 2026 таких было 27 у живых сессий: они
// достались от прежнего распределителя и остались бы навсегда.
const scarred = { 'session-a': 'Клим 97', 'session-b': 'Ося 51' };
const healed = assignNames(scarred, [], all(['session-a', 'session-b']));
ok('имя с номером лечится, когда пул позволяет',
  Object.values(healed).every((n) => !/\s\d+$/.test(n)), healed);
ok('вылеченные имена не совпали', healed['session-a'] !== healed['session-b'], healed);
ok('лечение устойчиво: второй прогон ничего не меняет',
  JSON.stringify(assignNames(healed, [], all(['session-a', 'session-b']))) === JSON.stringify(healed));

// А когда лечить нечем — номер остаётся, и это не поломка.
const packed = {};
NAME_POOL.forEach((n, i) => { packed['busy-' + i] = n; });
packed['scarred'] = 'Клим 999';
const noRoom = assignNames(packed, [], all(Object.keys(packed)));
ok('на полном пуле номер остаётся на месте', noRoom['scarred'] === 'Клим 999', noRoom['scarred']);

console.log(bad ? `\nПЛОХО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
