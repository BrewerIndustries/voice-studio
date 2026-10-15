import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { hashPassword, verifyPassword, newToken, sessionId } from './auth';

type Bindings = {
  DB: D1Database;
  CLIPS: R2Bucket;
  ALLOWED_ORIGIN: string;
  SESSION_SECRET: string;
  ELEVENLABS_API_KEY?: string;
};

type SessionUser = {
  id: string;
  email: string;
  role: 'user' | 'admin';
  display_name: string | null;
};

// Admin-editable config, stored as one JSON row in `settings`.
type Config = {
  voice_id: string;            // the owner's own voice: "My voice" button + default for new users
  voice_name: string;
  model_id: string;
  monthly_char_cap: number;    // per user, per calendar month (UTC); admins exempt
  max_chars_per_clip: number;
};

const DEFAULT_CONFIG: Config = {
  voice_id: '',
  voice_name: '',
  model_id: 'eleven_multilingual_v2',
  monthly_char_cap: 20_000,
  max_chars_per_clip: 5_000,
};

const MODELS = ['eleven_multilingual_v2', 'eleven_v3', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'];

const app = new Hono<{ Bindings: Bindings; Variables: { user: SessionUser } }>();

const COOKIE = 'vs_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

// Login lockout: this many failures per key inside the window → 429.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;

// Generation burst limit, per user.
const GEN_WINDOW_MS = 10 * 60 * 1000;
const GEN_MAX_PER_WINDOW = 30;

const ELEVEN = 'https://api.elevenlabs.io/v1';

// ---------------- CORS ----------------
app.use('*', cors({
  origin: (origin, c) => {
    if (origin === c.env.ALLOWED_ORIGIN) return origin;
    // any localhost port during local dev
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '')) return origin;
    return c.env.ALLOWED_ORIGIN;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// ---------------- helpers ----------------
function publicUser(row: any): SessionUser {
  return { id: row.id, email: row.email, role: row.role, display_name: row.display_name ?? null };
}

async function currentUser(c: any): Promise<SessionUser | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const id = await sessionId(token, c.env.SESSION_SECRET);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.display_name, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
  ).bind(id).first();
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) return null;
  return publicUser(row);
}

const auth = async (c: any, next: any) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};

const requireAdmin = async (c: any, next: any) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  await next();
};

async function getConfig(c: any): Promise<Config> {
  const row = await c.env.DB.prepare('SELECT json FROM settings WHERE id = 1').first();
  return { ...DEFAULT_CONFIG, ...(row ? JSON.parse(row.json as string) : {}) };
}

async function saveConfig(c: any, cfg: Config) {
  await c.env.DB.prepare(
    'INSERT INTO settings (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json',
  ).bind(JSON.stringify(cfg)).run();
}

function monthStart(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

async function charsThisMonth(c: any, userId: string): Promise<number> {
  const row = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(chars), 0) AS n FROM clips WHERE user_id = ? AND created_at >= ?',
  ).bind(userId, monthStart()).first();
  return Number(row?.n ?? 0);
}

type Voice = { voice_id: string; name: string; category: string | null };
type Prefs = { voice_id: string; stability: number; similarity: number; style: number; speed: number };

const DEFAULT_PREFS: Omit<Prefs, 'voice_id'> = { stability: 0.25, similarity: 0.25, style: 0.55, speed: 1 };

// The account's voices, cached per isolate so /generate can validate a voice id
// without an extra ElevenLabs round trip every time.
let voiceCache: { at: number; voices: Voice[] } | null = null;
const VOICE_TTL_MS = 5 * 60 * 1000;

async function listVoices(c: any, fresh = false): Promise<Voice[]> {
  if (!fresh && voiceCache && Date.now() - voiceCache.at < VOICE_TTL_MS) return voiceCache.voices;
  const res = await eleven(c, '/voices');
  if (!res.ok) throw new Error(await elevenError(res));
  const j: any = await res.json();
  const isClone = (v: Voice) => v.category === 'cloned' || v.category === 'professional';
  const voices: Voice[] = (j.voices || []).map((v: any) => ({
    voice_id: v.voice_id, name: v.name, category: v.category ?? null,
  }));
  // Cloned voices first — that's the one you want.
  voices.sort((a, b) => Number(isClone(b)) - Number(isClone(a)));
  voiceCache = { at: Date.now(), voices };
  return voices;
}

async function getPrefs(c: any, userId: string, cfg: Config): Promise<Prefs> {
  const row = await c.env.DB.prepare('SELECT prefs FROM users WHERE id = ?').bind(userId).first();
  const saved = row?.prefs ? JSON.parse(row.prefs as string) : {};
  return { ...DEFAULT_PREFS, voice_id: cfg.voice_id, ...saved };
}

