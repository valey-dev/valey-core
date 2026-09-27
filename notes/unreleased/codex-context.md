---
title: A Codex agent's card shows how full its context is, out of the window Codex reports
scope: office
shots:
  - id: codex-context-card
    url: "#room=tide-charts"
    setup: "(() => { let n = 0; const t = setInterval(() => { const g = window.__game; const a = g && g.actors && g.actors.get('01a0aaaa-0000-7000-8000-00000000c0de'); if (a && g.player && g.currentRoom) { if (++n < 6) return; g.player.x = a.x; g.player.y = a.y + 22; clearInterval(t); } }, 250); return 'armed'; })()"
    keys: "Enter,wait:4000,Space,wait:1500"
---

The card's model line has said how full a Claude agent's context is since the size first appeared, and a Codex agent's line stayed bare: the office read the Codex rollout for the model, the prompt and the tools, and passed over the token counts it writes after every request. It now reads them — what the last request was fed, cached part included — and the window comes from the same line, because a GPT model's name does not say how large it is. So the card reads «84k / 258k», and from 80% the bubble over the head grows its meter as it does for Claude.
