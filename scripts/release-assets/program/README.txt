agent-webclient program bundle
==============================

This bundle packages the compiled frontend plus a lightweight backend process
that serves the SPA and proxies API traffic to the configured upstreams.

Contents:
- `manifest.json`: Desktop/runtime metadata
- `.env.example`: runtime environment template
- `backend/agent-webclient`: standalone HTTP server
- `frontend/dist/`: production frontend assets
- `start.*`, `stop.*`, `deploy.*`: lifecycle scripts
- `scripts/program-common.*`: shared runtime helpers