function cleanPrefs(b: any, base: Prefs): Prefs {
  return {
    voice_id: typeof b.voice_id === 'string' ? b.voice_id.trim() : base.voice_id,
    stability: clamp01(b.stability ?? base.stability, DEFAULT_PREFS.stability),
    similarity: clamp01(b.similarity ?? base.similarity, DEFAULT_PREFS.similarity),
    style: clamp01(b.style ?? base.style, DEFAULT_PREFS.style),
    speed: Math.max(0.7, Math.min(1.2, Number(b.speed ?? base.speed) || 1)),
  };
}

function clamp01(v: unknown, dflt: number): number {
  const n = Number(v);
  return isFinite(n) ? Math.max(0, Math.min(1, n)) : dflt;
}

function publicClip(row: any) {
  return {
    id: row.id,
    text: row.text,
    chars: row.chars,
    voice_id: row.voice_id,
    model_id: row.model_id,
    settings: row.settings ? JSON.parse(row.settings) : null,
    bytes: row.bytes,
    created_at: row.created_at,
  };
}

async function eleven(c: any, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(ELEVEN + path, {
    ...init,
    headers: { 'xi-api-key': c.env.ELEVENLABS_API_KEY!, ...(init.headers || {}) },
  });
}

// Pull a readable message out of an ElevenLabs error body.
async function elevenError(res: Response): Promise<string> {
  try {
    const j: any = await res.json();
    const d = j?.detail;
    if (typeof d === 'string') return d;
    if (d?.message) return d.message;
  } catch { /* ignore */ }
  return `ElevenLabs returned ${res.status}`;
}

// ---------------- health ----------------
app.get('/', (c) => c.json({ ok: true, service: 'voice-studio-api' }));

// ---------------- auth ----------------
app.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) return c.json({ error: 'login and password required' }, 400);

  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const keys = [`ip:${ip}`, `email:${email}`];
  const since = Date.now() - LOGIN_WINDOW_MS;
  await c.env.DB.prepare('DELETE FROM login_failures WHERE at < ?').bind(since).run();
  const fails = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM login_failures WHERE key IN (?, ?) AND at >= ? GROUP BY key ORDER BY n DESC LIMIT 1',
  ).bind(keys[0], keys[1], since).first();
  if (Number(fails?.n ?? 0) >= LOGIN_MAX_FAILURES) {
    return c.json({ error: 'too many attempts — try again in 15 minutes' }, 429);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash as string))) {
    const at = Date.now();
    await c.env.DB.batch(keys.map((k) =>
      c.env.DB.prepare('INSERT INTO login_failures (key, at) VALUES (?, ?)').bind(k, at)));
    return c.json({ error: 'invalid credentials' }, 401);
  }

  const token = newToken();
  const id = await sessionId(token, c.env.SESSION_SECRET);
  const created = Date.now();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .bind(id, user.id, created, created + SESSION_MS).run();

  const host = new URL(c.req.url).hostname;
  const secure = host !== 'localhost' && host !== '127.0.0.1';
  setCookie(c, COOKIE, token, {
    httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return c.json({ user: publicUser(user) });
});

app.post('/auth/logout', auth, async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?')
      .bind(await sessionId(token, c.env.SESSION_SECRET)).run();
  }
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/auth/me', auth, (c) => c.json({ user: c.get('user') }));

app.post('/auth/password', auth, async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const current = String(b.current ?? '');
  const next = String(b.next ?? '');
  if (next.length < 10) return c.json({ error: 'new password must be at least 10 characters' }, 400);
  const me = c.get('user');
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(me.id).first();
  if (!row || !(await verifyPassword(current, row.password_hash as string))) {
    return c.json({ error: 'current password is wrong' }, 401);
  }
  // Sign out every other session on a password change.
  const keep = await sessionId(getCookie(c, COOKIE)!, c.env.SESSION_SECRET);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), me.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(me.id, keep),
  ]);
  return c.json({ ok: true });
});

// ---------------- studio ----------------
// What the studio page needs: which voice is set up, the user's monthly usage.
app.get('/studio', auth, async (c) => {
  const cfg = await getConfig(c);
  const me = c.get('user');
  return c.json({
    ready: Boolean(c.env.ELEVENLABS_API_KEY),
    has_api_key: Boolean(c.env.ELEVENLABS_API_KEY),
    prefs: await getPrefs(c, me.id, cfg),
    my_voice_id: cfg.voice_id || null,
    model_id: cfg.model_id,
    max_chars_per_clip: cfg.max_chars_per_clip,
    usage: {
      used: await charsThisMonth(c, me.id),
      cap: me.role === 'admin' ? null : cfg.monthly_char_cap,
    },
  });
});

