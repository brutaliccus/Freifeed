package com.freifeed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class FeedReminderAlarmReceiver extends BroadcastReceiver {

    public static final String ACTION_FIRE = "com.freifeed.app.FEED_REMINDER_FIRE";

    public static final String EXTRA_ID = "id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_BABY_ID = "babyId";
    public static final String EXTRA_LAST_START_ISO = "lastStartIso";
    public static final String EXTRA_KIND = "kind";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_FIRE.equals(intent.getAction())) return;

        int id = intent.getIntExtra(EXTRA_ID, Integer.MIN_VALUE);
        if (id == Integer.MIN_VALUE) return;

        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String babyId = intent.getStringExtra(EXTRA_BABY_ID);
        String lastStartIso = intent.getStringExtra(EXTRA_LAST_START_ISO);
        String kind = intent.getStringExtra(EXTRA_KIND);

        FeedReminderNotifier.show(context, id, title, body, babyId, lastStartIso, kind, true);
        FeedReminderPlugin.dispatchShown(context, babyId, lastStartIso, kind);
    }
}
