import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export const inputCls =
  'w-full rounded-lg bg-field px-3 py-2 text-sm ring-1 ring-ink/15 outline-none focus:ring-2 focus:ring-accent/60';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />;
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
