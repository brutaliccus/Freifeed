package com.freifeed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class FeedWatchPollReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !FeedWatchScheduler.ACTION_POLL.equals(intent.getAction())) return;
        FeedWatchPoller.pollAndScheduleNext(context);
    }
}
