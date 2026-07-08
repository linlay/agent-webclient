#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
output_dir=""

die() {
  echo "[program] $*" >&2
  exit 1
}

require_value() {
  [[ -n "${2//[[:space:]]/}" ]] || die "missing required deploy argument: $1"
}

env_template() {
  [[ -f "$SCRIPT_DIR/.env.example" ]] && cat "$SCRIPT_DIR/.env.example"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      [[ $# -ge 2 ]] || die "missing value for --output-dir"
      output_dir="$2"
      shift 2
      ;;
    --config-dir|--data-dir|--state-dir|--log-dir|--port|--base-url|--daemon)
      die "$1 is a start/runtime argument; pass it to start.sh instead of deploy.sh"
      ;;
    *)
      die "unsupported deploy argument: $1"
      ;;
  esac
done

require_value "--output-dir" "$output_dir"

mkdir -p "$output_dir"
env_file="$output_dir/.env"
if [[ ! -f "$env_file" ]]; then
  env_template >"$env_file"
fi

echo "[program-deploy] config initialized: $env_file"
