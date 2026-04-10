agent-webclient program bundle
==============================

This bundle packages the frontend static assets plus the metadata needed for a
host environment to deploy and serve them.

Contents:
- `manifest.json`: bundle metadata for the host
- `.env.example`: runtime environment template
- `deploy.sh`: bundle verification and `.env` bootstrap helper
- `dist/`: production frontend assets to be served by the host

Usage:
1. Extract the bundle on the target host.
2. Run `./deploy.sh`.
3. Edit `.env` so `BASE_URL` and `VOICE_BASE_URL` point to the upstream APIs reachable from the deployment target.
4. Configure the host to serve the `dist/` directory as static files.

Notes:
- This bundle does not include a backend process.
- This bundle does not include `start.sh` or `stop.sh`.
- The host environment is responsible for serving `dist/`.
