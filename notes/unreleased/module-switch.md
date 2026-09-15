---
title: An installed module is switched off and back on from the module tree
scope: office
keys:
  - "`ENTER` on an installed module in the tree — switches it off, or back on"
shots:
  - id: module-switch
    keys: "Enter,wait:2500,c,wait:600,4,wait:600,v,wait:500,3,wait:600,tap:.tnode[data-id=prboard],wait:800"
---

A paid module you had no use for today could only be removed: take its folder out of `modules/`, or edit its `module.json`. Neither is something the owner of an office should have to do, and both are easy to forget to undo.

Now the card of every installed module in the inventory's tree (`C`, then `4`) carries a switch, «выкл | вкл». Switched off, the module stops: its server half is not run, its client is not loaded, its routes answer 404 — but its folder stays on disk and its node stays in the tree, dimmed, still counted as bought. `ENTER` on the node does the same as the buttons. The choice is kept in the office's settings, so it survives a restart and an update, and it is the owner's alone: a guest sees neither the switch nor the switched-off node.

The tree also gets its first node that grows out of another paid node: «Табло PR и CI» hangs under «Дерево гита», and it is the module this switch was designed for — a board that asks GitHub once a minute is not what every office wants.

Left out on purpose: switching a module off on a page that is already open without reloading it. A module's client cannot be taken back off a running page, so the switch reloads it, the way the stand's switches already do.
