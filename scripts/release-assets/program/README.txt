agent-webclient program bundle
==============================

This bundle packages the compiled frontend plus a lightweight backend process
that serves the SPA and proxies API traffic to the configured upstreams.

Contents:
- `manifest.json`: Desktop/runtime metadata
- `.env.example`: runtime environment template
- `backend/server.cjs`: standalone Express HTTP server entry
- `backend/package.json` + `backend/node_modules/`: pinned runtime dependencies
- `frontend/dist/`: production frontend assets
- `start.*`, `stop.*`, `deploy.*`: lifecycle scripts
- `scripts/program-common.*`: shared runtime helpers

Runtime notes:
- Hosts should provide Node.js 18+ in `PATH`.
- `BASE_URL` points to the runner HTTP API, optional `WS_BASE_URL` points to the main WebSocket upstream and defaults to `BASE_URL`, and `VOICE_BASE_URL` points to the voice HTTP / WebSocket upstream.
