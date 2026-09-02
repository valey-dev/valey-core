# Valey

A pixel-art office for the agents you already run.

Your Claude Code sessions become people in rooms — one room per project, one
person per session. They type, get up for coffee, pin finished work on the
board, and wave when they are waiting on you. Instead of a list of chats that
all look the same, you glance at a floor and see who needs you.

![The office](docs/office.png)

## Run it

```bash
npm start
```

Then open <http://localhost:5177>.

**There is no install step.** Not a missing instruction — the project has no
dependencies, so there is no `npm install` to run and no `node_modules` to
appear. The only foreign thing in this repository is the JetBrains Mono font in
`web/fonts/`, shipped as files under the OFL, because the office works without
internet.

### If you do not have Node

Node is the one thing you need. Check with:

```bash
node -v
```

It should print `v18` or higher. If it prints nothing, or a smaller number:

* **macOS** — `brew install node`, or the installer from [nodejs.org](https://nodejs.org).
* **Windows** — `winget install OpenJS.NodeJS.LTS`, or the same installer.
* **Linux** — your package manager's `nodejs` package, or [nvm](https://github.com/nvm-sh/nvm)
  if you would rather not touch the system one.

npm comes with Node, so there is nothing else to fetch. If `node -v` works and
`npm start` still does not, run `node server/index.js` — the error it prints is
the useful one.

## What it shows

* **Who is in** — from `~/.claude/sessions/*.json`: pid, working directory,
  session name. Alive is checked with `process.kill(pid, 0)`.
* **What they are doing** — the transcript is read incrementally: the last tool
  call, the last thing said, whether the turn ended and they are waiting on
  you, which files they touched, which git branch they are on.
* **Their trade** — from the tools they reach for. Edits code, so: developer.
  Opens design files: designer. Searches the web: researcher.
* **Their face and name** — a deterministic hash of the session id, so the same
  session is the same person every time you look.
* **The floor** — rebuilt whenever the cast changes, but a project keeps its
  slot, so somebody else starting work never shuffles your rooms.

Finished work goes on the board in the room. `.md` renders, code is
highlighted, images get a pixel loupe. You can leave notes on any line of a
conversation, and put a task on someone's desk.

## Nothing leaves your machine

The office reads `~/.claude` on your own machine and draws the floor from it.
Transcripts, code and project names are never sent anywhere.

Two exceptions, both yours to switch on, both named out loud:

* **The weather** outside the corridor window is invented until you turn on the
  real one — then a pair of coordinates goes to open-meteo, and nothing else.
* **The radio** plays through your own Spotify app, with a client id you create
  yourself. It is a module; delete the folder and the radio is gone.

There are no accounts, no telemetry and no analytics. The server is seven files
and you can read every one of them before you run it — that is the point of the
licence below.

## Modules

The office is a core plus a `modules/` folder. A module is a directory with a
`module.json`; the core knows exactly one thing about it — whether the folder
is there. Nothing is hidden behind a check, because a build without a feature
is a build that does not contain it.

`modules/radio` is the worked example: a thing in the corridor, a panel, its
own settings section, its own server route, its own dictionary and its own
test. Delete the folder, restart, and the office comes back without a radio —
no gap, no placeholder, no message about it.

Writing your own is [documented here](docs/modules.md).

## Keys

`WASD` walk · `SHIFT` run · `SPACE` talk, and drink at the cooler ·
`TAB` the round · `N` notes · `C` change your look · `P` window on the world ·
`U` office colour · `M` sound · `R` radio · `+` `0` scale ·
`ESC` back. The security room is below the floor and has the cameras.

## Tests

```bash
for t in tools/test-*.mjs modules/*/test-*.mjs; do node "$t"; done
```

No framework: each file prints its checks and exits non-zero if one failed.
They cover the parts that break quietly — markdown, syntax highlighting,
notes, plural forms in two languages, session parsing, the floor plan, the
module loader, and the keyboard in every panel.

Everything drawn is checked with eyes: `tools/shot.mjs` takes the picture from
a terminal, walks the office with `--keys`, and looks inside the live page with
`--eval`.

## Licence

[AGPL-3.0](LICENSE). Use it, read it, change it, run it for yourself or your
team. If you distribute a changed version, or run it as a service for other
people, your changes are theirs to read too — the same deal you get here.

Contributions need a signed agreement; see [CONTRIBUTING.md](CONTRIBUTING.md)
for what it says and why.

What changed between releases is in [CHANGELOG.md](CHANGELOG.md).

## Not affiliated with Anthropic

Claude Code is Anthropic's. This is an independent project that reads the
session files Claude Code leaves on your disk, and nothing else. It is not
endorsed by, and has no connection to, Anthropic.

Built by [Sergei Goriugin (xoyk)](https://github.com/xoyk).
