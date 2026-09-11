---
title: The release page carries the feature note, pictures and all
scope: release
---

Feature notes had pictures from v0.25.0 onward, and a real before-and-after from v0.26.0 — and none of it reached the page anybody opens. The release page on GitHub was built from the changelog section alone, so the frames sat in `notes/` where only somebody browsing the repository would ever find them.

Now a release with a note gets the note as its page: the prose, the keys, the pairs of frames, and the changelog section underneath it word for word, so the bullet list is still written exactly once. The pictures are linked at the commit that last touched the note rather than at the tag, because a note written after its release is not at that tag at all, and rather than at a branch, because a branch moves. A release without a note keeps the changelog, as before.

Pages published before this existed are rewritten with `node tools/gh-release.mjs --all --refresh`, which touches bodies and nothing else. It has been run on both the private staging repository and the public one.

Found on the way: `gh-release.mjs v0.4.0` ignored the tag it was given and published the newest one instead. Nobody noticed, because the only caller that passes a tag always passes the newest.
