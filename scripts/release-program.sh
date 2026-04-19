#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROGRAM_RELEASE_ASSETS_DIR="$SCRIPT_DIR/release-assets/program"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/release-common.sh"

require_release_tools
resolve_release_context

require_dir "$PROGRAM_RELEASE_ASSETS_DIR"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/README.txt"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/unix/deploy.sh"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/unix/start.sh"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/unix/stop.sh"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/unix/program-common.sh"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/windows/deploy.ps1"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/windows/start.ps1"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/windows/stop.ps1"
require_file "$PROGRAM_RELEASE_ASSETS_DIR/windows/program-common.ps1"
require_file "$REPO_ROOT/.env.example"
require_file "$REPO_ROOT/package.json"
require_file "$REPO_ROOT/package-lock.json"
require_file "$REPO_ROOT/backend/server.js"
require_file "$REPO_ROOT/backend/package.json"

cd "$REPO_ROOT"

build_frontend_dist() {
  echo "[release] building frontend dist..."
  npm ci
  npm run build
  require_file "$REPO_ROOT/dist/index.html"
}

build_program_bundle() {
  local target_os="$1"
  local target_arch="$2"
  local archive_format
  local bundle_archive
  local tmp_dir
  local stage_root
  local bundle_root
  local backend_dir
  local frontend_dir
  local scripts_dir

  archive_format="$(archive_format_for_os "$target_os")"
  bundle_archive="$RELEASE_DIR/$(program_bundle_filename "$VERSION" "$target_os" "$target_arch" "$archive_format")"

  echo "[release] program VERSION=$VERSION TARGET_OS=$target_os ARCH=$target_arch"

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/agent-webclient-program-release.XXXXXX")"
  trap 'rm -rf "$tmp_dir"' RETURN

  stage_root="$tmp_dir/stage"
  bundle_root="$stage_root/$APP_NAME"
  backend_dir="$bundle_root/backend"
  frontend_dir="$bundle_root/frontend"
  scripts_dir="$bundle_root/scripts"

  mkdir -p "$backend_dir" "$frontend_dir/dist" "$scripts_dir"

  echo "[release] assembling program bundle for $target_os..."
  cp -R "$REPO_ROOT/dist/." "$frontend_dir/dist/"
  cp "$REPO_ROOT/backend/server.js" "$backend_dir/server.js"
  cp "$REPO_ROOT/backend/package.json" "$backend_dir/package.json"
  if [[ -f "$REPO_ROOT/backend/package-lock.json" ]]; then
    cp "$REPO_ROOT/backend/package-lock.json" "$backend_dir/package-lock.json"
  fi
  cp "$REPO_ROOT/.env.example" "$bundle_root/.env.example"
  cp "$PROGRAM_RELEASE_ASSETS_DIR/README.txt" "$bundle_root/README.txt"
  write_program_manifest "$bundle_root/manifest.json" "$target_os" "$target_arch" "$(basename "$bundle_archive")"

  echo "[release] installing backend dependencies for $target_os..."
  (
    cd "$backend_dir"
    if [[ -f package-lock.json ]]; then
      npm ci --omit=dev --ignore-scripts
      exit 0
    fi
    npm install --omit=dev --ignore-scripts
  )

  if [[ "$target_os" == "windows" ]]; then
    cp "$PROGRAM_RELEASE_ASSETS_DIR/windows/deploy.ps1" "$bundle_root/deploy.ps1"
    cp "$PROGRAM_RELEASE_ASSETS_DIR/windows/start.ps1" "$bundle_root/start.ps1"
    cp "$PROGRAM_RELEASE_ASSETS_DIR/windows/stop.ps1" "$bundle_root/stop.ps1"
    cp "$PROGRAM_RELEASE_ASSETS_DIR/windows/program-common.ps1" "$scripts_dir/program-common.ps1"
  else
    cp "$PROGRAM_RELEASE_ASSETS_DIR/unix/deploy.sh" "$bundle_root/deploy.sh"
    cp "$PROGRAM_RELEASE_ASSETS_DIR/unix/start.sh" "$bundle_root/start.sh"
    cp "$PROGRAM_RELEASE_ASSETS_DIR/unix/stop.sh" "$bundle_root/stop.sh"
    cp "$PROGRAM_RELEASE_ASSETS_DIR/unix/program-common.sh" "$scripts_dir/program-common.sh"
    chmod +x \
      "$backend_dir/server.js" \
      "$bundle_root/deploy.sh" \
      "$bundle_root/start.sh" \
      "$bundle_root/stop.sh" \
      "$scripts_dir/program-common.sh"
  fi

  mkdir -p "$RELEASE_DIR"
  archive_bundle_dir "$stage_root" "$APP_NAME" "$bundle_archive" "$archive_format"

  echo "[release] done: $bundle_archive"
}

build_frontend_dist

while read -r target_os target_arch; do
  [[ -n "$target_os" ]] || continue
  [[ -n "$target_arch" ]] || die "missing ARCH for program target $target_os"
  require_archive_tool_for_os "$target_os"
  build_program_bundle "$target_os" "$target_arch"
done < <(parse_program_target_matrix)
