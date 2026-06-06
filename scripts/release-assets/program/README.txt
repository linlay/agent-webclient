agent-webclient program bundle
==============================

This bundle packages the compiled frontend for ZenMind Desktop. Desktop hosts
the SPA and proxy routes from its main process.

Contents:
- `manifest.json`: Desktop/runtime metadata
- `.env.example`: runtime environment template
- `frontend/dist/`: production frontend assets
- `start.*`, `stop.*`, `deploy.*`: lifecycle scripts
- `scripts/program-common.*`: shared runtime helpers

Runtime notes:
- ZenMind Desktop starts and stops the local HTTP host itself; lifecycle scripts
  are retained for manifest compatibility and print the managed endpoint.
- `BASE_URL` points to the runner HTTP API and main `/ws` upstream. Optional
  `VOICE_BASE_URL` points to the voice HTTP / WebSocket upstream; leave it empty
  to hide voice features.
