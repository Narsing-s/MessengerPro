'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Message = { id?: number; sender_id: string; recipient_id: string; body: string; created_at?: string };

type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  online: boolean;
  initials: string;
  color: string;
  unread?: number;
};

const conversations: Conversation[] = [
  { id: 'maya', name: 'Maya Chen', preview: 'The new design looks amazing ✨', time: '10:42', online: true, initials: 'MC', color: 'blue', unread: 3 },
  { id: 'alex', name: 'Alex Morgan', preview: 'Can you send the files?', time: '09:18', online: true, initials: 'AM', color: 'violet', unread: 1 },
  { id: 'team', name: 'MessengerPro Team', preview: 'Narsing: deployment is ready', time: 'Yesterday', online: false, initials: 'MP', color: 'cyan' },
  { id: 'sarah', name: 'Sarah Williams', preview: 'Thanks! Talk soon.', time: 'Mon', online: false, initials: 'SW', color: 'pink' },
  { id: 'family', name: 'Family Group', preview: 'Mom: Have a great day everyone! ❤️', time: 'Sun', online: true, initials: 'FG', color: 'orange', unread: 5 },
  { id: 'design', name: 'Design Channel', preview: 'New campaign files are ready', time: 'Sat', online: false, initials: 'DC', color: 'green' },
];

const navItems = [
  ['chats', '▤', 'Chats'],
  ['groups', '♧', 'Groups'],
  ['channels', '◈', 'Channels'],
  ['contacts', '♙', 'Contacts'],
  ['calls', '◔', 'Calls'],
  ['meetings', '▣', 'Meetings'],
  ['ai', '✦', 'AI Assistant'],
  ['settings', '⚙', 'Settings'],
];

function Avatar({ item, size = '' }: { item: Pick<Conversation, 'initials' | 'color'>; size?: string }) {
  return <div className={`avatar avatar-${item.color} ${size}`}>{item.initials}</div>;
}

