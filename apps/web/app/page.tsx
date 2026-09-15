'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Message = { id?: number; sender_id: string; recipient_id: string; body: string; created_at?: string };
type Conversation = { id: string; name: string; preview: string; time: string; online: boolean; initials: string; color: string; unread?: number };

const conversations: Conversation[] = [
  { id: 'maya', name: 'Maya Chen', preview: 'The new design looks amazing ✨', time: '10:42', online: true, initials: 'MC', color: 'blue', unread: 3 },
  { id: 'alex', name: 'Alex Morgan', preview: 'Can you send the files?', time: '09:18', online: true, initials: 'AM', color: 'violet', unread: 1 },
  { id: 'team', name: 'MessengerPro Team', preview: 'Narsing: deployment is ready', time: 'Yesterday', online: false, initials: 'MP', color: 'cyan' },
  { id: 'sarah', name: 'Sarah Williams', preview: 'Thanks! Talk soon.', time: 'Mon', online: false, initials: 'SW', color: 'pink' },
  { id: 'family', name: 'Family Group', preview: 'Mom: Have a great day everyone! ❤️', time: 'Sun', online: true, initials: 'FG', color: 'orange', unread: 5 },
  { id: 'design', name: 'Design Channel', preview: 'New campaign files are ready', time: 'Sat', online: false, initials: 'DC', color: 'green' },
];

const navItems = [
  ['chats', '▤', 'Chats'], ['groups', '♧', 'Groups'], ['channels', '◈', 'Channels'], ['contacts', '♙', 'Contacts'],
  ['calls', '◔', 'Calls'], ['meetings', '▣', 'Meetings'], ['ai', '✦', 'AI Assistant'], ['mini', '⌘', 'Mini Apps'], ['settings', '⚙', 'Settings'],
];

