---
title: A hired agent works in auto mode and only asks about the risky
scope: office
nopicture: a permission flag the CLI is started with — the pager simply stays quieter
---

An agent hired at the reception used to start in the default permission mode and put every command on the pager, down to `ls`, which left it barely usable without someone at the keyboard. It now starts in Claude Code's auto mode: routine commands and edits go through, and what the CLI's classifier finds risky still comes to the pager. The mode is `hire.mode` in `~/.config/valey/settings.json` — `auto` unless changed, `acceptEdits`, or `default` to be asked about everything; full access is not among them.
