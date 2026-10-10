package com.syhuinc.omnihub.keepawake;

import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Keeps the screen on for as long as the app is in the foreground, via the standard
 * FLAG_KEEP_SCREEN_ON window flag rather than a PowerManager wake lock -- it's released
 * automatically when the activity goes away, no explicit release() needed, and it only
 * keeps the *screen* on (not the CPU), which is all the Settings toggle promises.
 */
@CapacitorPlugin(name = "KeepAwakePlugin")
public class KeepAwakePlugin extends Plugin {

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
        call.resolve(new JSObject());
    }
}
