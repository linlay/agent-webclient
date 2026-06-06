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

cd "$REPO_ROOT"

BUILD_ROOT=""
BUNDLE_TMP_DIRS=()

cleanup_release_temps() {
  if [[ -n "$BUILD_ROOT" ]]; then
    rm -rf "$BUILD_ROOT"
  fi

  if ((${#BUNDLE_TMP_DIRS[@]} > 0)); then
    rm -rf "${BUNDLE_TMP_DIRS[@]}"
  fi
}

copy_file_if_exists() {
  local src="$1"
  local dest="$2"

  if [[ -f "$src" ]]; then
    cp "$src" "$dest"
  fi
}

prepare_build_root() {
  BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/agent-webclient-program-build.XXXXXX")"
  BUILD_ROOT="$(cd "$BUILD_ROOT" && pwd -P)"
  trap cleanup_release_temps EXIT

  mkdir -p "$BUILD_ROOT"
  cp "$REPO_ROOT/package.json" "$BUILD_ROOT/package.json"
  cp "$REPO_ROOT/package-lock.json" "$BUILD_ROOT/package-lock.json"
  cp "$REPO_ROOT/webpack.config.js" "$BUILD_ROOT/webpack.config.js"
  cp "$REPO_ROOT/tsconfig.json" "$BUILD_ROOT/tsconfig.json"
  cp "$REPO_ROOT/postcss.config.js" "$BUILD_ROOT/postcss.config.js"
  cp "$REPO_ROOT/.env.example" "$BUILD_ROOT/.env.example"
  copy_file_if_exists "$REPO_ROOT/.env" "$BUILD_ROOT/.env"

  if [[ ! -f "$BUILD_ROOT/.env" ]]; then
    cp "$BUILD_ROOT/.env.example" "$BUILD_ROOT/.env"
  fi

  cp -R "$REPO_ROOT/public" "$BUILD_ROOT/public"
  cp -R "$REPO_ROOT/src" "$BUILD_ROOT/src"
}

install_build_dependencies() {
  echo "[release] installing isolated frontend dependencies..."
  (
    cd "$BUILD_ROOT"
    npm ci
  )
}

build_frontend_dist() {
  echo "[release] building frontend dist in isolated workspace..."
  (
    cd "$BUILD_ROOT"
    npm run build
  )
  require_file "$BUILD_ROOT/dist/index.html"
}

build_program_bundle() {
  local target_os="$1"
  local target_arch="$2"
  local archive_format
  local bundle_archive
  local tmp_dir
  local stage_root
  local bundle_root
  local frontend_dir
  local scripts_dir

  archive_format="$(archive_format_for_os "$target_os")"
  bundle_archive="$RELEASE_DIR/$(program_bundle_filename "$VERSION" "$target_os" "$target_arch" "$archive_format")"

  echo "[release] program VERSION=$VERSION TARGET_OS=$target_os ARCH=$target_arch"

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/agent-webclient-program-release.XXXXXX")"
  BUNDLE_TMP_DIRS+=("$tmp_dir")

  stage_root="$tmp_dir/stage"
  bundle_root="$stage_root/$APP_NAME"
  frontend_dir="$bundle_root/frontend"
  scripts_dir="$bundle_root/scripts"

  mkdir -p "$frontend_dir/dist" "$scripts_dir"

  echo "[release] assembling program bundle for $target_os..."
  cp -R "$BUILD_ROOT/dist/." "$frontend_dir/dist/"
  cp "$REPO_ROOT/.env.example" "$bundle_root/.env.example"
  write_program_manifest "$bundle_root/manifest.json" "$target_os" "$target_arch" "$(basename "$bundle_archive")"

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
      "$bundle_root/deploy.sh" \
      "$bundle_root/start.sh" \
      "$bundle_root/stop.sh" \
      "$scripts_dir/program-common.sh"
  fi

  mkdir -p "$RELEASE_DIR"
  archive_bundle_dir "$stage_root" "$APP_NAME" "$bundle_archive" "$archive_format"
  rm -rf "$tmp_dir"

  echo "[release] done: $bundle_archive"
}

prepare_build_root
install_build_dependencies
build_frontend_dist

while read -r target_os target_arch; do
  [[ -n "$target_os" ]] || continue
  [[ -n "$target_arch" ]] || die "missing ARCH for program target $target_os"
  require_archive_tool_for_os "$target_os"
  build_program_bundle "$target_os" "$target_arch"
done < <(parse_program_target_matrix)
