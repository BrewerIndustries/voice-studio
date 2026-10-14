import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';

type Theme = 'system' | 'light' | 'dark';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem('vs_theme') as Theme) || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    const cl = document.documentElement.classList;
    cl.toggle('theme-light', theme === 'light');
    cl.toggle('theme-dark', theme === 'dark');
    try { localStorage.setItem('vs_theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const next = () => setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'));
  return [theme, next];
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" className="text-accent" aria-hidden>
        <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
      </svg>
      Voice Studio
    </span>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [theme, nextTheme] = useTheme();
  const isDev = import.meta.env.BASE_URL !== '/';
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-ink/10 text-ink' : 'text-ink/60 hover:text-ink'}`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Logo />
          {isDev && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-black">Dev</span>}
          <nav className="flex gap-1">
            <NavLink to="/" end className={link}>Studio</NavLink>
            <NavLink to="/settings" className={link}>Settings</NavLink>
            <NavLink to="/account" className={link}>Account</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={nextTheme} title="Theme" className="rounded-md px-2 py-1.5 text-xs text-ink/60 hover:text-ink">
              {theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}
            </button>
            <button onClick={logout} className="rounded-md px-2 py-1.5 text-sm text-ink/60 hover:text-ink">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
