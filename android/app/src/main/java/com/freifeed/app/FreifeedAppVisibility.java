package com.freifeed.app;

/** True while MainActivity is in the foreground (user is inside Freifeed). */
public final class FreifeedAppVisibility {

    private static volatile boolean inForeground = false;

    private FreifeedAppVisibility() {}

    public static void setInForeground(boolean foreground) {
        inForeground = foreground;
    }

    public static boolean isInForeground() {
        return inForeground;
    }
}
