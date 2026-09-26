---
title: A breaker under the security room puts the whole office in the dark
scope: office
keys:
  - "`SPACE` at the breaker under the security room — lights out for everyone on the floor, and back on"
shots:
  - id: dark
    setup: "setTimeout(()=>{const g=__game,s=g.layout.security;g.player.x=s.x+s.w-56;g.player.y=s.y+s.h+18;},3200)"
    keys: "Enter,wait:4200,Space,wait:2500"
---

An electrical panel is bolted to the outside of the security room, on the wall that faces the corridor below. The room opens only to a card; the panel does not. Walk up to it and press `SPACE`: the hum winds down, a relay clunks, and the office goes dark — for everybody on the floor at once, guests included, and anyone can pull it back up.

It is a joke, not an outage, and it does not pretend otherwise. The agents keep working in the dark: the ones at their desks are lit by their monitors, their bubbles stay on, the keyboards keep clattering, and there is no "office unreachable" plaque. Every person on the floor keeps a flashlight of their own, and a UPS somewhere beeps every fifteen seconds until the lights come back. A toast tells everyone who pulled it.

The light lives in the server's memory only: restarting the office turns it back on, so a breaker left down never leaves an office dark for good.
