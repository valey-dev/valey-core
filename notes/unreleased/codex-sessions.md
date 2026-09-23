---
title: Codex threads sit at desks next to Claude sessions
scope: office
shots:
  - id: codex-floor
    url: "#room=tide-charts"
    setup: "(() => { let n = 0; const t = setInterval(() => { const g = window.__game; const a = g && g.actors && g.actors.get('01a0aaaa-0000-7000-8000-00000000c0de'); if (a && g.player && g.currentRoom) { if (++n < 6) return; g.player.x = a.x; g.player.y = a.y + 22; clearInterval(t); } }, 250); return 'armed'; })()"
    keys: "Enter,wait:4000"
  - id: codex-card
    url: "#room=tide-charts"
    setup: "(() => { let n = 0; const t = setInterval(() => { const g = window.__game; const a = g && g.actors && g.actors.get('01a0aaaa-0000-7000-8000-00000000c0de'); if (a && g.player && g.currentRoom) { if (++n < 6) return; g.player.x = a.x; g.player.y = a.y + 22; clearInterval(t); } }, 250); return 'armed'; })()"
    keys: "Enter,wait:4000,Space,wait:1500"
  - id: codex-task
    url: "#room=tide-charts"
    setup: "(() => { let n = 0; const t = setInterval(() => { const g = window.__game; const a = g && g.actors && g.actors.get('01a0aaaa-0000-7000-8000-00000000c0de'); if (a && g.player && g.currentRoom) { if (++n < 6) return; g.player.x = a.x; g.player.y = a.y + 22; clearInterval(t); } }, 250); return 'armed'; })()"
    keys: "Enter,wait:4000,Space,wait:1500,3,wait:800"
---

The office only knew Claude Code. Whoever also worked in Codex had half the team off the floor: those threads were busy, finished, waiting on a reply — and none of it could be seen without opening the Codex app.

Now Codex Desktop and CLI threads take desks in their project's room next to Claude sessions: a name, a face, a role from the tools they reach for, what they are doing, the branch, the thread's name as the app shows it, and «waiting on you» or «at rest» read off the report their last reply ends with. Each source has its mark — ✶ Claude and ◇ Codex — before the name on the floor and after the role in the card. A thread is in while a Codex process holds its lock, so a closed thread leaves its desk the way a closed Claude session does; Codex's own helper threads are not seated.

«Give a task» works for Codex too. The task goes into the thread's own queue through `codex queue`, and Codex takes it in when the turn in progress is over — in the open Codex window as well — so the note on the desk says «queued in Codex» and the answer arrives in the conversation. There is no mode to pick: permission modes are Claude's, Codex decides its own.

Left out on purpose: answering a Codex permission request from the office. Codex does not write those requests to its files at all, so the office cannot see an agent waiting for one; Codex has hooks shaped like Claude's, and that is a separate step.
