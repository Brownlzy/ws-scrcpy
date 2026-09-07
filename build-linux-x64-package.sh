#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/portable/ws-scrcpy-linux-x64"
OUT="$ROOT/portable"
LINUX_TOOLS="$ROOT/tools/linux-x64"
PKG_TARGET="${PKG_TARGET:-node16-linux-x64}"

cd "$ROOT"

if [[ ! -f "$ROOT/config.yaml" ]]; then
  echo "Missing config file: $ROOT/config.yaml"
  echo "Create it from config.example.yaml and rerun this script."
  exit 1
fi

if [[ ! -f "$LINUX_TOOLS/frpc" ]]; then
  echo "Missing Linux x64 frpc: $LINUX_TOOLS/frpc"
  echo "Put the Linux x64 frpc binary there and rerun this script."
  exit 1
fi

if [[ ! -f "$LINUX_TOOLS/adb" ]]; then
  echo "Missing Linux x64 adb: $LINUX_TOOLS/adb"
  echo "Put the Linux x64 adb binary there and rerun this script."
  exit 1
fi

echo "Building Linux x64 backend bundle..."
WS_SCRCPY_PORTABLE_BUNDLE=true npm run dist:dev

mkdir -p "$OUT"
rm -rf "$APP"
mkdir -p "$APP/tools" "$APP/tmp/frpc"

cp -R "$ROOT/dist/public" "$APP/public"
cp -R "$ROOT/dist/vendor" "$APP/vendor"
cp "$ROOT/dist/package.json" "$APP/package.json"
cp "$ROOT/dist/LICENSE" "$APP/LICENSE"
cp "$ROOT/linux-start.sh" "$APP/start.sh"
cp "$ROOT/ws-scrcpy.service" "$APP/ws-scrcpy.service"
cp "$LINUX_TOOLS/frpc" "$APP/tools/frpc"
cp "$LINUX_TOOLS/adb" "$APP/tools/adb"

sed \
  -e 's#tools/frpc.exe#tools/frpc#g' \
  -e 's#tools/adb.exe#tools/adb#g' \
  "$ROOT/config.yaml" > "$APP/config.yaml"

# npx --yes @yao-pkg/pkg "$ROOT/dist/index.js" --sea --targets node22-linux-x64 --output "$APP/ws-scrcpy"

echo "Packaging ws-scrcpy with pkg target: $PKG_TARGET"
npx --yes @yao-pkg/pkg "$ROOT/dist/index.js" --targets "$PKG_TARGET" --output "$APP/ws-scrcpy"

chmod +x "$APP/ws-scrcpy" "$APP/start.sh" "$APP/tools/frpc" "$APP/tools/adb"

tar -czf "$OUT/ws-scrcpy-linux-x64.tar.gz" -C "$OUT" ws-scrcpy-linux-x64

echo "Linux x64 deploy package updated:"
echo "  $APP"
echo "Archive:"
echo "  $OUT/ws-scrcpy-linux-x64.tar.gz"
