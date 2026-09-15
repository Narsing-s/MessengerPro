from pathlib import Path
import re

p = Path('apps/web/app/page.tsx')
s = p.read_text()
marker = "type Account = { name: string; username: string; email: string; phone: string; password: string };"
helpers = r'''

const getApiBase = () => {
  if (typeof window === 'undefined') return '';
  try { const q = new URLSearchParams(window.location.search).get('api'); if (q) return q.replace(/\/$/, ''); } catch {}
  try { const saved = localStorage.getItem('messengerpro.apiUrl'); if (saved) return saved.replace(/\/$/, ''); } catch {}
  return '';
};
const apiFetch = async (path: string, init?: RequestInit) => fetch(`${getApiBase()}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
const getStoredAccounts = (): Account[] => { try { const a = JSON.parse(localStorage.getItem('messengerpro.accounts') || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
'''
if 'const getApiBase = () =>' not in s:
    if marker not in s: raise SystemExit('Account type marker missing')
    s = s.replace(marker, marker + helpers, 1)

login_pattern = r"function submitLogin\(\) \{.*?\n  \}"
login_replacement = r'''async function submitLogin() {
    if (!value.trim() || !password) return setNotice('Enter your login details.');
    try {
      const response = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: value.trim(), mode, password }) });
      if (response.ok) { const data = await response.json(); const account = { ...data.account, password }; localStorage.setItem('messengerpro.account', JSON.stringify(account)); localStorage.setItem('messengerpro.session', 'true'); if (remember) localStorage.setItem('messengerpro.remember', 'true'); onLogin(account); return; }
      if (response.status !== 404) { const data = await response.json().catch(() => ({})); return setNotice(data.error || 'Invalid credentials.'); }
    } catch {}
    const accounts = getAccounts(); const key = value.trim().toLowerCase(); const account = accounts.find((a) => (mode === 'email' ? a.email.toLowerCase() === key : mode === 'username' ? a.username.toLowerCase() === key : a.phone === value.replace(/\D/g, '')) && a.password === password);
    if (!account) return setNotice('Invalid credentials. Check your details or use Forgot password.'); localStorage.setItem('messengerpro.account', JSON.stringify(account)); localStorage.setItem('messengerpro.session', 'true'); onLogin(account);
  }'''
s, n = re.subn(login_pattern, lambda _m: login_replacement, s, count=1, flags=re.S)
if n != 1: raise SystemExit('submitLogin function not found')

register_pattern = r"function createAccount\(\) \{.*?\n  \}"
register_replacement = r'''async function createAccount() {
    if (!name.trim() || !username.trim() || !email.trim() || !phone.trim() || !password || !confirmPassword) return setNotice('Please complete all required details.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setNotice('Enter a valid email address.');
    if (phone.replace(/\D/g, '').length < 10) return setNotice('Enter a valid 10-digit mobile number.');
    if (password.length < 8) return setNotice('Password must contain at least 8 characters.');
    if (password !== confirmPassword) return setNotice('Passwords do not match.');
    const account = { name: name.trim(), username: username.trim(), email: email.trim(), phone: phone.replace(/\D/g, '').slice(-10), password };
    try {
      const response = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(account) });
      if (response.ok) { const data = await response.json(); const created = { ...data.account, password }; const existing = getStoredAccounts().filter((a) => a.username.toLowerCase() !== created.username.toLowerCase()); localStorage.setItem('messengerpro.accounts', JSON.stringify([...existing, created])); localStorage.setItem('messengerpro.account', JSON.stringify(created)); localStorage.setItem('messengerpro.session', 'true'); setNotice('Account created successfully. Opening your Messenger workspace…'); setTimeout(() => onLogin(created), 250); return; }
      const data = await response.json().catch(() => ({})); if (response.status !== 404) return setNotice(data.error || 'Unable to create account.');
    } catch {}
    const accounts = getStoredAccounts(); if (accounts.some((a) => a.username.toLowerCase() === account.username.toLowerCase())) return setNotice('That username is already in use.'); if (accounts.some((a) => a.email.toLowerCase() === account.email.toLowerCase())) return setNotice('That email is already in use.'); if (accounts.some((a) => a.phone === account.phone)) return setNotice('That mobile number is already in use.'); localStorage.setItem('messengerpro.accounts', JSON.stringify([...accounts, account])); localStorage.setItem('messengerpro.account', JSON.stringify(account)); localStorage.setItem('messengerpro.session', 'true'); setNotice('Account created successfully. Opening your Messenger workspace…'); setTimeout(() => onLogin(account), 500);
  }'''
