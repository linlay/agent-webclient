#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_CONTRACT_CHECKER="$REPO_ROOT/scripts/check-agent-webclient-contract.js"
FEATURE_BOUNDARY_CHECKER="$REPO_ROOT/scripts/check-feature-boundaries.js"
BUILD_WORKSPACE_PREPARER="$REPO_ROOT/scripts/prepare-release-build-cache.js"

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
require_file "$FEATURE_BOUNDARY_CHECKER"
require_file "$BUILD_WORKSPACE_PREPARER"
require_file "$REPO_ROOT/package.json"
require_file "$REPO_ROOT/webpack.config.js"
require_file "$REPO_ROOT/tsconfig.json"
require_file "$REPO_ROOT/postcss.config.js"
[[ -d "$REPO_ROOT/src" ]] || die "required release input directory is missing: src"
[[ -d "$REPO_ROOT/public" ]] || die "required release input directory is missing: public"

cd "$REPO_ROOT"

cache_base="${XDG_CACHE_HOME:-${HOME:-${TMPDIR:-/tmp}}/.cache}"
BUILD_CACHE_ROOT="${AGENT_WEBCLIENT_BUILD_CACHE_DIR:-$cache_base/zenmind/build-cache/agent-webclient}"
BUILD_ROOT="$BUILD_CACHE_ROOT/build"
BUNDLE_TMP_DIRS=()

cleanup_release_temps() {
  if ((${#BUNDLE_TMP_DIRS[@]} > 0)); then
    rm -rf "${BUNDLE_TMP_DIRS[@]}"
  fi
}

prepare_build_root() {
  trap cleanup_release_temps EXIT
  echo "[release] preparing cached frontend workspace: $BUILD_ROOT"
  node "$BUILD_WORKSPACE_PREPARER" --source "$REPO_ROOT" --build "$BUILD_ROOT"
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
  [[ ! -e "$bundle_archive" ]] || die "release already exists: $bundle_archive; choose a new VERSION"

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

while read -r target_os target_arch; do
  [[ -n "$target_os" ]] || continue
  target_archive="$RELEASE_DIR/$(program_bundle_filename "$VERSION" "$target_os" "$target_arch" "$(archive_format_for_os "$target_os")")"
  [[ ! -e "$target_archive" ]] || die "release already exists: $target_archive; choose a new VERSION"
done < <(parse_program_target_matrix)

prepare_build_root
build_frontend_dist

while read -r target_os target_arch; do
  [[ -n "$target_os" ]] || continue
  [[ -n "$target_arch" ]] || die "missing ARCH for program target $target_os"
  require_archive_tool_for_os "$target_os"
  build_program_bundle "$target_os" "$target_arch"
done < <(parse_program_target_matrix)
