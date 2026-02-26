# Release Deployment

1. Copy this `release` directory to the target host.
2. Enter the release directory and create env file:

   cp .env.example .env

3. Edit `.env` for production.
4. Start service:

   docker compose up -d --build
