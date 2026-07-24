package com.freifeed.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;

import java.util.HashSet;
import java.util.Set;

/** Persisted feed session keys we already alerted (mirrors JS feedAlertState). */
public final class FeedAlertStateStore {

    private static final String PREFS = "freifeed_feed_alert_sessions";

    private FeedAlertStateStore() {}

    public static boolean hasAlerted(Context context, String sessionKey) {
        return readSet(context).contains(sessionKey);
    }

    public static void markAlerted(Context context, String sessionKey) {
        Set<String> keys = readSet(context);
        if (keys.add(sessionKey)) {
            writeSet(context, keys);
        }
    }

    public static void removeAlerted(Context context, String sessionKey) {
        Set<String> keys = readSet(context);
        if (keys.remove(sessionKey)) {
            writeSet(context, keys);
        }
    }

    public static boolean hasAnyAlertForBaby(Context context, String babyId) {
        if (babyId == null || babyId.isEmpty()) return false;
        String prefix = babyId + ":";
        for (String key : readSet(context)) {
            if (key.startsWith(prefix)) return true;
        }
        return false;
    }

    public static Set<String> getAlertedBabyIds(Context context) {
        Set<String> babies = new HashSet<>();
        for (String key : readSet(context)) {
            int idx = key.indexOf(':');
            if (idx > 0) {
                babies.add(key.substring(0, idx));
            }
        }
        return babies;
    }

    public static void clearBabySessions(Context context, String babyId) {
        if (babyId == null || babyId.isEmpty()) return;
        String prefix = babyId + ":";
        Set<String> keys = readSet(context);
        boolean changed = false;
        for (String key : new HashSet<>(keys)) {
            if (key.startsWith(prefix) && keys.remove(key)) {
                changed = true;
            }
        }
        if (changed) writeSet(context, keys);
    }

    public static void applyFromJson(Context context, String json) {
        if (json == null || json.isEmpty()) return;
        try {
            JSONArray arr = new JSONArray(json);
            Set<String> keys = readSet(context);
            boolean changed = false;
            for (int i = 0; i < arr.length(); i++) {
                String key = arr.optString(i, "");
                if (!key.isEmpty() && keys.add(key)) {
                    changed = true;
                }
            }
            if (changed) writeSet(context, keys);
        } catch (Exception ignored) {
            /* ignore */
        }
    }

    private static Set<String> readSet(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString("keys", "[]");
        Set<String> out = new HashSet<>();
        try {
            JSONArray arr = new JSONArray(raw != null ? raw : "[]");
            for (int i = 0; i < arr.length(); i++) {
                String key = arr.optString(i, "");
                if (!key.isEmpty()) out.add(key);
            }
        } catch (Exception ignored) {
            /* ignore */
        }
        return out;
    }

    private static void writeSet(Context context, Set<String> keys) {
        JSONArray arr = new JSONArray();
        for (String key : keys) {
            arr.put(key);
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("keys", arr.toString())
            .apply();
    }
}
