#!/bin/sh
# The office in one command.
#
#   curl -fsSL https://valey.dev/install.sh | sh                 # собрать
#   curl -fsSL https://valey.dev/install.sh | sh -s -- --run      # и запустить
#   ... | sh -s -- --run --pack=~/Downloads/valey-office.zip      # с платными модулями
#   ... | sh -s -- --update                                       # обновить ~/valey без вопросов
#
# In a terminal it asks where the office goes (~/valey on Enter) and, when that
# place is taken, what to do about it: update the office already there, put a
# second one beside it, or leave. The questions go to /dev/tty, because under
# `curl | sh` stdin is the script itself. Without a terminal nothing is asked and
# a taken place is refused, as before; --dir and --update answer in advance.
#
# The office and the paid modules come from two places on purpose: the core is
# public and AGPL, and the paid modules cannot live in a repository everyone can
# clone. Two sources must not mean two chores, so --pack folds the second one
# into the same command.
#
# Piping a script into a shell means running code you have not read, and this
# project's whole claim is that you can read it before you run it. So: this file
# is short on purpose, it is the same file the repository publishes, and it
# verifies what it downloads against a checksum published beside it. If you would
# rather read first — and you should — that is one flag apart:
#
#   curl -fsSL https://valey.dev/install.sh -o install.sh && less install.sh && sh install.sh
#
# Where the bytes come from: valey.dev/dist/<version>/ is a redirect to the
# assets of that GitHub release, and `latest` to the newest one. The version is
# its own path segment because that is the only thing a static host's redirect
# can capture; a version baked into the file name could not be forwarded.
set -eu

BASE=${VALEY_BASE:-https://valey.dev}
VERSION=${VALEY_VERSION:-latest}
DEST=${VALEY_DIR:-$HOME/valey}
# A place given in advance is not asked about again.
DEST_GIVEN=${VALEY_DIR:+1}
PORT=${PORT:-5177}
RUN=0
UPDATE=0
# Where answers come from. A stand points this at a file of answers; nothing
# else should need to.
TTY=${VALEY_TTY:-/dev/tty}
PACK=${VALEY_PACK:-}

# Russian or English by locale, defaulting to English: the landing speaks both,
# and a buyer is not necessarily either.
LANG_ALL="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
case "$LANG_ALL" in ru*|RU*) L=ru ;; *) L=en ;; esac
[ "${VALEY_LANG:-}" = "" ] || L=$VALEY_LANG

