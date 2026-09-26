---
title: The owner decides what a guest sees, module by module
scope: access
keys:
  - "`I` — the invite panel; ↑↓ walk the module rows, ←→ choose shown or hidden, Enter presses"
shots:
  - id: panel
    url: ""
    keys: "Enter,wait:2500,i,wait:900"
---

Since v0.27.0 a module's manifest says whether a guest may see it, and that was one value for every office: the owner could neither open the easel to a guest nor hide the feed from one, and nowhere in the office was it written what an invited person would get.

The invite panel now carries a row per module — its name, what a guest gets from it in the module's own words, and «shown | hidden». The manifest is still the default; the owner's choice lies over it, one choice for all guests rather than one per link. A row whose choice departs from the default is marked, and choosing the default again clears the mark. It takes effect at once: the module's routes stop answering a guest, its files are no longer served, and a guest with a page open is told to reload it, so the hidden module leaves his page without his help.

Deliberately left out: a choice per invitation, and any say over what the owner's own devices see — a device of the owner's on the Wi-Fi is not a guest and is not decided here.
