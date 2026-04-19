agent-webclient program bundle
==============================

This bundle packages the compiled frontend plus a lightweight backend process
that serves the SPA and proxies API traffic to the configured upstreams.

Contents:
- `manifest.json`: Desktop/runtime metadata
- `.env.example`: runtime environment template
- `backend/server.js`: standalone Express HTTP server entry
- `backend/package.json` + `backend/node_modules/`: pinned runtime dependencies
- `frontend/dist/`: production frontend assets
- `start.*`, `stop.*`, `deploy.*`: lifecycle scripts
- `scripts/program-common.*`: shared runtime helpers

Runtime notes:
- Desktop writes `NODE_BIN` into `.env` and starts the backend with `ELECTRON_RUN_AS_NODE=1`.
- Standalone hosts should provide Node.js 18+ in `PATH` when `NODE_BIN` is unset.
