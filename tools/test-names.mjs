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
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const ids = (n, from = 0) => Array.from({ length: n }, (_, i) => `session-${from + i}`);
const all = (arr) => new Set(arr);
const assignRu = (saved, order, keep) => assignNames(saved, order, keep, 'ru');

// The handing out is checked in Russian — every story below is written in it.
const NAME_POOL = namePool('ru');

// ------------------------------------------------------------------ the dictionaries
ok('more than one pack', PACK_IDS.length > 1, PACK_IDS);
for (const id of PACK_IDS) {
  const pool = namePool(id);
  const dup = pool.filter((n, i) => pool.indexOf(n) !== i);
  ok(`${id}: no repetitions in dictionary`, dup.length === 0, dup);
  ok(`${id}: each name has a gender`,
    pool.every((n) => genderOf(n, id) === 'm' || genderOf(n, id) === 'f'));
  ok(`${id}: the dictionary is noticeably larger than the previous fifty`, pool.length > 150, pool.length);
}
// The alphabet of a pack. On 6 September 2026 the Russian pool turned out to
// hold 'Costa' — «Костя» typed on the wrong keyboard layout, and the same name
// already sat ten places below in Cyrillic. It arrived with the very first
// commit of the repository and nobody saw it for four days: a name is only ever
// seen when a session's hash lands on it, and one Latin word among a hundred and
// seventy reads as somebody's joke rather than as a slip.
//
// The check is the alphabet rather than the one word, because the mistake is the
// layout and it will come back with the next name added to the list.
const SCRIPT = { ru: /^\p{Script=Cyrillic}[\p{Script=Cyrillic}\p{Pd} ]*$/u, en: /^\p{Script=Latin}[\p{Script=Latin}\p{Pd}' ]*$/u };
for (const id of PACK_IDS) {
  const rule = SCRIPT[id];
  ok(`${id}: the pack has an alphabet rule`, !!rule, id);
  if (!rule) continue;
  const strays = namePool(id).filter((n) => !rule.test(n));
  ok(`${id}: names are written in pack alphabet`, strays.length === 0, strays);
}

// A digit in a pool name would be read as the number the office appends when the
// pool runs dry: `genderOf('Ося 51')` strips it to ask about «Ося», and a name
// that came with a number of its own would be asked about as something else.
for (const id of PACK_IDS) {
  const numbered = namePool(id).filter((n) => /\d/.test(n));
  ok(`${id}: there are no names with a number in the dictionary`, numbered.length === 0, numbered);
  const untidy = namePool(id).filter((n) => n !== n.trim() || n === '');
  ok(`${id}: no empty names or trailing spaces`, untidy.length === 0, untidy);
}

// One pool size across the packs is not pedantry: a name is handed out from a
// hash around the circle, and an office that moved onto a short pack will run
// into numbers where a long one had none.
const sizes = PACK_IDS.map((id) => namePool(id).length);
ok('packs are comparable in size', Math.max(...sizes) - Math.min(...sizes) < 30, sizes);

// Exactly the names the last-letter guess was wrong about.
const wasWrong = ['Гоша', 'Тимка', 'Сеня', 'Гриша', 'Лёва', 'Стёпа', 'Кузя', 'Савва', 'Митя', 'Ося', 'Никита'];
ok('male names with traditionally feminine-looking endings stay male', wasWrong.every((n) => genderOf(n) === 'm'),
  wasWrong.filter((n) => genderOf(n) !== 'm'));
ok('a female name remains female', genderOf('Марта') === 'f');
ok('an exhaustion suffix does not change gender', genderOf('Ося 51') === 'm' && genderOf('Марта 77') === 'f');
ok('an unknown name falls back to the final-letter heuristic', genderOf('Пелагея') === 'f' && genderOf('Аристарх') === 'm');

// ------------------------------------------------------------------ handing out
const defaults = assignNames({}, ids(3), all([]));
ok('the default allocator uses the English pack',
  Object.values(defaults).every((n) => namePool('en').includes(n)), defaults);
const first = assignRu({}, ids(3), all([]));
ok('new sessions are given different names', new Set(Object.values(first)).size === 3, first);

const again = assignRu(first, ids(3), all(ids(3)));
ok('the name does not change on the next tick', JSON.stringify(again) === JSON.stringify(first));

// The session left but the transcript stayed on disk: --resume returns the same
// sessionId, and the agent has to come back as himself.
const resting = assignRu(first, [], all(ids(3)));
ok('the name is waiting for the returned session', JSON.stringify(resting) === JSON.stringify(first));
const resumed = assignRu(resting, ['session-1'], all(ids(3)));
ok('--resume catches your name', resumed['session-1'] === first['session-1']);

// The transcript is gone — the name returns to the pool.
const pruned = assignRu(first, [], all(['session-0']));
ok('a permanently departed agent releases its name', Object.keys(pruned).length === 1, pruned);
const reused = assignRu(pruned, ['session-9'], all(['session-0', 'session-9']));
ok('a released name can be assigned again',
  new Set(Object.values(reused)).size === 2 && Object.keys(reused).length === 2, reused);

// ------------------------------------------------- running out, and not running out
const many = ids(NAME_POOL.length);
const full = assignRu({}, many, all(many));
ok('the pool is distributed entirely without numbers',
  Object.values(full).every((n) => !/\s\d+$/.test(n)), Object.values(full).filter((n) => /\s\d+$/.test(n)).length);
ok('names are not repeated on a full pool', new Set(Object.values(full)).size === NAME_POOL.length);

const over = assignRu(full, [...many, 'session-over'], all([...many, 'session-over']));
ok('past the end of the pool, a numbered name is still assigned', /\s\d+$/.test(over['session-over']), over['session-over']);

// The very failure: fifty sessions in a row, each leaving for good.
let carry = {};
let numbered = 0;
for (let i = 0; i < NAME_POOL.length * 3; i++) {
  const id = `wave-${i}`;
  carry = assignRu(carry, [id], all([id]));   // the previous session is no longer on disk
  if (/\s\d+$/.test(carry[id])) numbered++;
}
ok('sessions in a row don’t hit a wall', numbered === 0, numbered);

// ------------------------------------------- curing the numbered names
// In the real registry on 30 August 2026 there were 27 of these among live
// sessions: they came from the old allocator and would have stayed forever.
const scarred = { 'session-a': 'Клим 97', 'session-b': 'Ося 51' };
const healed = assignRu(scarred, [], all(['session-a', 'session-b']));
ok('a numbered name heals when the pool has room',
  Object.values(healed).every((n) => !/\s\d+$/.test(n)), healed);
ok('healed names remain distinct', healed['session-a'] !== healed['session-b'], healed);
ok('healing is stable: a second run changes nothing',
  JSON.stringify(assignRu(healed, [], all(['session-a', 'session-b']))) === JSON.stringify(healed));

// And when there is nothing to cure it with, the number stays, and that is not a failure.
const packed = {};
NAME_POOL.forEach((n, i) => { packed['busy-' + i] = n; });
packed['scarred'] = 'Клим 999';
const noRoom = assignRu(packed, [], all(Object.keys(packed)));
ok('on a full pool the number remains in place', noRoom['scarred'] === 'Клим 999', noRoom['scarred']);

// ------------------------------------------------- switching the pack and back
// The whole panel rests on this: a line in it promises that giving the pack back
// gives the names back. If it did not hold, the switch would be irreversible,
// and nobody would ever press it once.
const crowd = ids(12);
const ru = assignNames({}, crowd, all(crowd), 'ru');
const en = assignNames({}, crowd, all(crowd), 'en');
ok('switching packs changes every name',
  crowd.every((id) => ru[id] !== en[id]), { ru: ru[crowd[0]], en: en[crowd[0]] });
ok('the selected pack supplies every name',
  Object.values(en).every((n) => namePool('en').includes(n)), Object.values(en).slice(0, 3));
const back = assignNames({}, crowd, all(crowd), 'ru');
ok('switching back restores the original names', JSON.stringify(back) === JSON.stringify(ru));
ok('gender metadata travels with the pack',
  genderOf(en[crowd[0]], 'en') === 'm' || genderOf(en[crowd[0]], 'en') === 'f');
// Names handed out by the previous pack lie on disk until the next snapshot, and
// they need exactly the same gender: otherwise half the floor changes gender
// between the press and the snapshot.
ok('a previous-pack name retains known gender', genderOf('Гоша', 'en') === 'm');

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
