# Freifeed Pi API

Node 20 + Fastify + SQLite (WAL) backend for `https://buba.freiverse.com`.

## Local run

```bash
cd server
cp .env.example .env   # set JWT_SECRET
npm install
npm run dev
# health: GET http://localhost:8080/api/health
```

## Auth

1. Client signs in with Google and obtains a Google ID token.
2. `POST /api/auth/google` `{ "idToken": "..." }` → `{ token, user }` (JWT, 30 days).
3. Subsequent calls: `Authorization: Bearer <token>`.
4. When the JWT expires, re-run Google sign-in (no refresh token endpoint yet).

Firebase Auth UIDs are preserved when users are imported (`google_sub` / email mapping).

## Docker on the Pi (arm64)

```bash
cd /opt/stacks/freifeed
# create .env with JWT_SECRET (do not commit it)
docker compose up -d --build
```

- API is published on host port **8787** (plain HTTP). Nginx Proxy Manager terminates TLS for `buba.freiverse.com` and proxies to `http://<pi-lan-ip>:8787`.
- Until NPM is live, test from the LAN: `http://pihole:8787/api/health`.
- Enable **Websockets Support** in NPM; the API trusts `X-Forwarded-*` (`trustProxy: true`).
- Data volume `freifeed-data` → `/data` (SQLite + photos + hourly backups).
- Container name: `freifeed-api`.

## Backups

Hourly copies land in `/data/backups/freifeed-*.sqlite` (keeps ~48). Restore:

```bash
docker compose stop freifeed-api
# copy a backup over /data/freifeed.sqlite (volume mount)
docker compose start freifeed-api
```

## Export / import (from a workstation)

```bash
# Read-only Firebase dump → ../export/
node scripts/export-firebase.mjs

# Import into a SQLite file
node scripts/import-sqlite.mjs ../export ./data/freifeed.sqlite
```

## Tests

```bash
npm test
```
