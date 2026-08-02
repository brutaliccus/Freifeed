package com.freifeed.app;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Schedules native AlarmManager reminders when a nursing timer has been running
 * longer than the configured threshold — works while the app is closed/idle.
 */
public final class NursingSessionReminderScheduler {

    private static final String TAG = "NursingSessionReminder";

    /** Must match nativeNotifications.ts NURSING_LONG_ID_BASE / SPAN. */
    static final int NURSING_ID_BASE = 34_000;
    static final int NURSING_ID_SPAN = 100;

    private NursingSessionReminderScheduler() {}

    public static void syncFromJson(Context context, String json) {
        Context app = context.getApplicationContext();
        cancelAll(app);

        if (json == null || json.isEmpty() || "null".equals(json)) return;

        try {
            JSONObject root = new JSONObject(json);
            if (!root.optBoolean("enabled", false)) return;

            long thresholdMs = root.optLong("thresholdMs", 0L);
            JSONArray sessions = root.optJSONArray("sessions");
            if (sessions == null || thresholdMs <= 0) return;

            Set<String> alerted = new HashSet<>();
            JSONArray alertedKeys = root.optJSONArray("alertedKeys");
            if (alertedKeys != null) {
                for (int i = 0; i < alertedKeys.length(); i++) {
                    String key = alertedKeys.optString(i, "");
                    if (!key.isEmpty()) alerted.add(key);
                }
            }

            long now = System.currentTimeMillis();

            for (int i = 0; i < sessions.length(); i++) {
                JSONObject session = sessions.optJSONObject(i);
                if (session == null) continue;

                String sessionKey = session.optString("sessionKey", "");
                String babyName = session.optString("babyName", "Baby");
                String startAtIso = session.optString("startAtIso", "");
                String side = session.optString("side", "");
                if (sessionKey.isEmpty() || startAtIso.isEmpty()) continue;
                if (alerted.contains(sessionKey)) continue;

                long startMs = parseIsoMs(startAtIso);
                if (startMs <= 0) continue;

                long fireAt = startMs + thresholdMs;
                int notifId = nursingNotifId(sessionKey);
                String sideSuffix = (side != null && !side.isEmpty()) ? " · " + side : "";
                String title = babyName + " — nursing still active";
                String body =
                    "Nursing timer is still running" + sideSuffix + ". Open Freifeed to stop the session.";

                if (fireAt <= now) {
                    schedule(app, notifId, now + 500L, title, body, sessionKey);
                } else {
                    schedule(app, notifId, fireAt, title, body, sessionKey);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "syncFromJson failed", e);
        }
    }

    static int nursingNotifId(String sessionKey) {
        int h = 0;
        for (int i = 0; i < sessionKey.length(); i++) {
            h = (h * 31 + sessionKey.charAt(i)) | 0;
        }
        return NURSING_ID_BASE + (Math.abs(h) % NURSING_ID_SPAN);
    }

    private static void schedule(
        Context context,
        int id,
        long atMs,
        String title,
        String body,
        String sessionKey
    ) {
        android.content.Intent intent =
            new android.content.Intent(context, NursingSessionReminderAlarmReceiver.class);
        intent.setAction(NursingSessionReminderAlarmReceiver.ACTION_FIRE);
        intent.putExtra(NursingSessionReminderAlarmReceiver.EXTRA_ID, id);
        intent.putExtra(NursingSessionReminderAlarmReceiver.EXTRA_TITLE, title);
        intent.putExtra(NursingSessionReminderAlarmReceiver.EXTRA_BODY, body);
        intent.putExtra(NursingSessionReminderAlarmReceiver.EXTRA_SESSION_KEY, sessionKey);

        android.app.AlarmManager am = context.getSystemService(android.app.AlarmManager.class);
        if (am == null) return;

        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
        }
        android.app.PendingIntent pending =
            android.app.PendingIntent.getBroadcast(context, id, intent, flags);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, atMs, pending);
        } else {
            am.setExact(android.app.AlarmManager.RTC_WAKEUP, atMs, pending);
        }
    }

    public static void cancel(Context context, int id) {
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
        NursingSessionReminderNotifier.dismiss(context, id);
    }

    public static void cancelAll(Context context) {
        for (int i = 0; i < NURSING_ID_SPAN; i++) {
            cancel(context, NURSING_ID_BASE + i);
        }
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
                java.text.SimpleDateFormat fmt =
                    new java.text.SimpleDateFormat(pattern, Locale.US);
                fmt.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                java.util.Date d = fmt.parse(iso);
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
                /* try next */
            }
        }
        return -1;
    }
}
