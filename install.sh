#!/bin/sh
# The office in one command.
#
#   curl -fsSL https://valey.dev/install.sh | sh            # собрать
#   curl -fsSL https://valey.dev/install.sh | sh -s -- --run # собрать и запустить
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

for arg in "$@"; do
  case "$arg" in
    --run) RUN=1 ;;
    --dir=*) DEST=${arg#--dir=} ;;
    --version=*) VERSION=${arg#--version=} ;;
    -h|--help)
      echo "usage: install.sh [--run] [--dir=<путь>] [--version=<тег>]"
      exit 0 ;;
    *) echo "неизвестный ключ: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Node is the only requirement, and the office needs a modern one. Saying which
# version is missing beats a stack trace fifteen seconds later.
have node || die "Нужен Node 18 или новее — его нет. macOS: brew install node · Windows: winget install OpenJS.NodeJS.LTS · Linux: пакет nodejs"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 18 ] || die "Нужен Node 18 или новее, а стоит $(node -v)."
have curl || die "Нужен curl."
have tar || die "Нужен tar."

if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null || true)" ]; then
  die "В $DEST уже что-то лежит. Укажи другое место: --dir=<путь>"
fi

TMP=$(mktemp -d)
# The temp dir goes away whichever way this ends, including a failed checksum:
# a half-downloaded office left on disk is what people run by accident later.
trap 'rm -rf "$TMP"' EXIT INT TERM

say "Качаю офис ($VERSION)…"
curl -fsSL "$BASE/dist/valey-$VERSION.tar.gz" -o "$TMP/valey.tar.gz" \
  || die "Не скачалось: $BASE/dist/valey-$VERSION.tar.gz"
curl -fsSL "$BASE/dist/valey-$VERSION.tar.gz.sha256" -o "$TMP/valey.sha256" \
  || die "Нет контрольной суммы рядом с архивом — установка остановлена."

# Verify before unpacking, not after: the point is to not write unchecked bytes
# into the place the user is about to run from.
WANT=$(cut -d' ' -f1 < "$TMP/valey.sha256" | tr -d '\r\n')
if have sha256sum; then GOT=$(sha256sum "$TMP/valey.tar.gz" | cut -d' ' -f1)
elif have shasum;   then GOT=$(shasum -a 256 "$TMP/valey.tar.gz" | cut -d' ' -f1)
else die "Нечем проверить контрольную сумму: нет ни sha256sum, ни shasum."
fi
[ "$WANT" = "$GOT" ] || die "Контрольная сумма не сошлась. Скачанное удалено, ничего не установлено."

mkdir -p "$DEST"
tar -xzf "$TMP/valey.tar.gz" -C "$DEST" --strip-components=1
say "Офис собран: $DEST"
say "Установки нет — зависимостей у него тоже нет."

if [ "$RUN" -eq 1 ]; then
  say ""
  say "Запускаю. Открой http://localhost:$PORT"
  cd "$DEST"
  exec npm start
else
  say ""
  say "Запустить:"
  say "  cd $DEST && npm start"
  say "Потом открой http://localhost:$PORT"
fi
