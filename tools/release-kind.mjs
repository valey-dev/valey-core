// Which digit moves, decided by the range instead of by the person typing.
//
// Until 5 September 2026 `release.mjs` took the digit as its first argument and
// believed it: `patch` over ten `feat` commits went through without a word. The
// rulebook already said that was wrong and left the check to the eye on `--dry`
// — and the eye missed it the first time it mattered. v0.7.0 went out carrying
// three features, which by the project's own rule is three minors: two releases
// nobody cut, found only because somebody asked what was in main.
//
// So the range decides and the argument is only allowed to agree with it. This
// lives apart from `release.mjs` for one reason: that file cuts a release the
// moment it is imported, so a stand could never have loaded it to check the
// rules. Here there are no side effects and `test-release-kind.mjs` can feed it
// whatever history it likes.

// Conventional Commits, with the `!` that marks a breaking change captured.
const RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

// The three types a changelog reader actually reads; everything else lands in
// Other and says nothing about the digit.
export const VISIBLE = { feat: 'Added', fix: 'Fixed', perf: 'Faster' };

export function classify(commit) {
  const subject = typeof commit === 'string' ? commit : commit.subject;
  const body = (typeof commit === 'string' ? '' : commit.body) || '';
  const m = RE.exec(subject || '');
  if (!m) return { type: null, scope: null, text: subject || '', breaking: false };
  return {
    type: m[1],
    scope: m[2] || null,
    text: m[4],
    // Both spellings of the same claim: `feat(x)!: …` and a `BREAKING CHANGE:`
    // paragraph in the body. Conventional Commits allows either.
    breaking: Boolean(m[3]) || /^BREAKING[ -]CHANGE:/m.test(body),
  };
}

// The digit the range asks for, plus everything worth saying out loud about it.
// `version` is the current one, because "breaking" answers differently below 1.0:
// semver spends the zero major on exactly this, and the rulebook keeps that.
export function pickKind(commits, version) {
  // The hash rides along: the caller writes a "Breaking changes" block out of these, and a
  // changelog entry without a hash cannot be looked up.
  const parsed = commits.map((c) => ({ ...classify(c), hash: typeof c === 'string' ? null : c.hash }));
  const feats = parsed.filter((c) => c.type === 'feat');
  const fixes = parsed.filter((c) => c.type === 'fix' || c.type === 'perf');
  const breaking = parsed.filter((c) => c.breaking);
  const zero = String(version || '0.0.0').split('.')[0] === '0';

  const warnings = [];
  // One accepted feature is one minor. Two in a range is not a bigger release,
  // it is a release that was skipped — and saying so is the whole point, because
  // by the time anybody notices, the only fix left is to admit the count.
  if (feats.length > 1) {
    warnings.push(
      `the range contains ${feats.length} features, which should be ${feats.length} minor releases; ` +
      `${feats.length - 1} release(s) were therefore missed. ` +
      'The version understates reality: one minor is being cut for all of them.');
  }

  if (breaking.length) {
    // Below 1.0 a breaking change still costs a minor — the number cannot carry
    // the news, so the changelog has to. The caller writes the "Breaking changes" block;
    // here we only insist that it is owed.
    if (zero) {
      return {
        kind: 'minor', breaking, feats, fixes, warnings,
        why: `${breaking.length} breaking change(s), but the major is zero, so semver makes this minor`,
        needsBreakingBlock: true,
      };
    }
    return {
      kind: 'major', breaking, feats, fixes, warnings,
      why: `${breaking.length} breaking change(s)`,
      needsBreakingBlock: true,
    };
  }

  if (feats.length) {
    return {
      kind: 'minor', breaking, feats, fixes, warnings,
      why: `${feats.length} feature(s)`, needsBreakingBlock: false,
    };
  }
  if (fixes.length) {
    return {
      kind: 'patch', breaking, feats, fixes, warnings,
      why: `${fixes.length} fix(es) or performance change(s), nothing new`,
      needsBreakingBlock: false,
    };
  }
  // Only refactor, test, chore, docs: a release page whose every section is
  // Other tells a reader nothing. Not an error — just not a release on its own.
  return {
    kind: null, breaking, feats, fixes, warnings,
    why: 'the range contains no feat, fix, or perf commits, so there is nothing to release',
    needsBreakingBlock: false,
  };
}

// Is the digit a person typed allowed to stand next to the one the range asks
// for? Over-stating is a judgement call and passes with a note; under-stating is
// the failure this module exists to stop, and it does not pass.
const ORDER = { patch: 0, minor: 1, major: 2 };
export function check(asked, picked) {
  if (!asked) return { ok: true, note: null };
  if (!picked.kind) {
    // Nothing visible in the range: a deliberate `patch` is fine — that is how a
    // release made only of refactors gets a number when somebody wants one.
    return asked === 'patch'
      ? { ok: true, note: 'the range has no visible changes; cutting a patch by explicit request' }
      : { ok: false, note: `${picked.why}: there is no reason to cut ${asked}` };
  }
  if (asked === picked.kind) return { ok: true, note: null };
  if (ORDER[asked] < ORDER[picked.kind]) {
    return {
      ok: false,
      note: `the range requires ${picked.kind} (${picked.why}), but ${asked} was requested; ` +
        'the version is understated, which is exactly what this check prevents',
    };
  }
  return { ok: true, note: `the range requires ${picked.kind} (${picked.why}); cutting ${asked} is a deliberate overstatement` };
}
