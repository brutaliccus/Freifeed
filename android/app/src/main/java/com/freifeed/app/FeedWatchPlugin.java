package com.freifeed.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "FeedWatch")
public class FeedWatchPlugin extends Plugin {

    private static final String TAG = "FeedWatchPlugin";
    private static final String PREFS = "freifeed_feed_watch_pending";
    private static final String PENDING_SHOWN = "pending_shown";
    private static final String PENDING_ENDED = "pending_ended";
    private static final String PENDING_APP_RESUMED = "pending_app_resumed";

    /** Must match nativeNotifications.ts FEED_ID_BASE span. */
    static final int FEED_ID_BASE = 31_000;

    private static FeedWatchPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
        drainPendingShown();
        drainPendingEnded();
        drainPendingAppResumed();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void setWatchConfig(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        String householdId = call.getString("householdId", "");
        String idToken = call.getString("idToken", "");
        String projectId = call.getString("projectId", "freifeed-3b861");
        JSArray ownedArr = call.getArray("ownedFeedingIds");
        Set<String> owned = new HashSet<>();
        if (ownedArr != null) {
            for (int i = 0; i < ownedArr.length(); i++) {
                try {
                    String id = ownedArr.getString(i);
                    if (id != null && !id.isEmpty()) owned.add(id);
                } catch (Exception ignored) {
                    /* skip */
                }
            }
        }

        FeedWatchState.save(getContext(), Boolean.TRUE.equals(enabled), householdId, idToken, projectId, owned);

        if (Boolean.TRUE.equals(enabled) && !householdId.isEmpty() && !idToken.isEmpty()) {
            FeedWatchScheduler.schedule(getContext(), FeedWatchPoller.initialPollDelayMs());
            final String regToken = idToken;
            new Thread(
                () -> {
                    try {
                        String fcm =
                            Tasks.await(
                                FirebaseMessaging.getInstance().getToken(),
                                30,
                                TimeUnit.SECONDS
                            );
                        registerTokenWithBackend(getContext(), fcm, regToken);
                    } catch (Exception e) {
                        Log.w(TAG, "setWatchConfig registerPushToken failed", e);
                    }
                }
            )
                .start();
        } else {
            FeedWatchScheduler.cancel(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void syncAlertSessionsFromWeb(PluginCall call) {
        String json = call.getString("json", "[]");
        FeedAlertStateStore.applyFromJson(getContext(), json);
        call.resolve();
    }

    @PluginMethod
    public void registerPushToken(PluginCall call) {
        String authToken = call.getString("authToken", "");
        if (authToken == null || authToken.isEmpty()) {
            authToken = FeedWatchState.read(getContext()).optString("idToken", "");
        }
        final String idToken = authToken;
        Tasks.call(
            () -> {
                String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 30, TimeUnit.SECONDS);
                registerTokenWithBackend(getContext(), token, idToken);
                return null;
            }
        )
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> call.reject("Failed to register push token", e));
    }

    @PluginMethod
    public void getPushToken(PluginCall call) {
        Tasks.call(
            () -> Tasks.await(FirebaseMessaging.getInstance().getToken(), 30, TimeUnit.SECONDS)
        )
            .addOnSuccessListener(
                token -> {
                    JSObject ret = new JSObject();
                    ret.put("token", token != null ? token : "");
                    call.resolve(ret);
                }
            )
            .addOnFailureListener(e -> call.reject("Failed to get push token", e));
    }

    static int feedNotifId(String babyId) {
        int h = 0;
        for (int i = 0; i < babyId.length(); i++) {
            h = (h * 31 + babyId.charAt(i)) | 0;
        }
        return FEED_ID_BASE + (Math.abs(h) % 100);
    }

    /** Re-register FCM when app returns to foreground (partner push). */
    static void maybeRegisterPushTokenFromStoredAuth(Context context) {
        JSONObject cfg = FeedWatchState.read(context);
        if (!cfg.optBoolean("enabled", false)) return;
        String idToken = cfg.optString("idToken", "");
        if (idToken.isEmpty()) return;
        new Thread(
            () -> {
                try {
                    String fcm =
                        Tasks.await(
                            FirebaseMessaging.getInstance().getToken(),
                            30,
                            TimeUnit.SECONDS
                        );
                    registerTokenWithBackend(context, fcm, idToken);
                } catch (Exception e) {
                    Log.w(TAG, "maybeRegisterPushToken failed", e);
                }
            }
        )
            .start();
    }

    static void registerTokenWithBackend(Context context, String token) {
        registerTokenWithBackend(context, token, null);
    }

    static void registerTokenWithBackend(Context context, String token, String authTokenOverride) {
        if (token == null || token.isEmpty()) return;
        JSONObject cfg = FeedWatchState.read(context);
        String idToken =
            authTokenOverride != null && !authTokenOverride.isEmpty()
                ? authTokenOverride
                : cfg.optString("idToken", "");
        String projectId = cfg.optString("projectId", "freifeed-3b861");
        if (idToken.isEmpty()) return;

        try {
            String url =
                "https://us-central1-" + projectId + ".cloudfunctions.net/registerPushToken";
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(20_000);
            conn.setReadTimeout(20_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Authorization", "Bearer " + idToken);

            JSONObject data = new JSONObject();
            data.put("token", token);
            JSONObject body = new JSONObject();
            body.put("data", data);

            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            java.io.InputStream stream =
                code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            StringBuilder responseBody = new StringBuilder();
            if (stream != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        responseBody.append(line);
                    }
                }
            }
            if (code < 200 || code >= 300) {
                Log.w(TAG, "registerPushToken HTTP " + code + " " + responseBody);
            } else {
                Log.i(TAG, "registerPushToken ok " + responseBody);
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "registerPushToken failed", e);
        }
    }

