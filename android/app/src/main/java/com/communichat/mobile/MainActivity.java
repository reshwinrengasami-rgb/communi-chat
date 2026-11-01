package com.communichat.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SafeBrowsingResponse;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.widget.TextView;
import android.widget.FrameLayout;
import java.util.ArrayList;

public final class MainActivity extends Activity {
    private static final String APP_HOST = "connect-communichat.vercel.app";
    private static final String CLERK_HOST = "capital-malamute-794.accounts.dev";
    private static final String START_URL = "https://" + APP_HOST;
    private static final int MEDIA_PERMISSION_REQUEST = 51;

    private WebView webView;
    private TextView errorNotice;
    private PermissionRequest pendingMediaRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(13, 14, 20));
        getWindow().setNavigationBarColor(Color.rgb(13, 14, 20));
        createWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void createWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(13, 14, 20));
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view,
                    WebResourceRequest request
            ) {
                Uri uri = request.getUrl();
                if (isTrustedWebOrigin(uri)) {
                    return false;
                }

                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (android.content.ActivityNotFoundException ignored) {
                        showMessage("No browser is available to open this link.");
                    }
                }
                return true;
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    showMessage("Communichat couldn’t load. Check your internet connection and try again.");
                }
            }

            @Override
            public void onSafeBrowsingHit(
                    WebView view,
                    WebResourceRequest request,
                    int threatType,
                    SafeBrowsingResponse callback
            ) {
                callback.backToSafety(true);
            }
        });

        FrameLayout container = new FrameLayout(this);
        container.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        errorNotice = new TextView(this);
        errorNotice.setTextColor(Color.WHITE);
        errorNotice.setTextSize(16);
        errorNotice.setGravity(android.view.Gravity.CENTER);
        errorNotice.setPadding(32, 32, 32, 32);
        errorNotice.setBackgroundColor(Color.rgb(13, 14, 20));
        errorNotice.setVisibility(View.GONE);
        errorNotice.setOnClickListener(view -> {
            errorNotice.setVisibility(View.GONE);
            webView.loadUrl(START_URL);
        });
        container.addView(errorNotice, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleMediaPermissionRequest(request));
            }
        });

        setContentView(container);
    }

    private boolean isTrustedWebOrigin(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }

        String host = uri.getHost();
        return APP_HOST.equalsIgnoreCase(host)
                || CLERK_HOST.equalsIgnoreCase(host);
    }

    private void handleMediaPermissionRequest(PermissionRequest request) {
        if (pendingMediaRequest != null) {
            request.deny();
            return;
        }

        Uri origin = Uri.parse(request.getOrigin().toString());
        if (!isTrustedWebOrigin(origin)) {
            request.deny();
            return;
        }

        boolean requestsOnlyMedia = true;
        for (String resource : request.getResources()) {
            if (!PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                requestsOnlyMedia = false;
                break;
            }
        }

        if (!requestsOnlyMedia || request.getResources().length == 0) {
            request.deny();
            return;
        }

        if (hasRequestedMediaPermissions(request)) {
            request.grant(request.getResources());
            return;
        }

        ArrayList<String> missingPermissions = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                missingPermissions.add(Manifest.permission.CAMERA);
            }
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                missingPermissions.add(Manifest.permission.RECORD_AUDIO);
            }
        }
        pendingMediaRequest = request;
        requestPermissions(missingPermissions.toArray(new String[0]), MEDIA_PERMISSION_REQUEST);
    }

    private boolean hasRequestedMediaPermissions(PermissionRequest request) {
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != MEDIA_PERMISSION_REQUEST || pendingMediaRequest == null) {
            return;
        }

        PermissionRequest request = pendingMediaRequest;
        pendingMediaRequest = null;
        if (hasRequestedMediaPermissions(request)) {
            request.grant(request.getResources());
        } else {
            request.deny();
        }
    }

    private void showMessage(String message) {
        errorNotice.setText(message + "\n\nTap here to try again.");
        errorNotice.setVisibility(View.VISIBLE);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingMediaRequest != null) {
            pendingMediaRequest.deny();
            pendingMediaRequest = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
