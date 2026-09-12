---
title: A module can be switched off in its own manifest
scope: modules
---

The only way to keep a module out of the office was to take its folder away, or to untick it on the stand's plaque — a simulation that lives in the server's memory and is forgotten on restart. Neither says "this module exists and is deliberately off".

Now `"active": false` in a module's `module.json` does. The office does not import the module's server, does not list its client, does not serve a single file of it to the page, and its routes answer nobody. The stand's plaque shows it as «OFF · manifest» and does not offer to switch it back on — only an edit to the manifest can. The first module to use it is the voice in the meeting room, which stays off until it is sold; the meeting room itself stays on the floor.
