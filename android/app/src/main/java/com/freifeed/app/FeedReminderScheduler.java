package com.freifeed.app;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Schedules native feed-reminder alarms from JSON synced by the web layer. */
public final class FeedReminderScheduler {

    private static final String TAG = "FeedReminderScheduler";

    /** Must match nativeNotifications.ts REMINDER_ID_BASE. */
    static final int REMINDER_ID_BASE = 32_000;
    static final int REMINDER_ID_SPAN = 100;

    private FeedReminderScheduler() {}

    public static void syncFromJson(Context context, String json) {
        Context app = context.getApplicationContext();
        cancelAll(app);

        if (json == null || json.isEmpty() || "null".equals(json)) return;

        try {
            JSONObject root = new JSONObject(json);
            if (!root.optBoolean("enabled", false)) return;

            long thresholdMs = root.optLong("thresholdMs", 0L);
            int snoozeMinutes = root.optInt("snoozeMinutes", 15);
            JSONArray babies = root.optJSONArray("babies");
            if (babies == null || thresholdMs <= 0) return;

            long now = System.currentTimeMillis();

            Set<String> feedingInProgress = new HashSet<>();
            JSONArray feedingNow = root.optJSONArray("feedingInProgressBabyIds");
            if (feedingNow != null) {
                for (int j = 0; j < feedingNow.length(); j++) {
                    String id = feedingNow.optString(j, "");
                    if (!id.isEmpty()) feedingInProgress.add(id);
                }
            }

            for (int i = 0; i < babies.length(); i++) {
                JSONObject baby = babies.optJSONObject(i);
                if (baby == null) continue;

                String babyId = baby.optString("id", "");
                String babyName = baby.optString("name", "Baby");
                String lastStartIso = baby.optString("lastStartIso", "");
                if (babyId.isEmpty() || lastStartIso.isEmpty()) continue;

                if (feedingInProgress.contains(babyId)) {
                    cancel(app, reminderNotifId(babyId));
                    continue;
                }

                long lastMs = parseIsoMs(lastStartIso);
                if (lastMs <= 0) continue;

                int notifId = reminderNotifId(babyId);
                String title = babyName + " — feed reminder";
                long dueAt = lastMs + thresholdMs;

                JSONObject tracking = root.optJSONObject("tracking");
                String trackKey = babyId + ":" + normalizeStartSecond(lastStartIso);
                JSONObject track = tracking != null ? tracking.optJSONObject(trackKey) : null;
                if (track == null && tracking != null) {
                    track = tracking.optJSONObject(babyId + ":" + lastStartIso);
                }
                if (track != null && track.optBoolean("dismissed", false)) continue;

                String snoozeIso = track != null ? track.optString("snoozeUntilIso", "") : "";
                long snoozeUntil = parseIsoMs(snoozeIso);

                if (snoozeUntil > now) {
                    schedule(
                        app,
                        notifId,
                        snoozeUntil,
                        title,
                        "Snoozed — checking again in " + snoozeMinutes + " min",
                        babyId,
                        lastStartIso,
                        "feed-reminder-snooze"
                    );
                    continue;
                }

                boolean alerted = track != null && track.optBoolean("alerted", false);
                if (alerted) continue;

                long durationMs = now - lastMs;
                String duration = formatDuration(durationMs);

                if (durationMs >= thresholdMs) {
                    schedule(
                        app,
                        notifId,
                        now + 500L,
                        title,
                        "It's been " + duration + " since " + babyName + " last started nursing",
                        babyId,
                        lastStartIso,
                        "feed-reminder"
                    );
                } else if (dueAt > now) {
                    schedule(
                        app,
                        notifId,
                        dueAt,
                        title,
                        "Scheduled feed check-in",
                        babyId,
                        lastStartIso,
                        "feed-reminder-scheduled"
                    );
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "syncFromJson failed", e);
        }
    }

    static int reminderNotifId(String babyId) {
        int h = 0;
        for (int i = 0; i < babyId.length(); i++) {
            h = (h * 31 + babyId.charAt(i)) | 0;
        }
        return REMINDER_ID_BASE + (Math.abs(h) % REMINDER_ID_SPAN);
    }

    private static void schedule(
        Context context,
        int id,
        long atMs,
        String title,
        String body,
        String babyId,
        String lastStartIso,
        String kind
    ) {
        android.content.Intent intent = new android.content.Intent(context, FeedReminderAlarmReceiver.class);
        intent.setAction(FeedReminderAlarmReceiver.ACTION_FIRE);
        intent.putExtra(FeedReminderAlarmReceiver.EXTRA_ID, id);
        intent.putExtra(FeedReminderAlarmReceiver.EXTRA_TITLE, title);
        intent.putExtra(FeedReminderAlarmReceiver.EXTRA_BODY, body);
        intent.putExtra(FeedReminderAlarmReceiver.EXTRA_BABY_ID, babyId);
        intent.putExtra(FeedReminderAlarmReceiver.EXTRA_LAST_START_ISO, lastStartIso);
        intent.putExtra(FeedReminderAlarmReceiver.EXTRA_KIND, kind);

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
        android.content.Intent intent = new android.content.Intent(context, FeedReminderAlarmReceiver.class);
        intent.setAction(FeedReminderAlarmReceiver.ACTION_FIRE);
        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
        }
        android.app.PendingIntent pending =
            android.app.PendingIntent.getBroadcast(context, id, intent, flags);
        android.app.AlarmManager am = context.getSystemService(android.app.AlarmManager.class);
        if (am != null) am.cancel(pending);
        FeedReminderNotifier.dismiss(context, id);
    }

    public static void cancelAll(Context context) {
        for (int i = 0; i < REMINDER_ID_SPAN; i++) {
            cancel(context, REMINDER_ID_BASE + i);
        }
    }

    private static String normalizeStartSecond(String iso) {
        long ms = parseIsoMs(iso);
        if (ms <= 0) return iso != null ? iso : "";
        java.text.SimpleDateFormat fmt =
            new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return fmt.format(new java.util.Date((ms / 1000L) * 1000L));
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
                java.text.SimpleDateFormat fmt = new java.text.SimpleDateFormat(pattern, Locale.US);
                fmt.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                java.util.Date d = fmt.parse(iso);
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
                /* try next */
            }
        }
        return -1;
    }

    private static String formatDuration(long ms) {
        long totalMinutes = Math.max(0, ms / 60_000L);
        long h = totalMinutes / 60;
        long m = totalMinutes % 60;
        if (h > 0 && m > 0) return String.format(Locale.US, "%dh %dm", h, m);
        if (h > 0) return String.format(Locale.US, "%dh", h);
        return String.format(Locale.US, "%dm", m);
    }
}
