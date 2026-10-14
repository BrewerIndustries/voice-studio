-- Voice Studio schema (D1 / SQLite)

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  display_name  TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,          -- HMAC-SHA256(token, SESSION_SECRET)
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Failed logins, for per-IP and per-email lockout.
CREATE TABLE login_failures (
  key TEXT NOT NULL,                    -- 'ip:<addr>' or 'email:<addr>'
  at  INTEGER NOT NULL
);
CREATE INDEX idx_login_failures ON login_failures(key, at);

-- One row per generated voice-over; the MP3 lives in R2 at r2_key.
CREATE TABLE clips (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  text       TEXT NOT NULL,
  chars      INTEGER NOT NULL,
  voice_id   TEXT NOT NULL,
  model_id   TEXT NOT NULL,
  settings   TEXT,                      -- JSON voice_settings sent to ElevenLabs
  r2_key     TEXT NOT NULL,
  bytes      INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_clips_user ON clips(user_id, created_at DESC);

-- Admin-editable app config (single JSON row).
CREATE TABLE settings (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);
