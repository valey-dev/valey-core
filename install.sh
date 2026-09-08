#!/bin/sh
# The office in one command.
#
#   curl -fsSL https://valey.dev/install.sh | sh                 # собрать
#   curl -fsSL https://valey.dev/install.sh | sh -s -- --run      # и запустить
#   ... | sh -s -- --run --pack=~/Downloads/valey-office.zip      # с платными модулями
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
set -eu

BASE=${VALEY_BASE:-https://valey.dev}
VERSION=${VALEY_VERSION:-latest}
DEST=${VALEY_DIR:-$HOME/valey}
PORT=${PORT:-5177}
RUN=0
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
      starting)  echo "Запускаю. Открой http://localhost:$2" ;;
      howto)     echo "Запустить:" ;;
      thencmd)   echo "  cd $2 && npm start" ;;
      thenopen)  echo "Потом открой http://localhost:$2" ;;
      badflag)   echo "неизвестный ключ: $2" ;;
      usage)     echo "usage: install.sh [--run] [--dir=<путь>] [--version=<тег>] [--pack=<файл|url>]" ;;
    esac
  else
    case "$1" in
      need_node) echo "Node 18 or newer is required and was not found. macOS: brew install node · Windows: winget install OpenJS.NodeJS.LTS · Linux: your nodejs package" ;;
      old_node)  echo "Node 18 or newer is required; this is $2." ;;
      need_tool) echo "$2 is required." ;;
      busy)      echo "$2 is not empty. Pick another place: --dir=<path>" ;;
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
      starting)  echo "Starting. Open http://localhost:$2" ;;
      howto)     echo "To start it:" ;;
      thencmd)   echo "  cd $2 && npm start" ;;
      thenopen)  echo "Then open http://localhost:$2" ;;
      badflag)   echo "unknown flag: $2" ;;
      usage)     echo "usage: install.sh [--run] [--dir=<path>] [--version=<tag>] [--pack=<file|url>]" ;;
    esac
  fi
}

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

for arg in "$@"; do
  case "$arg" in
    --run) RUN=1 ;;
    --dir=*) DEST=${arg#--dir=} ;;
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

if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null || true)" ]; then
  die "$(msg busy "$DEST")"
fi

TMP=$(mktemp -d)
# The temp dir goes away whichever way this ends, including a failed checksum:
# a half-downloaded office left on disk is what people run by accident later.
trap 'rm -rf "$TMP"' EXIT INT TERM

say "$(msg fetching "$VERSION")"
curl -fsSL "$BASE/dist/valey-$VERSION.tar.gz" -o "$TMP/valey.tar.gz" \
  || die "$(msg no_archive "$BASE/dist/valey-$VERSION.tar.gz")"
curl -fsSL "$BASE/dist/valey-$VERSION.tar.gz.sha256" -o "$TMP/valey.sha256" \
  || die "$(msg no_sum)"

# Verify before unpacking, not after: the point is to not write unchecked bytes
# into the place the user is about to run from.
WANT=$(cut -d' ' -f1 < "$TMP/valey.sha256" | tr -d '\r\n')
if have sha256sum; then GOT=$(sha256sum "$TMP/valey.tar.gz" | cut -d' ' -f1)
elif have shasum;   then GOT=$(shasum -a 256 "$TMP/valey.tar.gz" | cut -d' ' -f1)
else die "$(msg no_hasher)"
fi
[ "$WANT" = "$GOT" ] || die "$(msg bad_sum)"

mkdir -p "$DEST"
tar -xzf "$TMP/valey.tar.gz" -C "$DEST" --strip-components=1
say "$(msg built "$DEST")"
say "$(msg no_deps)"

# The paid modules, if the buyer passed their pack. Same command, one office.
if [ -n "$PACK" ]; then
  say ""
  say "$(msg packing "$PACK")"
  case "$PACK" in
    http://*|https://*)
      curl -fsSL "$PACK" -o "$TMP/pack.zip" || die "$(msg no_pack "$PACK")" ;;
    *)
      PACK=$(eval echo "$PACK")
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
  say "$(msg starting "$PORT")"
  cd "$DEST"
  exec npm start
else
  say ""
  say "$(msg howto)"
  say "$(msg thencmd "$DEST")"
  say "$(msg thenopen "$PORT")"
fi
