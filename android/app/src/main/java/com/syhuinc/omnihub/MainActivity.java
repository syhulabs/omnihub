package com.syhuinc.omnihub;

import android.os.Bundle;
import android.view.View;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.syhuinc.omnihub.alarm.AlarmPlugin;
import com.syhuinc.omnihub.biometric.BiometricPlugin;
import com.syhuinc.omnihub.devicestats.DeviceStatsPlugin;
import com.syhuinc.omnihub.flashalert.FlashAlertPlugin;
import com.syhuinc.omnihub.keepawake.KeepAwakePlugin;
import com.syhuinc.omnihub.ringtone.RingtonePlugin;
import com.syhuinc.omnihub.sleepmode.SleepModePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlarmPlugin.class);
        registerPlugin(FlashAlertPlugin.class);
        registerPlugin(SleepModePlugin.class);
        registerPlugin(DeviceStatsPlugin.class);
        registerPlugin(RingtonePlugin.class);
        registerPlugin(KeepAwakePlugin.class);
        registerPlugin(BiometricPlugin.class);
        super.onCreate(savedInstanceState);

        // The app's CSS relies on the WebView drawing edge-to-edge under the status bar
        // (env(safe-area-inset-top) padding, set up alongside StatusBar.setOverlaysWebView).
        // The WebView's own native overscroll/edge-glow effect isn't covered by the CSS
        // overscroll-behavior:none already on the scroll container - that only stops
        // scroll-chaining to parent elements, not Android's native touch/fling physics -
        // so a fast fling to the top can still show the glow effect over the status bar
        // area before the content settles back into its padded position. Disabling it here
        // removes that class of glitch entirely.
        this.bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Capacitor's own BridgeWebViewClient.onRenderProcessGone() returns false (meaning "not
        // handled") whenever nothing here overrides it - and per the WebViewClient contract,
        // returning false tells Android the app hasn't recovered, so the system kills the whole
        // app process outright rather than just the dead renderer. That's exactly the fatal,
        // unrecoverable crash automated testing caught: WebView renderer dies -> blank white ->
        // whole app aborts. Recreating the activity gives it a fresh WebView and keeps the app
        // alive through what would otherwise always be a hard, unrecoverable crash.
        this.bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                runOnUiThread(MainActivity.this::recreate);
                return true;
            }
        });
    }
}
