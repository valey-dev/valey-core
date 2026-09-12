---
title: A release stays in staging until somebody publishes it
scope: release
---

From v0.34.0 cutting a release also published it: the same tail that pushed the tag to the private staging repository pushed it to the public core and to the buyers' shelf, and valey.dev/dist/latest followed within a minute. Every version became public the moment it was cut — including the ones cut only to try a build, catch up a skipped number or follow a fix with another fix.

Now the two are separate steps. `npm run ship` cuts the version into the private origins and stops there. `npm run promote -- vX.Y.Z` is the only thing that reaches outside: it moves the public main to exactly the commit of that tag and builds one release page carrying every version since the last publication, newest first, so a run of small releases goes out as one piece with all of their notes. `npm run promote -- --status` lists, for the core and the Modules at once, what is in staging and not outside yet. The Modules record the core commit their stands ran against, and their promotion refuses to go out before that core is public — a buyer's `git pull` must never bring a module that needs core code nobody has published.

Deliberately left out: promotion never goes backwards and never rewrites what is already out, and it cannot hold back one feature of a version — a version goes out whole or not at all.
