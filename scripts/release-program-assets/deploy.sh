#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "[deploy] $*" >&2; exit 1; }

[[ -d "$SCRIPT_DIR/dist" ]] || die "missing dist/"
[[ -f "$SCRIPT_DIR/manifest.json" ]] || die "missing manifest.json"
[[ -f "$SCRIPT_DIR/.env.example" ]] || die "missing .env.example"

ENV_FILE="$SCRIPT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "[deploy] keeping existing .env"
else
  cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
  echo "[deploy] created .env from .env.example"
fi

echo "[deploy] bundle verified"
echo "[deploy] next steps:"
echo "[deploy] 1. Edit .env and set BASE_URL / VOICE_BASE_URL for the deployment target"
echo "[deploy] 2. Configure the host to serve $SCRIPT_DIR/dist as static files"