    static void dispatchFeedShown(Context context, String babyId, String feedingId, long startMs) {
        JSObject data = new JSObject();
        data.put("babyId", babyId);
        data.put("feedingId", feedingId);
        data.put("startAtMs", startMs);

        if (instance != null) {
            instance.notifyListeners("feedWatchShown", data, true);
            return;
        }

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PENDING_SHOWN, data.toString())
            .apply();
    }

    private void drainPendingShown() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PENDING_SHOWN, null);
        if (raw == null) return;
        prefs.edit().remove(PENDING_SHOWN).apply();
        try {
            notifyListeners("feedWatchShown", new JSObject(raw), true);
        } catch (Exception ignored) {
            /* ignore */
        }
    }

    static void dispatchFeedEnded(Context context, String babyId, String feedingId, long startAtMs) {
        JSObject data = new JSObject();
        data.put("babyId", babyId);
        if (feedingId != null && !feedingId.isEmpty()) {
            data.put("feedingId", feedingId);
        }
        data.put("startAtMs", startAtMs);

        if (instance != null) {
            instance.notifyListeners("feedWatchEnded", data, true);
            return;
        }

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PENDING_ENDED, data.toString())
            .apply();
    }

    private void drainPendingEnded() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PENDING_ENDED, null);
        if (raw == null) return;
        prefs.edit().remove(PENDING_ENDED).apply();
        try {
            notifyListeners("feedWatchEnded", new JSObject(raw), true);
        } catch (Exception ignored) {
            /* ignore */
        }
    }

    static void dispatchAppResumed(Context context) {
        if (instance != null) {
            instance.notifyListeners("appResumed", new JSObject(), true);
            return;
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(PENDING_APP_RESUMED, true)
            .apply();
    }

    private void drainPendingAppResumed() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(PENDING_APP_RESUMED, false)) return;
        prefs.edit().remove(PENDING_APP_RESUMED).apply();
        try {
            notifyListeners("appResumed", new JSObject(), true);
        } catch (Exception ignored) {
            /* ignore */
        }
    }
}
