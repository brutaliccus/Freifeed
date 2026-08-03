package com.freifeed.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;

import java.util.HashSet;
import java.util.Set;

/** Persisted nursing-timer-reminder settings + alerted session keys (native). */
public final class NursingSessionReminderState {

    private static final String PREFS = "freifeed_nursing_session_reminder";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_THRESHOLD_MS = "thresholdMs";
    private static final String KEY_ALERTED = "alertedKeys";
    private static final String KEY_WEB_SESSIONS = "webSessionKeys";

    private NursingSessionReminderState() {}

    public static void saveConfig(Context context, boolean enabled, long thresholdMs) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putLong(KEY_THRESHOLD_MS, Math.max(0L, thresholdMs))
            .apply();
    }

    public static Set<String> readWebSessionKeys(Context context) {
        return readStringSet(context, KEY_WEB_SESSIONS);
    }

    public static void saveWebSessionKeys(Context context, Set<String> keys) {
        writeStringSet(context, KEY_WEB_SESSIONS, keys != null ? keys : new HashSet<>());
    }

    public static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_ENABLED, false);
    }

    public static long thresholdMs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getLong(KEY_THRESHOLD_MS, 0L);
    }

    public static boolean hasAlerted(Context context, String sessionKey) {
        if (sessionKey == null || sessionKey.isEmpty()) return false;
        return readAlerted(context).contains(sessionKey);
    }

    public static void markAlerted(Context context, String sessionKey) {
        if (sessionKey == null || sessionKey.isEmpty()) return;
        Set<String> keys = readAlerted(context);
        if (keys.add(sessionKey)) {
            writeAlerted(context, keys);
        }
    }

    public static void clearAlerted(Context context, String sessionKey) {
        if (sessionKey == null || sessionKey.isEmpty()) return;
        Set<String> keys = readAlerted(context);
        if (keys.remove(sessionKey)) {
            writeAlerted(context, keys);
        }
    }

    public static void clearAlertedForBaby(Context context, String babyId) {
        if (babyId == null || babyId.isEmpty()) return;
        String prefix = babyId + ":";
        Set<String> keys = readAlerted(context);
        boolean changed = false;
        for (String key : new HashSet<>(keys)) {
            if (key.startsWith(prefix) && keys.remove(key)) {
                changed = true;
            }
        }
        if (changed) writeAlerted(context, keys);
    }

    public static void mergeAlertedKeys(Context context, Set<String> incoming) {
        if (incoming == null || incoming.isEmpty()) return;
        Set<String> keys = readAlerted(context);
        boolean changed = false;
        for (String key : incoming) {
            if (key != null && !key.isEmpty() && keys.add(key)) {
                changed = true;
            }
        }
        if (changed) writeAlerted(context, keys);
    }

    public static void pruneAlerted(Context context, Set<String> activeKeys) {
        Set<String> keys = readAlerted(context);
        boolean changed = false;
        for (String key : new HashSet<>(keys)) {
            if (!activeKeys.contains(key) && keys.remove(key)) {
                changed = true;
            }
        }
        if (changed) writeAlerted(context, keys);
    }

    private static Set<String> readAlerted(Context context) {
        return readStringSet(context, KEY_ALERTED);
    }

    private static void writeAlerted(Context context, Set<String> keys) {
        writeStringSet(context, KEY_ALERTED, keys);
    }

    private static Set<String> readStringSet(Context context, String key) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(key, "[]");
        Set<String> out = new HashSet<>();
        try {
            JSONArray arr = new JSONArray(raw != null ? raw : "[]");
            for (int i = 0; i < arr.length(); i++) {
                String value = arr.optString(i, "");
                if (!value.isEmpty()) out.add(value);
            }
        } catch (Exception ignored) {
            /* ignore */
        }
        return out;
    }

    private static void writeStringSet(Context context, String key, Set<String> values) {
        JSONArray arr = new JSONArray();
        for (String value : values) {
            arr.put(value);
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(key, arr.toString())
            .apply();
    }
}
