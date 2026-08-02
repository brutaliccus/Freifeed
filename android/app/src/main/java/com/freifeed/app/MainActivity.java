package com.freifeed.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor shell loading the hosted Freifeed PWA (remote URL).
 * Forces dark native chrome and themed JS dialogs so pickers/alerts match the app.
 */
public class MainActivity extends BridgeActivity {

    private static final int WEB_CHROME_ATTACH_MAX_TRIES = 40;

    private FreifeedWebChromeClient freifeedWebChromeClient;
    private int webChromeAttachAttempts;
    private boolean webChromeAttached;

    public MainActivity() {
        registerPlugin(FeedProgressPlugin.class);
        registerPlugin(MedicineAlertPlugin.class);
        registerPlugin(FeedWatchPlugin.class);
        registerPlugin(FeedReminderPlugin.class);
        registerPlugin(NursingSessionReminderPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
        super.onCreate(savedInstanceState);
        FreifeedAppVisibility.setInForeground(true);
        // BridgeActivity applies Capacitor's light AppCompat theme in super.onCreate — re-apply ours.
        setTheme(R.style.AppTheme_NoActionBar);
        applyFreifeedWindowChrome();
        webChromeAttachAttempts = 0;
        getWindow().getDecorView().post(this::attachFreifeedWebChromeClient);
        handlePendingAppUpdateIntent();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handlePendingAppUpdateIntent();
    }

    private void handlePendingAppUpdateIntent() {
        Intent intent = getIntent();
        if (intent == null || !intent.getBooleanExtra("freifeed_pending_app_update", false)) {
            return;
        }
        intent.removeExtra("freifeed_pending_app_update");
        getWindow()
            .getDecorView()
            .postDelayed(() -> AppUpdatePlugin.requestJsDownload(this), 300);
    }

    @Override
    public void onResume() {
        super.onResume();
        FreifeedAppVisibility.setInForeground(true);
        applyFreifeedWindowChrome();
        FeedWatchPlugin.dispatchAppResumed(this);
        FeedWatchPlugin.maybeRegisterPushTokenFromStoredAuth(this);
    }

    @Override
    public void onPause() {
        FreifeedAppVisibility.setInForeground(false);
        super.onPause();
    }

    private void attachFreifeedWebChromeClient() {
        if (webChromeAttached) {
            return;
        }
        Bridge bridge = getBridge();
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (bridge == null || webView == null) {
            if (webChromeAttachAttempts < WEB_CHROME_ATTACH_MAX_TRIES) {
                webChromeAttachAttempts++;
                getWindow().getDecorView().postDelayed(this::attachFreifeedWebChromeClient, 200);
            }
            return;
        }
        webChromeAttached = true;
        android.webkit.WebChromeClient currentChrome = webView.getWebChromeClient();
        if (freifeedWebChromeClient == null && currentChrome instanceof BridgeWebChromeClient) {
            freifeedWebChromeClient = new FreifeedWebChromeClient(bridge, (BridgeWebChromeClient) currentChrome);
        }
        if (freifeedWebChromeClient != null) {
            webView.setWebChromeClient(freifeedWebChromeClient);
        }
        applyFreifeedWindowChrome();
    }

    private void applyFreifeedWindowChrome() {
        var window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);

        int bg = ContextCompat.getColor(this, R.color.windowBackground);
        int status = ContextCompat.getColor(this, R.color.statusBar);
        int nav = ContextCompat.getColor(this, R.color.navBar);

        window.setBackgroundDrawableResource(R.color.windowBackground);
        window.setStatusBarColor(status);
        window.setNavigationBarColor(nav);

        WindowInsetsControllerCompat ctrl = WindowCompat.getInsetsController(window, window.getDecorView());
        if (ctrl != null) {
            ctrl.setAppearanceLightStatusBars(false);
            ctrl.setAppearanceLightNavigationBars(false);
        }

        window.getDecorView().setBackgroundColor(bg);

        android.view.View content = findViewById(android.R.id.content);
        if (content != null) {
            content.setBackgroundColor(bg);
        }
        Bridge bridge = getBridge();
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView != null) {
            webView.setBackgroundColor(bg);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            window.setStatusBarContrastEnforced(false);
        }
    }
}