app.get('/voices', auth, async (c) => {
  if (!c.env.ELEVENLABS_API_KEY) return c.json({ error: 'ElevenLabs API key is not set yet' }, 503);
  try {
    return c.json({ voices: await listVoices(c, c.req.query('fresh') === '1') });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

app.put('/prefs', auth, async (c) => {
  const me = c.get('user');
  const b = await c.req.json().catch(() => ({} as any));
  const prefs = cleanPrefs(b, await getPrefs(c, me.id, await getConfig(c)));
  await c.env.DB.prepare('UPDATE users SET prefs = ? WHERE id = ?').bind(JSON.stringify(prefs), me.id).run();
  return c.json({ prefs });
});

app.post('/generate', auth, async (c) => {
  const me = c.get('user');
  const cfg = await getConfig(c);
  if (!c.env.ELEVENLABS_API_KEY) return c.json({ error: 'ElevenLabs API key is not set yet' }, 503);

  const b = await c.req.json().catch(() => ({} as any));
  const prefs = cleanPrefs(b, await getPrefs(c, me.id, cfg));
  let voices: Voice[];
  try {
    voices = await listVoices(c);
    if (prefs.voice_id && !voices.some((v) => v.voice_id === prefs.voice_id)) voices = await listVoices(c, true);
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
  const voice_id = voices.some((v) => v.voice_id === prefs.voice_id) ? prefs.voice_id : '';
  if (!voice_id) return c.json({ error: 'pick a voice first' }, 400);

  const text = String(b.text ?? '').trim();
  if (!text) return c.json({ error: 'enter some text first' }, 400);
  if (text.length > cfg.max_chars_per_clip) {
    return c.json({ error: `too long — max ${cfg.max_chars_per_clip} characters per clip` }, 400);
  }

  if (me.role !== 'admin') {
    const used = await charsThisMonth(c, me.id);
    if (used + text.length > cfg.monthly_char_cap) {
      return c.json({ error: `monthly limit reached (${used.toLocaleString()} of ${cfg.monthly_char_cap.toLocaleString()} characters)` }, 429);
    }
  }
  const recent = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM clips WHERE user_id = ? AND created_at >= ?',
  ).bind(me.id, Date.now() - GEN_WINDOW_MS).first();
  if (Number(recent?.n ?? 0) >= GEN_MAX_PER_WINDOW) {
    return c.json({ error: 'slow down — too many clips in the last 10 minutes' }, 429);
  }

  const voice_settings = {
    stability: prefs.stability,
    similarity_boost: prefs.similarity,
    style: prefs.style,
    use_speaker_boost: true,
    speed: prefs.speed,
  };

  const res = await eleven(c, `/text-to-speech/${encodeURIComponent(voice_id)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: cfg.model_id, voice_settings }),
  });
  if (!res.ok) return c.json({ error: await elevenError(res) }, 502);

  const audio = await res.arrayBuffer();
  const id = crypto.randomUUID();
  const r2_key = `clips/${me.id}/${id}.mp3`;
  await c.env.CLIPS.put(r2_key, audio, { httpMetadata: { contentType: 'audio/mpeg' } });

  const row = {
    id, user_id: me.id, text, chars: text.length, voice_id, model_id: cfg.model_id,
    settings: JSON.stringify(voice_settings), r2_key, bytes: audio.byteLength, created_at: Date.now(),
  };
  await c.env.DB.prepare(
    `INSERT INTO clips (id, user_id, text, chars, voice_id, model_id, settings, r2_key, bytes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(row.id, row.user_id, row.text, row.chars, row.voice_id, row.model_id, row.settings,
    row.r2_key, row.bytes, row.created_at).run();

  return c.json({ clip: publicClip(row) });
});

app.get('/clips', auth, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM clips WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
  ).bind(c.get('user').id).all();
  return c.json({ clips: results.map(publicClip) });
});

async function ownClip(c: any): Promise<any | null> {
  const me = c.get('user');
  return c.env.DB.prepare('SELECT * FROM clips WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), me.id).first();
}

// Auth-gated audio stream (R2 stays private). ?download=1 → attachment.
app.get('/clips/:id/audio', auth, async (c) => {
  const clip = await ownClip(c);
  if (!clip) return c.json({ error: 'not found' }, 404);
  const obj = await c.env.CLIPS.get(clip.r2_key);
  if (!obj) return c.json({ error: 'audio missing' }, 404);
  const headers = new Headers({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' });
  if (c.req.query('download')) {
    const slug = String(clip.text).slice(0, 40).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'voiceover';
    headers.set('Content-Disposition', `attachment; filename="${slug}.mp3"`);
  }
  return new Response(obj.body, { headers });
});

app.delete('/clips/:id', auth, async (c) => {
  const clip = await ownClip(c);
  if (!clip) return c.json({ error: 'not found' }, 404);
  await c.env.CLIPS.delete(clip.r2_key);
  await c.env.DB.prepare('DELETE FROM clips WHERE id = ?').bind(clip.id).run();
  return c.json({ ok: true });
});

// ---------------- admin: voice + limits ----------------
app.get('/admin/settings', auth, requireAdmin, async (c) => {
  return c.json({ config: await getConfig(c), models: MODELS, has_api_key: Boolean(c.env.ELEVENLABS_API_KEY) });
});

app.put('/admin/settings', auth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const cfg = await getConfig(c);
  if (typeof b.voice_id === 'string') cfg.voice_id = b.voice_id.trim();
  if (typeof b.voice_name === 'string') cfg.voice_name = b.voice_name.trim().slice(0, 80);
  if (typeof b.model_id === 'string' && b.model_id.trim()) cfg.model_id = b.model_id.trim();
  if (b.monthly_char_cap !== undefined) cfg.monthly_char_cap = Math.max(0, Math.floor(Number(b.monthly_char_cap) || 0));
  if (b.max_chars_per_clip !== undefined) {
    cfg.max_chars_per_clip = Math.max(100, Math.min(10_000, Math.floor(Number(b.max_chars_per_clip) || 0)));
  }
  await saveConfig(c, cfg);
  return c.json({ config: cfg });
});

// Kept for the v1 admin page; the studio now uses /voices.
app.get('/admin/voices', auth, requireAdmin, async (c) => {
  if (!c.env.ELEVENLABS_API_KEY) return c.json({ error: 'ElevenLabs API key is not set yet' }, 503);
  try {
    return c.json({ voices: await listVoices(c) });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// ElevenLabs account quota (characters used / limit this billing period).
app.get('/admin/quota', auth, requireAdmin, async (c) => {
  if (!c.env.ELEVENLABS_API_KEY) return c.json({ error: 'ElevenLabs API key is not set yet' }, 503);
  const res = await eleven(c, '/user/subscription');
  if (!res.ok) return c.json({ error: await elevenError(res) }, 502);
  const j: any = await res.json();
  return c.json({
    tier: j.tier ?? null,
    used: j.character_count ?? null,
    limit: j.character_limit ?? null,
    resets_at: j.next_character_count_reset_unix ? j.next_character_count_reset_unix * 1000 : null,
  });
});

// ---------------- admin: users ----------------
app.get('/admin/users', auth, requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.display_name, u.created_at,
            (SELECT COALESCE(SUM(chars),0) FROM clips WHERE user_id = u.id AND created_at >= ?) AS chars_month
     FROM users u ORDER BY u.created_at`,
  ).bind(monthStart()).all();
  return c.json({ users: results });
});

app.post('/admin/users', auth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  const role = b.role === 'admin' ? 'admin' : 'user';
  // The login can be an email or a plain username (stored lowercased in `email`).
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isEmail && !/^[a-z0-9._-]{3,32}$/.test(email)) {
    return c.json({ error: 'use an email, or a username of 3–32 letters, numbers, . _ -' }, 400);
  }
  if (password.length < 10) return c.json({ error: 'password must be at least 10 characters' }, 400);
  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (exists) return c.json({ error: 'that login already has an account' }, 409);
  const user = {
    id: crypto.randomUUID(), email, role,
    display_name: b.display_name ? String(b.display_name).slice(0, 80) : null,
  };
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, role, display_name, created_at) VALUES (?,?,?,?,?,?)',
  ).bind(user.id, email, await hashPassword(password), role, user.display_name, Date.now()).run();
  return c.json({ user });
});

app.patch('/admin/users/:id', auth, requireAdmin, async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (b.role !== undefined) {
    if (id === c.get('user').id) return c.json({ error: "you can't change your own role" }, 400);
    await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(b.role === 'admin' ? 'admin' : 'user', id).run();
  }
  if (b.password !== undefined) {
    if (String(b.password).length < 10) return c.json({ error: 'password must be at least 10 characters' }, 400);
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(String(b.password)), id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    ]);
  }
  return c.json({ ok: true });
});

app.delete('/admin/users/:id', auth, requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (id === c.get('user').id) return c.json({ error: "you can't delete yourself" }, 400);
  const { results } = await c.env.DB.prepare('SELECT r2_key FROM clips WHERE user_id = ?').bind(id).all();
  if (results.length) await c.env.CLIPS.delete(results.map((r: any) => r.r2_key));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM clips WHERE user_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

export default app;
