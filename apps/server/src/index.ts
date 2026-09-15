import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Pool } from 'pg';
import Redis from 'ioredis';

const port = Number(process.env.PORT ?? 4000);
const origin = process.env.WEB_ORIGIN ?? 'http://localhost';
const app = Fastify({ logger: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const clients = new Map<string, Set<any>>();

await app.register(cors, { origin, credentials: true });
await app.register(websocket);

app.get('/api/health', async (_request, reply) => {
  await pool.query('select 1');
  await redis.ping();
  return reply.send({ ok: true, service: 'messengerpro-server', time: new Date().toISOString() });
});

app.get('/api/ready', async (_request, reply) => {
  try {
    await pool.query('select 1');
    await redis.ping();
    return { ready: true };
  } catch {
    return reply.code(503).send({ ready: false });
  }
});

app.get('/ws', { websocket: true }, (socket, request) => {
  const userId = String((request.query as { userId?: string }).userId ?? '');
  if (!userId) {
    socket.close(1008, 'userId is required');
    return;
  }

  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(socket);

  socket.on('message', async (raw: Buffer) => {
    try {
      const message = JSON.parse(raw.toString()) as {
        type?: string;
        to?: string;
        body?: string;
        clientMessageId?: string;
      };

      if (message.type !== 'message' || !message.to || !message.body) return;
      const result = await pool.query(
        `insert into messages(sender_id, recipient_id, body, client_message_id)
         values ($1,$2,$3,$4)
         returning id, sender_id, recipient_id, body, client_message_id, created_at`,
        [userId, message.to, message.body, message.clientMessageId ?? null]
      );
      const event = JSON.stringify({ type: 'message', message: result.rows[0] });
      clients.get(message.to)?.forEach((client) => client.send(event));
      socket.send(JSON.stringify({ type: 'ack', clientMessageId: message.clientMessageId, message: result.rows[0] }));
    } catch (error) {
      app.log.error(error);
      socket.send(JSON.stringify({ type: 'error', message: 'Unable to send message' }));
    }
  });

  socket.on('close', () => {
    const current = clients.get(userId);
    current?.delete(socket);
    if (current?.size === 0) clients.delete(userId);
  });
});

await pool.query(`
  create table if not exists messages (
    id bigserial primary key,
    sender_id text not null,
    recipient_id text not null,
    body text not null,
    client_message_id text,
    created_at timestamptz not null default now()
  );
  create unique index if not exists messages_client_message_id_idx
    on messages(sender_id, client_message_id)
    where client_message_id is not null;
`);

await app.listen({ host: '0.0.0.0', port });

const shutdown = async () => {
  await app.close();
  await redis.quit();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
