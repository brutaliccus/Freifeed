# FreiFeed

A lightweight nursing tracker for twin daughters **Ingrid** and **Willow**. Built for two parents sharing one household via Google sign-in and Firebase.

## Architecture

- **Web app** (Vite + React) — Auth, UI
- **Cloud Functions** (`us-central1`) — Firestore API, baby photo uploads (Admin SDK → Storage)
- **Firestore** — Database (client access denied; Admin SDK in functions only)
- **Firebase Hosting** — `freifeed-3b861.web.app`

Feedings sync via polling every ~12 seconds (and when the tab becomes visible).

## Setup

### 1. Firebase project

1. [Firebase Console](https://console.firebase.google.com/) — project `freifeed-3b861`
2. **Authentication** → Google sign-in
3. **Firestore** — create database
4. **Storage** — **Required for baby photos.** In Console → Storage → **Get started** (choose a region), then run `firebase deploy --only storage`
5. **Blaze plan** — required for Cloud Functions
6. Web app config in `.env.local`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

7. **Authorized domains**: `localhost`, `freifeed-3b861.web.app`

### 2. Local dev

```bash
npm install
cd functions && npm install && cd ..
npm run dev
```

Optional: Functions emulator

```bash
cd functions && npm run build && cd ..
firebase emulators:start --only functions
```

### 3. Deploy

```bash
npm run build
cd functions && npm run build && cd ..
firebase deploy --only functions,firestore:rules,storage,hosting
```

## Household flow

1. Sign in with Google → **Create household** → share invite code
2. Partner **Join with code**
3. Log feeds; data syncs through Cloud Functions

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `cd functions && npm run build` | Compile Cloud Functions |
