---
title: A picture an agent sends in a reply is drawn, not spelled out
scope: office
shots:
  - id: reply-image
    url: "#room=standup"
    keys: "Enter,wait:2500,Tab,wait:900,Enter,wait:900,wait:1200"
    setup: "(() => { const t = setInterval(async () => { const ui = window.__ui; const dlg = document.querySelector('#dialog'); if (!ui || !dlg || dlg.hidden) return; clearInterval(t); const md = await import('/markdown.js'); const host = document.createElement('div'); host.className = 'md'; host.style.cssText = 'position:fixed;left:60px;top:140px;width:420px;background:#1a120c;padding:12px;z-index:99;border:2px solid #6b4a2f'; host.innerHTML = md.renderMarkdown('Вот, снял со стенда:\\n\\n![каталог после правки](/opt/valey-demo/catalog.png)\\n\\nа этого файла уже нет:\\n\\n![старый кадр](/opt/valey-demo/old.png)'); document.body.appendChild(host); ui.bindPictures(host); }, 200); })()"
---

An agent that draws something — a rendered frame, a screenshot of the layout it has just fixed — sends it back as `![подпись](/путь/кадр.png)`. Until now the office printed that line as it stood: the path was visible, the picture was not. In the conversation the file is now drawn where the line used to be, with its name under it; a click opens it in the same viewer the files on the desk use, with zoom and arrows.

Nothing new is unlocked to see it. The picture comes through `/api/file`, which serves only what the agent actually touched in its work, and for a guest only while the conversation itself is open. A path the office will not serve — a file already deleted, or one that was never the agent's — stays a line with the name and the reason rather than an empty frame.

In the card the reply is still typed out as plain text, so a picture there is named — `🖼 каталог-после-правки.png` — and the picture itself waits in the conversation.
