package com.freifeed.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;

import androidx.core.app.NotificationCompat;

/**
 * When Freifeed is open: post to the status bar only (no heads-up banner).
 * When another app is in front: allow peek / sound per channel settings.
 */
public final class NotificationAlertPolicy {

    private NotificationAlertPolicy() {}

    public static boolean shouldPeek(boolean wantsAlert) {
        return wantsAlert && !FreifeedAppVisibility.isInForeground();
    }

    public static void ensureChannelPair(
        Context context,
        String alertChannelId,
        String silentChannelId,
        String name,
        String description
    ) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        if (nm.getNotificationChannel(alertChannelId) == null) {
            NotificationChannel alert = new NotificationChannel(
                alertChannelId,
                name,
                NotificationManager.IMPORTANCE_HIGH
            );
            alert.setDescription(description);
            alert.enableVibration(true);
            alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(alert);
        }

        if (nm.getNotificationChannel(silentChannelId) == null) {
            NotificationChannel silent = new NotificationChannel(
                silentChannelId,
                name + " (in app)",
                NotificationManager.IMPORTANCE_LOW
            );
            silent.setDescription("Updates the notification shade while Freifeed is open");
            silent.enableVibration(false);
            silent.setSound(null, null);
            silent.setShowBadge(false);
            silent.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(silent);
        }
    }

    public static String channelId(String alertChannelId, String silentChannelId, boolean wantsAlert) {
        return shouldPeek(wantsAlert) ? alertChannelId : silentChannelId;
    }

    public static void applyPeekStyle(NotificationCompat.Builder builder, boolean peek) {
        builder.setSilent(!peek);
        builder.setPriority(
            peek ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_LOW
        );
        if (!peek) {
            builder.setDefaults(0);
            builder.setVibrate(null);
        }
    }
}