export default function Home() {
  const [userId] = useState('you');
  const [recipient, setRecipient] = useState('maya');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState('');
  const [activeNav, setActiveNav] = useState('chats');
  const [showDetails, setShowDetails] = useState(true);
  const [muted, setMuted] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  const active = useMemo(
    () => conversations.find((c) => c.id === recipient) ?? conversations[0],
    [recipient]
  );

  const filteredConversations = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return conversations;
    return conversations.filter((c) => `${c.name} ${c.preview}`.toLowerCase().includes(value));
  }, [search]);

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

  function openConversation(id: string) {
    setRecipient(id);
    setMessages([]);
    setActiveNav('chats');
  }

  function send() {
    const body = text.trim();
    if (!body || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: 'message', to: recipient, body, clientMessageId: crypto.randomUUID() }));
    setMessages((current) => [
      ...current,
      { sender_id: userId, recipient_id: recipient, body, created_at: new Date().toISOString() },
    ]);
    setText('');
  }

  return (
    <main className="messenger-shell">
      <aside className="left-rail">
        <div className="brand-lockup">
          <div className="brand-logo"><span>✦</span></div>
          <div><strong>Global</strong> <b>Messenger</b><small>Connect · Chat · Share · Do More</small></div>
        </div>

        <div className="me-card">
          <div className="avatar avatar-me">N</div>
          <div className="me-copy"><strong>Narsing</strong><span><i /> {connected ? 'Online' : 'Connecting…'}</span></div>
          <button className="ghost-icon" aria-label="Account menu">⌄</button>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(([id, icon, label]) => (
            <button key={id} className={activeNav === id ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(id)}>
              <span className="nav-icon">{icon}</span><span>{label}</span>
              {id === 'chats' && <em>12</em>}
            </button>
          ))}
        </nav>

        <div className="rail-footer">
          <div className="secure-line"><span>⌁</span><div><strong>Private & secure</strong><small>Self-hosted MessengerPro</small></div></div>
          <button className="help-button">? <span>Help & Support</span></button>
        </div>
      </aside>

      <section className="conversation-panel">
        <header className="panel-header">
          <div><h1>{activeNav === 'chats' ? 'Chats' : navItems.find((n) => n[0] === activeNav)?.[2]}</h1><span>{activeNav === 'chats' ? `${conversations.length} recent conversations` : 'Coming together in one place'}</span></div>
          <button className="new-chat" aria-label="New chat">＋</button>
        </header>

        <div className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, chats, messages..." aria-label="Search people, chats, messages" /><kbd>⌘ K</kbd></div>

        <div className="chat-tabs"><button className="selected">All <b>12</b></button><button>Unread <b>3</b></button><button>Personal</button><button>Groups</button><button>Channels</button></div>

        <div className="conversation-list">
          {filteredConversations.map((c) => (
            <button key={c.id} className={`conversation-card ${c.id === recipient ? 'selected' : ''}`} onClick={() => openConversation(c.id)}>
              <div className="avatar-wrap"><Avatar item={c} /><span className={c.online ? 'online-indicator' : 'online-indicator hidden'} /></div>
              <div className="conversation-content"><div className="conversation-title"><strong>{c.name}</strong><time>{c.time}</time></div><p>{c.preview}</p></div>
              {c.unread ? <span className="unread-count">{c.unread}</span> : null}
            </button>
          ))}
        </div>

        <div className="pinned-label">Pinned</div>
        <div className="pinned-row"><Avatar item={conversations[4]} /><div><strong>Family Group</strong><span>Mom: Happy Friday! 😊</span></div><time>10:24</time></div>
        <div className="pinned-row"><Avatar item={conversations[2]} /><div><strong>Work Team</strong><span>Meeting at 4 PM</span></div><time>10:12</time></div>
      </section>

      <section className="chat-panel">
        <header className="chat-topbar">
          <div className="chat-user"><Avatar item={active} size="large" /><div><strong>{active.name}</strong><span>{active.online ? '● Active now' : 'Last seen recently'}</span></div></div>
          <div className="chat-tools"><button aria-label="Search in chat">⌕</button><button aria-label="Voice call">☎</button><button aria-label="Video call">▣</button><button aria-label="More">⋮</button></div>
        </header>

        <div className="chat-content">
          <div className="chat-date">TODAY</div>
          <div className="welcome-card"><div className="welcome-mark">✦</div><div><strong>Start a private conversation</strong><p>Messages are delivered in real time through your MessengerPro server.</p></div></div>
          {messages.map((m, i) => (
            <div key={`${m.id ?? i}-${m.created_at ?? ''}`} className={`message-row ${m.sender_id === userId ? 'mine' : ''}`}>
              <div className="message-bubble"><span>{m.body}</span><small>{new Date(m.created_at ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ✓</small></div>
            </div>
          ))}
        </div>

        <div className="composer-status">{connected ? `${active.name} is available` : 'Reconnecting to server…'}</div>
        <div className="composer-wrap">
          <button className="attach-button" aria-label="Attach file">＋</button>
          <div className="message-input"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={`Type a message to ${active.name}...`} /><button aria-label="Emoji">☺</button><button aria-label="Voice message">◉</button></div>
          <button className="send-button" onClick={send} disabled={!connected || !text.trim()} aria-label="Send message">➤</button>
        </div>
      </section>

      {showDetails && <aside className="details-panel">
        <div className="details-header"><strong>Profile</strong><button onClick={() => setShowDetails(false)} aria-label="Close profile">×</button></div>
        <div className="profile-hero"><Avatar item={active} size="huge" /><span className="profile-online" /><h2>{active.name}</h2><p>{active.online ? 'Online now' : 'MessengerPro user'}</p></div>
        <div className="profile-actions"><button><span>⌕</span>Search</button><button onClick={() => setMuted((v) => !v)}><span>♩</span>{muted ? 'Unmute' : 'Mute'}</button><button><span>▣</span>Files</button></div>
        <div className="detail-section"><h3>Conversation</h3><button><span>🔒</span>End-to-end encryption <b>›</b></button><button><span>🔔</span>Notifications <b>{muted ? 'Off' : 'On'}</b></button><button><span>⌁</span>Disappearing messages <b>Off</b></button></div>
        <div className="detail-section"><h3>Shared content</h3><button><span>▧</span>Photos & videos <b>›</b></button><button><span>⌕</span>Links <b>›</b></button><button><span>▤</span>Files <b>›</b></button></div>
        <div className="server-badge"><span>SECURE SERVER</span><strong>MessengerPro</strong><p>Private, realtime and self-hosted.</p><button>Manage connection</button></div>
      </aside>}

      {!showDetails && <button className="show-details" onClick={() => setShowDetails(true)} aria-label="Show profile">‹</button>}
    </main>
  );
}
