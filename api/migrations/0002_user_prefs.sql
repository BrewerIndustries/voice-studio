-- Per-user voice preferences (JSON: voice_id, stability, similarity, style, speed).
ALTER TABLE users ADD COLUMN prefs TEXT;
