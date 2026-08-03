package com.freifeed.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Capacitor bridge for "nursing timer still running" AlarmManager reminders. */
@CapacitorPlugin(name = "NursingSessionReminder")
public class NursingSessionReminderPlugin extends Plugin {

    private static final String PREFS = "freifeed_nursing_session_reminder_pending";
    private static final String PENDING_SHOWN = "pending_shown";
    private static final String PENDING_DISMISS = "pending_dismiss";

    private static NursingSessionReminderPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
        drainPending();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void syncReminders(PluginCall call) {
        String json = call.getString("json", "null");
        NursingSessionReminderScheduler.syncFromJson(getContext(), json);
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        NursingSessionReminderState.saveConfig(getContext(), false, 0L);
        NursingSessionReminderScheduler.cancelAll(getContext());
        call.resolve();
    }

    static void dispatchShown(Context context, String sessionKey) {
        JSObject data = new JSObject();
        data.put("sessionKey", sessionKey != null ? sessionKey : "");
        notifyOrPending(context, "nursingSessionReminderShown", data, PENDING_SHOWN);
    }

    static void dispatchDismiss(Context context, String sessionKey) {
        JSObject data = new JSObject();
        data.put("sessionKey", sessionKey != null ? sessionKey : "");
        notifyOrPending(context, "nursingSessionReminderDismiss", data, PENDING_DISMISS);
    }

    private static void notifyOrPending(
        Context context,
        String event,
        JSObject data,
        String pendingKey
    ) {
        if (instance != null) {
            instance.notifyListeners(event, data, true);
            return;
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(pendingKey, data.toString())
            .apply();
    }

    private void drainPending() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        drainOne(prefs, PENDING_SHOWN, "nursingSessionReminderShown");
        drainOne(prefs, PENDING_DISMISS, "nursingSessionReminderDismiss");
    }

    private void drainOne(SharedPreferences prefs, String key, String event) {
        String raw = prefs.getString(key, null);
        if (raw == null) return;
        prefs.edit().remove(key).apply();
        try {
            notifyListeners(event, new JSObject(raw), true);
        } catch (Exception ignored) {
            /* ignore */
        }
    }
}
