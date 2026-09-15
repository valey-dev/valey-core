---
title: The agent card names its model and reasoning level, and a trade wears a pixel icon instead of a border
scope: office
shots:
  - id: model-card
    url: "#room=standup"
    keys: "Enter,wait:2500,Tab,wait:900,Enter,wait:900"
---

Sessions in the office run on different models, and the card never said which. Now it does, right after the trade: «Fable 5 (high)» — the model that wrote the agent's last reply, in a person's words rather than its id, and in parentheses the reasoning level it thinks at. Switch with `/model` or `/effort` and the card follows from the next answer; a one-turn boost shows only while that turn runs. A model the office has not heard of yet is shown by its id, not hidden.

The trade itself lost its border. A box around the text could never sit on the same line as the name beside it, so each trade now has a small pixel icon in its colour — `>_` for code, a pencil, a magnifier, a list, a tick, an arrow to the shelf — standing on the baseline with the letters.

A guest sees the model too: which model answers is a fact about the desk, like the trade, not about the work.
