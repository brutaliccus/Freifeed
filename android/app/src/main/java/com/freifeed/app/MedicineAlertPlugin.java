package com.freifeed.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "MedicineAlert")
public class MedicineAlertPlugin extends Plugin {

    private static final String PREFS = "freifeed_medicine_alert_pending";
    private static final String PENDING_TAKEN = "pending_taken";
    private static final String PENDING_SHOWN = "pending_shown";

    /** Must match src/lib/nativeNotifications.ts MED_ID_BASE and span. */
    static final int MED_ID_BASE = 20_000;
    static final int MED_ID_SPAN = 8_000;

    private static MedicineAlertPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
        drainPendingEvents();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void show(PluginCall call) {
        Integer id = call.getInt("id");
        String title = call.getString("title", "");
        String body = call.getString("body", "");
        Boolean alert = call.getBoolean("alert", true);
        String medicineId = call.getString("medicineId", "");
        Double dueMs = call.getDouble("dueMs", 0.0);
        if (id == null) {
            call.reject("id is required");
            return;
        }
        long due = dueMs != null ? Math.round(dueMs) : 0L;
        MedicineAlertNotifier.show(
            getContext(),
            id,
            title,
            body,
            Boolean.TRUE.equals(alert),
            medicineId,
            due
        );
        call.resolve();
    }

    @PluginMethod
    public void scheduleAlarms(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null) {
            call.resolve();
            return;
        }
        Context ctx = getContext();
        for (int i = 0; i < items.length(); i++) {
            try {
                JSONObject raw = items.getJSONObject(i);
                JSObject item = JSObject.fromJSONObject(raw);
                Integer id = item.getInteger("id");
                Double atMs = item.getDouble("atMs");
                if (id == null || atMs == null) continue;
                String title = item.getString("title", "");
                String body = item.getString("body", "");
                String medicineId = item.getString("medicineId", "");
                long dueMs = Math.round(item.optDouble("dueMs", 0.0));
                MedicineAlertScheduler.schedule(
                    ctx,
                    id,
                    Math.round(atMs),
                    title,
                    body,
                    medicineId,
                    dueMs
                );
            } catch (Exception ignored) {
                /* skip malformed row */
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelScheduledInRange(PluginCall call) {
        Integer baseId = call.getInt("baseId");
        Integer count = call.getInt("count");
        if (baseId == null || count == null) {
            call.reject("baseId and count are required");
            return;
        }
        MedicineAlertScheduler.cancelAllInRange(getContext(), baseId, count);
        call.resolve();
    }

    @PluginMethod
    public void cancelScheduledIds(PluginCall call) {
        JSArray items = call.getArray("ids");
        if (items == null) {
            call.resolve();
            return;
        }
        Context ctx = getContext();
        for (int i = 0; i < items.length(); i++) {
            try {
                Integer id = items.getInt(i);
                if (id != null) {
                    MedicineAlertScheduler.cancel(ctx, id);
                }
            } catch (Exception ignored) {
                /* skip malformed id */
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void dismissDeliveredInRange(PluginCall call) {
        Integer baseId = call.getInt("baseId");
        Integer count = call.getInt("count");
        if (baseId == null || count == null) {
            call.reject("baseId and count are required");
            return;
        }
        MedicineAlertNotifier.dismissAllInRange(getContext(), baseId, count);
        call.resolve();
    }

    @PluginMethod
    public void syncAlertFiredFromWeb(PluginCall call) {
        String json = call.getString("json", "{}");
        MedicineAlertStateStore.applyMapJson(getContext(), json);
        call.resolve();
    }

    @PluginMethod
    public void getAlertFiredJson(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("json", MedicineAlertStateStore.getMapJson(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelLegacyLocalNotifications(PluginCall call) {
        call.resolve();
    }

    public static void dispatchMedicineTaken(Context context, String medicineId) {
        JSObject data = new JSObject();
        data.put("medicineId", medicineId);

        if (instance != null) {
            instance.notifyListeners("medicineAlertActionPerformed", data, true);
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(PENDING_TAKEN, data.toString()).apply();

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(launch);
        }
    }

    public static void dispatchAlertShown(Context context, String medicineId, long dueMs) {
        JSObject data = new JSObject();
        data.put("medicineId", medicineId);
        data.put("dueMs", dueMs);

        if (instance != null) {
            instance.notifyListeners("medicineAlertShown", data, true);
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(PENDING_SHOWN, data.toString()).apply();
    }

    private void drainPendingEvents() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String taken = prefs.getString(PENDING_TAKEN, null);
        if (taken != null) {
            prefs.edit().remove(PENDING_TAKEN).apply();
            try {
                notifyListeners("medicineAlertActionPerformed", new JSObject(taken), true);
            } catch (Exception ignored) {
                /* ignore */
            }
        }
        String shown = prefs.getString(PENDING_SHOWN, null);
        if (shown != null) {
            prefs.edit().remove(PENDING_SHOWN).apply();
            try {
                notifyListeners("medicineAlertShown", new JSObject(shown), true);
            } catch (Exception ignored) {
                /* ignore */
            }
        }
    }
}
