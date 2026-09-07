#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

export WS_SCRCPY_CONFIG="$ROOT/config.yaml"

if [[ ! -x "$ROOT/tools/frpc" ]]; then
  echo "Missing executable: $ROOT/tools/frpc"
  echo "Run: chmod +x \"$ROOT/tools/frpc\""
  exit 1
fi

if [[ ! -x "$ROOT/tools/adb" ]]; then
  echo "Missing executable: $ROOT/tools/adb"
  echo "Run: chmod +x \"$ROOT/tools/adb\""
  exit 1
fi

if [[ ! -x "$ROOT/ws-scrcpy" ]]; then
  echo "Missing executable: $ROOT/ws-scrcpy"
  echo "Run: chmod +x \"$ROOT/ws-scrcpy\""
  exit 1
fi

echo "Starting ws-scrcpy linux x64 with $WS_SCRCPY_CONFIG"
echo "Open http://127.0.0.1:8000/ or http://<server-ip>:8000/ in your browser."
exec "$ROOT/ws-scrcpy"