msg() {
  if [ "$L" = ru ]; then
    case "$1" in
      need_node) echo "Нужен Node 18 или новее — его нет. macOS: brew install node · Windows: winget install OpenJS.NodeJS.LTS · Linux: пакет nodejs" ;;
      old_node)  echo "Нужен Node 18 или новее, а стоит $2." ;;
      need_tool) echo "Нужен $2." ;;
      busy)      echo "В $2 уже что-то лежит. Укажи другое место: --dir=<путь>" ;;
      busy_office) echo "В $2 уже стоит офис v$3. Обновить: --update · в другое место: --dir=<путь>" ;;
      where)     echo "Куда поставить офис? Enter — $2:" ;;
      office_there) echo "В $2 уже стоит офис v$3, а ставится v$4." ;;
      opt_update) echo "  1) обновить — модули и настройки останутся" ;;
      opt_beside) echo "  2) поставить второй рядом, в $2" ;;
      opt_exit)  echo "  3) выйти" ;;
      choice)    echo "Выбор [1]:" ;;
      same)      echo "В $2 уже стоит офис v$3 — эта же версия." ;;
      foreign)   echo "$2 занята, и это не офис. Поставить в $3? [Y/n]" ;;
      bye)       echo "Ничего не менял." ;;
      updated)   echo "Офис обновлён: v$2 → v$3. Прежний лежит в $4" ;;
      kept)      echo "Перенёс модули: $2" ;;
      stale_cwd) echo "Этот терминал остался в прежнем офисе, $2 — npm start отсюда запустит старую версию, а если эту папку удалить, упадёт с ENOENT uv_cwd. Перейди в новый: cd $3" ;;
      fetching)  echo "Качаю офис ($2)…" ;;
      no_archive) echo "Не скачалось: $2" ;;
      no_sum)    echo "Нет контрольной суммы рядом с архивом — установка остановлена." ;;
      no_hasher) echo "Нечем проверить контрольную сумму: нет ни sha256sum, ни shasum." ;;
      bad_sum)   echo "Контрольная сумма не сошлась. Скачанное удалено, ничего не установлено." ;;
      built)     echo "Офис собран: $2" ;;
      no_deps)   echo "Установки нет — зависимостей у него тоже нет." ;;
      packing)   echo "Ставлю платные модули из $2…" ;;
      no_pack)   echo "Не нашёл пакет модулей: $2" ;;
      packed)    echo "Модули на месте: $2" ;;
      starting)  echo "Запускаю…" ;;
      howto)     echo "Запустить:" ;;
      thencmd)   echo "  cd $2 && npm start" ;;
      thenopen)  echo "Потом открой http://localhost:$2" ;;
      asked)     echo "Офис в $2 сейчас работает — попросил его обновиться самого, каталог не трогаю. Смотри строку версии во вкладке «офис»." ;;
      asked_no)  echo "Офис в $2 работает, но обновиться сам не смог: $3. Останови его и повтори — тогда каталог переставлю я." ;;
      badflag)   echo "неизвестный ключ: $2" ;;
      usage)     echo "usage: install.sh [--run] [--update] [--dir=<путь>] [--version=<тег>] [--pack=<файл|url>]" ;;
    esac
  else
    case "$1" in
      need_node) echo "Node 18 or newer is required and was not found. macOS: brew install node · Windows: winget install OpenJS.NodeJS.LTS · Linux: your nodejs package" ;;
      old_node)  echo "Node 18 or newer is required; this is $2." ;;
      need_tool) echo "$2 is required." ;;
      busy)      echo "$2 is not empty. Pick another place: --dir=<path>" ;;
      busy_office) echo "$2 already holds office v$3. To update it: --update · elsewhere: --dir=<path>" ;;
      where)     echo "Where should the office go? Enter for $2:" ;;
      office_there) echo "$2 already holds office v$3; this is v$4." ;;
      opt_update) echo "  1) update it — modules and settings stay" ;;
      opt_beside) echo "  2) install a second one beside it, in $2" ;;
      opt_exit)  echo "  3) leave" ;;
      choice)    echo "Choice [1]:" ;;
      same)      echo "$2 already holds office v$3 — the same version." ;;
      foreign)   echo "$2 is taken by something that is not the office. Install into $3 instead? [Y/n]" ;;
      bye)       echo "Nothing was changed." ;;
      updated)   echo "Office updated: v$2 → v$3. The previous one is in $4" ;;
      kept)      echo "Modules carried over: $2" ;;
      stale_cwd) echo "This terminal is still in the previous office, $2 — npm start here runs the old version, and once that folder is deleted it fails with ENOENT uv_cwd. Move to the new one: cd $3" ;;
      fetching)  echo "Downloading the office ($2)…" ;;
      no_archive) echo "Download failed: $2" ;;
      no_sum)    echo "No checksum published beside the archive — stopping." ;;
      no_hasher) echo "Nothing to verify the checksum with: neither sha256sum nor shasum." ;;
      bad_sum)   echo "Checksum mismatch. The download was deleted and nothing was installed." ;;
      built)     echo "Office assembled: $2" ;;
      no_deps)   echo "No install step — it has no dependencies." ;;
      packing)   echo "Adding the paid modules from $2…" ;;
      no_pack)   echo "Module pack not found: $2" ;;
      packed)    echo "Modules in place: $2" ;;
      starting)  echo "Starting…" ;;
      howto)     echo "To start it:" ;;
      thencmd)   echo "  cd $2 && npm start" ;;
      thenopen)  echo "Then open http://localhost:$2" ;;
      asked)     echo "The office in $2 is running — I asked it to update itself and left the folder alone. Watch the version row in the «office» tab." ;;
      asked_no)  echo "The office in $2 is running but could not update itself: $3. Stop it and run this again — then I will replace the folder." ;;
      badflag)   echo "unknown flag: $2" ;;
      usage)     echo "usage: install.sh [--run] [--update] [--dir=<path>] [--version=<tag>] [--pack=<file|url>]" ;;
    esac
  fi
}

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

for arg in "$@"; do
  case "$arg" in
    --run) RUN=1 ;;
    --update) UPDATE=1 ;;
    --dir=*) DEST=${arg#--dir=}; DEST_GIVEN=1 ;;
    --version=*) VERSION=${arg#--version=} ;;
    --pack=*) PACK=${arg#--pack=} ;;
    -h|--help) msg usage; exit 0 ;;
    *) msg badflag "$arg" >&2; exit 2 ;;
  esac
