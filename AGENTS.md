# Working agreements

Пиксельный офис как интерфейс к живым агентам Claude Code. Это репозиторий
ядра: сам офис и бесплатные модули. Платные модули и вся внутренняя
документация — в приватном репозитории, который разворачивается в `modules/`
этого же дерева.

<!-- local:two-repos -->
## Два репозитория в одном дереве

`modules/` принадлежит другому репозиторию — приватному. Отсюда правило,
которое стоит держать перед глазами: **`git status` в корне не видит правок в
`modules/`**, и наоборот. Коммит уходит туда, откуда позван: из корня — в
ядро, `git -C modules` — в приватный.

Списки в обоих `.gitignore` именные: ядро видит бесплатные модули поимённо,
приватный — только платные. Молчаливое «игнорируем всё чужое» однажды
проглотило бы платный модуль, забытый в рабочем дереве, — то есть увезло бы
его в публичную историю. Новый бесплатный модуль дописывается в `.gitignore`
ядра руками, и это не забывчивость, а решение: строка означает «этот модуль
бесплатный насовсем», потому что опубликованное не отзывается.

<!-- rule:reporting-back -->
## Reporting back

Every answer closes with the same three lines, after the substance rather than
instead of it:

```text
**Текущая фича/задача** — the thing being worked on, in one line.
**Статус** — where it stands: built / waiting for approval / blocked / pushed.
**Что нужно от меня** — what only the user can do. «Ничего» when that is true.
```

Answers here run long — measurements, decisions, what was rejected and why —
and this is the one place that says whether the thing is finished and whether
the user is holding it up. It summarises the message above it; it does not
replace it.

- One sentence per line. A status that needs a paragraph has a paragraph in the
  body and a sentence here.
- **`Что нужно от меня` is about the user.** Approvals, a choice between
  options, testing on a device, anything with credentials — things that cannot
  move without them. Never pad it with work the agent is about to do anyway.
- Write «Ничего» plainly when nothing is needed. An invented ask is worse than
  a blank one: it teaches the reader to skip the line.

<!-- rule:honest-reporting -->
## Saying what actually happened

The report is worth exactly as much as its worst sentence.

- **A check that was not run is not a passing check.** Say which ones ran and
  what they printed. "Tests pass" after running one file is a lie that costs
  someone else an afternoon.
- **A guess is labelled a guess.** "Probably the cache" and "the cache, the log
  line is at src/x.ts:40" are different claims and must read differently.
- **A wrong diagnosis gets corrected out loud**, in the message that finds it
  out, not quietly in the next commit. The user is making decisions on it.
- **Work that was skipped is named.** Scaling the job down is the user's call;
  reporting a smaller job as the whole one takes that call away from them.

<!-- rule:agent-names -->
## Names

Agents here are called by whatever name the person talking to them uses. If you
are addressed by a name, that is your name for the rest of the conversation:
answer to it, and do not spend a line correcting it.

It costs nothing, and it saves the "actually I am ..." exchange that would
otherwise open every session. What does not change is what sits behind the name
— if someone asks directly what you are, say it plainly. A nickname is a way of
being addressed, not a claim about who is answering.

<!-- rule:backlog -->
## The backlog

There are two, split the same way as the repositories. `BACKLOG.md` here is
the core's: bugs and work in the office itself, readable by anyone who has the
code. `modules/BACKLOG.md` in the private half holds everything about paid
modules, the business and internal documents. Each holds everything known to
be worth doing on its side and nothing else: the answer to "what next?" and
the place a bug or an idea goes when it is noticed in passing. Read both
before proposing work, add to the right one rather than mentioning something
once in a conversation, and close an item by deleting it.

Add to the end of a section rather than the top: everybody edits this file, and
appending turns most collisions into no collision at all.

<!-- rule:parallel-work -->
## Working in parallel

**One agent, one working tree.** Two agents in a single checkout share a `HEAD`,
an index and a working tree, and there is no way to be careful enough about
that: `git add -A` sweeps up somebody's half-written file, `git revert` refuses
because their edits sit in a file it must touch, and committing "only my lines"
from a shared file means building index blobs by hand. Branching inside a shared
checkout is worse than not branching, because a checkout switch pulls files out
from under whoever else is typing.

