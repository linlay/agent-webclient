#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
output_dir=""
desktop_config_reset=0
desktop_config_backup_dir=""
desktop_version_from=""
desktop_version_to=""

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

secure_config_tree() {
  local target="$1"
  [[ -e "$target" ]] || return
  find "$target" -type d -exec chmod 700 {} +
  find "$target" -type f -exec chmod 600 {} +
}

reset_desktop_config() {
  local backup_dir="$1"
  local backup_parent
  local failed_dir="${backup_dir}.failed"
  [[ "$backup_dir" == /* ]] || die "--desktop-config-backup-dir must be absolute"
  [[ "$backup_dir" != "$output_dir" && "$backup_dir" != "$output_dir/"* ]] || \
    die "Desktop config backup directory must be outside the service config directory"
  backup_parent="$(dirname "$backup_dir")"
  mkdir -p "$backup_parent"
  chmod 700 "$backup_parent"
  if [[ -e "$backup_dir" ]]; then
    rm -rf "$failed_dir"
    if [[ -e "$output_dir" ]]; then
      mv "$output_dir" "$failed_dir"
      secure_config_tree "$failed_dir"
    fi
  elif [[ -e "$output_dir" ]]; then
    mv "$output_dir" "$backup_dir"
    secure_config_tree "$backup_dir"
  fi
  mkdir -p "$output_dir"
  chmod 700 "$output_dir"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      [[ $# -ge 2 ]] || die "missing value for --output-dir"
      output_dir="$2"
      shift 2
      ;;
    --desktop-config-reset)
      desktop_config_reset=1
      shift
      ;;
    --desktop-config-backup-dir)
      [[ $# -ge 2 ]] || die "missing value for --desktop-config-backup-dir"
      desktop_config_backup_dir="$2"
      shift 2
      ;;
    --desktop-version-from)
      [[ $# -ge 2 ]] || die "missing value for --desktop-version-from"
      desktop_version_from="$2"
      shift 2
      ;;
    --desktop-version-to)
      [[ $# -ge 2 ]] || die "missing value for --desktop-version-to"
      desktop_version_to="$2"
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
if [[ "$desktop_config_reset" == "1" ]]; then
  require_value "--desktop-config-backup-dir" "$desktop_config_backup_dir"
  require_value "--desktop-version-from" "$desktop_version_from"
  require_value "--desktop-version-to" "$desktop_version_to"
  reset_desktop_config "$desktop_config_backup_dir"
fi

mkdir -p "$output_dir"
env_file="$output_dir/.env"
if [[ ! -f "$env_file" ]]; then
  env_template >"$env_file"
fi
if [[ "$desktop_config_reset" == "1" ]]; then
  secure_config_tree "$output_dir"
fi

echo "[program-deploy] config initialized: $env_file"
if [[ "$desktop_config_reset" == "1" ]]; then
  echo "[program-deploy] Desktop config rebuilt: $desktop_version_from -> $desktop_version_to"
fi