done


# Node is the only requirement, and the office needs a modern one. Saying which
# version is missing beats a stack trace fifteen seconds later.
have node || die "$(msg need_node)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 18 ] || die "$(msg old_node "$(node -v)")"
have curl || die "$(msg need_tool curl)"
have tar || die "$(msg need_tool tar)"

# Answers come from the terminal when there is one. The open is tried in a
# subshell first: a failed redirection on `exec` ends a POSIX shell outright.
ASK=0
if (exec 3<"$TTY") 2>/dev/null; then exec 3<"$TTY"; ASK=1; fi
ask() { printf '%s ' "$1"; ANSWER=""; read -r ANSWER <&3 || ANSWER=""; }

pretty() { case "$1" in "$HOME"|"$HOME"/*) printf '~%s' "${1#"$HOME"}" ;; *) printf '%s' "$1" ;; esac; }
# A typed path, made absolute: neither ~ nor a relative path means anything
# once it has been read into a variable.
place() {
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    "~/"*) printf '%s/%s' "$HOME" "${1#"~/"}" ;;
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$PWD" "$1" ;;
  esac
}
taken() { [ -e "$1" ] && [ -n "$(ls -A "$1" 2>/dev/null || true)" ]; }
# An office is known by its package.json, not by its folder name.
office_version() {
  [ -f "$1/package.json" ] || return 1
  node -e 'const p = require(process.argv[1]); if (p.name !== "valey") process.exit(1); console.log(p.version)' "$1/package.json" 2>/dev/null
}
# The first free <dir>-2, <dir>-3, …
beside() { n=2; while [ -e "$1-$n" ]; do n=$((n + 1)); done; printf '%s' "$1-$n"; }

if [ "$ASK" -eq 1 ] && [ -z "$DEST_GIVEN" ] && [ "$UPDATE" -eq 0 ]; then
  ask "$(msg where "$(pretty "$DEST")")"
  [ -z "$ANSWER" ] || DEST=$ANSWER
fi
DEST=$(place "$DEST")

# Without a terminal nobody can be asked, so a taken place stops here, before
# anything is downloaded. --update is the one answer given in advance.
OLDVER=""
if taken "$DEST"; then
  OLDVER=$(office_version "$DEST" || true)
  if [ "$ASK" -eq 0 ]; then
    [ -n "$OLDVER" ] || die "$(msg busy "$DEST")"
    [ "$UPDATE" -eq 1 ] || die "$(msg busy_office "$DEST" "$OLDVER")"
  fi
fi

# Where the office keeps its settings, and where the note about this
# installation goes: the folder is replaced by an update, so anything that has
# to survive one lives outside it.
CONFIG_DIR=${VALEY_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/valey}

# An office already running out of this very folder must not have the ground
# taken from under it: install.sh would leave the pages new and the server old
# until a Ctrl-C, and a Ctrl-C loses the guests. Since v0.62.0 the office can
# do the whole update itself, so it is asked to — and this script stops.
ask_office() {
  node -e '
    const fs = require("fs"), path = require("path"), http = require("http");
    const [dir, configDir] = process.argv.slice(1);
    let s = {}; try { s = JSON.parse(fs.readFileSync(path.join(configDir, "settings.json"), "utf8")); } catch { /* a fresh machine */ }
    const port = (s.network && s.network.port) || 5177;
    const token = (s.access && s.access.token) || "";
    const ask = (p, method) => new Promise((done) => {
      const req = http.request({ host: "127.0.0.1", port, path: p, method,
        headers: { "content-type": "application/json", ...(token ? { "x-valey-owner": token } : {}) } },
      (res) => { let b = ""; res.on("data", (d) => { b += d; }); res.on("end", () => done({ code: res.statusCode, body: b })); });
      req.on("error", () => done(null));
      req.end(method === "POST" ? "{}" : undefined);
    });
    (async () => {
      const seen = await ask("/api/update", "GET");
      if (!seen) process.exit(3);                       // nothing is listening: the folder is ours to replace
      if (seen.code !== 200) { console.log("HTTP " + seen.code); process.exit(1); }
      let view = {}; try { view = JSON.parse(seen.body); } catch { /* answered, but not with the row */ }
      if (!view.root || fs.realpathSync(view.root) !== fs.realpathSync(dir)) process.exit(3);
      const run = await ask("/api/update/run", "POST");
      if (!run || run.code !== 200) { console.log(run ? "HTTP " + run.code : "no answer"); process.exit(1); }
      process.exit(0);
    })();
  ' "$1" "$CONFIG_DIR" 2>/dev/null
}

