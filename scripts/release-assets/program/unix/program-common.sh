#!/usr/bin/env bash
set -euo pipefail

PROGRAM_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(cd "$PROGRAM_COMMON_DIR/.." && pwd)"
APP_NAME="agent-webclient"
MANIFEST_FILE="$BUNDLE_ROOT/manifest.json"
ENV_EXAMPLE_FILE="$BUNDLE_ROOT/.env.example"
ENV_FILE="$BUNDLE_ROOT/.env"
BACKEND_ENTRY="$BUNDLE_ROOT/backend/server.js"
BACKEND_PACKAGE_FILE="$BUNDLE_ROOT/backend/package.json"
BACKEND_NODE_MODULES_DIR="$BUNDLE_ROOT/backend/node_modules"
DIST_DIR="$BUNDLE_ROOT/frontend/dist"
RUN_DIR="$BUNDLE_ROOT/run"
PID_FILE="$RUN_DIR/$APP_NAME.pid"
LOG_FILE="$RUN_DIR/$APP_NAME.log"
NODE_CMD=""
PROGRAM_USE_ELECTRON_NODE=0

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
  program_require_file "$BACKEND_ENTRY"
  program_require_file "$BACKEND_PACKAGE_FILE"
  program_require_dir "$BACKEND_NODE_MODULES_DIR"
  program_require_dir "$DIST_DIR"
  program_require_file "$DIST_DIR/index.html"
}

program_load_env() {
  [[ -f "$ENV_FILE" ]] || program_die "missing .env (copy from .env.example first)"
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
  PORT="${PORT:-11948}"
  BASE_URL="${BASE_URL:-http://127.0.0.1:11949}"
  VOICE_BASE_URL="${VOICE_BASE_URL:-$BASE_URL}"
  export PORT BASE_URL VOICE_BASE_URL
}

resolve_node_bin() {
  if [[ -n "${NODE_BIN:-}" ]]; then
    [[ -x "$NODE_BIN" ]] || program_die "NODE_BIN is not executable: $NODE_BIN"
    NODE_CMD="$NODE_BIN"
    PROGRAM_USE_ELECTRON_NODE=1
    return
  fi

  NODE_CMD="$(command -v node 2>/dev/null || true)"
  [[ -n "$NODE_CMD" ]] || program_die "node runtime not found; install Node.js 18+ or set NODE_BIN in .env"
  PROGRAM_USE_ELECTRON_NODE=0
}

program_prepare_node_command() {
  resolve_node_bin
  if [[ "$PROGRAM_USE_ELECTRON_NODE" == "1" ]]; then
    export ELECTRON_RUN_AS_NODE=1
    return
  fi
  unset ELECTRON_RUN_AS_NODE || true
}

program_prepare_runtime_dirs() {
  mkdir -p "$RUN_DIR"
}

program_read_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$pid"
}

program_clear_stale_pid() {
  if [[ ! -f "$PID_FILE" ]]; then
    return
  fi
  local pid
  pid="$(program_read_pid || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    program_die "$APP_NAME is already running with pid $pid"
  fi
  rm -f "$PID_FILE"
}

program_start_backend_daemon() {
  local pid

  program_clear_stale_pid
  program_prepare_node_command
  : >"$LOG_FILE"
  nohup "$NODE_CMD" "$BACKEND_ENTRY" >>"$LOG_FILE" 2>&1 &
  pid=$!
  printf '%s\n' "$pid" >"$PID_FILE"
  sleep 1
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$PID_FILE"
    program_die "backend failed to start; see $LOG_FILE"
  fi

  echo "[program-start] started $APP_NAME in daemon mode (pid=$pid)"
  echo "[program-start] log file: $LOG_FILE"
}

program_exec_backend() {
  program_prepare_node_command
  exec "$NODE_CMD" "$BACKEND_ENTRY"
}

program_stop_backend() {
  if [[ ! -f "$PID_FILE" ]]; then
    echo "[program-stop] pid file not found: $PID_FILE"
    return
  fi

  local pid
  pid="$(program_read_pid || true)"
  [[ -n "$pid" ]] || program_die "pid file must contain a numeric pid: $PID_FILE"

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$PID_FILE"
    echo "[program-stop] process $pid is not running; removed stale pid file"
    return
  fi

  kill "$pid"
  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$PID_FILE"
      echo "[program-stop] stopped $APP_NAME (pid=$pid)"
      return
    fi
    sleep 1
  done

  program_die "process $pid did not stop within 30s"
}
