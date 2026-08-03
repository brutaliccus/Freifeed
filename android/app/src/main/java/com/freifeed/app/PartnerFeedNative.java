package com.freifeed.app;

import android.content.Context;
import android.util.Log;

/**
 * Partner nursing session notifications — must work with the app closed (FCM + background poll).
 * No WebView / JS required.
 */
public final class PartnerFeedNative {

    private static final String TAG = "PartnerFeedNative";

    private PartnerFeedNative() {}

    public static void onSessionStarted(
        Context context,
        String feedingId,
        String babyId,
        String babyName,
        String startAtIso,
        String side,
        long startMs
    ) {
        if (babyId == null || babyId.isEmpty()) return;
        if (feedingId != null && FeedWatchState.readOwnedFeedingIds(context).contains(feedingId)) {
            return;
        }

        // Still-nursing threshold reminder — independent of live timer alert state.
        NursingSessionReminderScheduler.onPartnerSessionStarted(
            context,
            babyId,
            babyName,
            startAtIso,
            side,
            startMs
        );

        String sessionKey = babyId + ":" + normalizeStartSecond(startAtIso, startMs);
        if (FeedAlertStateStore.hasAlerted(context, sessionKey)) return;

        String title = (babyName != null && !babyName.isEmpty() ? babyName : "Baby") + " — nursing";
        String body = side != null && !side.isEmpty() ? side : "Feeding";
        int notifId = FeedWatchPlugin.feedNotifId(babyId);

        FeedProgressNotifier.show(
            context,
            notifId,
            title,
            body,
            true,
            babyId,
            feedingId,
            startMs
        );
        FeedAlertStateStore.markAlerted(context, sessionKey);
        FeedWatchPlugin.dispatchFeedShown(context, babyId, feedingId, startMs);
        Log.i(TAG, "session started " + babyId);
    }

    public static void onSessionEnded(
        Context context,
        String feedingId,
        String babyId,
        String babyName,
        String startAtIso,
        long startMs
    ) {
        if (babyId == null || babyId.isEmpty()) return;

        String sessionKey = babyId + ":" + normalizeStartSecond(startAtIso, startMs);
        int notifId = FeedWatchPlugin.feedNotifId(babyId);

        FeedProgressNotifier.dismiss(context, notifId);
        FeedAlertStateStore.removeAlerted(context, sessionKey);
        FeedAlertStateStore.clearBabySessions(context, babyId);
        NursingSessionReminderScheduler.onSessionEnded(context, babyId, startAtIso, startMs);

        String title = (babyName != null && !babyName.isEmpty() ? babyName : "Baby") + " — session ended";
        FeedProgressNotifier.showSessionEnded(context, notifId, title, "Feeding finished", babyId);
        FeedWatchPlugin.dispatchFeedEnded(context, babyId, feedingId, startMs);

        if (FeedWatchState.isEnabled(context)) {
            FeedWatchScheduler.scheduleUrgent(context);
            FeedWatchPoller.pollNow(context);
        }
        Log.i(TAG, "session ended " + babyId);
    }

    private static String normalizeStartSecond(String iso, long startMs) {
        if (iso != null && !iso.isEmpty()) {
            return iso.length() >= 19 ? iso.substring(0, 19) + "Z" : iso;
        }
        return String.valueOf((startMs / 1000L) * 1000L);
    }
}