# The note install.sh leaves for the office: where it lives, which version, and
# that it came as an archive. The office reads it to know it can update itself.
note_install() {
  mkdir -p "$CONFIG_DIR"
  node -e '
    const fs = require("fs"), path = require("path");
    const [dir, version, file] = process.argv.slice(1);
    let was = {}; try { was = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* the first install */ }
    const now = { ...was, dir, version, source: "archive", at: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(now, null, 2) + "\n");
  ' "$1" "$2" "$CONFIG_DIR/install.json"
}

if [ "$UPDATE" -eq 1 ] && [ -n "$OLDVER" ]; then
  ASKED=$(ask_office "$DEST") && ASK_CODE=0 || ASK_CODE=$?
  case "${ASK_CODE:-0}" in
    0) say "$(msg asked "$(pretty "$DEST")")"; exit 0 ;;
    1) die "$(msg asked_no "$(pretty "$DEST")" "$ASKED")" ;;
    *) : ;;  # nothing of ours is listening there — carry on and replace the folder
  esac
fi

TMP=$(mktemp -d)
# The temp dir goes away whichever way this ends, including a failed checksum:
# a half-downloaded office left on disk is what people run by accident later.
trap 'rm -rf "$TMP"' EXIT INT TERM

say "$(msg fetching "$VERSION")"
ARCHIVE="$BASE/dist/$VERSION/valey-$VERSION.tar.gz"
curl -fsSL "$ARCHIVE" -o "$TMP/valey.tar.gz" || die "$(msg no_archive "$ARCHIVE")"
curl -fsSL "$ARCHIVE.sha256" -o "$TMP/valey.sha256" || die "$(msg no_sum)"

# Verify before unpacking, not after: the point is to not write unchecked bytes
# into the place the user is about to run from.
WANT=$(cut -d' ' -f1 < "$TMP/valey.sha256" | tr -d '\r\n')
if have sha256sum; then GOT=$(sha256sum "$TMP/valey.tar.gz" | cut -d' ' -f1)
elif have shasum;   then GOT=$(shasum -a 256 "$TMP/valey.tar.gz" | cut -d' ' -f1)
else die "$(msg no_hasher)"
fi
[ "$WANT" = "$GOT" ] || die "$(msg bad_sum)"

# Unpacked beside the download first: which version this is decides what
# happens to an office already in the place.
mkdir -p "$TMP/new"
tar -xzf "$TMP/valey.tar.gz" -C "$TMP/new" --strip-components=1
NEWVER=$(office_version "$TMP/new" || echo "$VERSION")

MODE=fresh
if taken "$DEST"; then
  if [ -z "$OLDVER" ]; then
    NEXT=$(beside "$DEST")
    ask "$(msg foreign "$(pretty "$DEST")" "$(pretty "$NEXT")")"
    case "$ANSWER" in
      ""|y|Y|yes|д|Д|да) DEST=$NEXT ;;
      *) say "$(msg bye)"; exit 0 ;;
    esac
  elif [ "$OLDVER" = "$NEWVER" ]; then
    MODE=same
  elif [ "$UPDATE" -eq 1 ]; then
    MODE=update
  else
    NEXT=$(beside "$DEST")
    say "$(msg office_there "$(pretty "$DEST")" "$OLDVER" "$NEWVER")"
    say "$(msg opt_update)"
    say "$(msg opt_beside "$(pretty "$NEXT")")"
    say "$(msg opt_exit)"
    ask "$(msg choice)"
    case "$ANSWER" in
      ""|1) MODE=update ;;
      2) DEST=$NEXT ;;
      *) say "$(msg bye)"; exit 0 ;;
    esac
  fi
fi

