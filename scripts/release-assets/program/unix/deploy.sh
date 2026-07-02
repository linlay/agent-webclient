#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
output_dir=""
base_url=""
port=""

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
    --base-url)
      [[ $# -ge 2 ]] || die "missing value for --base-url"
      base_url="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || die "missing value for --port"
      port="$2"
      shift 2
      ;;
    --config-dir|--data-dir|--state-dir|--log-dir|--daemon)
      die "$1 is a start/runtime argument; pass it to start.sh instead of deploy.sh"
      ;;
    *)
      die "unsupported deploy argument: $1"
      ;;
  esac
done

require_value "--output-dir" "$output_dir"
require_value "--base-url" "$base_url"
require_value "--port" "$port"

mkdir -p "$output_dir"
env_file="$output_dir/.env"
if [[ ! -f "$env_file" ]]; then
  env_template >"$env_file"
fi

tmp_file="$env_file.tmp.$$"
grep -vE '^[[:space:]]*#?[[:space:]]*(PORT|DESKTOP_APP|BASE_URL)=' "$env_file" >"$tmp_file" || true
{
  cat "$tmp_file"
  printf 'PORT=%s\n' "$port"
  printf 'DESKTOP_APP=true\n'
  printf 'BASE_URL=%s\n' "$base_url"
} >"$env_file"
rm -f "$tmp_file"

echo "[program-deploy] config initialized: $env_file"
