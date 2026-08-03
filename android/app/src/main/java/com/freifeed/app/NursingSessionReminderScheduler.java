package com.freifeed.app;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Nursing "still running?" reminders.
 *
 * Closed-app delivery uses the same {@link MedicineAlertScheduler} path as
 * appointments / reminders (JS computes atMs, AlarmManager fires the receiver).
 * This class persists settings for partner FCM/poller and schedules those with
 * numeric timestamps (no ISO parsing on the fire path).
 */
public final class NursingSessionReminderScheduler {

    private static final String TAG = "NursingSessionReminder";

    /** Must match nativeNotifications.ts NURSING_LONG_ID_BASE / SPAN. */
    static final int NURSING_ID_BASE = 34_000;
    static final int NURSING_ID_SPAN = 100;

    private NursingSessionReminderScheduler() {}

    /** Persist config from the web layer; cancel legacy nursing-only alarms. */
    public static void syncFromJson(Context context, String json) {
        Context app = context.getApplicationContext();
        // Cancel the old NursingSessionReminderAlarmReceiver alarms (pre-1.0.5).
        cancelLegacyAlarms(app);

        if (json == null || json.isEmpty() || "null".equals(json)) {
            NursingSessionReminderState.saveConfig(app, false, 0L);
            MedicineAlertScheduler.cancelAllInRange(app, NURSING_ID_BASE, NURSING_ID_SPAN);
            MedicineAlertNotifier.dismissAllInRange(app, NURSING_ID_BASE, NURSING_ID_SPAN);
            return;
        }

        try {
            JSONObject root = new JSONObject(json);
            boolean enabled = root.optBoolean("enabled", false);
            long thresholdMs = root.optLong("thresholdMs", 0L);
            NursingSessionReminderState.saveConfig(app, enabled, thresholdMs);

            Set<String> alerted = new HashSet<>();
            JSONArray alertedKeys = root.optJSONArray("alertedKeys");
            if (alertedKeys != null) {
                for (int i = 0; i < alertedKeys.length(); i++) {
                    String key = alertedKeys.optString(i, "");
                    if (!key.isEmpty()) alerted.add(key);
                }
            }
            NursingSessionReminderState.mergeAlertedKeys(app, alerted);

            if (!enabled || thresholdMs <= 0) {
                MedicineAlertScheduler.cancelAllInRange(app, NURSING_ID_BASE, NURSING_ID_SPAN);
                MedicineAlertNotifier.dismissAllInRange(app, NURSING_ID_BASE, NURSING_ID_SPAN);
            }
            // Session alarms are scheduled from JS via MedicineAlertNative.scheduleAlarms
            // (same as appointments). Partner-only sessions are armed from FCM/poller below.
        } catch (Exception e) {
            Log.w(TAG, "syncFromJson failed", e);
        }
    }

    /** Schedule from partner session start (FCM) using MedicineAlertScheduler. */
    public static void onPartnerSessionStarted(
        Context context,
        String babyId,
        String babyName,
        String startAtIso,
        String side,
        long startMs
    ) {
        Context app = context.getApplicationContext();
        if (!NursingSessionReminderState.isEnabled(app)) return;
        long thresholdMs = NursingSessionReminderState.thresholdMs(app);
        if (thresholdMs <= 0) return;

        long start = startMs > 0 ? startMs : parseIsoMs(startAtIso);
        if (start <= 0) {
            Log.w(TAG, "Partner nursing reminder missing startMs");
            return;
        }

        String sessionKey = sessionKeyFor(babyId, start);
        if (NursingSessionReminderState.hasAlerted(app, sessionKey)) return;

        String sideLabel = sideLabel(side);
        String name = (babyName != null && !babyName.isEmpty()) ? babyName : babyNameFor(babyId);
        scheduleMedicineAlarm(app, sessionKey, name, sideLabel, start, thresholdMs);
    }

    /** Cancel when a partner (or any) session ends. */
    public static void onSessionEnded(
        Context context,
        String babyId,
        String startAtIso,
        long startMs
    ) {
        Context app = context.getApplicationContext();
        long start = startMs > 0 ? startMs : parseIsoMs(startAtIso);
        String sessionKey = sessionKeyFor(babyId, start > 0 ? start : 0L);
        int notifId = nursingNotifId(sessionKey);
        MedicineAlertScheduler.cancel(app, notifId);
        MedicineAlertNotifier.dismiss(app, notifId);
        cancelLegacyAlarm(app, notifId);
        NursingSessionReminderNotifier.dismiss(app, notifId);
        NursingSessionReminderState.clearAlerted(app, sessionKey);
        NursingSessionReminderState.clearAlertedForBaby(app, babyId);
    }

    /**
     * Reconcile from listFeedings (background poller) — same MedicineAlert alarms
     * appointments use, so they fire with the app closed.
     */
    public static void syncFromRemoteFeedings(Context context, JSONArray feedings) {
        Context app = context.getApplicationContext();
        if (!NursingSessionReminderState.isEnabled(app)) return;
        long thresholdMs = NursingSessionReminderState.thresholdMs(app);
        if (thresholdMs <= 0 || feedings == null) return;

        Set<String> activeKeys = new HashSet<>();
        long now = System.currentTimeMillis();

        for (int i = 0; i < feedings.length(); i++) {
            JSONObject f = feedings.optJSONObject(i);
            if (f == null) continue;

            String type = f.optString("type", "nursing");
            if ("bottle".equals(type) || "pump".equals(type)) continue;

            String startAt = f.optString("startAt", "");
            String endAt = f.optString("endAt", "");
            String babyId = f.optString("babyId", "");
            if (babyId.isEmpty() || startAt.isEmpty() || !endAt.isEmpty()) continue;

            long start = parseIsoMs(startAt);
            if (start <= 0 || start > now) continue;

            String sessionKey = sessionKeyFor(babyId, start);
            activeKeys.add(sessionKey);
            if (NursingSessionReminderState.hasAlerted(app, sessionKey)) continue;

            String side = sideLabel(f.optString("side", ""));
            scheduleMedicineAlarm(
                app,
                sessionKey,
                babyNameFor(babyId),
                side,
                start,
                thresholdMs
            );
        }

        NursingSessionReminderState.pruneAlerted(app, activeKeys);
    }

