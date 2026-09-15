# MessengerPro deployment status

MessengerPro is currently a self-hosted Docker Compose application. The repository is not yet a complete public production Messenger service: the current backend is a realtime prototype and still needs authenticated accounts, durable conversation APIs, production WebSocket authentication, and a finished web client.

## Testing

Run locally with Docker Compose:

```bash
git clone https://github.com/Narsing-s/MessengerPro.git
cd MessengerPro
cp .env.example .env
docker compose up -d --build
```

Open the web service through the configured Caddy/web port from `docker compose ps`.

## Important

Do not use an unconfigured public deployment as a real messaging service yet. PostgreSQL/Redis and the backend must be reachable by the web application, and production HTTPS/WSS plus authentication are required for global cross-device use.
