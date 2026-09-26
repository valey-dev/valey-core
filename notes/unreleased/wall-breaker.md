---
title: A breaker by the lift puts the whole office in the dark
scope: office
keys:
  - "`SPACE` at the breaker by the lift — lights out for everyone on the floor, and back on"
shots:
  - id: dark
    setup: "setTimeout(()=>{const g=__game,lf=g.layout.lift,t=lf.floors.filter(f=>!f.tier).reduce((a,b)=>b.y<a.y?b:a);g.player.x=lf.x-32;g.player.y=t.y-4;},3200)"
    keys: "Enter,wait:4200,Space,wait:2500"
---

A grey breaker hangs on the shaft of the lift, on the top floor, just left of the call button. Walk up and press `SPACE`: the hum winds down, a relay clunks, and the office goes dark — for everybody on the floor at once, guests included, and anyone can pull it back up.

It is a joke, not an outage, and it does not pretend otherwise. The agents keep working in the dark: the ones at their desks are lit by their monitors, their bubbles stay on, the keyboards keep clattering, and there is no "office unreachable" plaque. Every person on the floor keeps a flashlight of their own, and a UPS somewhere beeps every fifteen seconds until the lights come back. A toast tells everyone who pulled it.

The light lives in the server's memory only: restarting the office turns it back on, so a breaker left down never leaves an office dark for good.
