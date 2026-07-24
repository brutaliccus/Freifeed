package com.freifeed.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FeedReminder")
public class FeedReminderPlugin extends Plugin {

    private static final String PREFS = "freifeed_feed_reminder_pending";
    private static final String PENDING_SHOWN = "pending_shown";
    private static final String PENDING_DISMISS = "pending_dismiss";
    private static final String PENDING_SNOOZE = "pending_snooze";

    private static FeedReminderPlugin instance;

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
        FeedReminderScheduler.syncFromJson(getContext(), json);
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        FeedReminderScheduler.cancelAll(getContext());
        call.resolve();
    }

    static void dispatchShown(Context context, String babyId, String lastStartIso, String kind) {
        JSObject data = new JSObject();
        data.put("babyId", babyId != null ? babyId : "");
        data.put("lastStartIso", lastStartIso != null ? lastStartIso : "");
        data.put("kind", kind != null ? kind : "");
        notifyOrPending(context, "feedReminderShown", data, PENDING_SHOWN);
    }

    static void dispatchDismiss(Context context, String babyId, String lastStartIso) {
        JSObject data = new JSObject();
        data.put("babyId", babyId != null ? babyId : "");
        data.put("lastStartIso", lastStartIso != null ? lastStartIso : "");
        notifyOrPending(context, "feedReminderDismiss", data, PENDING_DISMISS);
    }

    static void dispatchSnooze(Context context, String babyId, String lastStartIso) {
        JSObject data = new JSObject();
        data.put("babyId", babyId != null ? babyId : "");
        data.put("lastStartIso", lastStartIso != null ? lastStartIso : "");
        notifyOrPending(context, "feedReminderSnooze", data, PENDING_SNOOZE);
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
        drainOne(prefs, PENDING_SHOWN, "feedReminderShown");
        drainOne(prefs, PENDING_DISMISS, "feedReminderDismiss");
        drainOne(prefs, PENDING_SNOOZE, "feedReminderSnooze");
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
