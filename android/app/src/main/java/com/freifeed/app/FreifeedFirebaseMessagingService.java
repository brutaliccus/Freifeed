package com.freifeed.app;

import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** FCM data messages for partner feed session start / end (native only, app may be closed). */
public class FreifeedFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "FreifeedFCM";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (data == null || data.isEmpty()) return;

        String type = data.get("type");
        Log.i(TAG, "FCM data message: " + type);

        if ("feed_started".equals(type)) {
            new Thread(() -> deliverFeedStarted(data)).start();
        } else if ("feed_ended".equals(type)) {
            new Thread(() -> deliverFeedEnded(data)).start();
        }
    }

    private void deliverFeedStarted(Map<String, String> data) {
        String feedingId = data.get("feedingId");
        String babyId = data.get("babyId");
        String babyName = data.get("babyName");
        String startAtIso = data.get("startAtIso");
        String side = data.get("side");
        long startMs = parseStartMs(data.get("startAtMs"));

        PartnerFeedNative.onSessionStarted(
            getApplicationContext(),
            feedingId,
            babyId,
            babyName,
            startAtIso,
            side,
            startMs
        );
    }

    private void deliverFeedEnded(Map<String, String> data) {
        String feedingId = data.get("feedingId");
        String babyId = data.get("babyId");
        String babyName = data.get("babyName");
        String startAtIso = data.get("startAtIso");
        long startMs = parseStartMs(data.get("startAtMs"));

        PartnerFeedNative.onSessionEnded(
            getApplicationContext(),
            feedingId,
            babyId,
            babyName,
            startAtIso,
            startMs
        );
    }

    @Override
    public void onNewToken(@NonNull String token) {
        Log.d(TAG, "FCM token refreshed");
        FeedWatchPlugin.registerTokenWithBackend(getApplicationContext(), token);
    }

    private static long parseStartMs(String raw) {
        try {
            return Long.parseLong(raw);
        } catch (Exception e) {
            return System.currentTimeMillis();
        }
    }
}
