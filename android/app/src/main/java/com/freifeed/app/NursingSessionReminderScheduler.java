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
 *
 * Partner-started sessions are also armed from FCM / FeedWatchPoller, because the
 * web layer may not be running when someone else starts a feed.
 */
public final class NursingSessionReminderScheduler {

    private static final String TAG = "NursingSessionReminder";

    /** Must match nativeNotifications.ts NURSING_LONG_ID_BASE. */
    static final int NURSING_ID_BASE = 34_000;
    static final int NURSING_ID_SPAN = 100;

    private NursingSessionReminderScheduler() {}

    public static void syncFromJson(Context context, String json) {
        Context app = context.getApplicationContext();

        if (json == null || json.isEmpty() || "null".equals(json)) {
            NursingSessionReminderState.saveConfig(app, false, 0L);
            cancelAll(app);
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
                NursingSessionReminderState.saveWebSessionKeys(app, new HashSet<>());
                cancelAll(app);
                return;
            }

            JSONArray sessions = root.optJSONArray("sessions");
            Set<String> previousWeb = NursingSessionReminderState.readWebSessionKeys(app);
            Set<String> activeKeys = new HashSet<>();

            if (sessions != null) {
                for (int i = 0; i < sessions.length(); i++) {
                    JSONObject session = sessions.optJSONObject(i);
                    if (session == null) continue;
                    String sessionKey = session.optString("sessionKey", "");
                    String babyName = session.optString("babyName", "Baby");
                    String startAtIso = session.optString("startAtIso", "");
                    String side = session.optString("side", "");
                    if (sessionKey.isEmpty() || startAtIso.isEmpty()) continue;
                    activeKeys.add(sessionKey);
                    upsertSession(app, sessionKey, babyName, startAtIso, side, thresholdMs);
                }
            }

            // Only cancel sessions the web layer previously tracked and no longer reports.
            // Partner-only alarms (FCM/poller) are left alone.
            for (String key : previousWeb) {
                if (activeKeys.contains(key)) continue;
                int notifId = nursingNotifId(key);
                cancelAlarm(app, notifId);
                NursingSessionReminderNotifier.dismiss(app, notifId);
                NursingSessionReminderState.clearAlerted(app, key);
            }
            NursingSessionReminderState.saveWebSessionKeys(app, activeKeys);
        } catch (Exception e) {
            Log.w(TAG, "syncFromJson failed", e);
        }
    }

    /**
     * Arm / refresh a single nursing reminder (used for partner FCM start and poller).
     * Does not cancel other sessions' alarms.
     */
    public static void upsertSession(
        Context context,
        String sessionKey,
        String babyName,
        String startAtIso,
        String side,
        long thresholdMs
    ) {
        Context app = context.getApplicationContext();
        if (!NursingSessionReminderState.isEnabled(app)) return;
        long threshold =
            thresholdMs > 0 ? thresholdMs : NursingSessionReminderState.thresholdMs(app);
        if (threshold <= 0) return;
        if (sessionKey == null || sessionKey.isEmpty() || startAtIso == null || startAtIso.isEmpty()) {
            return;
        }
        if (NursingSessionReminderState.hasAlerted(app, sessionKey)) return;

        long startMs = parseIsoMs(startAtIso);
        if (startMs <= 0) {
            Log.w(TAG, "Could not parse startAtIso: " + startAtIso);
            return;
        }

        long fireAt = startMs + threshold;
        int notifId = nursingNotifId(sessionKey);
        String sideSuffix = (side != null && !side.isEmpty()) ? " · " + side : "";
        String name = (babyName != null && !babyName.isEmpty()) ? babyName : "Baby";
        String title = name + " — still nursing?";
        String body =
            "Nursing timer is still running" + sideSuffix + ". Open Freifeed to stop the session.";

        // Replace any prior alarm for this session.
        cancelAlarm(app, notifId);

        long now = System.currentTimeMillis();
        if (fireAt <= now) {
            NursingSessionReminderNotifier.show(app, notifId, title, body, sessionKey, true);
            NursingSessionReminderState.markAlerted(app, sessionKey);
            NursingSessionReminderPlugin.dispatchShown(app, sessionKey);
        } else {
            scheduleAlarm(app, notifId, fireAt, title, body, sessionKey);
        }
    }

    /** Schedule from partner session start (FCM). */
    public static void onPartnerSessionStarted(
        Context context,
        String babyId,
        String babyName,
        String startAtIso,
        String side,
        long startMs
    ) {
        if (!NursingSessionReminderState.isEnabled(context)) return;
        String sessionKey = sessionKeyFor(babyId, startAtIso, startMs);
        String iso =
            (startAtIso != null && !startAtIso.isEmpty())
                ? startAtIso
                : new java.util.Date((startMs / 1000L) * 1000L).toInstant().toString();
        String sideLabel = sideLabel(side);
        upsertSession(
            context,
            sessionKey,
            babyName,
            iso,
            sideLabel,
            NursingSessionReminderState.thresholdMs(context)
        );
    }

    /** Cancel when a partner (or any) session ends. */
    public static void onSessionEnded(
        Context context,
        String babyId,
        String startAtIso,
        long startMs
    ) {
        Context app = context.getApplicationContext();
        String sessionKey = sessionKeyFor(babyId, startAtIso, startMs);
        int notifId = nursingNotifId(sessionKey);
        cancelAlarm(app, notifId);
        NursingSessionReminderNotifier.dismiss(app, notifId);
        NursingSessionReminderState.clearAlerted(app, sessionKey);
        NursingSessionReminderState.clearAlertedForBaby(app, babyId);
    }

    /**
     * Reconcile reminders from a listFeedings payload (background poller).
     * Schedules for every in-progress nursing session, including partner-started ones.
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

            long startMs = parseIsoMs(startAt);
            if (startMs <= 0 || startMs > now) continue;

            String sessionKey = babyId + ":" + normalizeStartSecond(startAt);
            activeKeys.add(sessionKey);

            String babyName = babyNameFor(babyId);
            String side = sideLabel(f.optString("side", ""));
            upsertSession(app, sessionKey, babyName, startAt, side, thresholdMs);
        }

        // Drop alerted keys for sessions that are no longer active (poller is source of truth
        // for remote set). Do not cancel alarms for keys not in this list if start parse failed.
        NursingSessionReminderState.pruneAlerted(app, activeKeys);
    }

    static String sessionKeyFor(String babyId, String startAtIso, long startMs) {
        String normalized = normalizeStartSecond(startAtIso, startMs);
        return (babyId != null ? babyId : "") + ":" + normalized;
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

    /** Cancel alarms and remove shade notifications (used when feature is disabled). */
    public static void cancelAll(Context context) {
        for (int i = 0; i < NURSING_ID_SPAN; i++) {
            int id = NURSING_ID_BASE + i;
            cancelAlarm(context, id);
            NursingSessionReminderNotifier.dismiss(context, id);
        }
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

    private static String normalizeStartSecond(String iso) {
        long ms = parseIsoMs(iso);
        if (ms <= 0) return iso;
        return new java.util.Date((ms / 1000L) * 1000L).toInstant().toString();
    }

    private static String normalizeStartSecond(String iso, long startMs) {
        if (iso != null && !iso.isEmpty()) {
            long ms = parseIsoMs(iso);
            if (ms > 0) {
                return new java.util.Date((ms / 1000L) * 1000L).toInstant().toString();
            }
            return iso.length() >= 19 ? iso.substring(0, 19) + "Z" : iso;
        }
        return new java.util.Date((startMs / 1000L) * 1000L).toInstant().toString();
    }

    private static String babyNameFor(String babyId) {
        if ("ingrid".equals(babyId)) return "Ingrid";
        if ("willow".equals(babyId)) return "Willow";
        if ("isaac".equals(babyId)) return "Isaac";
        return "Baby";
    }

    private static String sideLabel(String side) {
        if (side == null) return "";
        if ("left".equalsIgnoreCase(side) || "Left".equals(side)) return "Left";
        if ("right".equalsIgnoreCase(side) || "Right".equals(side)) return "Right";
        if ("Left".equals(side) || "Right".equals(side)) return side;
        return "";
    }
}