function Avatar({ item, size = '' }: { item: Pick<Conversation, 'initials' | 'color'>; size?: string }) {
  return <div className={`avatar avatar-${item.color} ${size}`}>{item.initials}</div>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<'phone' | 'email' | 'username'>('phone');
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  return (
    <main className="auth-shell">
      <section className="auth-showcase">
        <div className="auth-brand"><div className="brand-logo">✦</div><div><b>Global</b> Messenger<small>Connect · Chat · Share · Do More</small></div></div>
        <div className="auth-hero"><span>More than just a messenger</span><h1>Your world. Your people. Your everything.</h1><p>A secure communication workspace for web, desktop and mobile.</p></div>
        <div className="feature-grid">
          {[
            ['⌁','End-to-End Encrypted','Your chats, your privacy.'],['▣','Multi-Device Sync','Chat anywhere, anytime.'],['☎','Voice & Video Calls','HD calls and screen sharing.'],['✦','AI Assistant','Search, summarize, translate.'],['♙','Bots & Mini Apps','Do more inside chat.'],['▧','File Sharing','All formats, large files.'],
          ].map(([icon,title,desc]) => <div className="feature-item" key={title}><i>{icon}</i><div><strong>{title}</strong><span>{desc}</span></div></div>)}
        </div>
        <div className="globe-card"><div className="globe-ring">◎</div><div><b>Built for everyone</b><span>Web · Android · iOS · Windows · Mac</span></div></div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-card-head"><div className="mini-logo">✦</div><h2>Welcome back</h2><p>Sign in to continue to Global Messenger</p></div>
          <div className="auth-tabs">{(['phone','email','username'] as const).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item === 'phone' ? '▣ Phone' : item === 'email' ? '✉ Email' : '♙ Username'}</button>)}</div>
          <label>{mode === 'phone' ? 'Mobile number' : mode === 'email' ? 'Email address' : 'Username'}</label>
          <div className="auth-input">{mode === 'phone' && <span>+91 ▾</span>}<input value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === 'phone' ? 'Enter your mobile number' : mode === 'email' ? 'you@example.com' : 'Enter username'} /></div>
          <label>Password</label>
          <div className="auth-input"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"/><span>◉</span></div>
          <div className="auth-options"><button className="check" onClick={() => setRemember(!remember)}>{remember ? '☑' : '☐'} Remember me</button><button>Forgot password?</button></div>
          <button className="login-button" onClick={onLogin}>Login</button>
          <div className="auth-or"><span>or</span></div>
          <div className="social-row"><button>G <span>Google</span></button><button>● <span>Apple</span></button><button>⊞ <span>Microsoft</span></button></div>
          <p className="auth-create">Don't have an account? <button onClick={onLogin}>Create Free Account</button></p>
          <button className="demo-button" onClick={onLogin}>Continue with Demo Workspace</button>
          <div className="security-note">🔒 Private by design · Self-hosted ready · Secure sessions</div>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
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

  const active = useMemo(() => conversations.find((c) => c.id === recipient) ?? conversations[0], [recipient]);
  const filteredConversations = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value ? conversations.filter((c) => `${c.name} ${c.preview}`.toLowerCase().includes(value)) : conversations;
  }, [search]);

  useEffect(() => {
    if (!loggedIn) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    try {
      const ws = new WebSocket(`${protocol}://${location.host}/ws?userId=${encodeURIComponent(userId)}`);
      socket.current = ws;
      ws.onopen = () => setConnected(true); ws.onclose = () => setConnected(false); ws.onerror = () => setConnected(false);
      ws.onmessage = (event) => { try { const payload = JSON.parse(event.data); if (payload.type === 'message') setMessages((current) => [...current, payload.message]); } catch {} };
      return () => ws.close();
    } catch { setConnected(false); }
  }, [loggedIn, userId]);

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />;

  function openConversation(id: string) { setRecipient(id); setMessages([]); setActiveNav('chats'); }
  function send() {
    const body = text.trim();
    if (!body) return;
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'message', to: recipient, body, clientMessageId: crypto.randomUUID() }));
    setMessages((current) => [...current, { sender_id: userId, recipient_id: recipient, body, created_at: new Date().toISOString() }]);
    setText('');
  }

  return (
    <main className="messenger-shell">
      <aside className="left-rail">
        <div className="brand-lockup"><div className="brand-logo">✦</div><div><strong>Global</strong> <b>Messenger</b><small>Connect · Chat · Share · Do More</small></div></div>
        <div className="me-card"><div className="avatar avatar-me">N</div><div className="me-copy"><strong>Narsing</strong><span><i />{connected ? 'Online' : 'Demo / Offline'}</span></div><button className="ghost-icon">⌄</button></div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(([id, icon, label]) => <button key={id} className={activeNav === id ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(id)}><span className="nav-icon">{icon}</span><span>{label}</span>{id === 'chats' && <em>12</em>}</button>)}
        </nav>
        <div className="rail-footer"><div className="secure-line"><span>⌁</span><div><strong>Private & secure</strong><small>Self-hosted MessengerPro</small></div></div><button className="help-button">? <span>Help & Support</span></button></div>
      </aside>

      <section className="conversation-panel">
        <header className="panel-header"><div><h1>{activeNav === 'chats' ? 'Chats' : navItems.find((n) => n[0] === activeNav)?.[2]}</h1><span>{activeNav === 'chats' ? '12 active conversations' : 'Your workspace'}</span></div><button className="new-chat">＋</button></header>
        <div className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, chats, messages..."/><kbd>⌘ K</kbd></div>
        {activeNav === 'chats' ? <>
          <div className="chat-tabs"><button className="selected">All <b>12</b></button><button>Unread <b>3</b></button><button>Personal</button><button>Groups</button><button>Channels</button></div>
          <div className="conversation-list">{filteredConversations.map((c) => <button key={c.id} className={`conversation-card ${c.id === recipient ? 'selected' : ''}`} onClick={() => openConversation(c.id)}><div className="avatar-wrap"><Avatar item={c}/><span className={c.online ? 'online-indicator' : 'online-indicator hidden'}/></div><div className="conversation-content"><div className="conversation-title"><strong>{c.name}</strong><time>{c.time}</time></div><p>{c.preview}</p></div>{c.unread ? <span className="unread-count">{c.unread}</span> : null}</button>)}</div>
          <div className="pinned-label">Pinned</div><div className="pinned-row"><Avatar item={conversations[4]}/><div><strong>Family Group</strong><span>Mom: Happy Friday! 😊</span></div><time>10:24</time></div><div className="pinned-row"><Avatar item={conversations[2]}/><div><strong>Work Team</strong><span>Meeting at 4 PM</span></div><time>10:12</time></div>
        </> : <div className="workspace-list"><div className="workspace-hero"><div className="workspace-icon">{navItems.find((n) => n[0] === activeNav)?.[1]}</div><h2>{navItems.find((n) => n[0] === activeNav)?.[2]}</h2><p>This workspace is ready for your real MessengerPro backend. The navigation, controls and visual hierarchy are now consistent across the product.</p></div><button>＋ Create new</button><button>⌕ Explore</button><button>⚙ Manage settings</button></div>}
      </section>

      <section className="chat-panel">
        <header className="chat-topbar"><div className="chat-user"><Avatar item={active} size="large"/><div><strong>{active.name}</strong><span>{active.online ? '● Active now' : 'Last seen recently'}</span></div></div><div className="chat-tools"><button aria-label="Search">⌕</button><button aria-label="Voice call">☎</button><button aria-label="Video call">▣</button><button aria-label="More">⋮</button></div></header>
        <div className="chat-content"><div className="chat-date">TODAY</div><div className="welcome-card"><div className="welcome-mark">✦</div><div><strong>Private, realtime conversation</strong><p>Messages, media, files, voice and calls belong in one focused workspace.</p></div></div>{messages.map((m, i) => <div key={`${i}-${m.created_at}`} className={`message-row ${m.sender_id === userId ? 'mine' : ''}`}><div className="message-bubble"><span>{m.body}</span><small>{new Date(m.created_at ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ✓</small></div></div>)}</div>
        <div className="composer-status">{connected ? `${active.name} is available` : 'Demo mode · connect MessengerPro server for realtime delivery'}</div>
        <div className="composer-wrap"><button className="attach-button">＋</button><div className="message-input"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={`Type a message to ${active.name}...`}/><button>☺</button><button>◉</button></div><button className="send-button" onClick={send} disabled={!text.trim()}>➤</button></div>
      </section>

      {showDetails && <aside className="details-panel"><div className="details-header"><strong>Profile & Settings</strong><button onClick={() => setShowDetails(false)}>×</button></div><div className="profile-hero"><Avatar item={active} size="huge"/><span className="profile-online"/><h2>{active.name}</h2><p>{active.online ? 'Online now' : 'MessengerPro user'}</p></div><div className="profile-actions"><button><span>⌕</span>Search</button><button onClick={() => setMuted((v) => !v)}><span>♩</span>{muted ? 'Unmute' : 'Mute'}</button><button><span>▣</span>Files</button></div><div className="detail-section"><h3>Account</h3><button><span>♙</span>Account & profile <b>›</b></button><button><span>🔒</span>Privacy & security <b>›</b></button><button><span>🔔</span>Notifications <b>{muted ? 'Off' : 'On'}</b></button><button><span>◐</span>Appearance <b>Dark</b></button></div><div className="detail-section"><h3>Conversation</h3><button><span>🔐</span>End-to-end encryption <b>On</b></button><button><span>⌁</span>Disappearing messages <b>Off</b></button><button><span>▧</span>Photos, videos & files <b>›</b></button><button><span>◫</span>Keyboard shortcuts <b>›</b></button></div><div className="server-badge"><span>SECURE SERVER</span><strong>MessengerPro</strong><p>Private, realtime and self-hosted.</p><button>Manage connection</button></div></aside>}
      {!showDetails && <button className="show-details" onClick={() => setShowDetails(true)}>‹</button>}
    </main>
  );
}
