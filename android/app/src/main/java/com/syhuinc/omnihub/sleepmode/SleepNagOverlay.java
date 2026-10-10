package com.syhuinc.omnihub.sleepmode;

import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;

import com.syhuinc.omnihub.R;

/**
 * The illustrated nag card, drawn as a floating overlay window instead of launched as an
 * Activity - deliberately, not as a redundant duplicate of SleepNagActivity.
 *
 * A notification's full-screen intent (what that activity relies on to auto-launch) is only
 * honored automatically by Android while the device is locked or the screen is off. While
 * unlocked and actively in use, the system just shows the notification as a heads-up banner and
 * leaves opening the full activity to an explicit tap - no permission changes that. Sleep Mode's
 * reminder only ever fires while the screen is already on and interactive (SleepModeReceiver's
 * one and only trigger condition), which is exactly the state the full-screen intent won't
 * auto-launch in. So it can look right in testing and still never auto-pop for a real nag.
 *
 * A TYPE_APPLICATION_OVERLAY window has no such restriction - it draws on top of whatever's
 * running regardless of lock state, since it never goes through the activity-launch pathway at
 * all. That's what actually delivers "pops up automatically while you're using your phone."
 * Requires the user to have granted "Display over other apps" (SYSTEM_ALERT_WINDOW /
 * Settings.canDrawOverlays) - checked before ever attempting to show, and silently skipped when
 * it hasn't been granted, exactly like the full-screen intent path degrades without its own
 * permission. The heads-up notification (and tapping it to reach SleepNagActivity) stays as the
 * fallback either way.
 */
final class SleepNagOverlay {
    private static final String TAG = "SleepNagOverlay";
    private static final long AUTO_DISMISS_MS = 8_000L;

    private static View currentView;
    private static WindowManager currentWindowManager;
    private static final Handler dismissHandler = new Handler(Looper.getMainLooper());
    private static Runnable dismissRunnable;

    private SleepNagOverlay() {
    }

    static boolean canShow(Context context) {
        return Settings.canDrawOverlays(context);
    }

    static void show(Context context, String text, String personality) {
        if (!canShow(context)) return;
        try {
            dismissInternal();

            Context appContext = context.getApplicationContext();
            WindowManager wm = (WindowManager) appContext.getSystemService(Context.WINDOW_SERVICE);
            if (wm == null) return;

            View view = LayoutInflater.from(appContext).inflate(R.layout.overlay_sleep_nag_card, null);
            // Renders this view subtree in software rather than on a hardware layer. A
            // TYPE_APPLICATION_OVERLAY surface is composited outside any app window's normal
            // rendering path, and GPU/hardware-compositor bugs specific to that path on a given
            // OEM's graphics stack are a well-known source of native crashes that no Java
            // try/catch can ever contain - forcing software rendering for just this small view
            // sidesteps that class of bug entirely, at a negligible cost for something this size.
            view.setLayerType(View.LAYER_TYPE_SOFTWARE, null);

            TextView bodyText = view.findViewById(R.id.nag_body);
            if (text != null && !text.isEmpty()) bodyText.setText(text);

            ImageView illustration = view.findViewById(R.id.nag_illustration);
            illustration.setImageResource(bannerResFor(appContext, personality));

            View closeButton = view.findViewById(R.id.nag_close);
            View primaryButton = view.findViewById(R.id.nag_btn_primary);
            View secondaryButton = view.findViewById(R.id.nag_btn_secondary);

            closeButton.setOnClickListener(v -> dismiss());
            primaryButton.setOnClickListener(v -> {
                sendToReceiver(appContext, SleepModeReceiver.ACTION_STOP_TONIGHT);
                dismiss();
            });
            secondaryButton.setOnClickListener(v -> {
                sendToReceiver(appContext, SleepModeReceiver.ACTION_SNOOZE);
                dismiss();
            });

            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;

            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    type,
                    // NOT_FOCUSABLE: the card still takes taps, but the keyboard and Back key
                    // stay with whatever app the user is in.
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                            | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT);
            params.gravity = Gravity.TOP;
            params.y = dp(appContext, 56);

            wm.addView(view, params);
            currentView = view;
            currentWindowManager = wm;

            dismissRunnable = SleepNagOverlay::dismiss;
            dismissHandler.postDelayed(dismissRunnable, AUTO_DISMISS_MS);
        } catch (Exception e) {
            // Never let a WindowManager quirk (a stale token, a denied-after-check permission,
            // an OEM restriction) take the service or the rest of the reminder down with it -
            // the notification has already posted independently by this point regardless.
            Log.w(TAG, "Failed to show nag overlay", e);
            dismissInternal();
        }
    }

    static void dismiss() {
        dismissInternal();
    }

    private static void dismissInternal() {
        if (dismissRunnable != null) {
            dismissHandler.removeCallbacks(dismissRunnable);
            dismissRunnable = null;
        }
        if (currentView != null && currentWindowManager != null) {
            try {
                currentWindowManager.removeView(currentView);
            } catch (Exception ignored) {
            }
        }
        currentView = null;
        currentWindowManager = null;
    }

    private static int bannerResFor(Context context, String personality) {
        String name = "friendly".equals(personality)
                ? "sleep_notification_banner_friendly"
                : "sleep_notification_banner_gentle";
        int resId = context.getResources().getIdentifier(name, "drawable", context.getPackageName());
        return resId != 0 ? resId : android.R.drawable.ic_menu_myplaces;
    }

    private static void sendToReceiver(Context context, String action) {
        Intent intent = new Intent(context, SleepModeReceiver.class).setAction(action);
        context.sendBroadcast(intent);
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
