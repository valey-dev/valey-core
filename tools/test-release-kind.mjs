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
  else { bad += 1; console.log('FAIL  |', name, '→', String(got).slice(0, 300)); }
};

const c = (subject, body = '') => ({ hash: 'abc1234', subject, body });

// --- parsing -------------------------------------------------------------
const plain = classify(c('feat(office): the pager rings in the corner'));
ok('parses type and area', plain.type === 'feat' && plain.scope === 'office', plain);
ok('text without prefix', plain.text === 'the pager rings in the corner', plain.text);
ok('a normal commit that doesn\'t break', plain.breaking === false, plain);

ok('exclamation point - breaking',
  classify(c('feat(modules)!: the snapshot changed shape')).breaking === true, 'нет');
ok('BREAKING CHANGE in the body - breaking',
  classify(c('refactor(modules): move the address', 'BREAKING CHANGE: modules read it')).breaking === true, 'нет');
ok('not conventional - type null, text is integer',
  classify(c('Merge the task line')).type === null, 'разобрался, а не должен');

// --- the digit -----------------------------------------------------------
const feat = pickKind([c('feat(a): one')], '0.7.0');
ok('one feature - minor', feat.kind === 'minor', feat);

const fixes = pickKind([c('fix(a): one'), c('perf(b): two')], '0.7.0');
ok('only repairs - patch', fixes.kind === 'patch', fixes);

const mixed = pickKind([c('fix(a): one'), c('feat(b): two')], '0.7.0');
ok('a feature next to a fix is still minor', mixed.kind === 'minor', mixed);

const quiet = pickKind([c('refactor(a): one'), c('test(b): two'), c('chore: three')], '0.7.0');
ok('neither feat nor fix - no category', quiet.kind === null, quiet);

// The case that cost two releases: the count is the news, not the digit.
const three = pickKind([c('feat(a): one'), c('feat(b): two'), c('feat(c): three')], '0.6.0');
ok('three features - still one minor', three.kind === 'minor', three);
ok('three features - warning about missed releases',
  three.warnings.length === 1 && /2 release/.test(three.warnings[0]), three.warnings);
ok('one feature - silent', feat.warnings.length === 0, feat.warnings);

// --- breaking, and the zero major ---------------------------------------
const breakZero = pickKind([c('feat(modules)!: the snapshot changed shape')], '0.7.0');
ok('breaking on 0.x - minor, not major', breakZero.kind === 'minor', breakZero);
ok('breaking on 0.x requires the “Breaks” block', breakZero.needsBreakingBlock === true, breakZero);

const breakOne = pickKind([c('feat(modules)!: the snapshot changed shape')], '1.2.3');
ok('breaking on 1.x - major', breakOne.kind === 'major', breakOne);
ok('and also with the block', breakOne.needsBreakingBlock === true, breakOne);
ok('the breaking commit arrived with the hash',
  breakOne.breaking.length === 1 && breakOne.breaking[0].hash === 'abc1234', breakOne.breaking);

// --- the argument is checked against the range ---------------------------
ok('patch over feature - failure', check('patch', feat).ok === false, check('patch', feat));
ok('and the refusal explains what the range is asking for',
  /minor/.test(check('patch', feat).note || ''), check('patch', feat).note);
ok('minor on top of the feature - silently', check('minor', feat).ok === true && !check('minor', feat).note, check('minor', feat));
ok('minor over breaking on 1.x - failure', check('minor', breakOne).ok === false, check('minor', breakOne));
ok('major on top of a feature - possible, but with a caveat',
  check('major', feat).ok === true && Boolean(check('major', feat).note), check('major', feat));
ok('patch if the range is empty - in other words', check('patch', quiet).ok === true, check('patch', quiet));
ok('minor if the range is empty - failure', check('minor', quiet).ok === false, check('minor', quiet));
ok('without an argument there is nothing to check', check(null, feat).ok === true, check(null, feat));

console.log(bad ? `\nFAILED: ${bad}` : '\nall green');
process.exit(bad ? 1 : 0);
