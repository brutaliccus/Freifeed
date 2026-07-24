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
 * Ongoing nursing timer notification: one alert when a session starts, then silent
 * in-place updates (same notification id) every second.
 */
public final class FeedProgressNotifier {

    public static final String CHANNEL_ID = "freifeed_feed_progress_v4";
    private static final String CHANNEL_ID_SILENT = "freifeed_feed_progress_silent_v1";
    private static final String ACTION_END_SESSION = FeedProgressActionReceiver.ACTION_END_SESSION;

    private FeedProgressNotifier() {}

    public static void ensureChannel(Context context) {
        NotificationAlertPolicy.ensureChannelPair(
            context,
            CHANNEL_ID,
            CHANNEL_ID_SILENT,
            "Feed in progress",
            "Live timer while a nursing session is in progress"
        );
    }

    public static void show(
        Context context,
        int id,
        String title,
        String body,
        boolean playAlert,
        String babyId,
        String feedingId,
        long startedAtMs
    ) {
        ensureChannel(context);
        boolean peek = NotificationAlertPolicy.shouldPeek(playAlert);
        String channelId = NotificationAlertPolicy.channelId(CHANNEL_ID, CHANNEL_ID_SILENT, playAlert);
        NotificationManagerCompat nm = NotificationManagerCompat.from(context);

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (openIntent != null) {
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openIntent.putExtra(FeedProgressActionReceiver.EXTRA_BABY_ID, babyId);
        }
        PendingIntent contentPending =
            openIntent != null ? PendingIntent.getActivity(context, id, openIntent, pendingFlags) : null;

        Intent endIntent = new Intent(context, FeedProgressActionReceiver.class);
        endIntent.setAction(ACTION_END_SESSION);
        endIntent.putExtra(FeedProgressActionReceiver.EXTRA_NOTIFICATION_ID, id);
        endIntent.putExtra(FeedProgressActionReceiver.EXTRA_BABY_ID, babyId);
        if (feedingId != null && !feedingId.isEmpty()) {
            endIntent.putExtra(FeedProgressActionReceiver.EXTRA_FEEDING_ID, feedingId);
        }
        PendingIntent endPending = PendingIntent.getBroadcast(context, id + 10_000, endIntent, pendingFlags);

        long when = startedAtMs > 0 ? startedAtMs : System.currentTimeMillis();
        String detail = body != null && !body.isEmpty() ? body : "Feeding";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_freifeed_notification)
            .setLargeIcon(bitmapFromDrawable(context, R.drawable.ic_freifeed_logo))
            .setColor(Color.parseColor("#c9a0b8"))
            .setContentTitle(title)
            .setContentText(detail)
            .setSubText(detail.contains("·") ? null : detail)
            .setWhen(when)
            .setShowWhen(false)
            .setUsesChronometer(true)
            .setChronometerCountDown(false)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, "End session", endPending);

        NotificationAlertPolicy.applyPeekStyle(builder, peek);

        if (contentPending != null) {
            builder.setContentIntent(contentPending);
        }

        Notification notification = builder.build();
        nm.notify(id, notification);
    }

    public static void dismiss(Context context, int id) {
        NotificationManagerCompat.from(context).cancel(id);
    }

    /** Brief alert when a partner ends a session (not ongoing). */
    public static void showSessionEnded(
        Context context,
        int id,
        String title,
        String body,
        String babyId
    ) {
        if (FreifeedAppVisibility.isInForeground()) {
            return;
        }

        ensureChannel(context);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (openIntent != null) {
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (babyId != null && !babyId.isEmpty()) {
                openIntent.putExtra(FeedProgressActionReceiver.EXTRA_BABY_ID, babyId);
            }
        }
        PendingIntent contentPending =
            openIntent != null ? PendingIntent.getActivity(context, id + 20_000, openIntent, pendingFlags) : null;

        String detail = body != null && !body.isEmpty() ? body : "Session ended";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_freifeed_notification)
            .setLargeIcon(bitmapFromDrawable(context, R.drawable.ic_freifeed_logo))
            .setColor(Color.parseColor("#c9a0b8"))
            .setContentTitle(title)
            .setContentText(detail)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setUsesChronometer(false)
            .setOngoing(false)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS);

        NotificationAlertPolicy.applyPeekStyle(builder, true);

        if (contentPending != null) {
            builder.setContentIntent(contentPending);
        }

        NotificationManagerCompat.from(context).notify(id, builder.build());
    }

    public static void dismissAll(Context context, int idBase, int idSpan) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        for (int i = 0; i < idSpan; i++) {
            nm.cancel(idBase + i);
        }
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