```bash
git worktree add ../ai-valey-<topic> -b <topic>
cd ../ai-valey-<topic>
```

- **Outside the repository, not under it.** A worktree inside the checkout gets
  walked by the linter and by every file watcher in the project.
- **Nothing to install, and do NOT copy `.settings.json` — give the tree its own
  settings file instead.** The project has no dependencies — Node 18+ and that
  is all — so a fresh tree runs as it stands. Settings moved out of the repo on
  30 August 2026: they live in `~/.config/valey/settings.json`, and the file
  next to the code is the legacy copy, ignored the moment the new one exists. So
  every office on this machine — yours and every worktree — reads and writes the
  SAME file: names, seats, the Figma token, and now the dress code.

  ```bash
  cp ~/.config/valey/settings.json /tmp/valey-<topic>.json
  VALEY_SETTINGS=/tmp/valey-<topic>.json PORT=5178 npm start
  ```

  Seeding it from the real one keeps the names and the weather you are used to.
  On 31 August 2026 the dress-code branch skipped this, flipped its new switch
  to see it work, and changed the clothes in the user's own office two ports
  over. Nothing was lost — the switch went back — but a worktree that reaches
  into the office you are working in is not isolation, it is a shared mutable
  file with extra steps.

  **Стенд поднимается с табличкой.** Офис на 5177 и офис на 5188 выглядят
  одинаково, и это уже стоило времени дважды: кадр из чужой ветки прочитался
  как «фича не работает», а пустой этаж в режиме shared — как поломка сборки.
  Переменная `VALEY_STAND` вешает в углу жёлтую табличку: что проверяем, какая
  ветка, какой порт, какие модули поднялись и какие не встали.

  ```bash
  VALEY_SETTINGS=/tmp/valey-<topic>.json PORT=5188 \
    VALEY_STAND="что проверяем" npm start
  ```

  На табличке же — переключатели модулей: клик гасит модуль и перезагружает
  страницу, второй клик возвращает. Это **имитация, а не бесплатная сборка**:
  файлы остаются на диске, отключается лишь то, что офис о них знает.
  Настоящая проверка — та, где папки `modules/` нет; переключатель отвечает на
  вопрос «как офис выглядит без него», а не «собирается ли он без него».
  Состояние живёт в памяти сервера и умирает с ним: забытая галочка не должна
  пережить перезапуск.

  В обычном офисе таблички нет вовсе — снимать её перед показом не нужно.
  `shot.mjs --url` принимает адрес целиком, а `#room=<ключ>` заводит сразу в
  комнату, включая служебные: пешком до пультовой не дойти, в списке TAB её нет.

<!-- rule:worktree-limits -->
### What worktrees do not fix

Files everybody edits — `BACKLOG.md`, this file, translation dictionaries. A
worktree turns silent clobbering into an ordinary merge conflict, which is the
win. Anything with a single shared history and no branches — a design file, a
tracker, a live environment — is not helped at all and needs an owner named per
piece of work.

<!-- rule:commits -->
## Commits

- **Commit each piece as it lands**, not once at the end. A branch with one
  commit called "work" cannot be reviewed, reverted in part, or explained.
