# Writing a module

A module is a folder in `modules/` with a `module.json`. The core knows exactly one thing about it: whether the folder is there. There is no registry to edit, no build step, no bundler — the office is plain ES modules served as files.

That single rule is the whole design. A build without your feature is a build that does not contain it, not a build with it switched off.

```
modules/mything/
  module.json      what it is called and which files to load
  client.js        runs in the page: register(api)
  server.js        optional: routes, settings, side effects
  style.css        optional: loaded when the module loads
  test-keys.mjs    optional, and you want one
```

## module.json

```json
{
  "id": "mything",
  "name": { "ru": "Моя вещь", "en": "My thing" },
  "tier": "core",
  "client": "client.js",
  "style": "style.css",
  "server": "server.js"
}
```

`id` must equal the folder name — the path `/modules/<id>/` is built from it, and if they drift you get a module whose client cannot be downloaded.

## The client half

`client.js` exports `register(api)`. Everything else is yours.

```js
import { t as tr } from '../../web/i18n.js';

const DICT = { ru: { 'mything.hint': 'ПРОБЕЛ — потрогать' },
               en: { 'mything.hint': 'SPACE to touch' } };

export function register(api) {
  api.i18n(DICT);
  api.on('hint', (near) => near?.kind === 'mything'
    ? { x: near.thing.x, y: near.thing.y, text: tr('mything.hint') }
    : null);
}
```

Imports of the core are written relative — `../../web/i18n.js` — which is true on disk, so your test runs in Node. In the browser an import map in `index.html` folds `/web/` onto `/`, so both resolve to the same module. Do not route around it with a server alias: that yields a *second* copy of the core, with its own language and an empty dictionary, and your text renders as raw keys while everything looks fine.

Name your dictionary keys with your id in front. Two modules will otherwise fight over one name, and the loser is whoever loaded first.

### The points

Two calling conventions, and confusing them is expensive:

* **collect** — everyone is asked and the answers are gathered.
* **first** — the event goes to the first taker.

| Point | Kind | Called with | You return |
| --- | --- | --- | --- |
| `sig` | collect | `state` | a string folded into the floor-plan signature; the plan rebuilds when it changes |
| `layout` | collect | `L, state` | nothing; attach your things to the layout |
| `near` | collect | `p, L, room` | `{ kind, d, … }` — the nearest candidate wins |
| `draw` | collect | `L, t, near` | `{ y, fn(ctx) }`, or an array of them; sorted by `y` with everything else |
| `act` | first | `n, state` | `true` if SPACE was yours |
| `hint` | collect | `near, state` | `{ x, y, text, color }` |
| `key` | first | `raw, shift` | `true` if the key was yours |
| `esc` | first | — | `true` if ESC closed something of yours |
| `tick` | collect | `state, dt` | nothing; every frame |
| `hud` | collect | `state` | `{ text, kind, title }` — a chip in the top bar |
| `lang` | collect | — | nothing; redraw your own panel |
| `help` | collect | — | a string appended to the key strip at the bottom |

`layout` is called on every plan rebuild **and** once after the modules load, because the floor is usually built before they arrive. Make it idempotent, or you will push the same thing twice.

Your panel is your own element, created by you and appended to `body`. The core markup has no holes waiting for it. Panel chrome (`.vwrap`, `.vhead`, `.grid`) and `focusRing` from `web/ui.js` are yours to reuse: the keyboard walks panels the same way everywhere, and a second way to walk buttons is a second office.

If your thing stands on the floor, give it `w` and `h` — the collision table in `blocked()` cannot know a stranger's kind. Measure from the core's constants, never from a number you copied: a hand-copied wall thickness once put an object fourteen pixels inside a wall, with every hook answering correctly.

## The server half

`server.js` exports whatever it needs, all optional:

```js
export const defaults = () => ({ mything: { key: '' } });
export const merge = (prev, patch) => ({ mything: { ...prev.mything, ...(patch.mything || {}) } });
export const publicView = (s) => ({ mything: { ...s.mything, key: undefined, hasKey: !!s.mything.key } });
export const onPatch = (patch) => { if (patch.mything) forgetCache(); };
export const observe = async (now, prev) => { journal.record(now, prev); };

export async function route(url, req, res, send) {
  if (url.pathname !== '/api/mything') return false;
  send(res, 200, { ok: true });
  return true;   // «я забрал этот запрос»
}
```

Settings live in the office's one file, in your own section — a module does not get a settings file of its own, or there would be as many as there are modules. `merge` is how a value survives a save the page never saw; `publicView` is how a secret stays on the server. The module cuts its own secret out, because it is the only one that knows where it is.

`observe` is called once per office tick with the snapshot the core has just
built and the one before it, on the **server**. Use it when your module keeps
history or counts something: the client point `tick` is a browser frame, and the
browser is often closed while the office keeps running. Observers are awaited,
so a journal can rely on order; one that throws is logged and does not stop the
tick or the other observers. An event is a difference, so both snapshots are
handed over — the core does not compute the diff for you.

`route` **must return `true`** when it answers. Returning the result of `send` returns `undefined`, the core reads that as "not mine", and then tries to answer a second time into headers that are already gone.

Module routes run after every core route: a module extends the office, it never redefines it.

## Failing loudly

A module that does not load must say so. The server prints it at startup, the page warns in the console, and the stand card (below) shows both sides separately — the server can have loaded a module the page did not.

That distinction is not theoretical. A module once registered on the server, declared a point the loader did not have, threw inside `register`, and vanished from the page — while the server cheerfully listed it as up.

## The stand

While developing, run the office with a name for what you are checking:

```bash
VALEY_STAND="what I am testing" npm start
```

A card appears in the corner with the branch, the port, and every module with a switch. The switch is a **simulation**: the files stay on disk and only what the office knows about them goes away. It answers "how does the office look without this", never "does it build without this" — for that, move the folder away.

`tools/shot.mjs` photographs a running office from the terminal, walks it with `--keys`, enters a room directly with `--url '…/#room=<key>'`, and looks inside the live page with `--eval`.

## A hole worth knowing

`/callback` stays in the core. It is an OAuth return address, and a module cannot add itself a static route; inventing a point for one line was worse than the line. If your module needs an OAuth redirect, it lands there.
