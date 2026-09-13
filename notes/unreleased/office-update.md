---
title: The office updates itself from its repository, without stopping
scope: office
keys:
  - "`C`, then the office tab — the version row is the first thing in it"
shots:
  - id: office-update
    url: ""
    keys: 'Enter,wait:3000,c,wait:900,tap:[data-tab="office"],wait:1500'
---

Updating the office meant stopping it: Ctrl-C, `git pull` in the core, `git pull` in the Modules, `npm start`. Whatever the office kept in memory went with it — guests' access, the notes on the desks, the questions it was holding for agents.

Now the office tab opens with a version row. **Check** asks the repository what is new — the version and how many features and fixes — and **update** pulls the core and the Modules and swaps the running office for the new one. `npm start` now runs a small supervisor that holds the port, so nothing is dropped on the way: guests keep their access, notes stay on their desks, a question held for an agent comes back held by the new office, and every open page reloads onto it and says «office updated». `npm run update` does the same from a terminal. When an update cannot go — uncommitted changes, a branch with commits of its own, a new server that will not start — the row says why in words, and the running office is left exactly as it was.

Left out on purpose: the office never checks by itself. Checking is a trip to git, and the office goes outside only when asked; a background check may come later as a setting, off by default. A Ctrl-C is still a restart and still forgets guests' access.
