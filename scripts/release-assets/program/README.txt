agent-webclient program bundle
==============================

This bundle packages the compiled frontend for Desktop. Desktop hosts
the SPA and proxy routes from its main process.

Contents:
- `manifest.json`: Desktop/runtime metadata
- `.env.example`: runtime environment template
- `frontend/dist/`: production frontend assets

Runtime notes:
- Desktop starts and stops the local HTTP host itself. This bundle does
  not include a backend entrypoint.
- `deploy.sh` / `deploy.ps1` initializes `.env` from `.env.example`.
- Desktop supplies host-managed values such as `PORT`, `DESKTOP_APP`,
  and `BASE_URL` at start time. Optional `VOICE_ENABLED=true` in `.env` enables the entry only when Platform
  capabilities are ready. Voice HTTP and the exact media WebSocket use `BASE_URL`.
