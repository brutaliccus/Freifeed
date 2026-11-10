# Freifeed Phase 2 — notes for parent agent

Branch: `pi-backend` (from `main` @ `d07e0ae`).

## Architecture decisions

- **Server:** Fastify + better-sqlite3 (WAL, FK, busy_timeout) under `server/`. Callables mirrored as `POST /api/{name}` with the same JSON shapes the client already expects from `httpsCallable` (`res.data`).
- **IDs:** Firestore document IDs preserved as SQLite PKs. Firebase Auth UIDs remain the primary `users.uid`; `google_sub` + email used for Google sign-in resolution.
- **Timestamps:** ISO-8601 strings on the wire; client mappers accept ISO (and Firestore Timestamps).
- **Auth:** Google ID token verified with `google-auth-library` against the existing web client ID. Server issues HS256 JWT (`JWT_SECRET`, default TTL **30 days** via `JWT_EXPIRES_IN`). Re-login when expired (no refresh endpoint yet). Client persists token in `localStorage` and sends `Authorization: Bearer …`. SSE uses `?access_token=` because EventSource cannot set headers.
- **Realtime:** Authenticated SSE at `GET /api/events` with ~20s heartbeat comments; broadcasts `{ householdId, collections, at }` after mutations. Client API mode: initial list fetch + SSE-driven refetch (no Firestore listeners).
- **Photos:** Stored under `DATA_DIR/households/{hid}/babies/{bid}/avatar.jpg`; served only via authenticated `GET /api/photos/...`.
- **Client switch:** `VITE_API_BASE` (e.g. `https://buba.freiverse.com`). Unset = unchanged Firebase production path.
- **CORS:** Firebase Hosting origins + localhost 5173/4173 + `capacitor://localhost` + `https://localhost` + `CORS_ORIGINS` extras.

## Bugfixes shipped

1. **Sync banner:** Shows failing op name + `lastError`; permanent errors (validation / not-found / permission / unauthenticated) are not retried 12×; `unauthenticated` removed from transient list.
2. **Milk optimistic UI:** Local apply via `milkInventoryLocal` + `useMilkInventory` registry; freeze/thaw/combine/redistribute/update/delete + bottle deductions / pump lots update inventory immediately; expiry alarms rebuild from optimistic list; recently-removed lot ids skipped for due alerts.
3. **snapshotSig / mappedItemRevision:** Include `remainingOz`, `storage`, `volumeOz`, `note` so volume-only updates are not dropped.
4. **Dual-enqueue:** `runMutation` owns offline queue for optimistic paths; permanent failures recorded once as failed queue items.

## Env vars (server)

See `server/.env.example`: `JWT_SECRET`, `GOOGLE_WEB_CLIENT_ID`, `CORS_ORIGINS`, `DATA_DIR`, `PORT`, `TUNNEL_TOKEN`, optional FCM / `GOOGLE_APPLICATION_CREDENTIALS`.

## Run compose on the Pi

```bash
# /etc/freifeed/tunnel.env should contain TUNNEL_TOKEN=...
cd /path/to/Freifeed/server
cp .env.example .env   # set JWT_SECRET
docker compose up -d --build
# API: 127.0.0.1:8080 only; cloudflared on same network → freifeed-api:8080
```

## Export / import

```bash
cd server
node scripts/export-firebase.mjs          # → ../export/ (gitignored)
# Uses firebase-tools token or ADC; auth via REST or `firebase auth:export` fallback
node scripts/import-sqlite.mjs ../export ./data/freifeed.sqlite
```

Export was run successfully on this machine (Firestore + Storage photos + Auth via CLI). **Do not commit `export/`.** Auth REST admin API lacked scope; CLI `firebase auth:export` worked (3 users with Google provider UIDs / `google_sub`).

## FCM status

Partner nursing push is wired as a **no-op with a one-time log** when `FCM_*` / `GOOGLE_APPLICATION_CREDENTIALS` are absent. Writes never fail due to push. Full HTTP v1 send can be completed later when a service account is available on the Pi.

## Staging / APK notes

- Web staging: `VITE_API_BASE=https://buba.freiverse.com npm run build && npm run preview`
- Production Firebase Hosting build: leave `VITE_API_BASE` unset (verified `npm run build`).
- Android: keep `CAP_SERVER_URL` on Firebase Hosting until hosting is redeployed with API-mode assets; or build a preview APK after hosting a API-mode `dist`. Optional later: `npm run cap:sync` then `cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`. No phone install performed.

## Deferred

- Deleting deployed no-op Firebase sync-pulse functions (must not touch Firebase production).
- Full README architecture rewrite beyond this note + `server/README.md`.
- Persisting `nativeMilkExpiryFired` across process restarts.
- Listener registry lifetime cleanup beyond current API-mode destroy on sign-out.
- Rotating the hardcoded OAuth web client id.
- Completing FCM HTTP v1 send + invalid-token prune on the Pi.
- JWT refresh endpoint (currently re-login after 30d).

## Test / build results

- `server`: `npm test` — **7 passed** (milk freeze/thaw, combine/redistribute, bottle deductions, non-member denied, import ID preservation).
- `server`: `npm run build` (tsc) — OK.
- Web: `npm run build` (no `VITE_API_BASE`) — OK.
- Web: `VITE_API_BASE=https://buba.freiverse.com npm run build` — OK.

## Blockers

- **Auth REST export** needs admin scope; mitigated via `firebase auth:export` in the script.
- **FCM** not live without a service account on the Pi (by design for staging).
- **APK / Hosting:** cannot deploy Hosting or ship a phone APK in this phase without Firebase write; preview path documented.
- Cloudflare **TUNNEL_TOKEN** must be supplied on the Pi (never committed).

## Commit SHAs

- `7d7f113` — Add Pi SQLite/Fastify backend with Docker, SSE, and export/import.
- `1240046` — Rewire client for VITE_API_BASE and fix sync/milk expiry bugs.
- `347cd20` — Document Phase 2 architecture, ops, and deferred items.
