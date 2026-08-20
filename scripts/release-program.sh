#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_CONTRACT_CHECKER="$REPO_ROOT/scripts/check-agent-webclient-contract.js"
CONVERSATION_EXPORT_WEBPACK_CONFIG="$REPO_ROOT/webpack.export.config.js"
CONVERSATION_EXPORT_BUILDER="$REPO_ROOT/scripts/build-conversation-export-template.js"
CONVERSATION_EXPORT_CHECKER="$REPO_ROOT/scripts/check-conversation-export-template.js"
CONVERSATION_EXPORT_CDN_ASSETS="$REPO_ROOT/scripts/conversation-export-cdn-assets.json"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/release-common.sh"

require_release_tools
resolve_release_context

require_file "$REPO_ROOT/.env.example"
require_file "$REPO_ROOT/scripts/release-assets/program/unix/deploy.sh"
require_file "$REPO_ROOT/scripts/release-assets/program/unix/start.sh"
require_file "$REPO_ROOT/scripts/release-assets/program/unix/stop.sh"
require_file "$REPO_ROOT/scripts/release-assets/program/unix/program-common.sh"
require_file "$REPO_ROOT/scripts/release-assets/program/windows/deploy.ps1"
require_file "$REPO_ROOT/scripts/release-assets/program/windows/start.ps1"
require_file "$REPO_ROOT/scripts/release-assets/program/windows/stop.ps1"
require_file "$REPO_ROOT/scripts/release-assets/program/windows/program-common.ps1"
require_file "$DESKTOP_CONTRACT_CHECKER"
require_file "$CONVERSATION_EXPORT_WEBPACK_CONFIG"
require_file "$CONVERSATION_EXPORT_BUILDER"
require_file "$CONVERSATION_EXPORT_CHECKER"
require_file "$CONVERSATION_EXPORT_CDN_ASSETS"
require_file "$REPO_ROOT/package.json"

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

  mkdir -p "$BUILD_ROOT/scripts"
  cp "$REPO_ROOT/package.json" "$BUILD_ROOT/package.json"
  copy_file_if_exists "$REPO_ROOT/package-lock.json" "$BUILD_ROOT/package-lock.json"
  cp "$REPO_ROOT/webpack.config.js" "$BUILD_ROOT/webpack.config.js"
  cp "$CONVERSATION_EXPORT_WEBPACK_CONFIG" "$BUILD_ROOT/webpack.export.config.js"
  cp "$REPO_ROOT/tsconfig.json" "$BUILD_ROOT/tsconfig.json"
  cp "$REPO_ROOT/postcss.config.js" "$BUILD_ROOT/postcss.config.js"
  cp "$REPO_ROOT/.env.example" "$BUILD_ROOT/.env.example"
  copy_file_if_exists "$REPO_ROOT/.env" "$BUILD_ROOT/.env"
  cp "$DESKTOP_CONTRACT_CHECKER" "$BUILD_ROOT/scripts/check-agent-webclient-contract.js"
  cp "$CONVERSATION_EXPORT_BUILDER" "$BUILD_ROOT/scripts/build-conversation-export-template.js"
  cp "$CONVERSATION_EXPORT_CHECKER" "$BUILD_ROOT/scripts/check-conversation-export-template.js"
  cp "$CONVERSATION_EXPORT_CDN_ASSETS" "$BUILD_ROOT/scripts/conversation-export-cdn-assets.json"

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
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      echo "[release] package-lock.json not found; using npm install without writing a lockfile."
      npm install --no-package-lock
    fi
  )
}

build_frontend_dist() {
  echo "[release] building frontend dist in isolated workspace..."
  (
    cd "$BUILD_ROOT"
    npm run build
  )
  require_file "$BUILD_ROOT/dist/index.html"
  require_file "$BUILD_ROOT/dist/export/conversation.template.html"
  require_file "$BUILD_ROOT/dist/export/conversation-assets.json"
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

  mkdir -p "$frontend_dir/dist"
  mkdir -p "$scripts_dir"

  echo "[release] assembling program bundle for $target_os..."
  cp -R "$BUILD_ROOT/dist/." "$frontend_dir/dist/"
  rm -rf "$frontend_dir/dist/export/assets"
  rm -f "$frontend_dir/dist/export/conversation-assets.json"
  cp "$REPO_ROOT/.env.example" "$bundle_root/.env.example"
  if [[ "$target_os" == "windows" ]]; then
    cp "$REPO_ROOT/scripts/release-assets/program/windows/deploy.ps1" "$bundle_root/deploy.ps1"
    cp "$REPO_ROOT/scripts/release-assets/program/windows/start.ps1" "$bundle_root/start.ps1"
    cp "$REPO_ROOT/scripts/release-assets/program/windows/stop.ps1" "$bundle_root/stop.ps1"
    cp "$REPO_ROOT/scripts/release-assets/program/windows/program-common.ps1" "$scripts_dir/program-common.ps1"
  else
    cp "$REPO_ROOT/scripts/release-assets/program/unix/deploy.sh" "$bundle_root/deploy.sh"
    cp "$REPO_ROOT/scripts/release-assets/program/unix/start.sh" "$bundle_root/start.sh"
    cp "$REPO_ROOT/scripts/release-assets/program/unix/stop.sh" "$bundle_root/stop.sh"
    cp "$REPO_ROOT/scripts/release-assets/program/unix/program-common.sh" "$scripts_dir/program-common.sh"
    chmod +x \
      "$bundle_root/deploy.sh" \
      "$bundle_root/start.sh" \
      "$bundle_root/stop.sh" \
      "$scripts_dir/program-common.sh"
  fi
  write_program_manifest "$bundle_root/manifest.json" "$target_os" "$target_arch" "$(basename "$bundle_archive")"

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
