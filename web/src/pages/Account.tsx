import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, Input } from '../components/ui';

export default function Account() {
  const { user } = useAuth();
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
    <div className="mx-auto max-w-md space-y-4">
      <Card title="Account">
        <p className="text-sm text-ink/70">{user?.email} · <span className="text-ink/50">{user?.role}</span></p>
      </Card>
      <Card title="Change password">
        <form onSubmit={submit} className="space-y-3">
          <Input type="password" placeholder="Current password" autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <Input type="password" placeholder="New password (10+ characters)" autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)} minLength={10} required />
          <ErrorNote>{error}</ErrorNote>
          {done && <p className="text-sm text-emerald-400">Password changed. Other devices were signed out.</p>}
          <Button type="submit">Change password</Button>
        </form>
      </Card>
    </div>
  );
}
