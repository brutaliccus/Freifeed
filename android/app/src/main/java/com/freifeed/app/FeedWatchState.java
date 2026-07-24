package com.freifeed.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/** Background feed watch credentials + owned feeding ids (skip self-started sessions). */
public final class FeedWatchState {

    private static final String PREFS = "freifeed_feed_watch";

    private FeedWatchState() {}

    public static void save(
        Context context,
        boolean enabled,
        String householdId,
        String idToken,
        String projectId,
        Set<String> ownedFeedingIds
    ) {
        JSONArray owned = new JSONArray();
        if (ownedFeedingIds != null) {
            for (String id : ownedFeedingIds) {
                owned.put(id);
            }
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean("enabled", enabled)
            .putString("householdId", householdId != null ? householdId : "")
            .putString("idToken", idToken != null ? idToken : "")
            .putString("projectId", projectId != null ? projectId : "freifeed-3b861")
            .putString("ownedFeedingIds", owned.toString())
            .apply();
    }

    public static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false);
    }

    public static JSONObject read(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject out = new JSONObject();
        try {
            out.put("enabled", prefs.getBoolean("enabled", false));
            out.put("householdId", prefs.getString("householdId", ""));
            out.put("idToken", prefs.getString("idToken", ""));
            out.put("projectId", prefs.getString("projectId", "freifeed-3b861"));
            out.put("ownedFeedingIds", prefs.getString("ownedFeedingIds", "[]"));
        } catch (Exception ignored) {
            /* ignore */
        }
        return out;
    }

    public static Set<String> readOwnedFeedingIds(Context context) {
        Set<String> out = new HashSet<>();
        try {
            JSONArray arr = new JSONArray(read(context).optString("ownedFeedingIds", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                String id = arr.optString(i, "");
                if (!id.isEmpty()) out.add(id);
            }
        } catch (Exception ignored) {
            /* ignore */
        }
        return out;
    }
}
