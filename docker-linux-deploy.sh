#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

IMAGE_NAME="${IMAGE_NAME:-ws-scrcpy:linux-node16}"
CONTAINER_NAME="${CONTAINER_NAME:-ws-scrcpy}"
CONTAINER_PORT="${CONTAINER_PORT:-8000}"
CONFIG_PATH=""
PUBLIC_PORT=""
DETACH="-d"
RESTART_POLICY="${RESTART_POLICY:-unless-stopped}"

usage() {
  cat <<'USAGE'
Usage:
  ./docker-linux-deploy.sh --config /path/to/config.yaml --port 8000 [options]

Required:
  -c, --config PATH       Host config file to mount into the container.
  -p, --port PORT         External host port to publish.

Options:
      --container-port N  Container port used by ws-scrcpy config. Default: 8000.
      --image NAME        Docker image name. Default: ws-scrcpy:linux-node16.
      --name NAME         Container name. Default: ws-scrcpy.
      --restart POLICY    Docker restart policy. Default: unless-stopped.
      --foreground        Run container in the foreground.
  -h, --help              Show this help.

The script builds an image based on node:16-bullseye, maps
PUBLIC_PORT:CONTAINER_PORT, and mounts the config you provide at
/app/config.yaml. The image does not contain a config file.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--config)
      CONFIG_PATH="${2:-}"
      shift 2
      ;;
    -p|--port)
      PUBLIC_PORT="${2:-}"
      shift 2
      ;;
    --container-port)
      CONTAINER_PORT="${2:-}"
      shift 2
      ;;
    --image)
      IMAGE_NAME="${2:-}"
      shift 2
      ;;
    --name)
      CONTAINER_NAME="${2:-}"
      shift 2
      ;;
    --restart)
      RESTART_POLICY="${2:-}"
      shift 2
      ;;
    --foreground)
      DETACH=""
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$CONFIG_PATH" || -z "$PUBLIC_PORT" ]]; then
  echo "Missing required --config or --port."
  usage
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found. Install Docker first."
  exit 1
fi

if [[ ! "$PUBLIC_PORT" =~ ^[0-9]+$ || "$PUBLIC_PORT" -lt 1 || "$PUBLIC_PORT" -gt 65535 ]]; then
  echo "Invalid external port: $PUBLIC_PORT"
  exit 1
fi

if [[ ! "$CONTAINER_PORT" =~ ^[0-9]+$ || "$CONTAINER_PORT" -lt 1 || "$CONTAINER_PORT" -gt 65535 ]]; then
  echo "Invalid container port: $CONTAINER_PORT"
  exit 1
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Config file not found: $CONFIG_PATH"
  exit 1
fi

if [[ ! -f "$ROOT/tools/linux-x64/frpc" ]]; then
  echo "Missing Linux x64 frpc: $ROOT/tools/linux-x64/frpc"
  exit 1
fi

if [[ ! -f "$ROOT/tools/linux-x64/adb" ]]; then
  echo "Missing Linux x64 adb: $ROOT/tools/linux-x64/adb"
  exit 1
fi

CONFIG_ABS="$(cd "$(dirname "$CONFIG_PATH")" && pwd)/$(basename "$CONFIG_PATH")"

echo "[docker-linux-deploy] Source config: $CONFIG_ABS"
echo "[docker-linux-deploy] Image: $IMAGE_NAME"
echo "[docker-linux-deploy] Container: $CONTAINER_NAME"
echo "[docker-linux-deploy] Port mapping: 0.0.0.0:$PUBLIC_PORT -> $CONTAINER_PORT"

docker build -f "$ROOT/Dockerfile.linux" -t "$IMAGE_NAME" "$ROOT"

if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  echo "[docker-linux-deploy] Removing existing container: $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

docker run $DETACH \
  --name "$CONTAINER_NAME" \
  --restart "$RESTART_POLICY" \
  -p "0.0.0.0:$PUBLIC_PORT:$CONTAINER_PORT" \
  -v "$CONFIG_ABS:/app/config.yaml:ro" \
  -v "${CONTAINER_NAME}-frpc-tmp:/app/tmp/frpc" \
  "$IMAGE_NAME"

echo "[docker-linux-deploy] Deployed."
echo "[docker-linux-deploy] URL: http://127.0.0.1:$PUBLIC_PORT/"
echo "[docker-linux-deploy] Logs: docker logs -f $CONTAINER_NAME"
