package com.freifeed.app;

import android.net.Uri;
import android.text.InputType;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.EditText;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Themed JS alert/confirm/prompt for WebView (copy/paste, legacy prompts).
 */
public final class FreifeedWebChromeClient extends WebChromeClient {

    private final Bridge appBridge;
    private final BridgeWebChromeClient delegate;

    public FreifeedWebChromeClient(Bridge bridge, BridgeWebChromeClient delegate) {
        this.appBridge = bridge;
        this.delegate = delegate;
    }

    private static int dialogSidePaddingPx(WebView view) {
        float d = view.getContext().getResources().getDisplayMetrics().density;
        return Math.round(24 * d);
    }

    private static void stylePromptField(EditText input) {
        input.setTextColor(ContextCompat.getColor(input.getContext(), R.color.js_dialog_text));
        input.setHintTextColor(ContextCompat.getColor(input.getContext(), R.color.js_dialog_text_secondary));
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        int pad = Math.round(12 * input.getContext().getResources().getDisplayMetrics().density);
        input.setPadding(pad * 2, pad * 2, pad * 2, pad * 2);
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        delegate.onShowCustomView(view, callback);
    }

    @Override
    public void onHideCustomView() {
        delegate.onHideCustomView();
    }

    @Override
    public void onPermissionRequest(PermissionRequest request) {
        delegate.onPermissionRequest(request);
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        delegate.onGeolocationPermissionsShowPrompt(origin, callback);
    }

    @Override
    public boolean onShowFileChooser(
        WebView webView,
        ValueCallback<Uri[]> filePathCallback,
        FileChooserParams fileChooserParams
    ) {
        return delegate.onShowFileChooser(webView, filePathCallback, fileChooserParams);
    }

    @Override
    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
        return delegate.onConsoleMessage(consoleMessage);
    }

    @Override
    public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
        if (appBridge.getActivity().isFinishing()) {
            return true;
        }
        new AlertDialog.Builder(view.getContext(), R.style.FreifeedJsDialogTheme)
            .setMessage(message)
            .setPositiveButton(
                android.R.string.ok,
                (dialog, which) -> {
                    dialog.dismiss();
                    result.confirm();
                }
            )
            .setOnCancelListener(
                dialog -> {
                    dialog.dismiss();
                    result.cancel();
                }
            )
            .show();
        return true;
    }

    @Override
    public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
        if (appBridge.getActivity().isFinishing()) {
            return true;
        }
        new AlertDialog.Builder(view.getContext(), R.style.FreifeedJsDialogTheme)
            .setMessage(message)
            .setPositiveButton(
                android.R.string.ok,
                (dialog, which) -> {
                    dialog.dismiss();
                    result.confirm();
                }
            )
            .setNegativeButton(
                android.R.string.cancel,
                (dialog, which) -> {
                    dialog.dismiss();
                    result.cancel();
                }
            )
            .setOnCancelListener(
                dialog -> {
                    dialog.dismiss();
                    result.cancel();
                }
            )
            .show();
        return true;
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, final JsPromptResult result) {
        if (appBridge.getActivity().isFinishing()) {
            return true;
        }
        final EditText input = new EditText(view.getContext());
        stylePromptField(input);
        if (defaultValue != null) {
            input.setText(defaultValue);
            input.setSelection(defaultValue.length());
        }
        int side = dialogSidePaddingPx(view);
        input.setPadding(side, input.getPaddingTop(), side, input.getPaddingBottom());

        new AlertDialog.Builder(view.getContext(), R.style.FreifeedJsDialogTheme)
            .setMessage(message)
            .setView(input)
            .setPositiveButton(
                android.R.string.ok,
                (dialog, which) -> {
                    dialog.dismiss();
                    result.confirm(input.getText().toString().trim());
                }
            )
            .setNegativeButton(
                android.R.string.cancel,
                (dialog, which) -> {
                    dialog.dismiss();
                    result.cancel();
                }
            )
            .setOnCancelListener(
                dialog -> {
                    dialog.dismiss();
                    result.cancel();
                }
            )
            .show();
        return true;
    }
}