- **Run the checks before the commit leaves this machine.** A local commit is
  free to rewrite; a pushed one is not.

  ```bash
  for f in server/*.js web/*.js; do node --check "$f" || break; done
  for t in tools/test-*.mjs; do node "$t" > /dev/null || echo "УПАЛ: $t"; done
  npm start   # затем пройтись по офису на localhost:5177
  ```

  **Всё нарисованное проверяется глазами, и для этого есть `tools/shot.mjs`.**
  Он поднимает headless-Chrome, доводит офис до нужного места клавишами и кладёт
  кадр на диск — тем, у кого браузера под рукой нет. `chrome --screenshot` тут
  не работает вообще: страница держит открытым `/api/stream`, событие `load` не
  наступает. В самом офисе то же самое делает F9 (кадр 1:1) и Shift+F9 (×4).

  ```bash
  node tools/shot.mjs --port 5178 --keys "Enter,wait:2500,hold-w:1500,shift-F9"
  ```

  **`--port` says whose office to photograph, not which one to start.** shot.mjs
  starts a browser, never a server: it talks to whatever already listens there.
  On 31 August 2026 two frames of the dress code came back in ordinary clothes
  and read as "the feature does nothing" — port 5179 belonged to another
  worktree's office, running code that had never heard of it. Before believing a
  frame, check whose port it is:

  ```bash
  lsof -a -p "$(lsof -ti tcp:5179 -sTCP:LISTEN)" -d cwd -Fn
  ```

  Мелкий текст по макету не судить. Холст 400×225 растягивается целыми
  пикселями, и 29 августа 2026 табличка, на макете читавшаяся при ×6, в офисе
  показывала «v8.1.8 · Mode» вместо «v0.1.0 · Node». Нашлось это первым же
  настоящим кадром — и только им.

  **There is no linter and no typechecker here, and the tests cover part of the
  code, not all of it** — разметка и подсветка, разбор транскрипта, заметки,
  склонения в i18n, внешность и профессии агентов, загрузчик модулей и разбор
  манифестов, доступ по сети, пиксельный шрифт с геометрией таблички и
  несколько клавиатурных стендов. Клавиатурные ходят по подставному DOM:
  проверять там нечего кроме состояния фокуса, зато оно ломается тихо.
  Список неполон и устаревает — он тут затем, чтобы было видно, чего в нём
  нет: холста, раскладки этажа и всего, что судится глазами.

  **И открыть страницу, а не только дёрнуть сервер.** 3 сентября 2026 дерево
  гита вынесли модулем: `node --check` прошёл по всем файлам, 33 стенда ядра и
  5 модульных были зелёные, `/api/git` отвечал настоящими коммитами — а офис
  после входа показывал чёрный экран. Вырезая код панели, скрипт захватил
  соседнее объявление `MY_ID`, и это видно только в браузере: ссылка на него
  живёт внутри функции, синтаксис её не ловит, а тесты туда не заходят.
  Проверка стоит пяти секунд и делается последней, а не вместо остальных.

  **Count them, do not quote this number.** 29 августа 2026 два отчёта и одно
  сообщение коммита сказали «все пять tests проходят», когда файлов было
  восемь: цифра пришла из этого абзаца, а не из прогона. Вывод случайно уцелел —
  проходили все, — но «пять из восьми» читается как треть непроверенной работы.
  Строка выше устаревает при каждом новом тесте; `ls tools/test-*.mjs | wc -l`
  не устаревает никогда.

  Say which ones ran instead of implying a green run: everything drawn is still
  the eye, and a change to the canvas is not verified until somebody has walked
  past it.

- **Conventional Commit subjects**, from 29 August 2026 onward:
  `<type>(<scope>): summary`, where the type is one of `feat`, `fix`, `perf`,
  `docs`, `test`, `refactor`, `build`, `ci`, `chore`. The prefix is what lets a
  range be read by a generator, a reviewer or a bisect without opening each
  diff.

  This office wrote its own prefixes instead — `Merge:`, `Backlog:`, `Record
  the …` — and none of the last sixty commits was conventional. They are not
  wrong, they are just private to this repo, which is the problem: nothing that
  reads a history can read this one. Like the language rule above, the date is
  the whole of it. **Everything before it stays as it is**: the history is
  pushed, and rewriting sixty subjects to match would break every clone for a
  cosmetic gain.
- **The message says why, not what.** The diff already says what. The line
  worth writing is the one a reader needs in six months: what was broken, what
  was rejected, what will bite if this is undone.
- **Commit messages are in English**, from 29 August 2026 onward. Everything
  before that date is Russian and stays Russian: the history has been pushed,
  and rewriting it to match would break every clone and the landing page for a
  cosmetic gain. So `git log` reads bilingual, split at one date — that is the
  intended state, not drift someone should tidy up.

  This covers commit messages only. The office speaks Russian and English to
  whoever walks through it, `BACKLOG.md` and the code comments stay Russian, and
  this file stays as it is. Nothing else changes language.
