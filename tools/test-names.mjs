// node tools/test-names.mjs — handing names to agents, and the gender that comes
// with a name.
//
// What is checked is what caused the rewrite on 30 August 2026. A pool of fifty
// names ran out on the fifty-first session, because `taken` was assembled from
// every name ever handed out and nothing came back: the registry held 152
// entries, 102 of them with a number. And the gender was guessed from the last
// letter, which is why the office wrote "Гоша освободилась" for fourteen names
// out of fifty.
//
// Both failures are quiet: a name with a number looks like a name, and the wrong
// gender looks like a typo. Since 4 September 2026 there is more than one
// dictionary: the dictionary check runs over every pack rather than over one
// "the real one". A pack whose pool is half as long, or in which half the names
// have no gender, is not half a pack — it is an office where every second agent
// is called with a number or with "освободилась".
import { assignNames, genderOf, namePool, PACK_IDS } from '../server/agents.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const ids = (n, from = 0) => Array.from({ length: n }, (_, i) => `session-${from + i}`);
const all = (arr) => new Set(arr);

// The handing out is checked in Russian — every story below is written in it.
const NAME_POOL = namePool('ru');

// ------------------------------------------------------------------ the dictionaries
ok('паков больше одного', PACK_IDS.length > 1, PACK_IDS);
for (const id of PACK_IDS) {
  const pool = namePool(id);
  const dup = pool.filter((n, i) => pool.indexOf(n) !== i);
  ok(`${id}: в словаре нет повторов`, dup.length === 0, dup);
  ok(`${id}: у каждого имени есть род`,
    pool.every((n) => genderOf(n, id) === 'm' || genderOf(n, id) === 'f'));
  ok(`${id}: словарь заметно больше прежних пятидесяти`, pool.length > 150, pool.length);
}
// One pool size across the packs is not pedantry: a name is handed out from a
// hash around the circle, and an office that moved onto a short pack will run
// into numbers where a long one had none.
const sizes = PACK_IDS.map((id) => namePool(id).length);
ok('паки сопоставимы по размеру', Math.max(...sizes) - Math.min(...sizes) < 30, sizes);

// Exactly the names the last-letter guess was wrong about.
const wasWrong = ['Гоша', 'Тимка', 'Сеня', 'Гриша', 'Лёва', 'Стёпа', 'Кузя', 'Савва', 'Митя', 'Ося', 'Никита'];
ok('мужские имена на а/я больше не женские', wasWrong.every((n) => genderOf(n) === 'm'),
  wasWrong.filter((n) => genderOf(n) !== 'm'));
ok('женское имя осталось женским', genderOf('Марта') === 'f');
ok('номер на исчерпании пула рода не меняет', genderOf('Ося 51') === 'm' && genderOf('Марта 77') === 'f');
ok('имя не из словаря падает на догадку по букве', genderOf('Пелагея') === 'f' && genderOf('Аристарх') === 'm');

// ------------------------------------------------------------------ handing out
const first = assignNames({}, ids(3), all([]));
ok('новым сессиям выдаются разные имена', new Set(Object.values(first)).size === 3, first);

const again = assignNames(first, ids(3), all(ids(3)));
ok('имя не меняется на следующем тике', JSON.stringify(again) === JSON.stringify(first));

// The session left but the transcript stayed on disk: --resume returns the same
// sessionId, and the agent has to come back as himself.
const resting = assignNames(first, [], all(ids(3)));
ok('имя ждёт вернувшуюся сессию', JSON.stringify(resting) === JSON.stringify(first));
const resumed = assignNames(resting, ['session-1'], all(ids(3)));
ok('--resume застаёт своё имя', resumed['session-1'] === first['session-1']);

// The transcript is gone — the name returns to the pool.
const pruned = assignNames(first, [], all(['session-0']));
ok('имя ушедшего насовсем освобождается', Object.keys(pruned).length === 1, pruned);
const reused = assignNames(pruned, ['session-9'], all(['session-0', 'session-9']));
ok('освобождённое имя снова раздаётся',
  new Set(Object.values(reused)).size === 2 && Object.keys(reused).length === 2, reused);

// ------------------------------------------------- running out, and not running out
const many = ids(NAME_POOL.length);
const full = assignNames({}, many, all(many));
ok('пул раздаётся целиком без номеров',
  Object.values(full).every((n) => !/\s\d+$/.test(n)), Object.values(full).filter((n) => /\s\d+$/.test(n)).length);
ok('на полном пуле имена не повторяются', new Set(Object.values(full)).size === NAME_POOL.length);

const over = assignNames(full, [...many, 'session-over'], all([...many, 'session-over']));
ok('за пулом имя всё-таки выдаётся, с номером', /\s\d+$/.test(over['session-over']), over['session-over']);

// The very failure: fifty sessions in a row, each leaving for good.
let carry = {};
let numbered = 0;
for (let i = 0; i < NAME_POOL.length * 3; i++) {
  const id = `wave-${i}`;
  carry = assignNames(carry, [id], all([id]));   // the previous session is no longer on disk
  if (/\s\d+$/.test(carry[id])) numbered++;
}
ok('сессии подряд не упираются в стену', numbered === 0, numbered);

// ------------------------------------------- curing the numbered names
// In the real registry on 30 August 2026 there were 27 of these among live
// sessions: they came from the old allocator and would have stayed forever.
const scarred = { 'session-a': 'Клим 97', 'session-b': 'Ося 51' };
const healed = assignNames(scarred, [], all(['session-a', 'session-b']));
ok('имя с номером лечится, когда пул позволяет',
  Object.values(healed).every((n) => !/\s\d+$/.test(n)), healed);
ok('вылеченные имена не совпали', healed['session-a'] !== healed['session-b'], healed);
ok('лечение устойчиво: второй прогон ничего не меняет',
  JSON.stringify(assignNames(healed, [], all(['session-a', 'session-b']))) === JSON.stringify(healed));

// And when there is nothing to cure it with, the number stays, and that is not a failure.
const packed = {};
NAME_POOL.forEach((n, i) => { packed['busy-' + i] = n; });
packed['scarred'] = 'Клим 999';
const noRoom = assignNames(packed, [], all(Object.keys(packed)));
ok('на полном пуле номер остаётся на месте', noRoom['scarred'] === 'Клим 999', noRoom['scarred']);

// ------------------------------------------------- switching the pack and back
// The whole panel rests on this: a line in it promises that giving the pack back
// gives the names back. If it did not hold, the switch would be irreversible,
// and nobody would ever press it once.
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
// Names handed out by the previous pack lie on disk until the next snapshot, and
// they need exactly the same gender: otherwise half the floor changes gender
// between the press and the snapshot.
ok('чужому паку род прежнего имени всё равно известен', genderOf('Гоша', 'en') === 'm');

console.log(bad ? `\nПЛОХО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
