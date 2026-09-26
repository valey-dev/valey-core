---
title: A task sent to a chat whose folder is gone says so
scope: deliver
nopicture: one line of error text on the task; the demo floor has no chat with a vanished folder, and sending needs a real CLI
---

When a chat's project folder has been moved or deleted, sending it a task used to fail with nothing but «claude exited with code -2». The office now checks the folder before starting claude and says «the agent's folder is gone», with the path — in the task's card and in the error journal.
