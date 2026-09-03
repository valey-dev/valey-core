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

<!-- rule:backlog -->
## The backlog

The backlog lives in the private half — `modules/BACKLOG.md` — and holds
everything known to be worth doing and nothing else: the
answer to "what next?" and the place a bug or an idea goes when it is noticed
in passing. Read it before proposing work, add to it rather than mentioning
something once in a conversation, and close an item by deleting it.

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
- **Pushing is a separate decision from committing.** This repository has no
  `origin` yet: it is meant to become `xoyk/valey-core` — public, AGPL-3.0 —
  and its history starts at publication rather than carrying the monorepo's.
  **Pushing is the user's call, every time**, and creating the repository on
  GitHub is theirs alone. Ask; do not push because the work looks finished.

  Наружу пока не ушло ничего, поэтому история свободна к переписыванию — и
  это единственное такое окно. После публикации правится только новым
  коммитом: `--amend`, rebase и `push --force` по опубликованному не ходят.

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
