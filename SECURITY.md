# Security

Valey reads `~/.claude` and shows it on a floor. That is the product, so the boundary worth defending is a narrow one: nothing leaves the machine, nothing runs that the user did not ask for, and nothing an agent wrote can act on the user's behalf. A report that shows any of those three broken is a security report.

## Reporting

Write to **security@valey.dev**. Do not open a public issue: an issue is indexed within minutes, and a fix takes longer than that.

You will get a reply from a person, not an autoresponder, within a few days. There is no bounty programme and no PGP key yet; if either appears, this file will say so.

Please include what you ran, what you saw, and — if you can — the smallest office that reproduces it: a made-up `~/.claude` with one project and one transcript is usually enough. Do not send a real transcript.

## What counts

The places where a bug becomes a security bug, in the order they worry me:

- **Anything leaving the machine.** The office makes exactly two outbound requests, both opt-in and both documented in the README: coordinates to open-meteo when the weather is switched on, and the user's own Spotify app from the radio module. A third one is a bug regardless of what it carries.
- **Rendering.** Transcripts, notes and files are text an agent wrote, rendered by `web/markdown.js`, `web/highlight.js` and the HTML sandbox. Script execution from that content is the serious case, because the page can `POST /api/task`, which runs `claude --resume <session> -p` — a task delivered into a live Claude Code session.
- **Files.** `server/files.js` serves files out of project directories. Reading outside them is the classic and the first thing to try.
- **Network mode.** `VALEY_EXTERNAL=1` exposes the office on `0.0.0.0` behind a one-request token that moves into a cookie. Reaching the office without the token, or keeping the token in a URL, is in scope. Guests and invites (`server/network.js`, `server/permit.js`) live here too: a guest seeing what the owner did not grant is in scope.
- **The installer.** `install.sh` verifies a checksum before unpacking and refuses to run without one. A way past that check is in scope.
- **Modules.** `server/modules.js` loads any folder under `modules/`, following symlinks on purpose. A module is trusted code by design; a bug in the *loader* that runs something the user did not put there is not.

## What does not count

- **The office can read your transcripts.** Yes. Locally, by design, and the source is short enough to check.
- **Paid modules run without a licence key.** Also by design. The key is not a lock and the free build has none; the sources are readable, so any lock would be a promise nobody could keep. Using a paid module you did not pay for is a licence matter, not a vulnerability.
- **A Claude Code session did something bad.** The office shows sessions; it does not run them. That is a report for the tool that did.

## Supported versions

The latest release only. `main` is always shippable and a release is cut per accepted feature, so there is no older line receiving fixes. A fix ships as a new patch release, never as a rewrite of a published one.
