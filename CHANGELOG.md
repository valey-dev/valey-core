# Changelog

What changed from release to release, newest first. The sections are assembled from conventional commit prefixes — `node tools/release.mjs minor`.

Three things, so the file does not mislead. **The hashes lead into the project's own history, not this repository**: it starts at a single commit, and nothing here can be found by them. **Some entries describe modules that are not here** — the office is a core plus a `modules/` folder, and not every module sits next to the core. And **entries about internal documents were cut**: they pointed at files this repository does not contain, and said nothing to a reader of it.

## v0.2.0 — 30 August 2026

### Added

- **sheet:** a state sheet the code draws, not a hand copy (dce61be)
- **office:** the lounge moves down to the service tier (cccbd00)
- **lift:** the service tier is floor 1, not the basement (4b9aa59)
- **security:** a suspended file gets a red stamp, and the cabinet is solid (043f0c8)
- **security:** the filing cabinet hands out personnel files (be26b75)
- **office:** the meeting room, second room of the service tier (b2e506c)
- **names:** give names back when a session is gone, and a gender with each (bbf4e60)
- **name:** the office is called Valey (d09c65f)
- **card,viewer:** the last two click-only spots take the keyboard (f2db84f)
- **panels:** переодеться, окно в мир and цвет офиса take the keyboard (dbdbdb8)
- **notes:** the notes panel answers to the keyboard (40339e1)
- **panels:** обход and the radio answer to the keyboard (4194749)
- **layout:** the office grows upward and is numbered from the ground (56a4734)
- **lift:** floors can be picked from the keyboard (c17543d)
- **shot:** arrow keys, so keyboard work can be checked by keyboard (e1f4ab9)
- **dialog:** the file list answers to the keyboard (64fd509)
- **office:** hang the night-shift poster in the control room (0065520)
- **shot:** record the walk, not just one frame of it (0e6a879)

### Fixed

- **release:** the last tag is not the last release (94bf6d4)
- **shot:** F9 works while the cameras are on, and the letter keys exist (cf4ab69)
- **ui:** two vh values mean what they say at 175% (a0b5bf0)
- **sessions:** one session is one person, even in two files (a313277)
- **shot:** an unknown key in --keys fails instead of doing nothing (237608b)
- **office:** a service room in the draw loop was killing the frame (df307c9)
- **easel:** size the overflow note to its number (0bd5073)
- **office:** the floor sign's second line was drawn off its plate (bbd115d)
- **easel:** a tall frame no longer hides its top under the header (d9eb989)

### Other

- refactor(storage): browser keys drop the AI, like the product (7a3d6cc)
- refactor(ui): four panels share one focus ring (7f516be)
- refactor(layout): service rooms live in rooms, not beside it (a2ef66e)
- Стол закрепляется за сессией и переживает перезапуск (d007573)

## v0.1.0 — 30 August 2026

The first pinned release: 79 commits since 25 August, everything above this line. The pixel office, live Claude Code agents, notes on the desk and a task sent into a chat, paintings and the easel, the title screen, the lift, weather in the window.

This section was written by hand rather than by the generator, and it is the only one. Conventional prefixes arrived on 29 August; of those 79 commits only a handful carry one, and the generator would have produced seventy lines of "Other" instead of a description. From the next release the history is tagged throughout and assembles itself.
