#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
COMPOSE_FILE="$SCRIPT_DIR/compose.release.yml"
IMAGES_DIR="$SCRIPT_DIR/images"

die() { echo "[start] $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "missing .env (copy from .env.example first)"
[[ -f "$COMPOSE_FILE" ]] || die "missing compose.release.yml"

command -v docker >/dev/null 2>&1 || die "docker is required"
docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"

cd "$SCRIPT_DIR"

set -a
. "$ENV_FILE"
set +a

[[ -n "${BASE_URL:-}" ]] || die "BASE_URL is required in .env"
[[ -n "${VOICE_BASE_URL:-}" ]] || die "VOICE_BASE_URL is required in .env"

WEBCLIENT_VERSION="${WEBCLIENT_VERSION:-latest}"
IMAGE_REF="agent-webclient:$WEBCLIENT_VERSION"
IMAGE_TAR="$IMAGES_DIR/agent-webclient.tar"

load_image() {
  local ref="$1"
  local tar="$2"
  if docker image inspect "$ref" >/dev/null 2>&1; then
    return 0
  fi
  [[ -f "$tar" ]] || die "missing image tar: $tar"
  docker load -i "$tar" >/dev/null
  docker image inspect "$ref" >/dev/null 2>&1 || die "failed to load image: $ref"
}

load_image "$IMAGE_REF" "$IMAGE_TAR"

export WEBCLIENT_VERSION
docker compose -f "$COMPOSE_FILE" up -d

echo "[start] started agent-webclient $WEBCLIENT_VERSION"
echo "[start] endpoint: http://127.0.0.1:${HOST_PORT:-11948}"
