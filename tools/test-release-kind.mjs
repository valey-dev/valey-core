// node tools/test-release-kind.mjs — which digit a range of commits asks for.
//
// The rule this defends is the project's own: one accepted feature is one minor,
// patch is only fixes, and below 1.0 a breaking change is still a minor with a
// «Ломает» block to make up for what the number cannot say. Until 5 September
// 2026 `release.mjs` took the digit on trust, and v0.7.0 went out carrying three
// features — three minors by that rule, two of them never cut.
//
// The logic sits in release-kind.mjs precisely so this stand can load it:
// importing release.mjs would cut a release.
import { pickKind, check, classify } from './release-kind.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', String(got).slice(0, 300)); }
};

const c = (subject, body = '') => ({ hash: 'abc1234', subject, body });

// --- parsing -------------------------------------------------------------
const plain = classify(c('feat(office): the pager rings in the corner'));
ok('разбирает тип и область', plain.type === 'feat' && plain.scope === 'office', plain);
ok('текст без префикса', plain.text === 'the pager rings in the corner', plain.text);
ok('обычный коммит не ломающий', plain.breaking === false, plain);

ok('восклицательный знак — ломающий',
  classify(c('feat(modules)!: the snapshot changed shape')).breaking === true, 'нет');
ok('BREAKING CHANGE в теле — ломающий',
  classify(c('refactor(modules): move the address', 'BREAKING CHANGE: modules read it')).breaking === true, 'нет');
ok('не conventional — тип null, текст цел',
  classify(c('Merge the task line')).type === null, 'разобрался, а не должен');

// --- the digit -----------------------------------------------------------
const feat = pickKind([c('feat(a): one')], '0.7.0');
ok('одна фича — minor', feat.kind === 'minor', feat);

const fixes = pickKind([c('fix(a): one'), c('perf(b): two')], '0.7.0');
ok('только починки — patch', fixes.kind === 'patch', fixes);

const mixed = pickKind([c('fix(a): one'), c('feat(b): two')], '0.7.0');
ok('фича рядом с починкой — всё равно minor', mixed.kind === 'minor', mixed);

const quiet = pickKind([c('refactor(a): one'), c('test(b): two'), c('chore: three')], '0.7.0');
ok('ни feat, ни fix — разряда нет', quiet.kind === null, quiet);

// The case that cost two releases: the count is the news, not the digit.
const three = pickKind([c('feat(a): one'), c('feat(b): two'), c('feat(c): three')], '0.6.0');
ok('три фичи — всё ещё один minor', three.kind === 'minor', three);
ok('три фичи — предупреждение о пропущенных релизах',
  three.warnings.length === 1 && /2 релиз/.test(three.warnings[0]), three.warnings);
ok('одна фича — молча', feat.warnings.length === 0, feat.warnings);

// --- breaking, and the zero major ---------------------------------------
const breakZero = pickKind([c('feat(modules)!: the snapshot changed shape')], '0.7.0');
ok('ломающее на 0.x — minor, а не major', breakZero.kind === 'minor', breakZero);
ok('ломающее на 0.x требует блок «Ломает»', breakZero.needsBreakingBlock === true, breakZero);

const breakOne = pickKind([c('feat(modules)!: the snapshot changed shape')], '1.2.3');
ok('ломающее на 1.x — major', breakOne.kind === 'major', breakOne);
ok('и тоже с блоком', breakOne.needsBreakingBlock === true, breakOne);
ok('ломающий коммит доехал с хэшем',
  breakOne.breaking.length === 1 && breakOne.breaking[0].hash === 'abc1234', breakOne.breaking);

// --- the argument is checked against the range ---------------------------
ok('patch поверх фичи — отказ', check('patch', feat).ok === false, check('patch', feat));
ok('и отказ объясняет, чего просит диапазон',
  /minor/.test(check('patch', feat).note || ''), check('patch', feat).note);
ok('minor поверх фичи — молча', check('minor', feat).ok === true && !check('minor', feat).note, check('minor', feat));
ok('minor поверх ломающего на 1.x — отказ', check('minor', breakOne).ok === false, check('minor', breakOne));
ok('major поверх фичи — можно, но с оговоркой',
  check('major', feat).ok === true && Boolean(check('major', feat).note), check('major', feat));
ok('patch при пустом диапазоне — можно словом', check('patch', quiet).ok === true, check('patch', quiet));
ok('minor при пустом диапазоне — отказ', check('minor', quiet).ok === false, check('minor', quiet));
ok('без аргумента проверять нечего', check(null, feat).ok === true, check(null, feat));

console.log(bad ? `\nУПАЛО: ${bad}` : '\nвсё зелено');
process.exit(bad ? 1 : 0);
