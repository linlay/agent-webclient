#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_ASSETS_DIR="$SCRIPT_DIR/release-assets"

die() { echo "[release] $*" >&2; exit 1; }

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
    echo "[release] reusing existing host dependencies"
    return 0
  fi

  echo "[release] installing dependencies on host..."
  (
    cd "$REPO_ROOT"
    if [[ -f package-lock.json ]]; then
      npm ci
      if [[ ! -x "$REPO_ROOT/node_modules/.bin/webpack" ]]; then
        echo "[release] npm ci did not produce a usable webpack binary; retrying with npm install"
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

if [[ -z "${ARCH:-}" ]]; then
  case "$(uname -m)" in
    x86_64|amd64) ARCH=amd64 ;;
    arm64|aarch64) ARCH=arm64 ;;
    *) die "cannot detect ARCH from $(uname -m); pass ARCH=amd64|arm64" ;;
  esac
fi

PLATFORM="linux/$ARCH"
IMAGE_REF="agent-webclient:$VERSION"
BUNDLE_NAME="agent-webclient-${VERSION}-linux-${ARCH}"
BUNDLE_TAR="$REPO_ROOT/dist/release/${BUNDLE_NAME}.tar.gz"

echo "[release] VERSION=$VERSION ARCH=$ARCH PLATFORM=$PLATFORM"

command -v npm >/dev/null 2>&1 || die "npm is required"
command -v docker >/dev/null 2>&1 || die "docker is required"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agent-webclient-release.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

IMAGES_DIR="$TMP_DIR/images"
BUILD_CONTEXT_DIR="$TMP_DIR/build-context"
BUILD_ENV_FILE="$REPO_ROOT/.env"
mkdir -p "$IMAGES_DIR" "$BUILD_CONTEXT_DIR"

if [[ ! -f "$BUILD_ENV_FILE" ]]; then
  BUILD_ENV_FILE="$TMP_DIR/build.env"
  cp "$REPO_ROOT/.env.example" "$BUILD_ENV_FILE"
  echo "[release] root .env not found; using .env.example defaults for production build"
fi

ensure_host_dependencies

echo "[release] building frontend on host..."
(
  cd "$REPO_ROOT"
  load_build_env "$BUILD_ENV_FILE"
  export NODE_ENV=production
  ./node_modules/.bin/webpack --mode production
)

[[ -f "$REPO_ROOT/dist/index.html" ]] || die "dist/index.html not found after build"

cp -R "$REPO_ROOT/dist" "$BUILD_CONTEXT_DIR/dist"
cp "$REPO_ROOT/nginx.conf" "$BUILD_CONTEXT_DIR/nginx.conf"
cp "$RELEASE_ASSETS_DIR/Dockerfile.release" "$BUILD_CONTEXT_DIR/Dockerfile.release"

echo "[release] building image..."
docker buildx build \
  --platform "$PLATFORM" \
  --file "$BUILD_CONTEXT_DIR/Dockerfile.release" \
  --tag "$IMAGE_REF" \
  --output "type=docker,dest=$IMAGES_DIR/agent-webclient.tar" \
  "$BUILD_CONTEXT_DIR"

BUNDLE_ROOT="$TMP_DIR/agent-webclient"
mkdir -p "$BUNDLE_ROOT/images"

cp "$RELEASE_ASSETS_DIR/compose.release.yml" "$BUNDLE_ROOT/compose.release.yml"
cp "$RELEASE_ASSETS_DIR/start.sh" "$BUNDLE_ROOT/start.sh"
cp "$RELEASE_ASSETS_DIR/stop.sh" "$BUNDLE_ROOT/stop.sh"
cp "$RELEASE_ASSETS_DIR/README.txt" "$BUNDLE_ROOT/README.txt"
cp "$RELEASE_ASSETS_DIR/.env.example" "$BUNDLE_ROOT/.env.example"
cp "$IMAGES_DIR/agent-webclient.tar" "$BUNDLE_ROOT/images/"

sed -i.bak "s/^WEBCLIENT_VERSION=.*/WEBCLIENT_VERSION=$VERSION/" "$BUNDLE_ROOT/.env.example"
rm -f "$BUNDLE_ROOT/.env.example.bak"

chmod +x "$BUNDLE_ROOT/start.sh" "$BUNDLE_ROOT/stop.sh"

mkdir -p "$(dirname "$BUNDLE_TAR")"
tar -czf "$BUNDLE_TAR" -C "$TMP_DIR" agent-webclient

echo "[release] done: $BUNDLE_TAR"
