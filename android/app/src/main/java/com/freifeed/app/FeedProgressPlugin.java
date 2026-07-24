package com.freifeed.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FeedProgress")
public class FeedProgressPlugin extends Plugin {

    private static final String PREFS = "freifeed_feed_progress";
    private static final String PENDING_ACTION = "pending_action";

    /** Must match src/lib/nativeNotifications.ts FEED_ID_BASE span. */
    static final int FEED_ID_BASE = 31_000;

    private static FeedProgressPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
        drainPendingAction();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    /** Epoch ms for chronometer; Capacitor may not pass large doubles reliably. */
    private static long readStartedAtMs(PluginCall call) {
        String text = call.getString("startedAtMsText");
        if (text != null && !text.isEmpty()) {
            try {
                long parsed = Long.parseLong(text.trim());
                if (parsed > 0) return parsed;
            } catch (NumberFormatException ignored) {
                /* try numeric fields */
            }
        }
        JSObject data = call.getData();
        if (data != null && data.has("startedAtMs")) {
            try {
                long parsed = data.getLong("startedAtMs");
                if (parsed > 0) return parsed;
            } catch (Exception ignored) {
                /* try double */
            }
            try {
                double parsed = data.getDouble("startedAtMs");
                if (parsed > 0) return Math.round(parsed);
            } catch (Exception ignored) {
                /* fall through */
            }
        }
        Double started = call.getDouble("startedAtMs");
        if (started != null && started > 0) return Math.round(started);
        return System.currentTimeMillis();
    }

    @PluginMethod
    public void show(PluginCall call) {
        Integer id = call.getInt("id");
        String title = call.getString("title", "");
        String body = call.getString("body", "");
        Boolean alert = call.getBoolean("alert", false);
        String babyId = call.getString("babyId", "");
        String feedingId = call.getString("feedingId", "");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        if (babyId == null || babyId.isEmpty()) {
            call.reject("babyId is required");
            return;
        }
        long startMs = readStartedAtMs(call);
        FeedProgressNotifier.show(
            getContext(),
            id,
            title,
            body,
            Boolean.TRUE.equals(alert),
            babyId,
            feedingId,
            startMs
        );
        call.resolve();
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        FeedProgressNotifier.dismiss(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void dismissAll(PluginCall call) {
        FeedProgressNotifier.dismissAll(getContext(), FEED_ID_BASE, 100);
        call.resolve();
    }

    public static void dispatchFeedAction(Context context, String actionId, String babyId, String feedingId) {
        JSObject data = new JSObject();
        data.put("actionId", actionId);
        data.put("babyId", babyId);
        if (feedingId != null && !feedingId.isEmpty()) {
            data.put("feedingId", feedingId);
        }

        if (instance != null) {
            instance.notifyListeners("feedProgressActionPerformed", data, true);
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(PENDING_ACTION, data.toString()).apply();

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(launch);
        }
    }

    private void drainPendingAction() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PENDING_ACTION, null);
        if (raw == null) return;
        prefs.edit().remove(PENDING_ACTION).apply();
        try {
            JSObject data = new JSObject(raw);
            notifyListeners("feedProgressActionPerformed", data, true);
        } catch (Exception ignored) {
            /* ignore malformed pending payload */
        }
    }
}
