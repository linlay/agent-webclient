#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="agent-webclient"
RELEASE_PROGRAM_ASSETS_DIR="$SCRIPT_DIR/release-program-assets"

die() { echo "[release-program] $*" >&2; exit 1; }

load_build_env() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
}

ensure_host_dependencies() {
  if [[ -x "$REPO_ROOT/node_modules/.bin/webpack" ]]; then
    echo "[release-program] reusing existing host dependencies"
    return 0
  fi

  echo "[release-program] installing dependencies on host..."
  (
    cd "$REPO_ROOT"
    if [[ -f package-lock.json ]]; then
      npm ci
      if [[ ! -x "$REPO_ROOT/node_modules/.bin/webpack" ]]; then
        echo "[release-program] npm ci did not produce a usable webpack binary; retrying with npm install"
        npm install
      fi
    else
      npm install
    fi
  )

  [[ -x "$REPO_ROOT/node_modules/.bin/webpack" ]] || die "webpack binary not found after dependency install"
}

VERSION="${VERSION:-$(cat "$REPO_ROOT/VERSION" 2>/dev/null || echo "dev")}"
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "VERSION must match vX.Y.Z (got: $VERSION)"

command -v npm >/dev/null 2>&1 || die "npm is required"
command -v tar >/dev/null 2>&1 || die "tar is required"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${APP_NAME}-release-program.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

BUILD_ENV_FILE="$REPO_ROOT/.env"
BUNDLE_NAME="${APP_NAME}-${VERSION}"
BUNDLE_TAR_TMP="$TMP_DIR/${BUNDLE_NAME}.tar.gz"
BUNDLE_TAR="$REPO_ROOT/dist/release/${BUNDLE_NAME}.tar.gz"
WORK_ROOT="$TMP_DIR/$APP_NAME"
MANIFEST_FILE="$WORK_ROOT/manifest.json"
PROGRAM_ENV_FILE="$WORK_ROOT/.env.example"

if [[ ! -f "$BUILD_ENV_FILE" ]]; then
  BUILD_ENV_FILE="$TMP_DIR/build.env"
  cp "$REPO_ROOT/.env.example" "$BUILD_ENV_FILE"
  echo "[release-program] root .env not found; using .env.example defaults for production build"
fi

ensure_host_dependencies

echo "[release-program] building frontend on host..."
(
  cd "$REPO_ROOT"
  load_build_env "$BUILD_ENV_FILE"
  export NODE_ENV=production
  ./node_modules/.bin/webpack --mode production
)

[[ -f "$REPO_ROOT/dist/index.html" ]] || die "dist/index.html not found after build"

mkdir -p "$WORK_ROOT"
cp -R "$REPO_ROOT/dist" "$WORK_ROOT/dist"
rm -rf "$WORK_ROOT/dist/bundle"
rm -rf "$WORK_ROOT/dist/release"
cp "$RELEASE_PROGRAM_ASSETS_DIR/.env.example" "$PROGRAM_ENV_FILE"
cp "$RELEASE_PROGRAM_ASSETS_DIR/README.txt" "$WORK_ROOT/README.txt"
cp "$RELEASE_PROGRAM_ASSETS_DIR/deploy.sh" "$WORK_ROOT/deploy.sh"
cp "$RELEASE_PROGRAM_ASSETS_DIR/manifest.json" "$MANIFEST_FILE"

sed -i.bak "s/__APP_VERSION__/$VERSION/" "$MANIFEST_FILE"
rm -f "$MANIFEST_FILE.bak"

chmod +x "$WORK_ROOT/deploy.sh"

tar -czf "$BUNDLE_TAR_TMP" -C "$TMP_DIR" "$APP_NAME"

rm -rf "$REPO_ROOT/dist"
mkdir -p "$(dirname "$BUNDLE_TAR")"
mv "$BUNDLE_TAR_TMP" "$BUNDLE_TAR"

echo "[release-program] done: $BUNDLE_TAR"
