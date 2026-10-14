import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/Layout';
import { Button, ErrorNote, Input } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-1 text-2xl">
          <Logo />
          <p className="text-sm text-ink/50">Sign in to continue</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-2xl bg-ink/[0.04] p-6 ring-1 ring-ink/10">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Email</span>
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Password</span>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <p className="mt-4 text-center text-xs text-ink/40">Accounts are invite-only.</p>
      </div>
    </div>
  );
}
