package com.freifeed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Handles "End session" on the ongoing feed notification without opening the app UI first.
 */
public class FeedProgressActionReceiver extends BroadcastReceiver {

    public static final String ACTION_END_SESSION = "com.freifeed.app.FEED_END_SESSION";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_BABY_ID = "babyId";
    public static final String EXTRA_FEEDING_ID = "feedingId";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_END_SESSION.equals(intent.getAction())) return;

        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, Integer.MIN_VALUE);
        String babyId = intent.getStringExtra(EXTRA_BABY_ID);
        String feedingId = intent.getStringExtra(EXTRA_FEEDING_ID);
        if (babyId == null || babyId.isEmpty()) return;

        if (notificationId != Integer.MIN_VALUE) {
            FeedProgressNotifier.dismiss(context, notificationId);
        }

        FeedProgressPlugin.dispatchFeedAction(context, "end-session", babyId, feedingId);
    }
}
