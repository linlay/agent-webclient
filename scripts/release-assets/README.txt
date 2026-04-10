agent-webclient image bundle
============================

This bundle packages the production frontend as an offline Docker image plus the
runtime files needed to start it with Docker Compose.

1. Extract the bundle on the target host.
2. Copy `.env.example` to `.env`.
3. Edit `.env` so `BASE_URL` and `VOICE_BASE_URL` point to the backend endpoints reachable from the deployment target.
4. Start with `./start.sh`. The script loads the bundled image automatically when it is missing locally.
5. Stop with `./stop.sh`.

Runtime contract:
- `BASE_URL` is required and must point to the runner HTTP API.
- `VOICE_BASE_URL` is required and must point to the voice HTTP / WebSocket upstream.
- `HOST_PORT` is optional and defaults to `11948`, so the default entrypoint remains `http://127.0.0.1:11948`.
- On Linux, the bundled compose file adds `host.docker.internal:host-gateway` so host-side upstream URLs keep working from inside the container.

Bundle contents:
- `images/agent-webclient.tar`: offline Docker image
- `compose.release.yml`: release compose entrypoint
- `.env.example`: image bundle runtime environment template
- `start.sh` / `stop.sh`: deployment helpers
