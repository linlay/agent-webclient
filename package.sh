#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
NGINX_FILE="$ROOT_DIR/nginx.conf"

log() {
  printf '[package] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[package] missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_cmd npm

if [ ! -f "$ROOT_DIR/package.json" ]; then
  printf '[package] package.json not found in project root\n' >&2
  exit 1
fi

if [ ! -f "$NGINX_FILE" ]; then
  printf '[package] nginx.conf not found in project root\n' >&2
  exit 1
fi

if [ -f "$ROOT_DIR/.env" ]; then
  log "load environment from $ROOT_DIR/.env"
  set -a
  # shellcheck disable=SC1090
  . "$ROOT_DIR/.env"
  set +a
fi

log "build web dist"
(
  cd "$ROOT_DIR"
  if [ ! -d node_modules ]; then
    npm ci
  fi
  npm run build
)

if [ ! -d "$ROOT_DIR/dist" ]; then
  printf '[package] dist directory not found\n' >&2
  exit 1
fi

log "clean release directory: $RELEASE_DIR"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/frontend"

cp -R "$ROOT_DIR/dist" "$RELEASE_DIR/frontend/dist"

cp "$NGINX_FILE" "$RELEASE_DIR/frontend/nginx.conf"

cat >"$RELEASE_DIR/frontend/Dockerfile" <<'EOF'
FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["/bin/sh", "-c", "envsubst '$$AGENT_API_UPSTREAM' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
EOF

cat >"$RELEASE_DIR/docker-compose.yml" <<'EOF'
services:
  webclient:
    build:
      context: ./frontend
    container_name: agent-webclient
    environment:
      AGENT_API_UPSTREAM: ${AGENT_API_UPSTREAM:-http://host.docker.internal:11949}
    ports:
      - "${AGENT_WEBCLIENT_PORT:-11948}:80"
EOF

cat >"$RELEASE_DIR/.env.example" <<'EOF'
# host expose port
AGENT_WEBCLIENT_PORT=11948

# upstream AGENT API base URL (no trailing slash)
AGENT_API_UPSTREAM=http://host.docker.internal:11949
EOF

cat >"$RELEASE_DIR/DEPLOY.md" <<'EOF'
# Release Deployment

1. Copy this `release` directory to the target host.
2. Enter the release directory and create env file:

   cp .env.example .env

3. Edit `.env` for production.
4. Start service:

   docker compose up -d --build
EOF

log "release package generated:"
log "  $RELEASE_DIR/frontend/dist"
log "  $RELEASE_DIR/frontend/nginx.conf"
log "  $RELEASE_DIR/frontend/Dockerfile"
log "  $RELEASE_DIR/docker-compose.yml"
log "  $RELEASE_DIR/.env.example"
log "  $RELEASE_DIR/DEPLOY.md"
