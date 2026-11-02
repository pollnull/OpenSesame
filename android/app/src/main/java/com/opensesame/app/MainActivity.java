package com.opensesame.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String PICKED = "/picked/";
    private static final int PICK_FILES = 1;
    private static final int SAVE_FILE = 2;
    private WebView webView;
    private byte[] pendingSave;
    private String insetsScript;
    // Files the person picked this session, by random token. Only these exact URIs can be read or deleted.
    private final Map<String, Uri> picked = new ConcurrentHashMap<>();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // No screenshots, screen recording or recent-apps thumbnail of the vault (kept off in debug builds for testing).
        if (!BuildConfig.DEBUG) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        int background = Color.rgb(14, 15, 18); // --bg in web/index.html
        webView = new WebView(this);
        FrameLayout content = new FrameLayout(this);
        content.setBackgroundColor(background);
        content.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        webView.setBackgroundColor(background);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        webView.addJavascriptInterface(new Bridge(), "OpenSesameAndroid");
        // The app has no INTERNET permission; the bundled page is served from assets on a secure origin.
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String path = url.getPath();
                if (!HOST.equals(url.getHost()) || path == null) return notFound();
                if (path.startsWith(PICKED)) return pickedFile(path.substring(PICKED.length()));
                if (path.equals("/")) path = "/index.html";
                boolean font = path.endsWith(".woff2");
                String mime = font ? "font/woff2" : path.endsWith(".js") ? "text/javascript" : "text/html";
                try {
                    return new WebResourceResponse(mime, font ? null : "UTF-8", getAssets().open(path.substring(1)));
                } catch (IOException error) {
                    return notFound();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                applyInsets();
            }
        });
        // Edge to edge: the page paints behind transparent system bars and pads itself with --inset-* values.
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            content.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom;
                // The keyboard still pushes the page up; while it is open it also covers the navigation bar.
                view.setPadding(0, 0, 0, keyboard);
                float density = getResources().getDisplayMetrics().density;
                insetsScript = String.format(Locale.ROOT,
                    "(function(s){s.setProperty('--inset-top','%.1fpx');s.setProperty('--inset-right','%.1fpx');"
                        + "s.setProperty('--inset-bottom','%.1fpx');s.setProperty('--inset-left','%.1fpx')})"
                        + "(document.documentElement.style)",
                    bars.top / density, bars.right / density, keyboard > 0 ? 0 : bars.bottom / density, bars.left / density);
                applyInsets();
                return insets;
            });
            getWindow().getInsetsController().setSystemBarsAppearance(
                0,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        setContentView(content);
        if (state == null || webView.restoreState(state) == null) webView.loadUrl("https://" + HOST + "/");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    // Back closes the open sheet or dialog first; only an empty screen leaves the app.
    private void handleBack() {
        webView.evaluateJavascript("window.handleBack ? handleBack() : false", handled -> {
            if (!"true".equals(handled)) moveTaskToBack(true);
        });
    }

    private void applyInsets() {
        if (insetsScript != null) webView.evaluateJavascript(insetsScript, null);
    }

    // The page words the result in the phone's language.
    private void notifySave(String state) {
        webView.evaluateJavascript("window.notifySave && notifySave(" + JSONObject.quote(state) + ")", null);
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    // Streams a picked file to the page, so its bytes never pass through the JavaScript bridge.
    private WebResourceResponse pickedFile(String token) {
        Uri uri = picked.get(token);
        if (uri == null) return notFound();
        try {
            return new WebResourceResponse("application/octet-stream", null, getContentResolver().openInputStream(uri));
        } catch (IOException | SecurityException error) {
            return notFound();
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void pick() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*")
                    .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                startActivityForResult(intent, PICK_FILES);
            });
        }

        // Deletes exactly the document the person picked, and only if its content still has the SHA-256
        // the page verified against the encrypted copy (another app may have changed it meanwhile).
        @JavascriptInterface
        public boolean deleteOriginal(String token, String hash) {
            Uri uri = picked.remove(token);
            if (uri == null || hash == null) return false;
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    byte[] buffer = new byte[65536];
                    for (int read; (read = in.read(buffer)) > 0; ) digest.update(buffer, 0, read);
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
                if (!hex.toString().equals(hash)) return false;
                return DocumentsContract.deleteDocument(getContentResolver(), uri);
            } catch (Exception error) {
                return false;
            }
        }

        @JavascriptInterface
        public void save(String name, String mime, String base64) {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            runOnUiThread(() -> {
                pendingSave = bytes;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mime)
                    .putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(intent, SAVE_FILE);
            });
        }
    }

    private JSONObject describe(Uri uri) throws JSONException {
        String token = UUID.randomUUID().toString();
        picked.put(token, uri);
        JSONObject file = new JSONObject().put("token", token).put("name", "archivo").put("size", -1);
        String type = getContentResolver().getType(uri);
        file.put("type", type == null ? "" : type);
        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int name = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int size = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (name >= 0 && !cursor.isNull(name)) file.put("name", cursor.getString(name));
                if (size >= 0 && !cursor.isNull(size)) file.put("size", cursor.getLong(size));
            }
        }
        return file;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        Uri single = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (requestCode == PICK_FILES) {
            List<Uri> uris = new ArrayList<>();
            ClipData clip = resultCode == RESULT_OK && data != null ? data.getClipData() : null;
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
            } else if (single != null) {
                uris.add(single);
            }
            JSONArray files = new JSONArray();
            for (Uri uri : uris) {
                try {
                    files.put(describe(uri));
                } catch (JSONException | SecurityException error) {
                    // Skip a file we cannot describe; the others still go through.
                }
            }
            if (files.length() > 0) webView.evaluateJavascript("window.onPicked && onPicked(" + files + ")", null);
        } else if (requestCode == SAVE_FILE) {
            if (single == null || pendingSave == null) {
                notifySave("cancelled");
            } else {
                boolean saved;
                try (OutputStream out = getContentResolver().openOutputStream(single)) {
                    out.write(pendingSave);
                    saved = true;
                } catch (IOException | NullPointerException error) {
                    saved = false;
                }
                // Reported only once the stream is closed, so a failed close is not announced as saved.
                notifySave(saved ? "completed" : "failed");
            }
            if (pendingSave != null) java.util.Arrays.fill(pendingSave, (byte) 0);
            pendingSave = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        webView.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
