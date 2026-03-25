agent-webclient release bundle
==============================

1. Extract the bundle on the target host.
2. Copy `.env.example` to `.env`.
3. Edit `.env` so `BASE_URL` and `VOICE_BASE_URL` point to the backend endpoints reachable from the deployment target.
4. Start with `./start.sh`. The script loads the bundled image automatically when it is missing locally.
5. Stop with `./stop.sh`.

Bundle contents:
- `images/agent-webclient.tar`: offline Docker image
- `compose.release.yml`: release compose entrypoint
- `.env.example`: runtime environment template
- `start.sh` / `stop.sh`: deployment helpers
