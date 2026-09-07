# Changelog

What changed from release to release, newest first. The sections are assembled from conventional commit prefixes — `node tools/release.mjs minor`.

Three things, so the file does not mislead. **The hashes lead into the project's own history, not this repository**: it starts at a single commit, and nothing here can be found by them. **Some entries describe modules that are not here** — the office is a core plus a `modules/` folder, and not every module sits next to the core. And **entries about internal documents were cut**: they pointed at files this repository does not contain, and said nothing to a reader of it.

## v0.22.1 — 7 September 2026

### Fixed

- **settings:** refuse stale config writes (eea8fd1)
## v0.22.0 — 7 September 2026

### Added

- **git:** clean merged branches safely (0b9e56c)

### Fixed

- **git:** retry cleanup after worktrees go idle (875ff3d)
- **release:** clean the merged branch after shipping (4174247)

### Other

- build(git): require a release tip on main pushes (3f07067)
- ci(git): report merged branches left on origin (111cdac)
## v0.21.6 — 7 September 2026

### Fixed

- **i18n:** make English the distribution default (4fa6a61)
- **i18n:** make public source commentary English (68e1ccd)
## v0.21.5 — 7 September 2026

### Fixed

- **entrance:** on a phone the release card covered the menu (edc9986)
## v0.21.4 — 7 September 2026

### Fixed

- **dialog:** the closed-access line was styled by a class that does not exist (6530517)
## v0.21.3 — 7 September 2026

### Fixed

- **release:** keep module releases inside a core host (2a52fa2)
## v0.21.2 — 7 September 2026

### Fixed

- **release:** land carries an explicit catch-up through (3584446)
## v0.21.1 — 7 September 2026

### Fixed

- **tree:** stop downward navigation at the last skill (cb429f2)
## v0.21.0 — 6 September 2026

### Added

- **viewer:** Fn+↓ scrolls a tall picture, not just the mouse (dfe78a7)
## v0.20.0 — 6 September 2026

### Added

- **modules:** a module route can ask the office whether this is the owner (4ed115c)
- **tools:** stand-stop puts out your own office and refuses everyone else's (3a2ad7f)

### Other

- test(tokens): the mockups' palette is checked against :root instead of trusted (bec307f)
## v0.19.0 — 6 September 2026

### Added

- **release:** the same release tooling can cut a version in a second repository (cfc49fc)
- **radio:** Spotify becomes a key on the shelf, and the receiver stops explaining itself (8b9fc22)

### Fixed

- **i18n:** the language of the device is asked in a browser, not in a stand (642e9a7)
- **office:** the copy button on a key card answers on itself, not in a toast (49da087)
- **office:** the key shelf is walked with the keyboard, card and all (c8fba04)
## v0.18.0 — 6 September 2026

### Added

- **office:** the standup — everybody by team, with the task they named themselves (95e0984)

### Fixed

- **stands:** the comment guard could not see past a regex holding a backtick (911d82a)
## v0.17.0 — 6 September 2026

### Added

- **pager:** an option of a question is pressed, by mouse or by keyboard (f3ea532)

### Fixed

- **permit:** the canonical office is named, and every other one says it is not (4cfc8a4)
- **pager:** the sentence under an option travels with it (358ed45)
## v0.16.0 — 6 September 2026

### Added

- **stand:** «~» folds the test plaque into a small tab (8218ad1)
## v0.15.0 — 6 September 2026

### Added

- **radio:** S starts and stops the music from anywhere in the office (94adc4b)
## v0.14.3 — 6 September 2026

### Fixed

- **radio:** the field for a new wave gives the keys back to the office (ad54100)
- **radio:** the focused row keeps the panel's padding under it (9b93136)
- **radio:** three waves no longer hang out of the panel at 175% (ce4c46d)
## v0.14.2 — 6 September 2026

### Fixed

- **pager:** Esc closes what is in front, and a question is shown as a question (3158fd8)
- **pager:** the badge in the corner can be pressed, and the version stand stops crying wolf (7b84260)
## v0.14.1 — 6 September 2026

### Fixed

