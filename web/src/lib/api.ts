export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787';

export type User = { id: string; email: string; role: 'user' | 'admin'; display_name: string | null };

export type VoiceSettings = { stability: number; similarity_boost: number; style: number; speed: number };

export type Voice = { voice_id: string; name: string; category: string | null };

export type Prefs = { voice_id: string; stability: number; similarity: number; style: number; speed: number };

export type Clip = {
  id: string;
  text: string;
  chars: number;
  voice_id: string;
  model_id: string;
  settings: VoiceSettings | null;
  bytes: number | null;
  created_at: number;
};

export type Studio = {
  ready: boolean;
  has_api_key: boolean;
  prefs: Prefs;
  my_voice_id: string | null;
  model_id: string;
  max_chars_per_clip: number;
  usage: { used: number; cap: number | null };
};

export type Config = {
  voice_id: string;
  voice_name: string;
  model_id: string;
  monthly_char_cap: number;
  max_chars_per_clip: number;
};

export type AdminUser = User & { created_at: number; chars_month: number };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    ...opts,
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* ignore */ }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

// Auth-gated audio URL (session cookie is same-site, so <audio> sends it).
export const audioUrl = (id: string, download = false) =>
  `${API_BASE}/clips/${encodeURIComponent(id)}/audio${download ? '?download=1' : ''}`;

export const api = {
  me: () => req<{ user: User }>('/auth/me').then((r) => r.user),
  login: (email: string, password: string) => req<{ user: User }>('/auth/login', json('POST', { email, password })).then((r) => r.user),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
  changePassword: (current: string, next: string) => req<{ ok: true }>('/auth/password', json('POST', { current, next })),

  studio: () => req<Studio>('/studio'),
  voices: (fresh = false) => req<{ voices: Voice[] }>(`/voices${fresh ? '?fresh=1' : ''}`).then((r) => r.voices),
  savePrefs: (p: Partial<Prefs>) => req<{ prefs: Prefs }>('/prefs', json('PUT', p)).then((r) => r.prefs),
  generate: (text: string, p: Prefs) => req<{ clip: Clip }>('/generate', json('POST', { text, ...p })).then((r) => r.clip),
  clips: () => req<{ clips: Clip[] }>('/clips').then((r) => r.clips),
  deleteClip: (id: string) => req<{ ok: true }>(`/clips/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  adminSettings: () => req<{ config: Config; models: string[]; has_api_key: boolean }>('/admin/settings'),
  saveSettings: (patch: Partial<Config>) => req<{ config: Config }>('/admin/settings', json('PUT', patch)).then((r) => r.config),
  quota: () => req<{ tier: string | null; used: number | null; limit: number | null; resets_at: number | null }>('/admin/quota'),
  users: () => req<{ users: AdminUser[] }>('/admin/users').then((r) => r.users),
  createUser: (d: { email: string; password: string; role: string; display_name?: string }) => req<{ user: User }>('/admin/users', json('POST', d)),
  updateUser: (id: string, d: { role?: string; password?: string }) => req<{ ok: true }>(`/admin/users/${id}`, json('PATCH', d)),
  deleteUser: (id: string) => req<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }),
};
