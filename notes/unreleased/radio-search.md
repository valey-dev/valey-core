---
title: The office radio finds stations by name or genre
scope: radio
shots:
  - id: results
    setup: "(()=>{const found={stations:[{uuid:'',name:'101 SMOOTH JAZZ',country:'US',codec:'mp3',bitrate:192,uri:'https://stream0.example/live'},{uuid:'',name:'Adroit Jazz Underground',country:'US',codec:'mp3',bitrate:320,uri:'https://stream1.example/live'},{uuid:'',name:'Jazz 24',country:'US',codec:'aac',bitrate:256,uri:'https://stream2.example/live'},{uuid:'',name:'Jazz Radio Blues',country:'FR',codec:'mp3',bitrate:128,uri:'https://stream3.example/live'},{uuid:'',name:'Adroit Jazz Underground HD Opus',country:'US',codec:'ogg',bitrate:192,uri:'https://stream4.example/live'},{uuid:'',name:'Jazz Radio',country:'FR',codec:'mp3',bitrate:192,uri:'https://stream5.example/live'},{uuid:'',name:'Bossa Jazz Brasil',country:'BR',codec:'aac+',bitrate:64,uri:'https://stream6.example/live'},{uuid:'',name:'Jazz Radio',country:'FR',codec:'mp3',bitrate:128,uri:'https://stream7.example/live'}]};const f0=window.fetch;window.fetch=(u,o)=>String(u).startsWith('/api/radio/search')?Promise.resolve(new Response(JSON.stringify(found),{headers:{'content-type':'application/json'}})):f0(u,o);setTimeout(()=>{const u=document.querySelector('#radiouri');if(!u)return;u.value='jazz';u.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));},4200);})()"
    keys: "Enter,wait:2500,r,wait:3000"
---

Until now a stream had to be found somewhere else first: stations hide their stream address behind the player on their website, and a .pls or .m3u file is not something most people open. The receiver took an address or nothing.

Now «своя волна» is also a search. A Spotify link is still a Spotify wave and an address is still a checked stream, but anything else — «jazz», «NTS», «Маяк» — is looked up in the open radio-browser.info catalogue on Enter. Up to eight stations come back under the field, most popular first, each with its country, codec and bitrate; the arrows walk them, Enter or a click tunes in and starts playing. A station already in the list is marked ✓ and is tuned to rather than added twice. Esc goes back to the picks, and a second Esc closes the panel.

Under the picks is a row of genres — jazz, ambient, lo-fi, techno, classical, news — each a single tag the catalogue is known to carry, because its own tags are too messy to offer as they are. While the catalogue is thinking the line under the field says so; when nothing is found, it suggests a genre and leaves the genre row in sight; when the catalogue does not answer, it says to paste an address instead. HLS streams and stations the catalogue did not find on the air at its last check never appear. An http station on the office's https page is shown but cannot be caught.

The search is new traffic leaving the machine, and it is kept small: the office server sends the typed word or the genre to the catalogue only on Enter or a press, never as you type, and nothing about the office goes with it. A station you play is reported to the catalogue as one click, which is how it ranks stations. Searching is the owner's, like checking a stream: a guest's receiver keeps the address field and the picks.
