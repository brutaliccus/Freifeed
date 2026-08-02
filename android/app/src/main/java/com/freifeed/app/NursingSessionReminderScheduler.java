package com.freifeed.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
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

    /** Must match nativeNotifications.ts NURSING_LONG_ID_BASE. */
    static final int NURSING_ID_BASE = 34_000;
    static final int NURSING_ID_SPAN = 100;

    private NursingSessionReminderScheduler() {}

    public static void syncFromJson(Context context, String json) {
        Context app = context.getApplicationContext();
        // Cancel pending alarms only — do NOT dismiss already-shown notifications.
        // The web layer used to call cancelAll every ~15s, which wiped the shade alert.
        cancelAllAlarms(app);

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
                if (startMs <= 0) {
                    Log.w(TAG, "Could not parse startAtIso: " + startAtIso);
                    continue;
                }

                long fireAt = startMs + thresholdMs;
                int notifId = nursingNotifId(sessionKey);
                String sideSuffix = (side != null && !side.isEmpty()) ? " · " + side : "";
                String title = babyName + " — still nursing?";
                String body =
                    "Nursing timer is still running" + sideSuffix + ". Open Freifeed to stop the session.";

                if (fireAt <= now) {
                    // Already past threshold — show immediately (don't rely on a 500ms alarm
                    // that the next JS sync might cancel before it fires).
                    NursingSessionReminderNotifier.show(app, notifId, title, body, sessionKey, true);
                    NursingSessionReminderPlugin.dispatchShown(app, sessionKey);
                } else {
                    scheduleAlarm(app, notifId, fireAt, title, body, sessionKey);
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

    private static void scheduleAlarm(
        Context context,
        int id,
        long atMs,
        String title,
        String body,
        String sessionKey
    ) {
        Intent intent = new Intent(context, NursingSessionReminderAlarmReceiver.class);
        intent.setAction(NursingSessionReminderAlarmReceiver.ACTION_FIRE);
        intent.putExtra(NursingSessionReminderAlarmReceiver.EXTRA_ID, id);
        intent.putExtra(NursingSessionReminderAlarmReceiver.EXTRA_TITLE, title);
        intent.putExtra(NursingSessionReminderAlarmReceiver.EXTRA_BODY, body);
        intent.putExtra(NursingSessionReminderAlarmReceiver.EXTRA_SESSION_KEY, sessionKey);

        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am == null) return;

        PendingIntent pending = pendingIntent(context, id, intent);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pending);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, atMs, pending);
            }
            Log.i(TAG, "Scheduled nursing reminder id=" + id + " atMs=" + atMs);
        } catch (SecurityException e) {
            Log.w(TAG, "Exact alarm not permitted; falling back to setAndAllowWhileIdle", e);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pending);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, atMs, pending);
            }
        }
    }

    private static PendingIntent pendingIntent(Context context, int id, Intent intent) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, id, intent, flags);
    }

    /** Cancel pending alarms only — leaves any already-posted notification in the shade. */
    public static void cancelAllAlarms(Context context) {
        for (int i = 0; i < NURSING_ID_SPAN; i++) {
            cancelAlarm(context, NURSING_ID_BASE + i);
        }
    }

    public static void cancelAlarm(Context context, int id) {
        Intent intent = new Intent(context, NursingSessionReminderAlarmReceiver.class);
        intent.setAction(NursingSessionReminderAlarmReceiver.ACTION_FIRE);
        PendingIntent pending = pendingIntent(context, id, intent);
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(pending);
    }

    /** Cancel alarms and remove shade notifications (used when feature is disabled / no sessions). */
    public static void cancelAll(Context context) {
        for (int i = 0; i < NURSING_ID_SPAN; i++) {
            int id = NURSING_ID_BASE + i;
            cancelAlarm(context, id);
            NursingSessionReminderNotifier.dismiss(context, id);
        }
    }

    private static long parseIsoMs(String iso) {
        if (iso == null || iso.isEmpty()) return -1;
        // Normalize trailing Z / offsets so SimpleDateFormat can parse browser toISOString().
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
        }
        return -1;
    }
}