- **keys:** typing in a field is a line on the card's board, not a place of its own (5613070)
- **keys:** the lift takes all four arrows, not two (171fe62)
- **keys:** two captions broke mid-word on a narrow cap (8f29f15)
- **plan:** the floor keeps answering with the plan open, and the board says so (4ccf04c)
- **keys:** the board lights the floor wherever the floor still answers (911bd33)
## v0.14.0 — 6 September 2026

### Added

- **lang:** the office comes up in the language of the device, not in Russian (de46eb2)

### Fixed

- **names:** «Костя» in the Russian pack was typed on the wrong layout (902d0b4)
- **title:** the entrance menu is laid out after the canvas, not before it (d150a16)
## v0.13.0 — 6 September 2026

### Added

- **modules:** a module route can read the office settings (9b68277)
- **office:** the strip along the bottom is gone, the ? panel says it all (463c65b)
- **office:** the canvas takes the window, so a tall monitor shows more floor (000e103)
- **agents:** the shift — replies, characters and the gaps between them (a1bf739)
- **modules:** a module can be handed the office stream and told who it is talking as (977aa6d)
- **modules:** a module can be handed the floor — who is standing where, and how to reach one of them (36e7b70)
- **meeting:** the office introduces two browsers to each other and then gets out of the way (cf67e26)
- **office:** the inventory grows a keys shelf, and the office says what it connects to (a281d81)

### Fixed

- **office:** changing the interface size recounts the office, without a reload (6ff1ea2)
- **test:** a range with several features is a fifth right answer, not a broken dry run (585c185)
- **hud:** the HUD grows with the interface, not with the office (61a1714)
- **office:** the copy icon no longer hides while the cursor is crossing to it (de6fa6f)
- **office:** a guest asked for the modules before he was let in, and got an office without any (723165f)
- **shot:** two shots at once photographed the same browser, so two people read as one (e8fe739)
- **test:** a branch whose main was released past it is not a broken dry run (55026b2)
- **office:** the inventory keeps one height across its five tabs (5031b0a)
- **office:** keys take the last tab, and the hint stops counting digits aloud (ac56e00)

### Other

- docs(office): the tree points at the Prod section it was promoted to (649a855)
## v0.12.0 — 6 September 2026

### Added

- **plan:** the office plan names its own place on the keys board (ca80688)
- **keys:** «?» shows the keys of the place you are standing in, not of the floor (4129cb8)

### Fixed

- **keys:** every footnote on a cap is one the frame can actually print (22091db)
- **keys:** the caps say what the frame promised — the zoom keys, and the footnotes behind «·» (ade2ea7)
## v0.11.1 — 6 September 2026

### Fixed

- **release:** land clears its temporary tree even when the release fails (cf73ac3)
## v0.11.0 — 6 September 2026

### Added

- **release:** landing a pull request and cutting the version are one command (fac6084)

### Fixed

- **release:** the dry run of land cuts from the head and stops claiming it shipped (a5d9964)
- **release:** a version can be cut from any tree, and a skipped release now refuses (6495bad)

### Other

- test(release): the newest tag and package.json have to say the same thing (99c536c)
## v0.10.0 — 5 September 2026

### Added

- **lounge:** a bear skin in front of the sofa, head and teeth included (a9a65bb)
- **keys:** walking moves to the arrows, and WASD gives back its four letters (659ee0a)
- **keys:** the keyboard fills the panel instead of sitting in a column (9bed03e)
- **keys:** the whole keyboard on «?», and the strip below shrinks to one line (c54e314)
- **keys:** the strip at the bottom is built from the registry, so it cannot lie about the keys (21e219a)

### Fixed

- **sprites:** a look built by hand keeps its hair (a95f128)
- **keys:** T is «смена камер» and I is «гости», in words that fit the cap (aa56c2c)
- **keys:** the space bar acts alone, and E goes back to the free letters (e786dd9)
- **keys:** the space bar says «действие», the pager says «пейджер» (a067382)
- **keys:** one word for clothes everywhere, and F9 says what fits on a cap (3b0329c)
- **keys:** the panel highlights a key the way the frame does — a bar along its bottom edge (1f745b5)

### Other

