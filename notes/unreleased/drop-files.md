---
title: A file dropped onto a task goes to the agent with it
scope: office
shots:
  - id: drop-files
    url: "#room=standup"
    keys: "Enter,wait:2500,Tab,wait:900,Enter,wait:900,3,wait:900,wait:1500"
    setup: "(() => { const t = setInterval(() => { const ta = document.querySelector('#taskInput'); if (!ta) return; clearInterval(t); const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(184 * 1024)], 'макет-каталога.png', { type: 'image/png' })); dt.items.add(new File(['# отступы'], 'заметки-по-отступам.md', { type: 'text/markdown' })); ta.value = 'шапка съехала на 4 пикселя — вот макет и мои заметки'; document.querySelector('#dialog').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, 200); })()"
---

Drag a file onto an agent's card — a screenshot of the layout that slipped, a mockup, a log — and it goes to the agent together with the task. `Cmd+V` does the same for whatever is on the clipboard, which is usually a screenshot just taken. A chip appears under the field with the name and the size, and `✕` takes it off before the task leaves.

The office writes the file into `~/.config/valey/inbox`, beside its settings and outside any project, so nothing lands in a repository by accident; the task then carries `@<path>`, and Claude Code opens the file itself, picture or text. Notes work the same way: a note on the desk keeps its files, says `📎` and how many, and hands them over when it goes into the chat later. The same row sits under the task field when hiring, so a new agent's first message can come with a mockup attached.

Files are the owner's: a guest leaves a note and nothing of theirs is written to the owner's disk. Anything over 16 MB is refused with a red chip, five files at a time is the ceiling, and a file older than a fortnight is swept at startup — the agent reads it when the task arrives, and after that nobody does.

Two waits, and they no longer look alike. A file going up is a dashed chip under the field and lasts milliseconds — 5 MB reach the office in about 27. Waiting for the agent is the note on the desk: an hourglass, the waiting colour and `ждёт ответа · 1:12`, because `claude --resume` loads the whole session before the first word of the answer and an attached picture adds a second and a half on top. The office cannot make that shorter; it can say honestly which of the two you are waiting for.
