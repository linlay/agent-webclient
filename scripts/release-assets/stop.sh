#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
COMPOSE_FILE="$SCRIPT_DIR/compose.release.yml"

die() { echo "[stop] $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is required"
docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"

cd "$SCRIPT_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

WEBCLIENT_VERSION="${WEBCLIENT_VERSION:-latest}"
export WEBCLIENT_VERSION

docker compose -f "$COMPOSE_FILE" down --remove-orphans

echo "[stop] stopped agent-webclient $WEBCLIENT_VERSION"
