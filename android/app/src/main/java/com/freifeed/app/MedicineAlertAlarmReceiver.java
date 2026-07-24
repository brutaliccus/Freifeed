package com.freifeed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Fires scheduled medicine dose alerts (custom notifier with 5s timer).
 */
public class MedicineAlertAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !MedicineAlertScheduler.ACTION_FIRE.equals(intent.getAction())) return;

        int id = intent.getIntExtra(MedicineAlertScheduler.EXTRA_ID, Integer.MIN_VALUE);
        if (id == Integer.MIN_VALUE) return;

        String title = intent.getStringExtra(MedicineAlertScheduler.EXTRA_TITLE);
        String body = intent.getStringExtra(MedicineAlertScheduler.EXTRA_BODY);
        String medicineId = intent.getStringExtra(MedicineAlertScheduler.EXTRA_MEDICINE_ID);
        long dueMs = intent.getLongExtra(MedicineAlertScheduler.EXTRA_DUE_MS, 0L);

        MedicineAlertNotifier.show(context, id, title, body, true, medicineId, dueMs);
    }
}