- refactor(keys): the office answers to actions, and reads the key under the finger, not the letter on it (0a21c38)
## v0.9.0 — 5 September 2026

### Added

- **guest:** a guest says who they are at the door, not a minute later (ed7b726)

### Fixed

- **guest:** the word «ТЫ» stops being a name, in storage and over other people (4a697ea)

### Other

- docs(library): the tree says a guest gives a name at the door (1a81a5a)
- chore: give the Figma audit a command to type (6a8ec90)
## v0.8.1 — 5 September 2026

### Fixed

- **guest:** a stranger is «ГОСТЬ», not «ТЫ» — the office stops calling everyone you (7c13d9d)
- **office:** nobody was in a shared office, because presence went out without the pass (30a15e4)
- **guest:** the focus on «попросить доступ» is yellow, like the rest of a card's body (7cd8d4a)
- **invite:** a request that arrives while the panel is open shows up in it (40670da)
- **office:** in a shared office the owner was refused his own transcript (7e12ceb)
## v0.8.0 — 5 September 2026

### Added

- **release:** the range picks the digit, and one command carries a release to GitHub (c61d998)

### Fixed

- **test:** the dry-run stand no longer argues with the digit rules it triggered (adfc36b)
## v0.7.0 — 5 September 2026

### Added

- **tools:** an agent can sign what it drew and what it coded (0309d30)
- **notes:** a note can hang on a commit or a file, and lands in the same list (011e7b9)
- **script:** one take can cover several versions, not one each (7de3525)

### Fixed

- **office:** the tree keeps one height, whatever branch is open (f70c69d)

### Other

- refactor(landing): the public page leaves the office's repository (fd8df08)
- refactor(notes): the core keeps an address, not a commit (8ba2445)
- test(tokens): the names theme.js repaints must exist in :root (8924991)
- test(tokens): a colour written past :root now fails the run (be29ed5)
- refactor(office): the role and state accents got names in :root (2bb8e24)
- refactor(office): the panel colours that already had a name now use it (63e046d)
## v0.6.0 — 5 September 2026

### Added

- **dialog:** the card says what the agent works on, not what the chat is called (a16bddf)

### Fixed

- **release:** the video draft is the owner's paper, not a file in the repository (dd08722)
## v0.5.0 — 5 September 2026

### Added

- **release:** a tag becomes a page people can open, not just a pointer for git (484a3e6)

### Fixed

- **office:** the tree survives 175%, and the switch leaves the row of tabs (ecccaee)
## v0.4.1 — 5 September 2026

### Fixed

- **release:** the release script no longer blocks its own next run (20a0426)
- **test:** the release dry run stand goes green right after a release, too (8e0d76e)
- **office:** #room= reaches the service rooms, which is what it is for (9f116d6)
- **title:** the entrance menu appears in place, not on its way there (745fad7)
- **guest:** the arrows reach «попросить доступ», the one button that answered only a mouse (cf35a23)
- **guest:** the ask-for-access button was the one unpainted control in the office (3571e26)
- **network:** the token loses its lookalikes, and forgives the ones a hand adds (90db920)
- **office:** a guest saw rooms and no people, because one field never reaches them (0b6c312)
- **title:** the entrance prints the address it is actually served from (ef4c8a7)

### Other

- docs: the two-machine test was on 5 September, not the 4th (ada3310)
## v0.4.0 — 5 September 2026

### Added

- **office:** the tree gets a second, detailed view — six directions of the office (5373095)

### Fixed

- **shot:** the office plan can be photographed — K was in no key table (d190e4c)

### Other

- docs(modules): the last Russian comments are in English, and the repository is done (c84b49c)
- docs(radio): the comments of the radio module are in English (e38f454)
- docs(office): the comments of main.js are in English, and the core is done (109e2e9)
- docs(library): the last Russian comment in the tree data is in English (e184ad2)
- docs(readme) removed obsolete parts (2d73c91)
## v0.3.0 — 5 September 2026

### Added