case "$MODE" in
  same)
    say "$(msg same "$(pretty "$DEST")" "$OLDVER")" ;;
  update)
    # The previous office is moved aside, not deleted: an update that turns out
    # wrong is undone by moving a folder back.
    OLD="$DEST.v$OLDVER"
    n=2; while [ -e "$OLD" ]; do OLD="$DEST.v$OLDVER-$n"; n=$((n + 1)); done
    mv "$DEST" "$OLD"
    mv "$TMP/new" "$DEST"
    # Modules the archive does not carry were added by the owner — the paid
    # ones — and come across. Settings live in ~/.config/valey and are not here.
    mkdir -p "$DEST/modules"
    KEPT=""
    for d in "$OLD"/modules/*/; do
      [ -d "$d" ] || continue
      name=$(basename "$d")
      [ -e "$DEST/modules/$name" ] && continue
      cp -R "${d%/}" "$DEST/modules/"
      KEPT="$KEPT $name"
    done
    note_install "$DEST" "$NEWVER"
    say "$(msg updated "$OLDVER" "$NEWVER" "$(pretty "$OLD")")"
    [ -z "$KEPT" ] || say "$(msg kept "${KEPT# }")"
    # A terminal standing in the office goes with the folder, not the name: the
    # shell still prints ~/valey, but it is in the old copy now. On 26 September
    # 2026 a tester updated from inside the office, the old copy was deleted,
    # and the next npm start died on ENOENT uv_cwd. A script cannot move the
    # shell that ran it, so it says where to go. Physical paths on both sides:
    # $PWD keeps the name, and only the folder itself is the old one.
    #
    # The path is asked of the kernel — the external pwd, which calls getcwd().
    # A builtin answers out of $PWD, and by now that name belongs to the new
    # office: `pwd -P` in dash printed the old name, so CI, where sh is dash,
    # never warned and went red on every branch for a day; and `cd -P .` in
    # bash walked into the NEW folder, which reads as «not inside» just the
    # same. Checked in sh, dash, bash and zsh on 26 September 2026.
    HERE=$(env pwd -P 2>/dev/null || pwd -P 2>/dev/null || true)
    OLDP=$(CDPATH= cd "$OLD" 2>/dev/null && { env pwd -P 2>/dev/null || pwd -P; })
    case "$HERE" in "$OLDP"|"$OLDP"/*) say "$(msg stale_cwd "$(pretty "$OLD")" "$(pretty "$DEST")")" ;; esac
    ;;
  *)
    mkdir -p "$(dirname "$DEST")"
    if [ -d "$DEST" ]; then rmdir "$DEST"; fi
    mv "$TMP/new" "$DEST"
    note_install "$DEST" "$NEWVER"
    say "$(msg built "$DEST")"
    say "$(msg no_deps)"
    ;;
esac

# The paid modules, if the buyer passed their pack. Same command, one office.
if [ -n "$PACK" ]; then
  say ""
  say "$(msg packing "$PACK")"
  case "$PACK" in
    http://*|https://*)
      curl -fsSL "$PACK" -o "$TMP/pack.zip" || die "$(msg no_pack "$PACK")" ;;
    *)
      # A path, not a shell program: until 12 September 2026 this was
      # `eval echo`, and a pack named `$(cmd).zip` ran cmd. place() knows ~
      # and relative paths, which is all eval was ever there for.
      PACK=$(place "$PACK")
      [ -f "$PACK" ] || die "$(msg no_pack "$PACK")"
      cp "$PACK" "$TMP/pack.zip" ;;
  esac
  have unzip || die "$(msg need_tool unzip)"
  mkdir -p "$TMP/pack" && unzip -q "$TMP/pack.zip" -d "$TMP/pack"
  # The pack has one top folder and the generated files sit beside the modules;
  # only directories are modules, so only directories are copied.
  mkdir -p "$DEST/modules"
  NAMES=""
  for d in "$TMP"/pack/*/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    # No trailing slash: `cp -R dir/ dest/` copies the contents rather than the
    # folder, and the modules would land loose in modules/.
    cp -R "${d%/}" "$DEST/modules/"
    NAMES="$NAMES $name"
  done
  [ -n "$NAMES" ] || die "$(msg no_pack "$PACK")"
  say "$(msg packed "$(echo "$NAMES" | sed "s/^ //")")"
fi

if [ "$RUN" -eq 1 ]; then
  say ""
  say "$(msg starting)"
  cd "$DEST"
  exec npm start
else
  say ""
  say "$(msg howto)"
  say "$(msg thencmd "$DEST")"
  say "$(msg thenopen "$PORT")"
fi
