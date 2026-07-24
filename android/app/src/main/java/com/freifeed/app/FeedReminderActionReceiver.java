package com.freifeed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class FeedReminderActionReceiver extends BroadcastReceiver {

    public static final String ACTION_DISMISS = "com.freifeed.app.FEED_REMINDER_DISMISS";
    public static final String ACTION_SNOOZE = "com.freifeed.app.FEED_REMINDER_SNOOZE";

    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_BABY_ID = "babyId";
    public static final String EXTRA_LAST_START_ISO = "lastStartIso";
    public static final String EXTRA_KIND = "kind";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        int id = intent.getIntExtra(EXTRA_NOTIFICATION_ID, Integer.MIN_VALUE);
        String babyId = intent.getStringExtra(EXTRA_BABY_ID);
        String lastStartIso = intent.getStringExtra(EXTRA_LAST_START_ISO);
        String kind = intent.getStringExtra(EXTRA_KIND);

        if (id != Integer.MIN_VALUE) {
            FeedReminderNotifier.dismiss(context, id);
        }

        String action = intent.getAction();
        if (ACTION_DISMISS.equals(action)) {
            FeedReminderPlugin.dispatchDismiss(context, babyId, lastStartIso);
        } else if (ACTION_SNOOZE.equals(action)) {
            FeedReminderPlugin.dispatchSnooze(context, babyId, lastStartIso);
        }
    }
}
