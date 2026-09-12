---
title: The installer asks where the office goes, and what to do when the place is taken
scope: install
---

The installer put the office into `~/valey` and nowhere else. Run a second time, it stopped at «~/valey is not empty. Pick another place: --dir=<path>» — even when what sat there was the office itself, a few versions old, and running the installer again meant exactly «update it».

Now, in a terminal, it asks where to put the office; Enter takes `~/valey`. If an office is already there, it says which version and offers to update it, to put a second one beside it in `~/valey-2`, or to leave. The update moves the old office aside to `~/valey.v<version>` rather than deleting it, and carries over the modules the archive does not bring — the paid ones. Settings live in `~/.config/valey` and are not touched. A folder that is not an office gets the next free name offered instead.

Left out on purpose: without a terminal nothing is asked. A taken place is refused as before, `--dir=` picks the place and `--update` updates without questions.