- **Pushing is a separate decision from committing.** `origin` is
  `xoyk/valey-core-staging`, a private staging repository; the public one,
  `xoyk/valey-core` — AGPL-3.0 — is where this history is meant to end up, and
  `package.json` already names it. **Pushing is the user's call, every time**,
  and creating the public repository on GitHub is theirs alone. Ask; do not
  push because the work looks finished.

  Стейджинг — не публикация: он приватный, и до появления публичного
  репозитория история ещё правится. Но ушедшее в origin уже читают другие
  сессии и клоны, поэтому `--amend`, rebase и `push --force` по запушенному
  делаются только со словом пользователя и с отчётом вслух. После публикации
  не делаются вовсе: правится только новым коммитом.

<!-- rule:user-only -->
## Things only the user does

Never do these, whatever the framing, and say plainly that they are the user's:

- Typing passwords, API keys or card details into anything.
- Publishing, sending, or posting outward on their behalf without a clear yes.
- Anything destructive without naming exactly what will be lost first.
- **Sending a task into a live chat.** «Отправить в чат» runs
  `claude --resume <session> -p` against one of the user's real sessions: the
  exchange lands in that transcript for good, and with `bypassPermissions` the
  agent gets the terminal. Leaving a note on the desk is the game; delivery is
  the user's call, every time.
- **Turning on real weather.** It is the one thing in the project that talks to
  the outside world — a pair of coordinates to open-meteo. Off by default, and
  it stays the user's switch.
- **Killing a server somebody else started.** Port 5177 usually belongs to
  another session's office; ask rather than reclaim it.

  **Убирать за собой — по PID своего процесса, а не по имени.** 29 августа
  2026 свой сервер на 5178 гасился так: `pkill -f "node server/index.js" -n`.
  Флаг `-n` («только самый новый») читается как страховка и ею не является:
  под шаблон попадает и чужой офис, а кто из них запущен позже — вопрос
  случая. Улетел процесс на 5177, офис пользователя лежал минуту.
  `lsof -ti :<свой порт>` находит нужный процесс — но **не только его**.
  30 августа 2026 на порту 5182 та же команда вернула три pid: сервер и два
  браузера, у которых был открыт офис. `xargs kill` по этому списку закрыл бы
  пользователю Brave и Helium заодно с сервером. Порт держит и тот, кто слушает,
  и тот, кто к нему подключён, а `-i` не различает их. Поэтому pid проверяется
  перед ударом — `lsof -a -p <pid> -d cwd -Fn` показывает рабочий каталог, и
  свой сервер виден по нему сразу. Или сразу сужать до слушающего:
  `lsof -ti tcp:<порт> -sTCP:LISTEN`.
  И если чужое всё же упало — поднять обратно и сказать об этом вслух, а не
  надеяться, что `--watch` перезапустит: тот сервер был запущен без него.

  **И свой тоже не гасить, пока работу не приняли.** Хост, поднятый для показа,
  принадлежит не тому, кто его поднял, а тому, кто будет смотреть. 30 августа
  2026 фича была дописана, проверена и погашена в одном сообщении: сервер
  на 5182 убит в той же уборке, что и временные файлы, — и пользователю,
  открывшему офис по ссылке из отчёта, смотреть стало нечего. Приёмка — это
  событие пользователя, а не конец работы агента.

  **И поднимать его из ветки, а не из главного чекаута.** Смотреть надо ровно
  тот код, который предлагается принять, а `main` под ним успевает уехать:
  пока писалась эта фича, он ушёл вперёд четыре раза.

<!-- local:design-pointer -->
## Design comes first

Development starts only after the relevant frame is approved: **approved frame
→ implementation**. An exception is allowed only when the user explicitly says
the rule may be bypassed for this piece of work.

Сам файл макетов приватный, и вся механика работы с ним — секции `WIP`,
промоушен на `Prod`, архив, версии, раскладка и токены — лежит в приватной
половине рулбука, `modules/AGENTS.md`. Здесь остаётся само правило: без
утверждённого кадра код не начинается.

