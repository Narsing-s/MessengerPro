import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const port = Number(process.env.PORT ?? 4000);
const origin = process.env.WEB_ORIGIN ?? 'http://localhost';
const app = Fastify({ logger: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const clients = new Map<string, Set<any>>();

type AccountInput = { name: string; username: string; email: string; phone: string; password: string };
type LoginInput = { identifier: string; mode?: 'phone' | 'email' | 'username'; password: string };
type WsEvent = { type?: string; to?: string; body?: string; clientMessageId?: string; messageId?: number; emoji?: string };
const normalize = (v: string) => v.trim().toLowerCase();
const phone = (v: string) => v.replace(/\D/g, '').slice(-10);
const hashPassword = (password: string, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password: string, stored: string) => { try { const [salt, hash] = stored.split(':'); if (!salt || !hash) return false; const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return expected.length === actual.length && timingSafeEqual(actual, expected); } catch { return false; } };
const emit = (username: string, event: unknown) => clients.get(username)?.forEach((client) => { try { client.send(JSON.stringify(event)); } catch {} });
const validUsername = (v: string) => /^[a-zA-Z0-9_.-]{3,32}$/.test(v);

await app.register(cors, { origin: origin === '*' ? true : origin.split(',').map((v) => v.trim()), credentials: true });
await app.register(websocket);

app.get('/api/health', async (_request, reply) => { await pool.query('select 1'); await redis.ping(); return reply.send({ ok: true, service: 'messengerpro-server', time: new Date().toISOString(), capabilities: ['realtime','reactions','edit-delete','pin-star','typing','presence','message-search'] }); });
app.get('/api/ready', async (_request, reply) => { try { await pool.query('select 1'); await redis.ping(); return { ready: true }; } catch { return reply.code(503).send({ ready: false }); } });

app.post('/api/auth/register', async (request, reply) => {
  const body = request.body as Partial<AccountInput>;
  const name = String(body.name ?? '').trim(), username = String(body.username ?? '').trim(), email = normalize(String(body.email ?? '')), mobile = phone(String(body.phone ?? '')), password = String(body.password ?? '');
  if (!name || !validUsername(username) || !email || mobile.length < 10 || password.length < 8) return reply.code(400).send({ error: 'Invalid registration details' });
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
  const q = request.query as { me?: string; before?: string; limit?: string; search?: string };
  const me = String(q.me ?? ''); const limit = Math.min(Math.max(Number(q.limit ?? 100), 1), 1000);
  if (!me) return { messages: [] };
  const search = String(q.search ?? '').trim();
  const values: any[] = [me, username]; let where = '((sender_id=$1 and recipient_id=$2) or (sender_id=$2 and recipient_id=$1))';
  if (search) { values.push(`%${search.replace(/[%_]/g, '')}%`); where += ` and body ilike $${values.length}`; }
  if (q.before) { values.push(q.before); where += ` and created_at < $${values.length}`; }
  values.push(limit);
  const result = await pool.query(`select id, sender_id, recipient_id, body, client_message_id, created_at, edited_at, deleted_at, read_at from messages where ${where} order by created_at desc limit $${values.length}`, values);
  return { messages: result.rows.reverse() };
});

app.post('/api/messages/:username/read', async (request) => { const username = String((request.params as { username: string }).username); const me = String((request.body as { me?: string })?.me ?? ''); if (me) { await pool.query('update messages set read_at=coalesce(read_at,now()) where sender_id=$1 and recipient_id=$2 and read_at is null', [username, me]); emit(username, { type: 'read', by: me }); } return { ok: true }; });

app.patch('/api/messages/:id', async (request, reply) => {
  const id = Number((request.params as { id: string }).id); const body = request.body as { me?: string; text?: string };
  if (!Number.isSafeInteger(id) || !body.me || !String(body.text ?? '').trim()) return reply.code(400).send({ error: 'Invalid edit request' });
  const result = await pool.query('update messages set body=$1, edited_at=now() where id=$2 and sender_id=$3 and deleted_at is null returning *', [String(body.text).trim(), id, body.me]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Message not found or not owned by you' });
  const message = result.rows[0]; emit(message.recipient_id, { type: 'message_updated', message }); emit(message.sender_id, { type: 'message_updated', message }); return { message };
});

app.delete('/api/messages/:id', async (request, reply) => {
  const id = Number((request.params as { id: string }).id); const me = String((request.body as { me?: string })?.me ?? '');
  if (!Number.isSafeInteger(id) || !me) return reply.code(400).send({ error: 'Invalid delete request' });
  const result = await pool.query('update messages set deleted_at=now(), body=\'\' where id=$1 and sender_id=$2 and deleted_at is null returning *', [id, me]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Message not found or already deleted' });
  const message = result.rows[0]; emit(message.recipient_id, { type: 'message_deleted', messageId: id }); emit(message.sender_id, { type: 'message_deleted', messageId: id }); return { ok: true };
});

app.post('/api/messages/:id/reactions', async (request, reply) => {
  const id = Number((request.params as { id: string }).id); const body = request.body as { me?: string; emoji?: string };
  const emoji = String(body.emoji ?? '').trim(); if (!Number.isSafeInteger(id) || !body.me || !emoji || emoji.length > 16) return reply.code(400).send({ error: 'Invalid reaction' });
  await pool.query('insert into message_reactions(message_id,user_id,emoji) values($1,$2,$3) on conflict(message_id,user_id) do update set emoji=excluded.emoji', [id, body.me, emoji]);
  const result = await pool.query('select user_id, emoji from message_reactions where message_id=$1 order by user_id', [id]);
  const message = await pool.query('select sender_id, recipient_id from messages where id=$1', [id]); if (message.rowCount) { const m = message.rows[0]; emit(m.sender_id, { type: 'reactions', messageId: id, reactions: result.rows }); emit(m.recipient_id, { type: 'reactions', messageId: id, reactions: result.rows }); }
  return { reactions: result.rows };
});

app.delete('/api/messages/:id/reactions', async (request, reply) => { const id = Number((request.params as { id: string }).id); const me = String((request.body as { me?: string })?.me ?? ''); if (!Number.isSafeInteger(id) || !me) return reply.code(400).send({ error: 'Invalid reaction removal' }); await pool.query('delete from message_reactions where message_id=$1 and user_id=$2', [id, me]); return { ok: true }; });

app.post('/api/messages/:id/star', async (request, reply) => { const id = Number((request.params as { id: string }).id); const me = String((request.body as { me?: string })?.me ?? ''); if (!Number.isSafeInteger(id) || !me) return reply.code(400).send({ error: 'Invalid star request' }); await pool.query('insert into message_stars(message_id,user_id) values($1,$2) on conflict do nothing', [id, me]); return { starred: true }; });
app.delete('/api/messages/:id/star', async (request, reply) => { const id = Number((request.params as { id: string }).id); const me = String((request.body as { me?: string })?.me ?? ''); if (!Number.isSafeInteger(id) || !me) return reply.code(400).send({ error: 'Invalid star request' }); await pool.query('delete from message_stars where message_id=$1 and user_id=$2', [id, me]); return { starred: false }; });

app.get('/api/me/:username/starred', async (request) => { const username = String((request.params as { username: string }).username); const result = await pool.query(`select m.* from messages m join message_stars s on s.message_id=m.id where s.user_id=$1 order by m.created_at desc limit 500`, [username]); return { messages: result.rows }; });

app.post('/api/conversations/:username/pin', async (request) => { const username = String((request.params as { username: string }).username); const me = String((request.body as { me?: string })?.me ?? ''); if (!me) return { error: 'me is required' }; await pool.query('insert into conversation_settings(user_id,other_user,pinned) values($1,$2,true) on conflict(user_id,other_user) do update set pinned=true', [me, username]); return { pinned: true }; });
app.delete('/api/conversations/:username/pin', async (request) => { const username = String((request.params as { username: string }).username); const me = String((request.body as { me?: string })?.me ?? ''); if (!me) return { error: 'me is required' }; await pool.query('update conversation_settings set pinned=false where user_id=$1 and other_user=$2', [me, username]); return { pinned: false }; });
app.post('/api/conversations/:username/mute', async (request) => { const username = String((request.params as { username: string }).username); const body = request.body as { me?: string; until?: string | null }; if (!body.me) return { error: 'me is required' }; await pool.query('insert into conversation_settings(user_id,other_user,muted_until) values($1,$2,$3) on conflict(user_id,other_user) do update set muted_until=excluded.muted_until', [body.me, username, body.until ? new Date(body.until) : null]); return { muted_until: body.until ?? null }; });
app.post('/api/conversations/:username/archive', async (request) => { const username = String((request.params as { username: string }).username); const me = String((request.body as { me?: string })?.me ?? ''); if (!me) return { error: 'me is required' }; await pool.query('insert into conversation_settings(user_id,other_user,archived) values($1,$2,true) on conflict(user_id,other_user) do update set archived=true', [me, username]); return { archived: true }; });

app.get('/api/conversations/:username/settings', async (request) => { const username = String((request.params as { username: string }).username); const me = String((request.query as { me?: string })?.me ?? ''); if (!me) return { settings: {} }; const result = await pool.query('select pinned, archived, muted_until from conversation_settings where user_id=$1 and other_user=$2', [me, username]); return { settings: result.rows[0] ?? { pinned: false, archived: false, muted_until: null } }; });

app.get('/api/users/:username/presence', async (request) => { const username = String((request.params as { username: string }).username); const online = (clients.get(username)?.size ?? 0) > 0; const result = await pool.query('select last_seen from users where lower(username)=lower($1)', [username]); return { online, last_seen: result.rows[0]?.last_seen ?? null }; });

app.get('/ws', { websocket: true }, (socket, request) => {
  const userId = String((request.query as { userId?: string }).userId ?? '');
  if (!userId) { socket.close(1008, 'userId is required'); return; }
  let set = clients.get(userId); if (!set) { set = new Set(); clients.set(userId, set); } set.add(socket);
  pool.query('update users set last_seen=now() where lower(username)=lower($1)', [userId]).catch(() => {});
  socket.on('message', async (raw: Buffer) => {
    try {
      const message = JSON.parse(raw.toString()) as WsEvent;
      if (message.type === 'typing' && message.to) { emit(message.to, { type: 'typing', from: userId, active: true }); return; }
      if (message.type === 'stop_typing' && message.to) { emit(message.to, { type: 'typing', from: userId, active: false }); return; }
      if (message.type === 'presence' && message.to) { emit(message.to, { type: 'presence', from: userId, online: true }); return; }
      if (message.type !== 'message' || !message.to || !message.body) return;
      const clientMessageId = message.clientMessageId ?? randomBytes(12).toString('hex');
      const result = await pool.query(`insert into messages(sender_id, recipient_id, body, client_message_id) values ($1,$2,$3,$4) on conflict(sender_id,client_message_id) do update set body=excluded.body returning id, sender_id, recipient_id, body, client_message_id, created_at, edited_at, deleted_at, read_at`, [userId, message.to, message.body, clientMessageId]);
      const event = { type: 'message', message: result.rows[0] }; emit(message.to, event); socket.send(JSON.stringify({ type: 'ack', clientMessageId, message: result.rows[0] }));
    } catch (error) { app.log.error(error); socket.send(JSON.stringify({ type: 'error', message: 'Unable to send message' })); }
  });
  socket.on('close', () => { const current = clients.get(userId); current?.delete(socket); if (current?.size === 0) { clients.delete(userId); pool.query('update users set last_seen=now() where lower(username)=lower($1)', [userId]).catch(() => {}); } });
});

await pool.query(`
  create table if not exists users (id bigserial primary key, name text not null, username text not null unique, email text not null unique, phone text not null unique, password_hash text not null, last_seen timestamptz not null default now(), created_at timestamptz not null default now());
  create table if not exists messages (id bigserial primary key, sender_id text not null, recipient_id text not null, body text not null, client_message_id text, created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz, read_at timestamptz);
  alter table messages add column if not exists edited_at timestamptz;
  alter table messages add column if not exists deleted_at timestamptz;
  alter table messages add column if not exists read_at timestamptz;
  create unique index if not exists messages_client_message_id_idx on messages(sender_id, client_message_id) where client_message_id is not null;
  create index if not exists messages_pair_idx on messages(sender_id, recipient_id, created_at);
  create index if not exists users_search_idx on users(lower(username), lower(email), phone);
  create table if not exists message_reactions(message_id bigint not null references messages(id) on delete cascade, user_id text not null, emoji text not null, created_at timestamptz not null default now(), primary key(message_id,user_id));
  create table if not exists message_stars(message_id bigint not null references messages(id) on delete cascade, user_id text not null, created_at timestamptz not null default now(), primary key(message_id,user_id));
  create table if not exists conversation_settings(user_id text not null, other_user text not null, pinned boolean not null default false, archived boolean not null default false, muted_until timestamptz, created_at timestamptz not null default now(), primary key(user_id,other_user));
`);

await app.listen({ host: '0.0.0.0', port });
const shutdown = async () => { await app.close(); await redis.quit(); await pool.end(); process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
