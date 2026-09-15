# MessengerPro

A self-hosted, real-time messaging platform designed for private infrastructure, teams, communities and global communication.

## Current product capabilities

- Real-time 1:1 messaging over WebSocket
- Persistent PostgreSQL message history
- Offline message delivery after reconnect
- Account registration and login
- User discovery/search
- Presence and last-seen
- Typing indicators
- Delivery/read receipts
- Message edit and delete
- Emoji reactions
- Starred messages
- Pin, mute and archive conversation controls
- Message search and history pagination
- Health/readiness endpoints
- Redis-backed realtime infrastructure
- Docker/Caddy deployment

## Product direction

MessengerPro is being built as a privacy-first, self-hostable alternative to mainstream messengers, with advanced collaboration features planned on top of the realtime core.

Planned platform capabilities include:

- Groups, communities and announcement spaces
- Channels and broadcast publishing
- Polls, events and richer collaboration
- Voice/video calls and screen sharing
- Media, document and large-file sharing
- Multi-device synchronization
- Push notifications
- Audited end-to-end encryption
- Device/session management
- Disappearing and scheduled messages
- Bots, webhooks and Mini Apps
- Moderation, reporting and anti-spam controls
- Encrypted backup/export/restore
- Federation between independent MessengerPro servers
- Business/workspace capabilities

## Architecture

- **Web client:** Next.js + TypeScript
- **API/realtime:** Node.js + TypeScript + Fastify + WebSocket
- **Database:** PostgreSQL
- **Presence/cache:** Redis
- **Reverse proxy/TLS:** Caddy
- **Deployment:** Docker Compose

## Quick start

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost`.

For production, point your domain at the server and configure `DOMAIN` in `.env`. Caddy handles HTTPS when the domain resolves publicly.

## Design principles

1. Privacy and self-hosting first.
2. Real operations, not placeholder UI actions.
3. Reliable persistence before realtime acknowledgement.
4. Safe reconnect and offline delivery.
5. Server-side authorization for every privileged operation.
6. No secrets committed to source control.
7. Test every cross-account flow before calling a feature production-ready.
