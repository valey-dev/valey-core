# Feature notes

One note per release, next to the changelog and doing the other half of its job. The changelog is a list of subjects generated from the commits; a note is the prose — what was awkward before, what the feature does now, which keys it answers to, and what was deliberately left out.

A note is not written when the release is cut. It is assembled from fragments, and a fragment is written in the branch that builds the feature, committed next to the code:

```bash
node tools/notes.mjs --new arrows-stop   # a template in notes/unreleased/
node tools/notes.mjs                     # what is waiting for the next release
```

`tools/release.mjs` collects everything in `notes/unreleased/` into `notes/vX.Y.Z.md`, embeds the changelog section verbatim, and deletes the fragments. A release carrying a feature and no fragment is refused; `--no-note` is how you overrule that on purpose.

Reading them back:

```bash
node tools/notes.mjs v0.24.0             # one release
node tools/notes.mjs v0.24.0..v0.30.0    # a span, oldest first
```

Notes start at v0.24.0. The twenty-three versions before it have no fragments and are not being backfilled — that line is drawn in `CHANGELOG.md`, where they are all still listed.
