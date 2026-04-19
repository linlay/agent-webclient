#!/usr/bin/env bash
set -euo pipefail

APP_NAME="agent-webclient"

die() {
  echo "[release] $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || die "required file not found: $path"
}

require_dir() {
  local path="$1"
  [[ -d "$path" ]] || die "required directory not found: $path"
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) die "cannot detect ARCH from $(uname -m); pass ARCH=amd64|arm64" ;;
  esac
}

validate_arch() {
  case "$1" in
    amd64|arm64) ;;
    *) die "ARCH must be amd64 or arm64 (got: $1)" ;;
  esac
}

validate_target_os() {
  case "$1" in
    linux|darwin|windows) ;;
    *) die "TARGET_OS must be linux, darwin, or windows (got: $1)" ;;
  esac
}

require_release_tools() {
  command -v npm >/dev/null 2>&1 || die "npm is required"
}

resolve_release_context() {
  VERSION="${VERSION:-$(cat "$REPO_ROOT/VERSION" 2>/dev/null || echo "dev")}"
  [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "VERSION must match vX.Y.Z (got: $VERSION)"

  ARCH="${ARCH:-$(detect_arch)}"
  validate_arch "$ARCH"

  RELEASE_DIR="$REPO_ROOT/dist/release"
}

archive_format_for_os() {
  local target_os="$1"
  validate_target_os "$target_os"
  case "$target_os" in
    windows) printf 'zip\n' ;;
    *) printf 'tar.gz\n' ;;
  esac
}

require_archive_tool_for_os() {
  local target_os="$1"
  local archive_format
  archive_format="$(archive_format_for_os "$target_os")"
  case "$archive_format" in
    tar.gz) command -v tar >/dev/null 2>&1 || die "tar is required for $target_os bundles" ;;
    zip) command -v zip >/dev/null 2>&1 || die "zip is required for $target_os bundles" ;;
    *) die "unsupported archive format: $archive_format" ;;
  esac
}

archive_bundle_dir() {
  local stage_root="$1"
  local bundle_dir_name="$2"
  local output_path="$3"
  local format="$4"

  mkdir -p "$(dirname "$output_path")"

  case "$format" in
    tar.gz)
      tar -czf "$output_path" -C "$stage_root" "$bundle_dir_name"
      ;;
    zip)
      (
        cd "$stage_root"
        zip -qr "$output_path" "$bundle_dir_name"
      )
      ;;
    *)
      die "unsupported archive format: $format"
      ;;
  esac
}

program_bundle_filename() {
  local version="$1"
  local target_os="$2"
  local target_arch="$3"
  local archive_format="$4"
  printf '%s-%s-%s-%s.%s\n' "$APP_NAME" "$version" "$target_os" "$target_arch" "$archive_format"
}

parse_program_targets() {
  local raw="${PROGRAM_TARGETS:-darwin,windows}"
  raw="${raw//,/ }"
  for target in $raw; do
    validate_target_os "$target"
    printf '%s\n' "$target"
  done
}

parse_program_target_matrix() {
  local raw="${PROGRAM_TARGET_MATRIX:-}"
  local target_spec
  local target_os
  local target_arch

  if [[ -n "$raw" ]]; then
    raw="${raw//,/ }"
    for target_spec in $raw; do
      [[ "$target_spec" == */* ]] || die "PROGRAM_TARGET_MATRIX entries must look like <os>/<arch> (got: $target_spec)"
      target_os="${target_spec%%/*}"
      target_arch="${target_spec#*/}"
      validate_target_os "$target_os"
      validate_arch "$target_arch"
      printf '%s %s\n' "$target_os" "$target_arch"
    done
    return
  fi

  if [[ -n "${PROGRAM_TARGETS:-}" ]]; then
    while IFS= read -r target_os; do
      [[ -n "$target_os" ]] || continue
      printf '%s %s\n' "$target_os" "$ARCH"
    done < <(parse_program_targets)
    return
  fi

  printf 'darwin arm64\n'
  printf 'windows amd64\n'
}

write_program_manifest() {
  local dest="$1"
  local target_os="$2"
  local target_arch="$3"
  local asset_file_name="$4"
  local backend_entry="backend/server.js"
  local start_script="start.sh"
  local stop_script="stop.sh"
  local deploy_script="deploy.sh"
  local program_common="scripts/program-common.sh"
  local error_log_json=""

  if [[ "$target_os" == "windows" ]]; then
    start_script="start.ps1"
    stop_script="stop.ps1"
    deploy_script="deploy.ps1"
    program_common="scripts/program-common.ps1"
    error_log_json='    "errorLogRelativePath": "run/agent-webclient.stderr.log",'
  fi

  cat >"$dest" <<EOF
{
  "kind": "builtin",
  "id": "$APP_NAME",
  "name": "小宅助理",
  "version": "$VERSION",
  "description": "独立进程模式的 AGENT Web 客户端，负责静态资源托管并代理 API 请求。",
  "platform": {
    "os": "$target_os",
    "arch": "$target_arch"
  },
  "frontend": {
    "mode": "standalone",
    "entry": "/",
    "directAccess": true,
    "hostManaged": false
  },
  "backend": {
    "entry": "$backend_entry"
  },
  "scripts": {
    "start": ["$start_script", "--daemon"],
    "stop": "$stop_script",
    "deploy": "$deploy_script"
  },
  "configFiles": [
    {
      "key": "env",
      "label": ".env",
      "relativePath": ".env",
      "templateRelativePath": ".env.example",
      "required": true
    }
  ],
  "runtime": {
    "pidRelativePath": "run/agent-webclient.pid",
    "logRelativePath": "run/agent-webclient.log",
${error_log_json}
    "requiredPaths": [
      "$backend_entry",
      "backend/package.json",
      "backend/node_modules",
      "$start_script",
      "$stop_script",
      "$deploy_script",
      "$program_common",
      ".env.example",
      "manifest.json",
      "frontend/dist/index.html"
    ]
  },
  "web": {
    "routePath": "/",
    "portEnvKey": "PORT",
    "defaultPort": 11948
  },
  "desktop": {
    "assetFileName": "$asset_file_name",
    "bundleTopLevelDir": "$APP_NAME"
  }
}
EOF
}
