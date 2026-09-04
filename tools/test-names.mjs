// node tools/test-names.mjs — выдача имён агентам и род при имени.
//
// Проверяется то, из-за чего это переписали 30 августа 2026. Пул в пятьдесят
// имён кончился на пятьдесят первой сессии, потому что `taken` собирался из
// всех когда-либо выданных имён и ничего не возвращалось: в реестре было 152
// записи, 102 из них с номером. И род угадывался по последней букве, отчего
// офис писал «Гоша освободилась» на четырнадцати именах из пятидесяти.
//
// Обе поломки тихие: имя с номером выглядит как имя, чужой род — как опечатка.
// С 4 сентября 2026 словарь не один: проверка словаря идёт по каждому паку, а
// не по одному «тому самому». Пак, у которого пул вдвое короче или в котором
// половина имён без рода, — это не полпака, это офис, где каждый второй агент
// зовётся с номером или «освободилась».
import { assignNames, genderOf, namePool, PACK_IDS } from '../server/agents.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const ids = (n, from = 0) => Array.from({ length: n }, (_, i) => `session-${from + i}`);
const all = (arr) => new Set(arr);

// Раздача проверяется на русском — на нём написаны все истории ниже.
const NAME_POOL = namePool('ru');

// ------------------------------------------------------------------ словари
ok('паков больше одного', PACK_IDS.length > 1, PACK_IDS);
for (const id of PACK_IDS) {
  const pool = namePool(id);
  const dup = pool.filter((n, i) => pool.indexOf(n) !== i);
  ok(`${id}: в словаре нет повторов`, dup.length === 0, dup);
  ok(`${id}: у каждого имени есть род`,
    pool.every((n) => genderOf(n, id) === 'm' || genderOf(n, id) === 'f'));
  ok(`${id}: словарь заметно больше прежних пятидесяти`, pool.length > 150, pool.length);
}
// Пул одного размера у всех паков — не придирка: имя выдаётся от хеша по
// кругу, и офис, переехавший на короткий пак, упрётся в номера там, где на
// длинном их не было.
const sizes = PACK_IDS.map((id) => namePool(id).length);
ok('паки сопоставимы по размеру', Math.max(...sizes) - Math.min(...sizes) < 30, sizes);

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

// ------------------------------------------------------- смена пака и обратно
// На этом держится вся панель: строка в ней обещает, что вернёшь пак — вернутся
// имена. Если бы не держалось, переключение было бы необратимым, и его просто
// не нажали бы ни разу.
const crowd = ids(12);
const ru = assignNames({}, crowd, all(crowd), 'ru');
const en = assignNames({}, crowd, all(crowd), 'en');
ok('на другом паке офис зовётся иначе',
  crowd.every((id) => ru[id] !== en[id]), { ru: ru[crowd[0]], en: en[crowd[0]] });
ok('и именами этого пака',
  Object.values(en).every((n) => namePool('en').includes(n)), Object.values(en).slice(0, 3));
const back = assignNames({}, crowd, all(crowd), 'ru');
ok('вернул пак — вернулись имена', JSON.stringify(back) === JSON.stringify(ru));
ok('род едет вместе с паком',
  genderOf(en[crowd[0]], 'en') === 'm' || genderOf(en[crowd[0]], 'en') === 'f');
// Имена, выданные прежним паком, лежат на диске до следующего снимка, и род им
// нужен ровно тот же: иначе между нажатием и снимком полэтажа меняет род.
ok('чужому паку род прежнего имени всё равно известен', genderOf('Гоша', 'en') === 'm');

console.log(bad ? `\nПЛОХО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