- **agents:** the office counts what each agent actually does, by branch (f11eca5)
- **office:** a path, a command or a link is copied by the fragment itself (dca6715)
- **names:** the switcher opens a panel, and the office can be renamed from it (8a93059)
- **office:** a bench you can sit on, and do nothing (a0b9cfd)
- **office:** code blocks in the transcript and the viewer get a copy button (458aa77)
- **names:** the office can be named from a pack, not from the one dictionary (9282e56)
- **office:** the pager rings in the corner when an agent asks to run something (9aba40f)
- **office:** a permission prompt from Claude Code now waits in the office instead of only in the terminal (4d484a2)
- **pad:** the View button opens the office plan (25886b8)
- **plan:** an office plan on K, so "where is everyone" needs no lift ride (89d8f89)
- **office:** the inventory grows a «tree» tab showing what the next tier and the floor hold (3319a1b)
- **modules:** a module room is painted by the module that owns it (0cf5e34)
- **modules:** a module can add a room, which is what the seam promised (9240f33)
- **pad:** a gamepad walks the office, the keyboard keeps the text (76f257e)
- **skate:** ollie (6131f07)
- **dialog:** a key finishes the typewriter, not just a click (cc601fc)
- **modules:** a module can watch the office snapshot, on the server (e2966c0)

### Fixed

- **release:** the date of a section is English, like everything on its line (cb4d7f3)
- **office:** the number over a fragment no longer moves the line it sits in (70cf9f6)
- **office:** text in the panels can be selected again (154e207)
- **office:** the answer row in the permission card holds one line where the tab row does (57f2447)
- **dialog:** four buttons stay on one line at 175%, hints and all (5a52e5a)
- **office:** the answer buttons in the permission card were drawn by the browser, not by the office (379b1ad)
- **panels:** every panel with a field answers ESC, not just the invitation (fb4c3bb)
- **invite:** ESC closes the invitation panel, from the office and from its field (810a7ab)
- **office:** a question from a session the office has not indexed yet is no longer dropped on the first tick (1e88b3c)
- **office:** the easel grows from the work board, not from the paintings (691e70a)
- **test:** the module fixture says it is a module, and a missing file is a failure, not a crash (9821290)
- **radio:** the cover proxy follows no redirect and returns only images (26f9d0a)
- **settings:** a save cannot half-write the file, and a broken file is kept, not replaced (6d985fc)
- **release:** the script works on its own repository, not on the cwd (2b514e8)
- **server:** a module's default settings are there before the first save (1a6658d)
- **i18n:** the dictionary check asks only for the forms a language has (3d683c0)
- **office:** the stream comes back on its own, and I opens the invite panel (ca3022a)
- **title:** the language switcher says SPACE, not ПРОБЕЛ, when it offers English (07aab8f)
- **keys:** Cmd and Ctrl belong to the browser, not to the office (dd5c091)
- **modules:** a module's stylesheet is in place before its client runs (e52a9cb)
- **panels:** what an agent named stays text, and what it wrote is shown but never run (1dfa1a7)
- **server:** a foreign tab is not the owner, and one bad request no longer takes the office down (521ea95)
- **agents:** the rulebook page scrolls inside itself, and without animation (671cd4f)
- **agents:** the rulebook page scrolls to a section where # navigation is refused (3db09a8)
- **dialog:** Up finishes the reply, so the transcript block keeps the focus (4d526ac)
- **dialog:** the typewriter stole Enter from the transcript link (60a84fd)
- **rooms:** a worktree is the same project, so it gets the same room (0aa62a2)
- **rooms:** the tree belonged to the core, so it grew without its module (6102f8c)
- **office:** a constant the easel module still read out of the core (0a355c4)
- **office:** the floor was black after the extraction took MY_ID with it (688f9b4)
- **build:** the paid module's files were staged into the core by git mv (e4c0845)
- **network:** the office answered the whole Wi-Fi, and now answers this machine (cdb076d)

### Other

