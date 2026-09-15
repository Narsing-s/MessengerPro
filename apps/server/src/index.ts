import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const port = Number(process.env.PORT ?? 4000);
const origin = process.env.WEB_ORIGIN ?? 'http://localhost';
const app = Fastify({ logger: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const clients = new Map<string, Set<any>>();

type AccountInput = { name: string; username: string; email: string; phone: string; password: string };
type LoginInput = { identifier: string; mode?: 'phone' | 'email' | 'username'; password: string };
const normalize = (v: string) => v.trim().toLowerCase();
const phone = (v: string) => v.replace(/\D/g, '').slice(-10);
const hashPassword = (password: string, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password: string, stored: string) => { try { const [salt, hash] = stored.split(':'); if (!salt || !hash) return false; const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return expected.length === actual.length && timingSafeEqual(actual, expected); } catch { return false; } };

await app.register(cors, { origin: origin === '*' ? true : origin.split(',').map((v) => v.trim()), credentials: true });
await app.register(websocket);

app.get('/api/health', async (_request, reply) => { await pool.query('select 1'); await redis.ping(); return reply.send({ ok: true, service: 'messengerpro-server', time: new Date().toISOString() }); });
app.get('/api/ready', async (_request, reply) => { try { await pool.query('select 1'); await redis.ping(); return { ready: true }; } catch { return reply.code(503).send({ ready: false }); } });

app.post('/api/auth/register', async (request, reply) => {
  const body = request.body as Partial<AccountInput>;
  const name = String(body.name ?? '').trim(), username = String(body.username ?? '').trim(), email = normalize(String(body.email ?? '')), mobile = phone(String(body.phone ?? '')), password = String(body.password ?? '');
  if (!name || !username || !email || mobile.length < 10 || password.length < 8) return reply.code(400).send({ error: 'Invalid registration details' });
  const exists = await pool.query('select 1 from users where lower(username)=lower($1) or lower(email)=lower($2) or phone=$3 limit 1', [username, email, mobile]);
  if (exists.rowCount) return reply.code(409).send({ error: 'Username, email or mobile number is already in use' });
  const result = await pool.query(`insert into users(name, username, email, phone, password_hash) values($1,$2,$3,$4,$5) returning name, username, email, phone`, [name, username, email, mobile, hashPassword(password)]);
  return reply.code(201).send({ account: result.rows[0] });
});

app.post('/api/auth/login', async (request, reply) => {
  const body = request.body as Partial<LoginInput>;
  const identifier = String(body.identifier ?? '').trim(); const mode = body.mode; const password = String(body.password ?? '');
  const key = mode === 'phone' ? phone(identifier) : normalize(identifier);
  const result = mode === 'email' ? await pool.query('select * from users where lower(email)=lower($1) limit 1', [key]) : mode === 'username' ? await pool.query('select * from users where lower(username)=lower($1) limit 1', [key]) : await pool.query('select * from users where phone=$1 limit 1', [key]);
  const user = result.rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) return reply.code(401).send({ error: 'Invalid credentials' });
  await pool.query('update users set last_seen=now() where id=$1', [user.id]);
  return { account: { name: user.name, username: user.username, email: user.email, phone: user.phone } };
});

app.get('/api/users/search', async (request) => {
  const q = String((request.query as { q?: string }).q ?? '').trim();
  if (!q) return { users: [] };
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const result = await pool.query(`select name, username, email, phone, last_seen from users where name ilike $1 or username ilike $1 or email ilike $1 or phone like $2 order by name asc limit 30`, [like, `%${phone(q)}%`]);
  return { users: result.rows };
});

app.get('/api/users/:username', async (request, reply) => {
  const username = String((request.params as { username: string }).username);
  const result = await pool.query('select name, username, email, phone, last_seen from users where lower(username)=lower($1) limit 1', [username]);
  if (!result.rowCount) return reply.code(404).send({ error: 'User not found' });
  return { user: result.rows[0] };
});

app.get('/api/messages/:username', async (request) => {
  const username = String((request.params as { username: string }).username);
  const me = String((request.query as { me?: string }).me ?? '');
  if (!me) return { messages: [] };
  const result = await pool.query(`select id, sender_id, recipient_id, body, client_message_id, created_at from messages where (sender_id=$1 and recipient_id=$2) or (sender_id=$2 and recipient_id=$1) order by created_at asc limit 1000`, [me, username]);
  return { messages: result.rows };
});

app.post('/api/messages/:username/read', async (request) => { const username = String((request.params as { username: string }).username); const me = String((request.body as { me?: string })?.me ?? ''); if (me) await pool.query('update messages set read_at=coalesce(read_at,now()) where sender_id=$1 and recipient_id=$2 and read_at is null', [username, me]); return { ok: true }; });

app.get('/ws', { websocket: true }, (socket, request) => {
  const userId = String((request.query as { userId?: string }).userId ?? '');
  if (!userId) { socket.close(1008, 'userId is required'); return; }
  let set = clients.get(userId); if (!set) { set = new Set(); clients.set(userId, set); } set.add(socket);
  pool.query('update users set last_seen=now() where lower(username)=lower($1)', [userId]).catch(() => {});
  socket.on('message', async (raw: Buffer) => {
    try {
      const message = JSON.parse(raw.toString()) as { type?: string; to?: string; body?: string; clientMessageId?: string };
      if (message.type !== 'message' || !message.to || !message.body) return;
      const result = await pool.query(`insert into messages(sender_id, recipient_id, body, client_message_id) values ($1,$2,$3,$4) returning id, sender_id, recipient_id, body, client_message_id, created_at, read_at`, [userId, message.to, message.body, message.clientMessageId ?? null]);
      const event = JSON.stringify({ type: 'message', message: result.rows[0] }); clients.get(message.to)?.forEach((client) => client.send(event)); socket.send(JSON.stringify({ type: 'ack', clientMessageId: message.clientMessageId, message: result.rows[0] }));
    } catch (error) { app.log.error(error); socket.send(JSON.stringify({ type: 'error', message: 'Unable to send message' })); }
  });
  socket.on('close', () => { const current = clients.get(userId); current?.delete(socket); if (current?.size === 0) clients.delete(userId); });
});

await pool.query(`
  create table if not exists users (id bigserial primary key, name text not null, username text not null unique, email text not null unique, phone text not null unique, password_hash text not null, last_seen timestamptz not null default now(), created_at timestamptz not null default now());
  create table if not exists messages (id bigserial primary key, sender_id text not null, recipient_id text not null, body text not null, client_message_id text, created_at timestamptz not null default now(), read_at timestamptz);
  alter table messages add column if not exists read_at timestamptz;
  create unique index if not exists messages_client_message_id_idx on messages(sender_id, client_message_id) where client_message_id is not null;
  create index if not exists messages_pair_idx on messages(sender_id, recipient_id, created_at);
  create index if not exists users_search_idx on users(lower(username), lower(email), phone);
`);

await app.listen({ host: '0.0.0.0', port });
const shutdown = async () => { await app.close(); await redis.quit(); await pool.end(); process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
