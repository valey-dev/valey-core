---
title: A picture an agent sends in a reply is drawn, not spelled out
scope: office
shots:
  - id: reply-image
    url: "#room=standup"
    keys: "Enter,wait:2500,Tab,wait:900,Enter,wait:1200,tap:#readAll,wait:2500,shift-ArrowDown,wait:800"
---

An agent that draws something — a rendered frame, a screenshot of the layout it has just fixed — sends it back as `![подпись](/путь/кадр.png)`. Until now the office printed that line as it stood: the path was visible, the picture was not. In the conversation the file is now drawn where the line used to be, with its name under it; a click opens it in the same viewer the files on the desk use, with zoom and arrows.

The picture comes through `/api/file`, which serves an agent's own work: files it opened or wrote, and now also a picture it names in its own reply — png, jpg, gif or webp, by a full path — since a picture an agent generates or renders with a script reaches the transcript with no tool touching it. A guest sees it only while the conversation itself is open. A path the office will not serve — a file already deleted, or one never named by the agent — stays a line with the name and the reason rather than an empty frame.

In the card the reply is still typed out as plain text, so a picture there is named — `🖼 каталог-после-правки.png` — and the picture itself waits in the conversation.
