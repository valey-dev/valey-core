---
title: An agent cut off mid-step shows «stopped», not «waiting on you»
scope: office
shots:
  - id: stopped-state
    url: "#room=standup"
    keys: "Enter,wait:2500,Tab,wait:900"
    interrupt: c
  - id: stopped-dialog
    url: "#room=standup"
    keys: "Enter,wait:2500,Tab,wait:900,Enter,wait:900"
    interrupt: c
---

An agent that was interrupted used to look exactly like one that had finished and was asking for something: the blinking «!» over its head, the yellow stripe on its card, a place in «! N» and on the pager. Most interruptions are not a person pressing Esc — twenty of twenty-one in four days came right before the app resumed the session, which means the process was restarted — so the office said «waiting on you» about agents that were asking for nothing and would not go on by themselves.

Now an interrupted agent is **stopped**, drawn in its own colour. Over its head a still «‖» that does not blink; on its card «‖ прервано» with the step it was cut off at; in its dialog a line where the reply would be, saying the way on is «continue» in the session's own chat. The HUD counts them with a chip of their own, «‖ N», because a restart cuts every agent off at once and without a number that is found only by walking the floor. The chip is not a button and stopped agents stay out of «! N» and the pager: sending into a chat stays your word, and the office does not do it for you. The floor plan colours them the same way.

Still reading as «waiting on you»: an API error, which leaves the app back at the prompt with nothing to retry.
