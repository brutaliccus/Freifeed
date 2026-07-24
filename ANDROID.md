# Freifeed Android (Capacitor thin client)

Same pattern as **Freilifts**: the APK is a WebView shell that loads the hosted app.

**Default URL:** `https://freifeed-3b861.web.app`

## One-time setup

1. **Node deps** (from repo root):
   ```powershell
   npm install
   ```

2. **Google Sign-In (required for login on device)**  
   The Web client ID is baked into `capacitor.config.ts` (same as Firebase → Authentication → Google → Web SDK configuration). Override with `$env:GOOGLE_WEB_CLIENT_ID` before `cap:sync` if needed.

   Place Firebase’s `google-services.json` in `android/app/` (not the repo root). The Gradle build applies it automatically.

   Register your **Android app** in Firebase (package `com.freifeed.app`) and add this **debug SHA-1** (from this machine’s debug keystore):

   ```
   A9:9F:35:C5:EE:43:85:E0:7D:4B:37:57:47:6F:EB:38:C9:79:BE:9C
   ```

   Firebase Console → **Project settings** → **Your apps** → Android **Freifeed** → **Add fingerprint** → paste SHA-1 → Save.

   Then click **Download google-services.json** again and replace `android/app/google-services.json`.  
   A correct file includes an OAuth client with `"client_type": 1` (Android), not only `"client_type": 3` (Web).

   Rebuild in Android Studio (**Build → Rebuild Project**, then Run).

   To print SHA-1 yourself (Android Studio JBR keytool):
   ```powershell
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```

3. **Android Studio**  
   Install [Android Studio](https://developer.android.com/studio) with SDK 35 and accept licenses.

## Build & run on USB device

```powershell
cd c:\dev\Freifeed
npm run cap:sync
npm run cap:open
```

In Android Studio:

1. Enable **Developer options** + **USB debugging** on the phone.
2. Connect USB → select device → **Run** (green play).
3. On first launch, allow **Notifications** when prompted (medicine + feed alerts).

## Dev against local Vite (optional)

```powershell
npm run dev
$env:CAP_SERVER_URL = "http://YOUR_PC_LAN_IP:5173"
$env:CAP_ALLOW_CLEARTEXT = "1"
npm run cap:sync
```

Phone and PC must be on the same Wi‑Fi. Use your machine’s IPv4 (not `localhost`).

## Production URL only (like Freilifts deploy)

```powershell
npm run cap:sync
```

Uses `https://freifeed-3b861.web.app` with no local build bundled for content (only shell assets).

## In-app APK updates (Profile → App)

The Android app downloads and installs APKs from **GitHub Releases** on
[`brutaliccus/Freifeed`](https://github.com/brutaliccus/Freifeed/releases) via Cloud Functions
(`getAndroidAppUpdate` / `downloadAndroidApk`).

### Publish a new APK

1. Ensure GitHub Actions secrets exist (one-time):
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
2. Run the **Release Android APK** workflow (`workflow_dispatch`) with a higher `version_code`
   and the new `version_name` (e.g. `1.0.1`).
3. The workflow builds a signed release APK, creates a GitHub Release (`v{version}`), and uploads
   `freifeed-{version}.apk` plus `update-info.json`.
4. On the phone: **Profile → App → Check for updates → Download & install**.

Optional Firestore override at `config/androidApk`:

```json
{
  "githubOwner": "brutaliccus",
  "githubRepo": "Freifeed",
  "versionCode": 2,
  "versionName": "1.0.1"
}
```

If the repo is private, set a GitHub PAT as the Cloud Functions env var `GITHUB_TOKEN`
(Contents: read) so the functions can read release assets.

### Rebuild APK locally after native changes

```powershell
npm run cap:sync
# Android Studio → Build → Generate Signed Bundle / APK
```

Prefer the GitHub Actions release workflow so in-app update picks up the new build automatically.

## What’s native vs web

| Feature | Android APK | Browser PWA |
|--------|-------------|-------------|
| UI | Remote Freifeed site | Same |
| Google login | Capacitor Google Auth | Popup / redirect |
| Medicine reminders | Local Notifications | Service worker |
| Feed in progress | Local Notifications | Service worker |
| Date / time pickers | Custom sheets | Browser controls |

## Troubleshooting

- **Blank / white WebView:** Check internet; confirm hosting URL loads in Chrome on the phone.
- **Google sign-in fails:** `GOOGLE_WEB_CLIENT_ID` set before sync; SHA-1 added in Firebase; run `npm run cap:sync` again.
- **No notifications:** App settings → Freifeed → Notifications allowed; open app once after install.
- **Stale UI:** Remote URL mode always loads latest deploy — force-stop app and reopen (no APK rebuild needed for web changes).