    private static void scheduleMedicineAlarm(
        Context app,
        String sessionKey,
        String babyName,
        String sideLabel,
        long startMs,
        long thresholdMs
    ) {
        long now = System.currentTimeMillis();
        long fireAt = startMs + thresholdMs;
        // Match feed-reminder / appointment behavior: always schedule via AlarmManager
        // (even if slightly overdue) so delivery works with the process dead.
        if (fireAt <= now) {
            fireAt = now + 500L;
        }

        int notifId = nursingNotifId(sessionKey);
        String sideSuffix = (sideLabel != null && !sideLabel.isEmpty()) ? " · " + sideLabel : "";
        String title = babyName + " — still nursing?";
        String body =
            "Nursing timer is still running" + sideSuffix + ". Open Freifeed to stop the session.";
        String medicineId = "nursing:" + sessionKey;

        if (!MedicineAlertStateStore.shouldAlert(app, medicineId, fireAt)) {
            NursingSessionReminderState.markAlerted(app, sessionKey);
            return;
        }

        MedicineAlertScheduler.cancel(app, notifId);
        MedicineAlertScheduler.schedule(
            app,
            notifId,
            fireAt,
            title,
            body,
            medicineId,
            fireAt
        );
        Log.i(TAG, "Scheduled nursing reminder via MedicineAlert id=" + notifId + " atMs=" + fireAt);
    }

    static String sessionKeyFor(String babyId, long startMs) {
        long normalized = (Math.max(0L, startMs) / 1000L) * 1000L;
        return (babyId != null ? babyId : "") + ":" + formatIsoUtc(normalized);
    }

    static int nursingNotifId(String sessionKey) {
        int h = 0;
        for (int i = 0; i < sessionKey.length(); i++) {
            h = (h * 31 + sessionKey.charAt(i)) | 0;
        }
        return NURSING_ID_BASE + (Math.abs(h) % NURSING_ID_SPAN);
    }

    public static void cancelAll(Context context) {
        Context app = context.getApplicationContext();
        cancelLegacyAlarms(app);
        MedicineAlertScheduler.cancelAllInRange(app, NURSING_ID_BASE, NURSING_ID_SPAN);
        MedicineAlertNotifier.dismissAllInRange(app, NURSING_ID_BASE, NURSING_ID_SPAN);
        for (int i = 0; i < NURSING_ID_SPAN; i++) {
            NursingSessionReminderNotifier.dismiss(app, NURSING_ID_BASE + i);
        }
    }

    private static void cancelLegacyAlarms(Context context) {
        for (int i = 0; i < NURSING_ID_SPAN; i++) {
            cancelLegacyAlarm(context, NURSING_ID_BASE + i);
        }
    }

    private static void cancelLegacyAlarm(Context context, int id) {
        android.content.Intent intent =
            new android.content.Intent(context, NursingSessionReminderAlarmReceiver.class);
        intent.setAction(NursingSessionReminderAlarmReceiver.ACTION_FIRE);
        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
        }
        android.app.PendingIntent pending =
            android.app.PendingIntent.getBroadcast(context, id, intent, flags);
        android.app.AlarmManager am = context.getSystemService(android.app.AlarmManager.class);
        if (am != null) am.cancel(pending);
    }

    static long parseIsoMs(String iso) {
        if (iso == null || iso.isEmpty()) return -1;
        String normalized = iso.trim();
        if (normalized.endsWith("Z") || normalized.endsWith("z")) {
            normalized = normalized.substring(0, normalized.length() - 1) + "+0000";
        } else if (normalized.matches(".*[+-]\\d{2}:\\d{2}$")) {
            int idx = Math.max(normalized.lastIndexOf('+'), normalized.lastIndexOf('-'));
            if (idx > 10) {
                normalized =
                    normalized.substring(0, idx)
                        + normalized.substring(idx).replace(":", "");
            }
        }
        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
        };
        for (String pattern : patterns) {
            try {
                java.text.SimpleDateFormat fmt = new java.text.SimpleDateFormat(pattern, Locale.US);
                fmt.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                java.util.Date d = fmt.parse(normalized);
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
                /* try next */
            }
            try {
                // Also try original iso against patterns with literal Z
                java.text.SimpleDateFormat fmt = new java.text.SimpleDateFormat(pattern, Locale.US);
                fmt.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                java.util.Date d = fmt.parse(iso.trim());
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
                /* try next */
            }
        }
        return -1;
    }

    private static String formatIsoUtc(long ms) {
        java.text.SimpleDateFormat fmt =
            new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return fmt.format(new java.util.Date(ms));
    }

    private static String babyNameFor(String babyId) {
        if ("ingrid".equals(babyId)) return "Ingrid";
        if ("willow".equals(babyId)) return "Willow";
        if ("isaac".equals(babyId)) return "Isaac";
        return "Baby";
    }

    private static String sideLabel(String side) {
        if (side == null) return "";
        if ("left".equalsIgnoreCase(side)) return "Left";
        if ("right".equalsIgnoreCase(side)) return "Right";
        if ("Left".equals(side) || "Right".equals(side)) return side;
        return "";
    }
}
