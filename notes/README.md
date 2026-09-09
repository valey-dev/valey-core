# Feature notes

One note per release, next to the changelog and doing the other half of its job. The changelog is a list of subjects generated from the commits; a note is the prose — what was awkward before, what the feature does now, which keys it answers to, and what was deliberately left out.

A note is not written when the release is cut. It is assembled from fragments, and a fragment is written in the branch that builds the feature, committed next to the code:

```bash
node tools/notes.mjs --new arrows-stop   # a template in notes/unreleased/
node tools/notes.mjs                     # what is waiting for the next release
```

`tools/release.mjs` collects everything in `notes/unreleased/` into `notes/vX.Y.Z.md`, embeds the changelog section verbatim, and deletes the fragments. A release carrying a feature and no fragment is refused; `--no-note` is how you overrule that on purpose.

## Pictures

A fragment declares shots, and a shot is a recipe rather than a file — an id, where to be, and the keys that get there:

```yaml
shots:
  - id: standup
    url: "#room=standup"
    keys: "Enter,wait:2500,hold-w:1500"
```

`node tools/notes-shots.mjs` raises a demo office, walks it through each recipe and puts the frame next to its fragment. The release moves the pictures under the version and writes the recipes beside them in `notes/vX.Y.Z/shots.json` — a picture can only be looked at, but a recipe can be replayed on an older tag, which is what a real before-and-after will be made of. Declaring a shot and never rendering it stops the release.

The office in these frames is invented at the source: made-up people on made-up projects, out of the same fixtures the stands use. A photograph of a real office is a photograph of real project and branch names, and these files go to a public repository.

### Before and after

```bash
node tools/notes-shots.mjs --before v0.20.0   # the same recipes on that release
node tools/notes-shots.mjs --before           # on the last one
```

The recipe is replayed against a worktree of that tag — its server, its office — and the frame lands beside the new one with the tag in its name. The note then prints the pair. A before frame is never declared in the front matter: whether a comparison is worth making is a judgement, not a property of the feature.

Look at what comes back. No check can tell whether the old office understood the recipe: a room this feature added does not exist back there, a key does nothing, and the walk ends up somewhere else and photographs it perfectly plausibly.

Reading them back:

```bash
node tools/notes.mjs v0.24.0             # one release
node tools/notes.mjs v0.24.0..v0.30.0    # a span, oldest first
```

Notes start at v0.24.0. Five older releases have one anyway — [v0.10.0](v0.10.0.md), [v0.12.0](v0.12.0.md), [v0.13.0](v0.13.0.md), [v0.14.0](v0.14.0.md) and [v0.18.0](v0.18.0.md) — because their before-and-after can actually be photographed, and a pair is the fastest way to see what any of this is for. Each says in its own first line that it was written after the fact, out of the changelog rather than by whoever built the feature.

The rest are not backfilled and will not be. Most of what shipped before v0.24.0 is invisible in a frame — release tooling, the module contract, settings, guest access — and some of it needs a floor the demo office does not have: a pager with a real question waiting, a room that has to be walked to. A note nobody can illustrate and nobody remembers writing is a worse record than the changelog line, which is still there for every one of them.