<!-- rule:release-notes -->
## Release notes come from commits

The changelog section for a release is assembled from the subjects of the
commits since the previous `v*` tag: `node tools/release.mjs minor` groups
`feat`, `fix` and `perf` under *Added*, *Fixed* and *Faster*, and puts
everything else under *Other*. So the notes for a version are generated from
the range rather than remembered afterwards. There is no second audience and
no trailer here: the subject *Commits* already requires of every commit is the
note.

Rules:

- `feat`, `fix`, `perf` for a visible change. `docs`, `test`, `refactor`,
  `build`, `ci`, `chore` only for changes that need no user-facing note: they
  land under *Other*, and a reader of the changelog skips that section.
- A subject describes **the outcome**, never the implementation, and names the
  place: `fix(office): the floor was black after the extraction took MY_ID
  with it`, not `fix: null check`. A reader of the changelog must be able to
  tell what changed without opening the diff.
- The scope goes in front of the line in bold — `**office:**` — so a subject
  without a scope reads as a line about the whole product. Give it one.
- Merge commits are skipped by the generator (`--no-merges`); put the subject
  that matters on the product commit.
- Run the dry run before the commit leaves this machine:

  ```bash
  node tools/release.mjs patch --dry
  ```

  It prints the section as it would be written and how many commits fell into
  *Other*. A visible change sitting there is a wrong prefix, and it is cheap to
  fix while the commit is local; fixing it after the push costs a rewrite of
  published history.

<!-- rule:finishing-release -->
## Finishing a release

`tools/release.mjs` bumps `package.json`, writes the section into
`CHANGELOG.md`, commits `chore(release): vX.Y.Z` and puts an annotated tag on
**that exact commit** — never on `HEAD` by assumption, and never over a dirty
tree: the script refuses one, because a stray edit in the release commit is a
change nobody reviewed. The tag is the only thing that answers "which code is
vX.Y.Z?".

**Finalizing is not finished while the release is still on this machine.** The
script does not push, and the last act is to ask the user, in the same message
that reports the tag: here is the section, here is the tag, do you want it
pushed. A minor release also drops a draft of the video script
(`tools/script.mjs`), and that draft is the user's to edit. v0.2.0 went out
without a video because the rule lived in a README nobody opened; the draft
appearing by itself, next to the tag, is the fix.

Do not `--amend` or move a tag that has been pushed. A release that turns out
wrong gets a patch release, not a rewrite.

<!-- rule:publishing -->
## Publishing

`web/landing.html` is the project's public page, valey.dev. Cloudflare Pages
builds `_site/` on its own side from this repository, so a push is a publish:
the build does not run here, and there is nothing to inspect between the push
and the page.

Publishing is not an edit that can be taken back. Both rules below were paid
for once already, on another project, and both look like paranoia until the
day they do not.

<!-- rule:publishing-is-overwriting -->
### A file cannot be unpublished, only overwritten

**Symptom** — screenshots on a live site carried real customer data: issue
keys, summaries, the initials of the people assigned. They were deleted from
the repository and pushed. The HTML updated correctly and stopped referencing
them; both image URLs went on answering `200` with the original bytes —
`cf-cache-status: HIT`, `age: 320`, `cache-control: public, s-maxage=604800`.

A deployment that no longer contains a file does not evict what the edge
already holds, and a query-string cache-buster does not shift it either. Left
alone it would have served the real data for a week.

What worked was a deployment putting **new bytes at the same paths**, confirmed
by fetching them: 88069 B → 1978 B, about two minutes after the build.

```bash
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' https://<site>/<asset>
```

So: to take something off a published site, replace it. Deleting it looks like
the same action and is not. **Confirm by fetching the URL** — the state of the
repository proves nothing about what the edge is serving.

<!-- rule:public-invented-data -->
### Anything shown in public is drawn from invented data

Every screen, frame or fixture that can end up on a public page uses made-up
projects, made-up people and made-up numbers. Not "scrubbed before export":
**invented at the source**, so the safe result is what happens by default
rather than something somebody has to remember at the last step.