- docs(office): the comments of the floor plan and the drawing are in English (8ef47db)
- docs(office): the comments of i18n, the sprites and the entrance screen are in English (959485d)
- docs(office): the comments of the canvas modules are in English (c94d545)
- docs(office): the comments of fourteen small client files are in English (13c9c78)
- test(transcript): the four lines the comments stand caught are in English (e8eccbd)
- test(comments): a stand holds the English-comments rule instead of AGENTS.md alone (e7b96a5)
- docs(tools): the comments of the stands are in English (ef00a35)
- build(shot): --viewport, because Chrome will not make a window narrower than 500 (76ddd00)
- refactor(title): the plaque is its own module, and the scene opens three slots (1930433)
- docs(office): the copy button points at the frame it was promoted to (4e3057e)
- docs(agents): the rulebook came out on the 5th, not the 4th (439f13c)
- docs(server): the comments of the server half are in English (e9e6a15)
- ci(coverage): a floor under the stands, counted without giving the project a dependency (4218515)
- test(permit): the stand asks the system for a port instead of picking one (102f8f2)
- docs(office): the pager code points at the frames it was built from (ee18d4b)
- test(plan): the office plan stands on the shared DOM shim, like every other panel (dbfa119)
- docs(backlog): copy takes C inside the viewer, where the character sheet is not needed (a4a73d0)
- refactor(server): the office hands out its request handler, so routes are tested in this process (f0fd9bb)
- build(agents): the rulebook rides into every worktree by list, not by commit (41857e5)
- docs(backlog): a copy button for code blocks, drawn and waiting (18138aa)
- test: one DOM shim for the stands, and the card stops asserting a scroll that cannot happen (bba266f)
- ci: the actions move to v5, off the Node 20 runtime GitHub is switching off (49f781e)
- test: the stands stop depending on this machine, and a workflow runs them on 18, 20 and 22 (b1e56d7)
- docs(backlog): the permission request arrives as a pager, not a HUD line (64cfa6d)
- build(agents): the core's backlog follows the rulebook out of the tree (eaa9909)
- docs(backlog): the permission-request frame is drawn and linked from its item (ed7d9db)
- docs(backlog): the silent-failure batch is closed (2ed8c14)
- test(shot): the I key exists, so the invite panel can be photographed (1c84a54)
- build(agents): the rulebook comes back out of the tree (fa61726)
- docs(office): the tree's frames now live on Prod, section 18 (1329c20)
- docs(backlog): permission prompts can be routed into the office through the PermissionRequest hook (8523e69)
- docs(backlog): the help line still does not know about the ollie (a28a170)
- docs(skate,garden): the ollie stays at 18.2 px, and the accepted frames are linked from the code (1ec9915)
- docs(backlog): escaping and the file headers are done (d9ae041)
- docs(backlog): five server items closed by the hardening commit (793c388)
- chore(agents): git push asks instead of being denied outright (09349fe)
- docs(backlog): the core gets a backlog of its own (06d6f80)
- build(agents): the rulebook, its stamp and its page come into the tree (0c1add8)
- build(shot): the O key, so a panel that uses it can be photographed (37bd9af)
- refactor(core): the git tree leaves for a module of its own (fec248a)
- build: the rulebook stays out of the public history (3352a64)
- docs(agents): two rules were dropped by building this from a stale copy (34ba237)
- docs: a rulebook, because an agent here was starting from nothing (e3f8665)
- The core stops storing modules it does not own (deb1de6)
- docs: name the repository valey-core, and say why it is core (cd56e2f)
- docs: the landing page is not the office, and it does reach out (59c29be)
- Rebuild from the merged branch: the office is current again (843ec0a)
- docs: one line per paragraph, because these files are edited by hand (98212ae)
- docs: say how to get Node, and stop half-translating the changelog (c9e913e)
- docs: bring the changelog over, without the kitchen (7f1064a)
- Valey — a pixel-art office for the agents you already run (46c1c23)
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
- A desk stays assigned to its session across restarts (d007573)

## v0.1.0 — 30 August 2026

The first pinned release: 79 commits since 25 August, everything above this line. The pixel office, live Claude Code agents, notes on the desk and a task sent into a chat, paintings and the easel, the title screen, the lift, weather in the window.

This section was written by hand rather than by the generator, and it is the only one. Conventional prefixes arrived on 29 August; of those 79 commits only a handful carry one, and the generator would have produced seventy lines of "Other" instead of a description. From the next release the history is tagged throughout and assembles itself.
