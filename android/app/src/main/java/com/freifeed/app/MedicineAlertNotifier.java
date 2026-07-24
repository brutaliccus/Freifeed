package com.freifeed.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Build;

import androidx.appcompat.content.res.AppCompatResources;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Medicine dose alert (Android). Stays visible until the user acts — no auto-dismiss timer
 * (the in-app banner handles the 5s dismiss UX).
 */
public final class MedicineAlertNotifier {

    public static final String CHANNEL_ID = "freifeed_medicine_v5";
    private static final String CHANNEL_ID_SILENT = "freifeed_medicine_silent_v1";
    public static final String MILK_CHANNEL_ID = "freifeed_milk_expiry_v1";
    private static final String MILK_CHANNEL_ID_SILENT = "freifeed_milk_expiry_silent_v1";

    private MedicineAlertNotifier() {}

    private static boolean isMilkAlert(String medicineId) {
        return medicineId != null && medicineId.startsWith("milk:");
    }

    private static boolean isAppointmentAlert(String medicineId) {
        return medicineId != null && medicineId.startsWith("apt:");
    }

    /** Title prefix fallback for alarms scheduled before apt: ids were used. */
    private static boolean isAppointmentOrReminderTitle(String title) {
        if (title == null) return false;
        String t = title.trim();
        return t.startsWith("Appointment —") || t.startsWith("Reminder —");
    }

    private static boolean isAppointmentOrReminderAlert(String medicineId, String title) {
        return isAppointmentAlert(medicineId) || isAppointmentOrReminderTitle(title);
    }

    private static boolean skipTakenAction(String medicineId, String title) {
        return isMilkAlert(medicineId) || isAppointmentOrReminderAlert(medicineId, title);
    }

    public static void ensureChannel(Context context) {
        NotificationAlertPolicy.ensureChannelPair(
            context,
            CHANNEL_ID,
            CHANNEL_ID_SILENT,
            "Medicine reminders",
            "Alerts when a medicine dose is due"
        );
    }

    public static void ensureMilkChannel(Context context) {
        NotificationAlertPolicy.ensureChannelPair(
            context,
            MILK_CHANNEL_ID,
            MILK_CHANNEL_ID_SILENT,
            "Milk expiration",
            "Alerts when stored milk is expiring or expired"
        );
    }

    public static void show(
        Context context,
        int id,
        String title,
        String body,
        boolean playAlert,
        String medicineId,
        long dueMs
    ) {
        boolean milk = isMilkAlert(medicineId);
        boolean appointment = isAppointmentOrReminderAlert(medicineId, title);
        if (milk) {
            ensureMilkChannel(context);
        } else {
            ensureChannel(context);
        }
        boolean peek = NotificationAlertPolicy.shouldPeek(playAlert);
        String channelId = milk
            ? NotificationAlertPolicy.channelId(MILK_CHANNEL_ID, MILK_CHANNEL_ID_SILENT, playAlert)
            : NotificationAlertPolicy.channelId(CHANNEL_ID, CHANNEL_ID_SILENT, playAlert);

        if (medicineId != null && !medicineId.isEmpty() && dueMs > 0) {
            if (!MedicineAlertStateStore.shouldAlert(context, medicineId, dueMs)) {
                return;
            }
            MedicineAlertStateStore.markFired(context, medicineId, dueMs);
            MedicineAlertPlugin.dispatchAlertShown(context, medicineId, dueMs);
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (openIntent != null) {
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            String url = milk ? "/?view=milk" : appointment ? "/?view=notes" : "/?view=medicines";
            openIntent.putExtra("url", url);
        }
        PendingIntent contentPending =
            openIntent != null ? PendingIntent.getActivity(context, id, openIntent, pendingFlags) : null;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_freifeed_notification)
            .setLargeIcon(bitmapFromDrawable(context, R.drawable.ic_freifeed_logo))
            .setColor(Color.parseColor("#c9a0b8"))
            .setContentTitle(title != null ? title : (milk ? "Milk expiration" : "Medicine due"))
            .setContentText(body != null ? body : "")
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true);

        if (!skipTakenAction(medicineId, title)) {
            Intent takenIntent = new Intent(context, MedicineAlertActionReceiver.class);
            takenIntent.setAction(MedicineAlertActionReceiver.ACTION_MARK_TAKEN);
            takenIntent.putExtra(MedicineAlertActionReceiver.EXTRA_NOTIFICATION_ID, id);
            takenIntent.putExtra(MedicineAlertActionReceiver.EXTRA_MEDICINE_ID, medicineId);
            takenIntent.putExtra(MedicineAlertActionReceiver.EXTRA_DUE_MS, dueMs);
            PendingIntent takenPending = PendingIntent.getBroadcast(context, id + 50_000, takenIntent, pendingFlags);
            builder.addAction(0, "I took it", takenPending);
        }

        NotificationAlertPolicy.applyPeekStyle(builder, peek);

        if (contentPending != null) {
            builder.setContentIntent(contentPending);
        }

        NotificationManagerCompat.from(context).notify(id, builder.build());
    }

    public static void dismiss(Context context, int id) {
        NotificationManagerCompat.from(context).cancel(id);
    }

    public static void dismissAllInRange(Context context, int baseId, int count) {
        for (int i = 0; i < count; i++) {
            dismiss(context, baseId + i);
        }
    }

    private static Bitmap bitmapFromDrawable(Context context, int resId) {
        Drawable drawable = AppCompatResources.getDrawable(context, resId);
        if (drawable == null) return null;
        int w = Math.max(drawable.getIntrinsicWidth(), 1);
        int h = Math.max(drawable.getIntrinsicHeight(), 1);
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);
        return bitmap;
    }
}