The production material these are copied from follows the same rule, because a
copy inherits whatever it was copied from — which is how real data reaches a
public page in the first place.

`web/landing.js` already does this: the demo floor is eight invented agents in
three invented projects, drawn by the same functions as the office. Keep it
that way. A screenshot of a real office is a screenshot of real project names
and real branch names, and `docs/office.png` in the README is the one place
where that is easiest to forget.

<!-- local:hand-edited-markdown -->
### Wrapping: 79 columns here, one line per paragraph out there

The working files — this one, and `BACKLOG.md` and `MODULES.md` in the private
half — wrap at 79 columns, and should keep doing so: they are read in a
terminal and diffed line by line.

**Anything written for a public repository does not.** One line per paragraph,
however long. Markdown joins wrapped lines when it renders, so the wrapping is
invisible where it is read and expensive where it is edited: fixing one word
means re-flowing the paragraph by hand.

On 2 September 2026 the public README went out wrapped at 79 out of habit. The
first hand-edit of it joined a paragraph into the bullet above with a comma
where a blank line had been, and the install note swallowed the sentence about
npm. The wrapping did not cause the typo; it caused the re-flowing that
produced it.

<!-- rule:extending -->
## How to extend this file

**A rule without the incident that produced it lasts until the first argument
about it.** This file is worth reading because almost every paragraph in it can
answer "why?" with a date and a consequence, not with taste. Keep it that way:

- Write the rule, then the story in one or two sentences: what was tried, what
  broke, what it cost. The story is what stops the rule being re-litigated, and
  what lets a future reader see when it no longer applies.
- **Add the rule when the incident happens**, not later. The details that make
  it convincing evaporate within a day.
- **Delete a rule when its reason is gone.** A file that only grows stops being
  read, and an unread agreement is worse than none — it looks like coverage.
- Prefer one rule with a real story to five without. Platitudes about clean code
  are already in the model; this file is for what is true *here*.

<!-- rule:section-anchors -->
### Section anchors

Every section here carries an HTML comment above its heading —
`<!-- rule:reporting-back -->`. It does not render, and it is the section's
identity: **rename the heading to suit this project, but keep the comment.**

- **A section this project invents gets its own anchor**, with a `local:`
  prefix — `<!-- local:staging-box -->`. That is the mark saying "this rule was
  written here", which is what makes it findable later.
- **Never reuse a `rule:` id for something else**, and never delete one while
  the section survives under a new name. A missing anchor is indistinguishable
  from a deleted rule.

Four copies of this file were compared on 2026-08-29 and had drifted past the
point of comparison: the design section was called `Design-first workflow`,
`Design comes first` and `Figma design workflow` in three of them, and the
largest copy had silently lost both this section and the one about honest
reporting. Nothing lined up, so nothing could be collected back into the
template every copy came from. The anchors are what let the same rule be
recognised across projects that each renamed it.

<!-- rule:canon-precedence -->
### Canon wins, unless the deviation is declared

Sections anchored `rule:` came from the shared template and are the same rule in
every project carrying it. Sections anchored `local:` were written here. Where
the two contradict, **follow the `rule:` one** — it is the version that has
already been argued about in more than one project, and a local paragraph that
quietly says the opposite is usually older thinking nobody revisited.

A project that genuinely needs to depart from a canon rule declares it instead of
editing the text and hoping:

```json
// .claude/rulebook.json
"overrides": {
  "pushing": "nothing is pushed here until the user asks; the canon pushes on commit"
}
```

- **The reason is the whole point.** An override without one is indistinguishable
  from a section somebody edited and forgot, which is the state this mechanism
  exists to get out of.
- **A declared override is never written over** by `sync-rulebook.mjs --apply`,
  and it is printed on every run so it stays in sight. When the canon moves
  underneath one, the report says so: a deviation can outlive the thing it was
  deviating from.
- **Dropping a canon section is an override too.** A module that arrived whole
  and lost two sections should say which and why, or the next reader cannot tell
  a decision from an accident.
