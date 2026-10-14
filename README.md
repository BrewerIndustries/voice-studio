# Voice Studio

Type a script, get a voice-over in your own voice. Invite-only login, clip
history (replay, download, reuse text), per-user monthly character caps.
Speech comes from an **ElevenLabs** cloned voice.

| | Prod | Dev |
|---|---|---|
| Web | https://voice.dabrewer.dev/ | https://voice.dabrewer.dev/dev/ |
| API | https://voice-api.dabrewer.dev | https://voice-api-dev.dabrewer.dev |

## Architecture

Same flavor as Brookeslist: **GitHub Pages SPA + Cloudflare Worker (Hono) + D1 + R2**.

- `web/` — React + Vite + Tailwind. The Pages workflow (on `dev` pushes) builds
  `main` → `/` and `dev` → `/dev/` with per-build `BASE_PATH` + `VITE_API_BASE`.
- `api/` — Worker. Auth is PBKDF2 passwords + an HttpOnly session cookie whose
  DB row is `HMAC(token, SESSION_SECRET)`. Web and API are sibling subdomains of
  `dabrewer.dev`, so the cookie is same-site and `<audio>` requests carry it.
- **ElevenLabs key never leaves the Worker** (secret `ELEVENLABS_API_KEY`).
- MP3s are stored in **private** R2 (`voice-studio-clips-{prod,dev}`) and streamed
  through an auth-gated route (`/clips/:id/audio`, `?download=1` for a file).

### Guard rails
- Invite-only: no sign-up route; admins create accounts.
- Login lockout: 8 failures per IP or per email in 15 min → 429.
- Per-user monthly character cap (admins exempt) + max characters per clip,
  both set in **Admin**; burst limit of 30 clips per 10 min per user.

## Setup / operations

```bash
cd api
npx wrangler secret put ELEVENLABS_API_KEY            # prod
npx wrangler secret put ELEVENLABS_API_KEY --env dev  # dev
npm run create-user -- --env prod --email you@example.com --role admin --password '...'
npm run deploy && npm run deploy:dev
npm run migrate:prod && npm run migrate:dev           # after adding a migration
```

Then sign in. Pages:
- **Studio** — script box, **voice dropdown** (every voice on the ElevenLabs
  account, clones marked "yours"), generate, clip history.
- **Settings** — your delivery sliders (stability, similarity, style, speed),
  saved per user in D1 (`users.prefs`). Admins also get the ElevenLabs quota and
  the engine settings (model, max characters per clip).
  `eleven_multilingual_v2` is the safe default for clones.
- **Account** — change password. Admins also manage users and the monthly cap.

## Local dev

```bash
cd api && npx wrangler dev          # needs api/.dev.vars with SESSION_SECRET (and optionally ELEVENLABS_API_KEY)
cd web && npx vite                  # talks to http://localhost:8787
npm run migrate:local && npm run create-user -- --local --email ... --role admin --password ...
```
