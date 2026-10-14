import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export const inputCls =
  'w-full rounded-lg bg-field px-3 py-2 text-sm ring-1 ring-ink/15 outline-none focus:ring-2 focus:ring-accent/60';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />;
}

// Password field with an eye button that reveals what you're typing.
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`${inputCls} pr-10 ${props.className || ''}`} />
      <button type="button" onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink/40 hover:text-ink/80">
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function Button({ variant = 'primary', className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const v = {
    primary: 'bg-accent text-black font-semibold hover:brightness-110',
    ghost: 'text-ink/80 ring-1 ring-ink/15 hover:bg-ink/5',
    danger: 'text-red-400 ring-1 ring-red-400/30 hover:bg-red-400/10',
  }[variant];
  return (
    <button {...rest}
      className={`rounded-lg px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`} />
  );
}

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-ink/[0.04] p-5 ring-1 ring-ink/10">
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wider text-ink/60">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-400">{children}</div>;
}

export const fmtNum = (n: number) => n.toLocaleString();
export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
