---
title: A claimed backlog item says whether anybody is still working on it
scope: claim
nopicture: output of a command in the terminal, not a screen of the office
---

`node tools/claim.mjs` listed what was taken, by which branch and on which day — and a claim looked the same on its first day and its fourteenth. An abandoned one kept its item locked, and the only way to find out was to go and look at the branch.

Now every claim in the list carries what its branch is doing: its own commits and when the last one was made, the tree it is checked out in, how many files are lying there uncommitted and when they were last touched. A claim with no movement for a week is marked as looking abandoned, a claim whose branch no longer exists asks to be dropped, and `take` on a taken item says how long the owner has been silent. The first run found six of twelve claims silent for more than a week, one branch already gone, and a tree with eight uncommitted files untouched for thirteen days.

Nothing is fetched and nothing is changed: the list reads the branches as they are on this machine, and dropping a claim is still a word somebody says.
