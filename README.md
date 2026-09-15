# MessengerPro

A self-hosted, real-time Messenger platform designed to run on your own VPS, dedicated server, home server, or private cloud.

## Architecture

- **Web client:** Next.js + TypeScript
- **API/realtime:** Node.js + TypeScript + Fastify + WebSocket
- **Database:** PostgreSQL
- **Presence/cache:** Redis
- **Reverse proxy/TLS:** Caddy
- **Deployment:** Docker Compose
- **Storage:** local volume by default, S3-compatible storage ready

## Quick start

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost`.

For production, point your domain at the server and configure `DOMAIN` in `.env`. Caddy will handle HTTPS when the domain resolves publicly.

## Design goals

1. No dependency on Vercel, Render, or another application host.
2. Real-time delivery over WebSocket with automatic reconnect.
3. Messages are persisted before acknowledgement.
4. Offline users receive pending messages when they reconnect.
5. Health checks and graceful shutdown are built in.
6. Database and Redis are private to the Docker network.
7. Secrets are supplied through environment variables and never committed.

## Roadmap

- Accounts and sessions
- 1:1 conversations
- Groups
- Presence and typing indicators
- Read/delivery receipts
- Attachments
- Multi-device sync
- Push notifications
- End-to-end encryption
- Federation between independent MessengerPro servers
- Automated encrypted backups
