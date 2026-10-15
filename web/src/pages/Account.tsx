import { useEffect, useState, type FormEvent } from 'react';
import { api, type AdminUser, type Config } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, fmtNum, Input, inputCls, PasswordInput } from '../components/ui';

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone(false);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Card title="Change password">
      <form onSubmit={submit} className="space-y-3 sm:max-w-sm">
        <PasswordInput placeholder="Current password" autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <PasswordInput placeholder="New password (10+ characters)" autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)} minLength={10} required />
        <ErrorNote>{error}</ErrorNote>
        {done && <p className="text-sm text-emerald-400">Password changed. Other devices were signed out.</p>}
        <Button type="submit">Change password</Button>
      </form>
    </Card>
  );
}

// Admin: people and their monthly allowance.
function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [nu, setNu] = useState({ email: '', password: '', role: 'user' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.users().then(setUsers).catch((e) => setError(e.message));
    api.adminSettings().then((r) => setCfg(r.config)).catch(() => {});
  }, []);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.createUser(nu);
      setNu({ email: '', password: '', role: 'user' });
      setUsers(await api.users());
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveCap(e: FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    try {
      setCfg(await api.saveSettings({ monthly_char_cap: cfg.monthly_char_cap }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function resetPassword(u: AdminUser) {
    const pw = prompt(`New password for ${u.email} (10+ characters):`);
    if (!pw) return;
    await api.updateUser(u.id, { password: pw }).catch((e) => setError(e.message));
  }

  async function removeUser(u: AdminUser) {
    if (!confirm(`Delete ${u.email} and all their clips?`)) return;
    await api.deleteUser(u.id).catch((e) => setError(e.message));
    setUsers(await api.users());
  }

  return (
    <Card title="Users (admin)">
      <ul className="mb-5 divide-y divide-ink/10">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="min-w-0 truncate">{u.email}</span>
            <span className="text-xs text-ink/50">{u.role}</span>
            <span className="text-xs text-ink/50">{fmtNum(u.chars_month)} chars this month</span>
            {u.id !== me?.id && (
              <span className="ml-auto flex gap-3 text-xs">
                <button onClick={() => resetPassword(u)} className="text-ink/60 hover:text-ink">Reset password</button>
                <button onClick={() => removeUser(u)} className="text-red-400/80 hover:text-red-400">Delete</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={addUser} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Input type="text" placeholder="Email or username" autoCapitalize="none" spellCheck={false} value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required />
        <PasswordInput placeholder="Temporary password (10+)" autoComplete="new-password" minLength={10}
          value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required />
        <select className={inputCls} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <Button type="submit">Invite</Button>
      </form>
      {cfg && (
        <form onSubmit={saveCap} className="mt-5 flex flex-wrap items-end gap-3 border-t border-ink/10 pt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Monthly characters per user (admins exempt)</span>
            <Input type="number" min={0} value={cfg.monthly_char_cap} className="sm:w-48"
              onChange={(e) => setCfg({ ...cfg, monthly_char_cap: Number(e.target.value) })} />
          </label>
          <Button type="submit" variant="ghost">Save limit</Button>
          {saved && <span className="pb-2 text-sm text-emerald-400">Saved</span>}
        </form>
      )}
      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
    </Card>
  );
}

export default function Account() {
  const { user } = useAuth();
  return (
    <div className="space-y-5">
      <Card title="Account">
        <p className="text-sm text-ink/70">{user?.email} · <span className="text-ink/50">{user?.role}</span></p>
      </Card>
      <ChangePassword />
      {user?.role === 'admin' && <Users />}
    </div>
  );
}
