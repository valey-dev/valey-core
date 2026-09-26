---
title: The office writes down what broke
scope: office
nopicture: a file next to the settings; the button that reads it out comes with its own frames
---

When something failed on somebody else's machine, the office forgot it the moment it happened. A floor that froze left a line in the browser console only if the console was open, and a task that did not reach its chat left one red sentence in the card — «No conversation found», with nothing about which `claude` the office had called or which version it was.

Now the office keeps a journal of its own failures in `~/.config/valey/errors.jsonl`: uncaught errors of the page, tasks that failed to reach a chat with the CLI's answer and the CLI's path and version, and the server's own unhandled errors. A repeat within ten minutes adds to a count instead of a line, and the journal keeps the last 200. Home directories are cut to `~` on the way in, and the text of a task is never written — the failure is recorded, the message is not.

Nothing leaves the machine. The owner reads the journal at `/api/errors`, together with the office version, the system, Node and the CLI, and passes it on themselves; the button that turns it into a report is next.
