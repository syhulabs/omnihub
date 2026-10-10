package com.syhuinc.omnihub.sleepmode;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
        name = "SleepModePlugin",
        permissions = {
                @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
        }
)
public class SleepModePlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        SleepModeData data = new SleepModeData();
        data.enabled = call.getBoolean("enabled", false);
        data.bedtimeHour = call.getInt("bedtimeHour", 22);
        data.bedtimeMinute = call.getInt("bedtimeMinute", 30);
        data.wakeHour = call.getInt("wakeHour", 7);
        data.wakeMinute = call.getInt("wakeMinute", 0);
        data.intervalMin = call.getInt("intervalMin", 30);
        data.volumePercent = call.getInt("volumePercent", 85);
        data.personality = call.getString("personality", "friendly");
        data.mode = call.getString("mode", "normal");
        data.callName = call.getString("callName", null);
        data.workSchoolRoutine = call.getString("workSchoolRoutine", null);
        data.relationshipStatus = call.getString("relationshipStatus", null);
        data.interests = call.getString("interests", null);
        data.customNotes = call.getString("customNotes", null);

        // A settings change always (re)starts scheduling from now, rather than trying to preserve
        // an in-progress nightly session's nag count/anti-repeat state across an edit.
        data.sessionStartMillis = 0;
        data.nagCount = 0;
        data.recentKeysCsv = "";

        SleepModeStore.save(getContext(), data);

        boolean armed = false;
        if (data.enabled) {
            armed = SleepModeScheduler.armBedtime(getContext(), data);
        } else {
            SleepModeScheduler.disarm(getContext());
            // Cut off a reminder that's speaking right now if the user disables mid-utterance.
            getContext().stopService(new Intent(getContext(), SleepModeSpeakService.class));
        }

        JSObject ret = new JSObject();
        ret.put("armed", armed);
        call.resolve(ret);
    }

    @PluginMethod
    public void status(PluginCall call) {
        SleepModeData data = SleepModeStore.load(getContext());
        try {
            call.resolve(new JSObject(data.toJson().toString()));
        } catch (JSONException e) {
            call.reject("Failed to read Sleep Mode status", e);
        }
    }

    /** Returns a sample line for the given personality without touching any persisted anti-repeat state. */
    @PluginMethod
    public void previewMessage(PluginCall call) {
        String personality = call.getString("personality", "friendly");
        int tier = call.getInt("tier", 0);
        String callName = call.getString("callName", null);
        String workSchoolRoutine = call.getString("workSchoolRoutine", null);
        String interests = call.getString("interests", null);
        boolean hasWorkTomorrow = workSchoolRoutine != null && !workSchoolRoutine.trim().isEmpty();
        String[][] aiPool = SleepModeStore.loadAiMessages(getContext(), personality);

        MessageBank.Pick pick = MessageBank.pick(
                personality, tier, callName, hasWorkTomorrow, interests, null, java.util.Collections.emptySet(), aiPool);

        JSObject ret = new JSObject();
        ret.put("text", pick.text);
        call.resolve(ret);
    }

    /**
     * Caches a freshly-generated AI reminder pool for one personality, so the fully-offline nag
     * path (SleepModeReceiver, which never wakes the webview) can pick from it. tiersJson is the
     * exact {"tiers": [...]} JSON the generateSleepReminders Cloud Function returned; this method
     * just attaches a generatedAt timestamp and stores it as-is — no parsing happens here.
     */
    @PluginMethod
    public void setAiMessages(PluginCall call) {
        String personality = call.getString("personality");
        String tiersJson = call.getString("tiersJson");
        if (personality == null || tiersJson == null) {
            call.reject("personality and tiersJson are required");
            return;
        }
        try {
            JSONObject obj = new JSONObject(tiersJson);
            obj.put("generatedAt", System.currentTimeMillis());
            SleepModeStore.saveAiMessages(getContext(), personality, obj.toString());
            call.resolve();
        } catch (JSONException e) {
            call.reject("tiersJson must be valid JSON shaped {\"tiers\": [[...],[...],[...],[...]]}", e);
        }
    }

    /**
     * Caches the real-voice (Gemini TTS) clips generated alongside the AI reminder pool — one
     * WAV, base64-encoded, per tier (null for any tier synthesis failed for; see
     * generateSleepReminders). Stored via SleepModeStore.saveAiAudioClip, read back by
     * SleepModeAiClipBank when the nightly nag happens to pick that tier's line 0.
     */
    @PluginMethod
    public void setAiAudioClips(PluginCall call) {
        String personality = call.getString("personality");
        com.getcapacitor.JSArray clips = call.getArray("clips");
        if (personality == null || clips == null) {
            call.reject("personality and clips are required");
            return;
        }
        for (int tier = 0; tier < clips.length(); tier++) {
            try {
                // JSONArray.getString turns a JSON null into the text "null", which would be
                // decoded and saved over a previously good clip.
                if (clips.isNull(tier)) continue;
                String b64 = clips.getString(tier);
                if (b64 == null || b64.isEmpty()) continue;
                byte[] wavBytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                SleepModeStore.saveAiAudioClip(getContext(), personality, tier, wavBytes);
            } catch (JSONException ignored) {
                // a malformed entry just means that tier keeps falling back to on-device TTS
            }
        }
        call.resolve();
    }

    /** How old the cached AI pool for this personality is, so the JS side can decide whether to refresh it. */
    @PluginMethod
    public void getAiMessagesInfo(PluginCall call) {
        String personality = call.getString("personality", "friendly");
        long generatedAt = SleepModeStore.loadAiMessagesGeneratedAt(getContext(), personality);
        JSObject ret = new JSObject();
        ret.put("generatedAt", generatedAt);
        call.resolve(ret);
    }

    /** Recent completed nights, for Sleep Insights — real measured data only, never fabricated. */
    @PluginMethod
    public void getHistory(PluginCall call) {
        java.util.List<SleepSession> history = SleepModeStore.loadHistory(getContext());
        com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
        try {
            for (SleepSession s : history) {
                arr.put(new JSObject(s.toJson().toString()));
            }
        } catch (JSONException e) {
            call.reject("Failed to read Sleep Mode history", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("sessions", arr);
        call.resolve(ret);
    }

    /**
     * Speaks a sample line aloud right now, via the same foreground service the nightly loop
     * uses — same alarm-stream audio attributes and app-controlled volume as a real reminder, so
     * the preview sounds exactly like what will actually play at bedtime.
     */
    @PluginMethod
    public void speakTest(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.isEmpty()) {
            call.reject("text is required");
            return;
        }
        Intent serviceIntent = new Intent(getContext(), SleepModeSpeakService.class);
        serviceIntent.putExtra(SleepModeSpeakService.EXTRA_TEXT, text);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        call.resolve();
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            ret.put("granted", true);
        } else {
            ret.put("granted", getPermissionState("notifications").toString().equals("granted"));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "onNotificationPermissionResult");
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void onNotificationPermissionResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications").toString().equals("granted"));
        call.resolve(ret);
    }

    @PluginMethod
    public void checkExactAlarmPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", SleepModeScheduler.canScheduleExactAlarms(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestExactAlarmPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /**
     * The illustrated full-screen nag card (SleepNagActivity) only auto-launches over whatever's
     * on screen via the notification's full-screen intent -- Android 14+ treats that as a
     * separate, not-auto-granted permission for apps targeting API 34+ (unlike pre-14, where
     * declaring USE_FULL_SCREEN_INTENT in the manifest was enough on its own). Without it, the
     * card still opens on tap (SleepModeSpeakService's contentIntent), just not automatically.
     */
    @PluginMethod
    public void checkFullScreenIntentPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", canUseFullScreenIntent());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestFullScreenIntentPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    private boolean canUseFullScreenIntent() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
        android.app.NotificationManager nm = (android.app.NotificationManager)
                getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        return nm != null && nm.canUseFullScreenIntent();
    }

    /**
     * The actual mechanism the illustrated nag card uses to pop up automatically while the phone
     * is unlocked and in active use (see SleepNagOverlay's own doc for why full-screen intent
     * doesn't do that job, despite looking like the obvious fit). "Display over other apps" is a
     * separate, more invasive-sounding permission than the full-screen intent one, so this is
     * checked/requested independently rather than folded into that flow.
     */
    @PluginMethod
    public void checkOverlayPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", android.provider.Settings.canDrawOverlays(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }
}
