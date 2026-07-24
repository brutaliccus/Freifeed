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

public final class AppUpdateNotifier {

    public static final String CHANNEL_ID = "freifeed_app_update_v1";
    private static final String CHANNEL_ID_SILENT = "freifeed_app_update_silent_v1";
    public static final int NOTIFICATION_ID = 40_001;

    private AppUpdateNotifier() {}

    public static void ensureChannel(Context context) {
        NotificationAlertPolicy.ensureChannelPair(
            context,
            CHANNEL_ID,
            CHANNEL_ID_SILENT,
            "App updates",
            "Notifies when a new Freifeed APK is available"
        );
    }

    public static void show(
        Context context,
        String title,
        String body,
        String releaseKey,
        String downloadUrl,
        String authToken
    ) {
        if (FreifeedAppVisibility.isInForeground()) {
            return;
        }

        ensureChannel(context);
        AppUpdatePendingStore.save(context, releaseKey, downloadUrl, authToken, title, body);

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent updateIntent = new Intent(context, AppUpdateActionReceiver.class);
        updateIntent.setAction(AppUpdateActionReceiver.ACTION_UPDATE_NOW);
        PendingIntent updatePending =
            PendingIntent.getBroadcast(context, NOTIFICATION_ID, updateIntent, pendingFlags);

        Intent dismissIntent = new Intent(context, AppUpdateActionReceiver.class);
        dismissIntent.setAction(AppUpdateActionReceiver.ACTION_DISMISS);
        dismissIntent.putExtra(AppUpdateActionReceiver.EXTRA_RELEASE_KEY, releaseKey);
        PendingIntent dismissPending =
            PendingIntent.getBroadcast(context, NOTIFICATION_ID + 1, dismissIntent, pendingFlags);

        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (openIntent != null) {
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openIntent.putExtra("url", "/?view=profile&tab=app");
        }
        PendingIntent contentPending =
            openIntent != null
                ? PendingIntent.getActivity(context, NOTIFICATION_ID + 2, openIntent, pendingFlags)
                : null;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_freifeed_notification)
            .setLargeIcon(bitmapFromDrawable(context, R.drawable.ic_freifeed_logo))
            .setColor(Color.parseColor("#c9a0b8"))
            .setContentTitle(title != null ? title : "Update available")
            .setContentText(body != null ? body : "A new version of Freifeed is ready.")
            .setStyle(
                new NotificationCompat.BigTextStyle()
                    .bigText(body != null ? body : "A new version of Freifeed is ready.")
            )
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setDeleteIntent(dismissPending)
            .addAction(0, "Update now", updatePending)
            .addAction(0, "Dismiss", dismissPending);

        NotificationAlertPolicy.applyPeekStyle(builder, true);

        if (contentPending != null) {
            builder.setContentIntent(contentPending);
        }

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
    }

    public static void dismiss(Context context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
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
