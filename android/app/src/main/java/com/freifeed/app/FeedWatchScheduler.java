package com.freifeed.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class FeedWatchScheduler {

    public static final String ACTION_POLL = "com.freifeed.app.FEED_WATCH_POLL";

    private FeedWatchScheduler() {}

    /** Next background poll (partner feed fallback when FCM is delayed). */
    public static void schedule(Context context, long delayMs) {
        scheduleInternal(context, Math.max(delayMs, 5_000L));
    }

    /** Run listFeedings soon after FCM end (min ~1s). */
    public static void scheduleUrgent(Context context) {
        scheduleInternal(context, 1_000L);
    }

    private static void scheduleInternal(Context context, long delayMs) {
        Context app = context.getApplicationContext();
        AlarmManager am = app.getSystemService(AlarmManager.class);
        if (am == null) return;

        Intent intent = new Intent(app, FeedWatchPollReceiver.class);
        intent.setAction(ACTION_POLL);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getBroadcast(app, 90_001, intent, flags);

        long at = System.currentTimeMillis() + delayMs;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, at, pending);
        }
    }

    public static void cancel(Context context) {
        Context app = context.getApplicationContext();
        AlarmManager am = app.getSystemService(AlarmManager.class);
        if (am == null) return;

        Intent intent = new Intent(app, FeedWatchPollReceiver.class);
        intent.setAction(ACTION_POLL);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getBroadcast(app, 90_001, intent, flags);
        am.cancel(pending);
    }
}
