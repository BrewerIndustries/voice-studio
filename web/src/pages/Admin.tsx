import { useEffect, useState, type FormEvent } from 'react';
import { api, type AdminUser, type Config } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, fmtDate, fmtNum, Input, inputCls } from '../components/ui';

type Voice = { voice_id: string; name: string; category: string | null };
type Quota = { tier: string | null; used: number | null; limit: number | null; resets_at: number | null };

export default function Admin() {
  const { user: me } = useAuth();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [nu, setNu] = useState({ email: '', password: '', role: 'user' });

  useEffect(() => {
    api.adminSettings().then((r) => {
      setCfg(r.config);
      setModels(r.models);
      setHasKey(r.has_api_key);
      if (r.has_api_key) {
        api.voices().then(setVoices).catch((e) => setError(e.message));
        api.quota().then(setQuota).catch(() => {});
      }
    }).catch((e) => setError(e.message));
    api.users().then(setUsers).catch(() => {});
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    setError('');
    try {
      setCfg(await api.saveSettings(cfg));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    }
  }

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

  if (!cfg) return <div className="space-y-4"><ErrorNote>{error}</ErrorNote><p className="text-sm text-ink/50">Loading…</p></div>;

  return (
    <div className="space-y-5">
      <ErrorNote>{error}</ErrorNote>

      <Card title="ElevenLabs">
        {!hasKey ? (
          <p className="text-sm text-amber-300">
            No API key on the server yet. Run <code className="rounded bg-ink/10 px-1">npx wrangler secret put ELEVENLABS_API_KEY</code> in <code className="rounded bg-ink/10 px-1">api/</code>.
          </p>
        ) : quota && quota.limit !== null ? (
          <div className="text-sm">
            <div className="mb-1 flex justify-between text-ink/70">
              <span>{quota.tier ? `${quota.tier} plan` : 'Plan'}: {fmtNum(quota.used ?? 0)} of {fmtNum(quota.limit)} characters</span>
              {quota.resets_at && <span className="text-ink/50">resets {fmtDate(quota.resets_at)}</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, ((quota.used ?? 0) / Math.max(1, quota.limit)) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink/60">Connected.</p>
        )}
      </Card>

      <Card title="Voice & limits">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink/60">Voice</span>
            {voices && voices.length > 0 ? (
              <select className={inputCls} value={cfg.voice_id}
                onChange={(e) => {
                  const v = voices.find((x) => x.voice_id === e.target.value);
                  setCfg({ ...cfg, voice_id: e.target.value, voice_name: v?.name || '' });
                }}>
                <option value="">— choose —</option>
                {voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.name}{v.category ? ` (${v.category})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <Input placeholder="Voice ID" value={cfg.voice_id} onChange={(e) => setCfg({ ...cfg, voice_id: e.target.value })} />
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Model</span>
            <select className={inputCls} value={cfg.model_id} onChange={(e) => setCfg({ ...cfg, model_id: e.target.value })}>
              {[...new Set([cfg.model_id, ...models])].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Max characters per clip</span>
            <Input type="number" min={100} max={10000} value={cfg.max_chars_per_clip}
              onChange={(e) => setCfg({ ...cfg, max_chars_per_clip: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Monthly characters per user (admins exempt)</span>
            <Input type="number" min={0} value={cfg.monthly_char_cap}
              onChange={(e) => setCfg({ ...cfg, monthly_char_cap: Number(e.target.value) })} />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit">Save</Button>
            {saved && <span className="text-sm text-emerald-400">Saved</span>}
          </div>
        </form>
      </Card>

      <Card title="Users">
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
          <Input type="email" placeholder="Email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required />
          <Input type="password" placeholder="Temporary password (10+)" autoComplete="new-password" minLength={10}
            value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required />
          <select className={inputCls} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <Button type="submit">Invite</Button>
        </form>
      </Card>
    </div>
  );
}
