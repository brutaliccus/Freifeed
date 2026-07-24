package com.freifeed.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.Iterator;

/** Native copy of JS localStorage key freifeed-medicine-alert-fired (survives background alarms). */
public final class MedicineAlertStateStore {

    private static final String PREFS = "freifeed_medicine_alert_fired";

    private MedicineAlertStateStore() {}

    public static void markFired(Context context, String medicineId, long dueMs) {
        if (medicineId == null || medicineId.isEmpty()) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject map = readJson(prefs);
            long normalized = normalizeDueMs(dueMs);
            long prev = map.optLong(medicineId, Long.MIN_VALUE);
            if (prev != Long.MIN_VALUE && prev >= normalized) {
                return;
            }
            map.put(medicineId, normalized);
            prefs.edit().putString("map", map.toString()).apply();
        } catch (Exception ignored) {
            /* ignore */
        }
    }

    public static boolean shouldAlert(Context context, String medicineId, long dueMs) {
        if (medicineId == null || medicineId.isEmpty()) return true;
        try {
            long fired = readJson(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)).optLong(medicineId, Long.MIN_VALUE);
            if (fired == Long.MIN_VALUE) return true;
            return normalizeDueMs(fired) < normalizeDueMs(dueMs);
        } catch (Exception ignored) {
            return true;
        }
    }

    public static String getMapJson(Context context) {
        return readJson(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)).toString();
    }

    public static void applyMapJson(Context context, String json) {
        if (json == null || json.isEmpty()) return;
        try {
            JSONObject incoming = new JSONObject(json);
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject map = readJson(prefs);
            Iterator<String> keys = incoming.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                long due = incoming.optLong(key, Long.MIN_VALUE);
                if (due != Long.MIN_VALUE) {
                    long prev = map.optLong(key, Long.MIN_VALUE);
                    if (prev == Long.MIN_VALUE || due > prev) {
                        map.put(key, due);
                    }
                }
            }
            prefs.edit().putString("map", map.toString()).apply();
        } catch (Exception ignored) {
            /* ignore */
        }
    }

    private static long normalizeDueMs(long dueMs) {
        return (dueMs / 60_000L) * 60_000L;
    }

    private static JSONObject readJson(SharedPreferences prefs) {
        String raw = prefs.getString("map", "{}");
        try {
            return new JSONObject(raw != null ? raw : "{}");
        } catch (Exception e) {
            return new JSONObject();
        }
    }
}
