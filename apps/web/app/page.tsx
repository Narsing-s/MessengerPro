'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Message = { id?: number; sender_id: string; recipient_id: string; body: string; created_at?: string };

const conversations = [
  { id: 'maya', name: 'Maya Chen', preview: 'The new design looks amazing ✨', time: '10:42', online: true, initials: 'MC' },
  { id: 'alex', name: 'Alex Morgan', preview: 'Can you send the files?', time: '09:18', online: true, initials: 'AM' },
  { id: 'team', name: 'MessengerPro Team', preview: 'Narsing: deployment is ready', time: 'Yesterday', online: false, initials: 'MP' },
  { id: 'sarah', name: 'Sarah Williams', preview: 'Thanks! Talk soon.', time: 'Mon', online: false, initials: 'SW' },
];

export default function Home() {
  const [userId, setUserId] = useState('you');
  const [recipient, setRecipient] = useState('maya');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const active = useMemo(() => conversations.find((c) => c.id === recipient) ?? conversations[0], [recipient]);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/ws?userId=${encodeURIComponent(userId)}`);
    socket.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'message') setMessages((current) => [...current, payload.message]);
      } catch {}
    };
    return () => ws.close();
  }, [userId]);

  function send() {
    const body = text.trim();
    if (!body || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: 'message', to: recipient, body, clientMessageId: crypto.randomUUID() }));
    setMessages((current) => [...current, { sender_id: userId, recipient_id: recipient, body, created_at: new Date().toISOString() }]);
    setText('');
  }

  return (
    <main className="messenger-app">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">M</div><div><strong>MessengerPro</strong><small>Private. Open. Yours.</small></div></div>
        <div className="profile-row"><div className="avatar you">Y</div><div><strong>You</strong><span className="presence"><i /> {connected ? 'Online' : 'Connecting…'}</span></div><button className="icon-button" aria-label="Settings">•••</button></div>
        <div className="search"><span>⌕</span><input aria-label="Search" placeholder="Search conversations" /></div>
        <div className="section-title"><span>Messages</span><button className="new-button">＋</button></div>
        <nav className="conversation-list">
          {conversations.map((c) => <button key={c.id} className={`conversation ${c.id === recipient ? 'active' : ''}`} onClick={() => { setRecipient(c.id); setMessages([]); }}>
            <div className="avatar">{c.initials}</div><div className="conversation-copy"><strong>{c.name}</strong><span>{c.preview}</span></div><time>{c.time}</time>{c.online && <i className="online-dot" />}
          </button>)}
        </nav>
        <div className="sidebar-footer"><span>● {connected ? 'Realtime connected' : 'Reconnecting'}</span><span>Self-hosted</span></div>
      </aside>

      <section className="chat">
        <header className="chat-header"><div className="chat-person"><div className="avatar large">{active.initials}</div><div><h1>{active.name}</h1><span>{active.online ? '● Active now' : 'Last seen recently'}</span></div></div><div className="header-actions"><button>⌕</button><button>☎</button><button>⋮</button></div></header>
        <div className="chat-date">TODAY</div>
        <div className="messages-area">
          <div className="welcome"><div className="welcome-icon">✦</div><h2>Start a private conversation</h2><p>Messages are delivered in real time through your MessengerPro server.</p></div>
          {messages.map((m, i) => <div key={`${m.id ?? i}-${m.created_at ?? ''}`} className={`bubble-row ${m.sender_id === userId ? 'mine' : ''}`}><div className="bubble"><span>{m.body}</span><small>{new Date(m.created_at ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ✓</small></div></div>)}
        </div>
        <div className="typing">{connected ? `${active.name} is available` : 'Reconnecting to server…'}</div>
        <div className="composer"><button className="round-action">＋</button><div className="composer-input"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={`Message ${active.name}…`} /><button aria-label="Emoji">☺</button></div><button className="send" onClick={send} disabled={!connected || !text.trim()}>➤</button></div>
      </section>

      <aside className="details"><div className="details-top"><button>←</button><span>Details</span><button>×</button></div><div className="details-profile"><div className="avatar huge">{active.initials}</div><h2>{active.name}</h2><p>{active.online ? 'Online now' : 'MessengerPro user'}</p></div><div className="detail-actions"><button>⌕<span>Search</span></button><button>🔔<span>Mute</span></button><button>▣<span>Files</span></button></div><div className="detail-group"><span>Shared space</span><div><b>🔗</b> No shared links yet</div><div><b>◫</b> No shared media yet</div></div><div className="server-card"><span>YOUR SERVER</span><strong>MessengerPro</strong><p>Self-hosted realtime messaging</p><button>Manage connection</button></div></aside>
    </main>
  );
}
