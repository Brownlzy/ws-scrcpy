#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

CONFIG_PATH="${1:-$ROOT/config.yaml}"

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Missing config file: $CONFIG_PATH"
  echo "Create it from config.example.yaml or pass a config path as the first argument."
  exit 1
fi

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "Missing node_modules. Run npm install first."
  exit 1
fi

if [[ ! -f "$ROOT/dist/index.js" ]]; then
  echo "Missing dist/index.js. Building development bundle..."
  npm run dist:dev
fi

export WS_SCRCPY_CONFIG="$CONFIG_PATH"

echo "Starting ws-scrcpy with $WS_SCRCPY_CONFIG"
echo "Open http://127.0.0.1:8000/ or http://<server-ip>:8000/ in your browser, unless config.yaml uses another port."
exec node "$ROOT/dist/index.js"
