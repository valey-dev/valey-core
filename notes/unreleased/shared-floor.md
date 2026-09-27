---
title: агенты участника на твоём этаже
scope: office
shots:
  - id: visitor-card
    settings: '{"access":{"mode":"shared","token":"demo-owner-0001","invites":[{"id":"inv00001","code":"code00000001","name":"Аня","from":"Коля","at":0,"usedAt":null,"guest":null}]}}'
    url: "#owner=demo-owner-0001&room=storefront"
    setup: "(async()=>{const e=await (await fetch('/api/enter',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'code00000001'})})).json();const agents=[{id:'bbbbbbbb-0000-4000-8000-00000000000c',name:'Rex',gender:'m',project:'storefront',role:'Developer',roleKey:'code',mood:'code',status:'working',act:{key:'edit',arg:'src/grid.js'},activity:'',idleFor:40,startedAt:Date.now()-900000,version:'2.1.260',model:'claude-fable-5',effort:'high'}];const post=()=>fetch('/api/floor/visit',{method:'POST',headers:{'content-type':'application/json','x-valey-guest':e.guest},body:JSON.stringify({agents})});await post();setInterval(post,3000);setInterval(()=>{const g=window.__game;if(!g||!g.actors||!g.player)return;const v=(g.agents||[]).find(a=>a.visitor);if(!v)return;const act=g.actors.get(v.id);if(!act)return;g.player.x=act.x;g.player.y=act.y+24;},300);await new Promise(r=>setTimeout(r,1500));})()"
    keys: "Enter,wait:5000,Space,wait:1800"
---

Офис умел звать в гости человека, но не его агентов: приглашённый приходил на пустой этаж и смотрел на чужую работу со стороны. Теперь офис участника приезжает целиком — его агенты садятся за столы в комнатах твоего этажа, рядом с твоими.

Приезжает только проекция: имя, роль, комната, состояние. Последняя реплика, файлы, ветка и путь проекта не приходят вовсе — их не прячут, их просто не отправляют, и в этом разница. Задание чужому агенту не отправить даже так: `--resume` идёт с машины, где агент работает, а не с твоей.

Участник подключается одной командой у себя — `node modules/floor/join.mjs "<ссылка-приглашение>"`, — и его агенты появляются на этаже через такт. Отозвал приглашение — уехали на следующем. Панель со списком людей и запрос доступа к чужой работе рисуются отдельно: то, что вышло сейчас, — агенты за столами и их карточка.

Заодно офис перестал считать чужих агентов ждущими тебя: «!» в шапке, планёрка, ресепшен и первый экран зовут отвечать только там, где ответить можно.
