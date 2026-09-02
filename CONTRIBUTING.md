# Contributing

## Before anything

Run it. `npm start`, walk the floor, find the thing you want to change. Almost
every rule in this project came from something breaking, and the code says so:
the comments carry the incident, not just the intent. If a comment explains why
something is the way it is, it is load-bearing — change the reason before you
change the line.

## Checks

```bash
for f in server/*.js web/*.js modules/*/*.js; do node --check "$f"; done
for t in tools/test-*.mjs modules/*/test-*.mjs; do node "$t"; done
```

No framework and no runner: a test is a file that prints its checks and exits
non-zero. Count them if you want to know how many there are — do not trust a
number written in a document, including this one.

**Everything drawn is checked with eyes.** The tests cover parsing, dictionaries
and keyboards; they cannot see a thing that renders fourteen pixels inside a
wall. `tools/shot.mjs` takes the picture from a terminal:

```bash
node tools/shot.mjs --port 5177 --keys "Enter,wait:2500,shift-F9"
```

## Modules first

If your change adds a room, a panel, a prop or a service, it probably wants to
be a module rather than a line in the core — see [docs/modules.md](docs/modules.md).
The core stays small on purpose: it is what everyone has to merge.

## Commits

`<type>(<scope>): summary` — `feat`, `fix`, `perf`, `docs`, `test`, `refactor`,
`build`, `ci`, `chore`. The subject line is in English.

**The message says why, not what.** The diff already says what. Write the line
a reader needs in six months: what was broken, what you rejected, what will
bite whoever undoes this.

## The agreement

Contributions are accepted under a contributor licence agreement: see
[CLA.md](CLA.md). In short, you keep your copyright, and you give the project's
author the right to use your contribution — including in versions that are not
under the AGPL.

That last clause is the honest part, so it is stated plainly rather than buried:
the office is open core. The core you are looking at is AGPL for everyone, and
some modules are sold. Without this grant a patch to the open core could not be
carried into one of those, so the alternative would be refusing patches in the
places they are most useful.

If that is not a deal you want, an issue describing the bug is worth a great
deal on its own, and costs you nothing.

## What gets rejected

* A rule without its reason. Comments here answer "why", and a change that
  removes the answer is a change that will be re-litigated.
* A silent failure. If something cannot work, it says so where it is used — a
  module that fails to load prints; a panel that has no data says which.
* A check that phones home. The privacy claim in the README is checkable
  because the code is readable; anything that quietly opens a connection breaks
  the only thing this project cannot rebuild.
