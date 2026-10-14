import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Studio from './pages/Studio';
import Admin from './pages/Admin';
import Account from './pages/Account';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink/40">Loading…</div>;
  }

  // Everything is gated: nothing that touches the API mounts until we have a user.
  if (!user) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Studio />} />
        <Route path="/account" element={<Account />} />
        {user.role === 'admin' && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
