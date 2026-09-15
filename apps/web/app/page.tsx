'use client';

import { useEffect, useRef, useState } from 'react';

type Message = { id?: number; sender_id: string; recipient_id: string; body: string; created_at?: string };

export default function Home() {
  const [userId, setUserId] = useState('demo-user');
  const [recipient, setRecipient] = useState('friend');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/ws?userId=${encodeURIComponent(userId)}`);
    socket.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'message') setMessages((current) => [...current, payload.message]);
    };
    return () => ws.close();
  }, [userId]);

  function send() {
    if (!text.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: 'message', to: recipient, body: text.trim(), clientMessageId: crypto.randomUUID() }));
    setText('');
  }

  return (
    <main className="shell">
      <section className="hero">
        <div><span className="badge">SELF-HOSTED</span><h1>MessengerPro</h1><p>Your own real-time Messenger server.</p></div>
        <span className={connected ? 'status online' : 'status'}>{connected ? '● Connected' : '○ Connecting'}</span>
      </section>
      <section className="panel">
        <div className="controls"><label>Your ID<input value={userId} onChange={(e) => setUserId(e.target.value)} /></label><label>Send to<input value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label></div>
        <div className="messages">{messages.length === 0 ? <div className="empty">Send a message to test the live WebSocket connection.</div> : messages.map((m, i) => <div className="message" key={`${m.id ?? i}-${m.created_at ?? ''}`}><b>{m.sender_id}</b><span>{m.body}</span></div>)}</div>
        <div className="composer"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Write a message…" /><button onClick={send}>Send</button></div>
      </section>
    </main>
  );
}
