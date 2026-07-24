package com.freifeed.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Schedules medicine dose alarms that show {@link MedicineAlertNotifier} when fired.
 */
public final class MedicineAlertScheduler {

    public static final String ACTION_FIRE = "com.freifeed.app.MEDICINE_ALERT_FIRE";

    public static final String EXTRA_ID = "id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_MEDICINE_ID = "medicineId";
    public static final String EXTRA_DUE_MS = "dueMs";

    private MedicineAlertScheduler() {}

    public static void schedule(
        Context context,
        int id,
        long atMs,
        String title,
        String body,
        String medicineId,
        long dueMs
    ) {
        Context app = context.getApplicationContext();
        AlarmManager am = app.getSystemService(AlarmManager.class);
        if (am == null) return;

        Intent intent = new Intent(app, MedicineAlertAlarmReceiver.class);
        intent.setAction(ACTION_FIRE);
        intent.putExtra(EXTRA_ID, id);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_BODY, body);
        intent.putExtra(EXTRA_MEDICINE_ID, medicineId);
        intent.putExtra(EXTRA_DUE_MS, dueMs);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getBroadcast(app, id, intent, flags);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pending);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, atMs, pending);
        }
    }

    public static void cancel(Context context, int id) {
        Context app = context.getApplicationContext();
        AlarmManager am = app.getSystemService(AlarmManager.class);
        if (am == null) return;

        Intent intent = new Intent(app, MedicineAlertAlarmReceiver.class);
        intent.setAction(ACTION_FIRE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getBroadcast(app, id, intent, flags);
        am.cancel(pending);
    }

    public static void cancelAllInRange(Context context, int baseId, int count) {
        for (int i = 0; i < count; i++) {
            cancel(context, baseId + i);
        }
    }
}
