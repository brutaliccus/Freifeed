package com.freifeed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NursingSessionReminderActionReceiver extends BroadcastReceiver {

    public static final String ACTION_DISMISS = "com.freifeed.app.NURSING_SESSION_REMINDER_DISMISS";

    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_SESSION_KEY = "sessionKey";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        int id = intent.getIntExtra(EXTRA_NOTIFICATION_ID, Integer.MIN_VALUE);
        String sessionKey = intent.getStringExtra(EXTRA_SESSION_KEY);

        if (id != Integer.MIN_VALUE) {
            NursingSessionReminderNotifier.dismiss(context, id);
        }

        if (ACTION_DISMISS.equals(intent.getAction())) {
            NursingSessionReminderPlugin.dispatchDismiss(context, sessionKey);
        }
    }
}
