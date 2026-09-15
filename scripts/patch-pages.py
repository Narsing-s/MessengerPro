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
const getStoredAccounts = (): Account[] => { try { const a = JSON.parse(localStorage.getItem('messengerpro.accounts') || '[]'); return Array.isArray(a) ? a as Account[] : []; } catch { return []; } };
const getAccounts = (): Account[] => getStoredAccounts();
'''
if 'const getApiBase = () =>' not in s:
    if marker not in s: raise SystemExit('Account type marker missing')
    s = s.replace(marker, marker + helpers, 1)
elif 'const getAccounts = (): Account[]' not in s:
    anchor = "const getStoredAccounts = (): Account[] =>"
    pos = s.find(anchor)
    if pos < 0: raise SystemExit('stored account helper missing')
    end = s.find('\n', pos)
    s = s[:end] + "\nconst getAccounts = (): Account[] => getStoredAccounts();" + s[end:]

login_replacement = r'''async function submitLogin() {
    if (!value.trim() || !password) return setNotice('Enter your login details.');
    try {
      const response = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: value.trim(), mode, password }) });
      if (response.ok) { const data = await response.json(); const account: Account = { ...data.account, password }; localStorage.setItem('messengerpro.account', JSON.stringify(account)); localStorage.setItem('messengerpro.session', 'true'); if (remember) localStorage.setItem('messengerpro.remember', 'true'); onLogin(account); return; }
      if (response.status !== 404) { const data = await response.json().catch(() => ({})); return setNotice(data.error || 'Invalid credentials.'); }
    } catch {}
    const accounts = getAccounts(); const key = value.trim().toLowerCase(); const account = accounts.find((a: Account) => (mode === 'email' ? String(a.email).toLowerCase() === key : mode === 'username' ? String(a.username).toLowerCase() === key : String(a.phone) === value.replace(/\D/g, '')) && String(a.password) === password);
    if (!account) return setNotice('Invalid credentials. Check your details or use Forgot password.'); localStorage.setItem('messengerpro.account', JSON.stringify(account)); localStorage.setItem('messengerpro.session', 'true'); onLogin(account);
  }
'''
start = s.find('function submitLogin() {')
end = s.find('function createAccount() {', start)
if start < 0 or end < 0: raise SystemExit('submitLogin boundaries not found')
s = s[:start] + login_replacement + s[end:]

register_replacement = r'''async function createAccount() {
    if (!name.trim() || !username.trim() || !email.trim() || !phone.trim() || !password || !confirmPassword) return setNotice('Please complete all required details.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setNotice('Enter a valid email address.');
    if (phone.replace(/\D/g, '').length < 10) return setNotice('Enter a valid 10-digit mobile number.');
    if (password.length < 8) return setNotice('Password must contain at least 8 characters.');
    if (password !== confirmPassword) return setNotice('Passwords do not match.');
    const account: Account = { name: name.trim(), username: username.trim(), email: email.trim(), phone: phone.replace(/\D/g, '').slice(-10), password };
    try {
      const response = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(account) });
      if (response.ok) { const data = await response.json(); const created: Account = { ...data.account, password }; const existing = getStoredAccounts().filter((a: Account) => a.username.toLowerCase() !== created.username.toLowerCase()); localStorage.setItem('messengerpro.accounts', JSON.stringify([...existing, created])); localStorage.setItem('messengerpro.account', JSON.stringify(created)); localStorage.setItem('messengerpro.session', 'true'); setNotice('Account created successfully. Opening your Messenger workspace…'); setTimeout(() => onLogin(created), 250); return; }
      const data = await response.json().catch(() => ({})); if (response.status !== 404) return setNotice(data.error || 'Unable to create account.');
    } catch {}
    const accounts = getStoredAccounts(); if (accounts.some((a: Account) => a.username.toLowerCase() === account.username.toLowerCase())) return setNotice('That username is already in use.'); if (accounts.some((a: Account) => a.email.toLowerCase() === account.email.toLowerCase())) return setNotice('That email is already in use.'); if (accounts.some((a: Account) => a.phone === account.phone)) return setNotice('That mobile number is already in use.'); localStorage.setItem('messengerpro.accounts', JSON.stringify([...accounts, account])); localStorage.setItem('messengerpro.account', JSON.stringify(account)); localStorage.setItem('messengerpro.session', 'true'); setNotice('Account created successfully. Opening your Messenger workspace…'); setTimeout(() => onLogin(account), 500);
  }
'''
start = s.find('function createAccount() {')
end = s.find('function requestReset() {', start)
if start < 0 or end < 0: raise SystemExit('createAccount boundaries not found')
s = s[:start] + register_replacement + s[end:]

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
new_dir = "const registeredAccounts: Conversation[] = directory.length ? directory : getStoredAccounts().filter((a: Account) => a.username.toLowerCase() !== account?.username.toLowerCase()).map((a: Account) => ({ id: a.username, name: a.name, preview: 'Start a conversation', time: '', online: true, initials: a.name.split(/\\s+/).map((v: string) => v[0]).join('').slice(0,2).toUpperCase(), color: 'blue' as const })); const availableContacts: Conversation[] = registeredAccounts;"
s, n = old_dir.subn(lambda _m: new_dir, s, count=1)
if n != 1: s = s.replace("const availableContacts = sampleContacts;", new_dir, 1)

old_ws = "const protocol = location.protocol === 'https:' ? 'wss' : 'ws'; try { const ws = new WebSocket(`${protocol}://${location.host}/ws?userId=${encodeURIComponent(userId)}`);"
new_ws = "const apiBase = getApiBase(); const wsUrl = apiBase ? apiBase.replace(/^http/, 'ws') + `/ws?userId=${encodeURIComponent(userId)}` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?userId=${encodeURIComponent(userId)}`; try { const ws = new WebSocket(wsUrl);"
s = s.replace(old_ws, new_ws, 1)

# Keep the generated client strict-type-safe when older demo code contains loosely typed callback values.
s = s.replace('c.email.toLowerCase()', 'String(c.email).toLowerCase()')
s = s.replace('a.email.toLowerCase()', 'String(a.email).toLowerCase()')
p.write_text(s)
