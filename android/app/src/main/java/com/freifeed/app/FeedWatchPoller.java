package com.freifeed.app;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * Polls listFeedings while the app is backgrounded and shows feed progress notifications
 * for partner-started sessions; dismisses when sessions end.
 */
public final class FeedWatchPoller {

    private static final String TAG = "FeedWatchPoller";
    /** Fallback when FCM is delayed (app closed / OEM battery limits). */
    private static final long POLL_INTERVAL_MS = 45_000L;
    private static final long INITIAL_DELAY_MS = 15_000L;

    private FeedWatchPoller() {}

    static long pollIntervalMs() {
        return POLL_INTERVAL_MS;
    }

    static long initialPollDelayMs() {
        return INITIAL_DELAY_MS;
    }

    /** Immediate native poll (FCM end / urgent). Safe off main thread. */
    public static void pollNow(Context context) {
        Context app = context.getApplicationContext();
        new Thread(
            () -> {
                try {
                    pollOnce(app);
                } catch (Exception e) {
                    Log.w(TAG, "pollNow failed", e);
                }
            }
        )
            .start();
    }

    public static void pollAndScheduleNext(Context context) {
        Context app = context.getApplicationContext();
        try {
            pollOnce(app);
        } catch (Exception e) {
            Log.w(TAG, "poll failed", e);
        }
        if (FeedWatchState.isEnabled(app)) {
            FeedWatchScheduler.schedule(app, pollIntervalMs());
        }
    }

    private static void pollOnce(Context context) throws Exception {
        JSONObject cfg = FeedWatchState.read(context);
        if (!cfg.optBoolean("enabled", false)) return;

        String householdId = cfg.optString("householdId", "");
        String idToken = cfg.optString("idToken", "");
        String projectId = cfg.optString("projectId", "freifeed-3b861");
        if (householdId.isEmpty() || idToken.isEmpty()) return;

        Set<String> owned = FeedWatchState.readOwnedFeedingIds(context);
        JSONArray feedings = fetchFeedings(projectId, idToken, householdId);
        if (feedings == null) return;

        long now = System.currentTimeMillis();
        Set<String> activeBabyIds = new HashSet<>();

        for (int i = 0; i < feedings.length(); i++) {
            JSONObject f = feedings.optJSONObject(i);
            if (f == null) continue;

            String type = f.optString("type", "nursing");
            if ("bottle".equals(type)) continue;

            String startAt = f.optString("startAt", "");
            String endAt = f.optString("endAt", "");
            String babyId = f.optString("babyId", "");
            if (babyId.isEmpty()) continue;

            if (!startAt.isEmpty() && !endAt.isEmpty()) {
                continue;
            }

            if (startAt.isEmpty() || !endAt.isEmpty()) {
                continue;
            }

            String feedingId = f.optString("id", "");
            if (feedingId.isEmpty() || owned.contains(feedingId)) continue;

            long startMs = parseIsoMs(startAt);
            if (startMs <= 0 || startMs > now) continue;

            activeBabyIds.add(babyId);
            String sessionKey = babyId + ":" + normalizeStartSecond(startAt);
            int notifId = FeedWatchPlugin.feedNotifId(babyId);
            String babyName = babyNameFor(babyId);
            String side = sideLabel(f.optString("side", ""));
            String title = babyName + " — nursing";
            String body = side.isEmpty() ? "Feeding" : side;

            boolean playAlert = !FeedAlertStateStore.hasAlerted(context, sessionKey);
            FeedProgressNotifier.show(
                context,
                notifId,
                title,
                body,
                playAlert,
                babyId,
                feedingId,
                startMs
            );
            if (playAlert) {
                FeedAlertStateStore.markAlerted(context, sessionKey);
                FeedWatchPlugin.dispatchFeedShown(context, babyId, feedingId, startMs);
            }
        }

        dismissInactiveBabyNotifications(context, activeBabyIds);
    }

    private static void dismissInactiveBabyNotifications(Context context, Set<String> activeBabyIds) {
        for (String babyId : FeedAlertStateStore.getAlertedBabyIds(context)) {
            if (activeBabyIds.contains(babyId)) continue;
            PartnerFeedNative.onSessionEnded(
                context,
                null,
                babyId,
                babyNameFor(babyId),
                null,
                System.currentTimeMillis()
            );
        }
    }

    private static JSONArray fetchFeedings(String projectId, String idToken, String householdId)
        throws Exception {
        String url =
            "https://us-central1-" + projectId + ".cloudfunctions.net/listFeedings";
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(20_000);
        conn.setReadTimeout(20_000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("Authorization", "Bearer " + idToken);

        JSONObject body = new JSONObject();
        JSONObject data = new JSONObject();
        data.put("householdId", householdId);
        body.put("data", data);

        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(bytes);
        }

        int code = conn.getResponseCode();
        BufferedReader reader =
            new BufferedReader(
                new InputStreamReader(
                    code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream(),
                    StandardCharsets.UTF_8
                )
            );
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }
        conn.disconnect();

        if (code == 401 || code == 403) {
            Log.w(TAG, "listFeedings auth failed (" + code + "); need fresh idToken from app");
            return null;
        }
        if (code < 200 || code >= 300) {
            throw new IllegalStateException("listFeedings HTTP " + code + ": " + sb);
        }

        JSONObject parsed = new JSONObject(sb.toString());
        JSONObject result = parsed.optJSONObject("result");
        if (result == null) return null;
        return result.optJSONArray("feedings");
    }

    private static long parseIsoMs(String iso) {
        if (iso == null || iso.isEmpty()) return -1;
        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat fmt = new SimpleDateFormat(pattern, Locale.US);
                fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                java.util.Date d = fmt.parse(iso);
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
                /* try next */
            }
        }
        return -1;
    }

    private static String normalizeStartSecond(String iso) {
        long ms = parseIsoMs(iso);
        if (ms <= 0) return iso;
        return new java.util.Date((ms / 1000L) * 1000L).toInstant().toString();
    }

    private static String babyNameFor(String babyId) {
        if ("ingrid".equals(babyId)) return "Ingrid";
        if ("willow".equals(babyId)) return "Willow";
        if ("isaac".equals(babyId)) return "Isaac";
        return "Baby";
    }

    private static String sideLabel(String side) {
        if ("left".equals(side)) return "Left";
        if ("right".equals(side)) return "Right";
        return "";
    }
}
