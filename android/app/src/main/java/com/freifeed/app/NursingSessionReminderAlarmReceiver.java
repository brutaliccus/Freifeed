package com.freifeed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NursingSessionReminderAlarmReceiver extends BroadcastReceiver {

    public static final String ACTION_FIRE = "com.freifeed.app.NURSING_SESSION_REMINDER_FIRE";

    public static final String EXTRA_ID = "id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_SESSION_KEY = "sessionKey";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_FIRE.equals(intent.getAction())) return;

        int id = intent.getIntExtra(EXTRA_ID, Integer.MIN_VALUE);
        if (id == Integer.MIN_VALUE) return;

        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String sessionKey = intent.getStringExtra(EXTRA_SESSION_KEY);

        NursingSessionReminderNotifier.show(context, id, title, body, sessionKey, true);
        if (sessionKey != null && !sessionKey.isEmpty()) {
            NursingSessionReminderState.markAlerted(context, sessionKey);
        }
        NursingSessionReminderPlugin.dispatchShown(context, sessionKey);
    }
}
