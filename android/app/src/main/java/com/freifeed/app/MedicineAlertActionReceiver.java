package com.freifeed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class MedicineAlertActionReceiver extends BroadcastReceiver {

    public static final String ACTION_MARK_TAKEN = "com.freifeed.app.MEDICINE_MARK_TAKEN";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_MEDICINE_ID = "medicineId";
    public static final String EXTRA_DUE_MS = "dueMs";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_MARK_TAKEN.equals(intent.getAction())) return;

        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, Integer.MIN_VALUE);
        String medicineId = intent.getStringExtra(EXTRA_MEDICINE_ID);
        if (medicineId == null || medicineId.isEmpty() || medicineId.startsWith("milk:") || medicineId.startsWith("apt:")) {
            return;
        }

        if (notificationId != Integer.MIN_VALUE) {
            MedicineAlertNotifier.dismiss(context, notificationId);
        }

        MedicineAlertPlugin.dispatchMedicineTaken(context, medicineId);
    }
}
