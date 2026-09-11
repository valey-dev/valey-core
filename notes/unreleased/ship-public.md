---
title: A shipped release reaches the public repository in the same breath
scope: release
---

Since the core went public on 11 September, `npm run ship` still stopped at the private staging repository: the public one — the one `install.sh` downloads from, through `valey.dev/dist/latest` — had to be caught up by hand after every release, and on opening day three sessions were doing exactly that in parallel while the one-liner kept installing the previous version.

Now the tail carries the release the rest of the way: after `origin`, the same `main` and tag go to the remote called `public`, and the release page with its four files is created there too. Nothing new is published by this — the merge that made the release was the owner's decision, and the tail only delivers it. A clone without a `public` remote says so and stops after staging, so a fork does not become a publisher by accident. The README stopped counting server files while it was at it: the number drifted every time a file was added, in the one paragraph where every word is meant to be checkable.