s, n = re.subn(register_pattern, lambda _m: register_replacement, s, count=1, flags=re.S)
if n != 1: raise SystemExit('createAccount function not found')

state_marker = "const [loggedIn, setLoggedIn] = useState(false); const [account, setAccount] = useState<Account | null>(null);"
if 'const [directory, setDirectory]' not in s:
    if state_marker not in s: raise SystemExit('Home state marker missing')
    s = s.replace(state_marker, state_marker + " const [directory, setDirectory] = useState<Conversation[]>([]);", 1)

hook_marker = "  useEffect(() => { if (!toast) return;"
hook = r'''  useEffect(() => { if (!loggedIn) return; let cancelled = false; const load = async () => { const q = search.trim(); if (!q) { setDirectory([]); return; } try { const r = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`); if (r.ok) { const data = await r.json(); if (!cancelled) setDirectory((data.users || []).filter((u: any) => u.username.toLowerCase() !== account?.username.toLowerCase()).map((u: any) => ({ id: u.username, name: u.name, preview: 'Start a conversation', time: '', online: !!u.last_seen && Date.now() - new Date(u.last_seen).getTime() < 120000, initials: u.name.split(/\s+/).map((v: string) => v[0]).join('').slice(0,2).toUpperCase(), color: 'blue' }))); } } catch {} }; load(); return () => { cancelled = true; }; }, [loggedIn, search, account?.username]);
  useEffect(() => { if (!loggedIn || !recipient) return; let cancelled = false; const loadHistory = async () => { try { const r = await apiFetch(`/api/messages/${encodeURIComponent(recipient)}?me=${encodeURIComponent(userId)}`); if (r.ok) { const data = await r.json(); if (!cancelled) setMessages(data.messages || []); } } catch {} }; loadHistory(); return () => { cancelled = true; }; }, [loggedIn, recipient, userId]);
'''
if "apiFetch(`/api/users/search" not in s:
    if hook_marker not in s: raise SystemExit('toast hook marker missing')
    s = s.replace(hook_marker, hook + hook_marker, 1)

old_dir = re.compile(r"const registeredAccounts = .*?const availableContacts: Conversation\[\] = registeredAccounts;", re.S)
new_dir = "const registeredAccounts: Conversation[] = directory.length ? directory : getStoredAccounts().filter((a) => a.username.toLowerCase() !== account?.username.toLowerCase()).map((a) => ({ id: a.username, name: a.name, preview: 'Start a conversation', time: '', online: true, initials: a.name.split(/\\s+/).map((v) => v[0]).join('').slice(0,2).toUpperCase(), color: 'blue' as const })); const availableContacts: Conversation[] = registeredAccounts;"
s, n = old_dir.subn(lambda _m: new_dir, s, count=1)
if n != 1: s = s.replace("const availableContacts = sampleContacts;", new_dir, 1)

old_ws = "const protocol = location.protocol === 'https:' ? 'wss' : 'ws'; try { const ws = new WebSocket(`${protocol}://${location.host}/ws?userId=${encodeURIComponent(userId)}`);"
new_ws = "const apiBase = getApiBase(); const wsUrl = apiBase ? apiBase.replace(/^http/, 'ws') + `/ws?userId=${encodeURIComponent(userId)}` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?userId=${encodeURIComponent(userId)}`; try { const ws = new WebSocket(wsUrl);"
s = s.replace(old_ws, new_ws, 1)
p.write_text(s)
