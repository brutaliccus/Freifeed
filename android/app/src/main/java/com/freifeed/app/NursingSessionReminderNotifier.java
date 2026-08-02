package com.freifeed.app;

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
 * Native notification for long-running nursing timers.
 * Always uses the alerting channel — users often have Freifeed open but not looking
 * at the nursing timer, so silent-in-foreground would make these useless.
 */
public final class NursingSessionReminderNotifier {

    public static final String CHANNEL_ID = "freifeed_nursing_session_v2";

    private NursingSessionReminderNotifier() {}

    public static void ensureChannel(Context context) {
        android.app.NotificationManager nm =
            context.getSystemService(android.app.NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        android.app.NotificationChannel channel = new android.app.NotificationChannel(
            CHANNEL_ID,
            "Nursing timer reminders",
            android.app.NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Alerts when a nursing timer is still running");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
    }

    public static void show(
        Context context,
        int id,
        String title,
        String body,
        String sessionKey,
        boolean playAlert
    ) {
        ensureChannel(context);

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (openIntent != null) {
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }
        PendingIntent contentPending =
            openIntent != null ? PendingIntent.getActivity(context, id, openIntent, pendingFlags) : null;

        Intent dismissIntent = new Intent(context, NursingSessionReminderActionReceiver.class);
        dismissIntent.setAction(NursingSessionReminderActionReceiver.ACTION_DISMISS);
        dismissIntent.putExtra(NursingSessionReminderActionReceiver.EXTRA_NOTIFICATION_ID, id);
        dismissIntent.putExtra(NursingSessionReminderActionReceiver.EXTRA_SESSION_KEY, sessionKey);

        PendingIntent dismissPending =
            PendingIntent.getBroadcast(context, id + 50_000, dismissIntent, pendingFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_freifeed_notification)
            .setLargeIcon(bitmapFromDrawable(context, R.drawable.ic_freifeed_logo))
            .setColor(Color.parseColor("#c9a0b8"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSilent(!playAlert)
            .setDeleteIntent(dismissPending)
            .addAction(0, "Dismiss", dismissPending);

        if (playAlert) {
            builder.setDefaults(NotificationCompat.DEFAULT_ALL);
        }

        if (contentPending != null) {
            builder.setContentIntent(contentPending);
        }

        NotificationManagerCompat.from(context).notify(id, builder.build());
    }

    public static void dismiss(Context context, int id) {
        NotificationManagerCompat.from(context).cancel(id);
    }

    private static Bitmap bitmapFromDrawable(Context context, int drawableId) {
        Drawable drawable = AppCompatResources.getDrawable(context, drawableId);
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
