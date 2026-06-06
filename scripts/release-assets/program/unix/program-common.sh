#!/usr/bin/env bash
set -euo pipefail

PROGRAM_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(cd "$PROGRAM_COMMON_DIR/.." && pwd)"
APP_NAME="agent-webclient"
MANIFEST_FILE="$BUNDLE_ROOT/manifest.json"
ENV_EXAMPLE_FILE="$BUNDLE_ROOT/.env.example"
ENV_FILE="${SERVICE_CONFIG_DIR:-$BUNDLE_ROOT}/.env"
DIST_DIR="$BUNDLE_ROOT/frontend/dist"
RUN_DIR="${SERVICE_STATE_DIR:-$BUNDLE_ROOT/run}"
LOG_DIR="${SERVICE_LOG_DIR:-$RUN_DIR}"

program_die() {
  echo "[program] $*" >&2
  exit 1
}

program_require_file() {
  local path="$1"
  [[ -f "$path" ]] || program_die "required file not found: $path"
}

program_require_dir() {
  local path="$1"
  [[ -d "$path" ]] || program_die "required directory not found: $path"
}

program_validate_bundle() {
  program_require_file "$MANIFEST_FILE"
  program_require_file "$ENV_EXAMPLE_FILE"
  program_require_dir "$DIST_DIR"
  program_require_file "$DIST_DIR/index.html"
}

program_initialize_config() {
  mkdir -p "$(dirname "$ENV_FILE")"
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
  fi
}

program_load_env() {
  [[ -f "$ENV_FILE" ]] || program_die "missing .env (copy from .env.example first)"
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
  PORT="${PORT:-11948}"
  BASE_URL="${BASE_URL:-http://127.0.0.1:11949}"
  VOICE_BASE_URL="${VOICE_BASE_URL:-}"
  export PORT BASE_URL VOICE_BASE_URL
}

program_prepare_runtime_dirs() {
  mkdir -p "$RUN_DIR" "$LOG_DIR"
}

program_start_host_managed() {
  echo "[program-start] $APP_NAME is hosted by ZenMind Desktop"
  echo "[program-start] endpoint: http://127.0.0.1:${PORT:-11948}/"
}

program_stop_host_managed() {
  echo "[program-stop] $APP_NAME is hosted by ZenMind Desktop; no child process to stop"
}
