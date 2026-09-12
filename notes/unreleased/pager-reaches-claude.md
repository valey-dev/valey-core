---
title: The pager's answers reach Claude Code
scope: permit
---

The pager showed Claude Code's requests and let you press «allow» or «deny» — and Claude Code never heard it. The hook sent the verdict as a bare word where the client reads an object, so every press was dropped and the request fell back to the client's own prompt, or to an automatic refusal where nobody could answer. The agent's multiple-choice questions fared no better: the desktop app draws its own picker without waiting, and a press on the office's card ended in «this question is already closed».

Now «allow» lets the command run, «deny» stops it and the agent reads what you typed under it, and a question is answered by pressing one of its options: the agent gets the choice exactly as if it had been clicked in the client. Questions come in through a second hook entry, `PreToolUse` with the matcher `AskUserQuestion` — the README shows both. A batch of several questions still goes to the client whole: the card has room for one.
