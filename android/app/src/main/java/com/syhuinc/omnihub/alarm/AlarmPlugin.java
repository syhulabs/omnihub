package com.syhuinc.omnihub.alarm;

import android.Manifest;
import android.content.Intent;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import com.syhuinc.omnihub.CrashLogger;

@CapacitorPlugin(
        name = "AlarmPlugin",
        permissions = {
                @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
        }
)
public class AlarmPlugin extends Plugin {

    private static final int MAX_BACKUPS = 5;
    private static final int MIN_BACKUP_OFFSET_MIN = 1;
    private static final int MAX_BACKUP_OFFSET_MIN = 180;

    private Ringtone previewRingtone;
    private final Handler previewHandler = new Handler(Looper.getMainLooper());
    private Runnable previewStopRunnable;

    @PluginMethod
    public void schedule(PluginCall call) {
        String id = call.getString("id");
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");

        if (hour == null || minute == null) {
            call.reject("hour and minute are required");
            return;
        }

        String resolvedId = (id == null || id.isEmpty()) ? UUID.randomUUID().toString() : id;
        AlarmData existing = AlarmStore.find(getContext(), resolvedId);

        AlarmData alarm = buildAlarmFromCall(call, resolvedId, hour, minute);
        // A genuine local edit (this method, called from the editor UI) always bumps updatedAt to
        // now and keeps the original createdAt - applyFromSync below is the only other writer,
        // and it does the opposite (preserves the incoming updatedAt) since it's applying
        // something that already happened on another device, not a new edit happening now.
        alarm.createdAt = existing != null ? existing.createdAt : System.currentTimeMillis();
        alarm.updatedAt = System.currentTimeMillis();

        AlarmStore.upsert(getContext(), alarm);
        boolean armed = false;
        if (alarm.enabled) {
            armed = AlarmScheduler.arm(getContext(), alarm);
        } else {
            AlarmScheduler.disarm(getContext(), alarm.id);
        }

        JSObject ret = new JSObject();
        ret.put("id", alarm.id);
        ret.put("armed", armed);
        call.resolve(ret);
    }

    private static Long getLongValue(PluginCall call, String key) {
        Object value = call.getData().opt(key);
        return value instanceof Number ? ((Number) value).longValue() : null;
    }

    /**
     * Applies an alarm as it already exists on another signed-in device, via cloud sync -
     * distinct from schedule() because it must preserve the incoming createdAt/updatedAt exactly
     * rather than bumping updatedAt to now, which would otherwise make this device's copy look
     * newer than it really is and break the merge/conflict logic in the JS sync layer.
     */
    @PluginMethod
    public void applyFromSync(PluginCall call) {
        String id = call.getString("id");
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        // Epoch millis are parsed from JSON as Integer/Long, so getDouble() would return null
        // for every real timestamp and reject the whole sync; read any Number.
        Long updatedAt = getLongValue(call, "updatedAt");

        if (id == null || hour == null || minute == null || updatedAt == null) {
            call.reject("id, hour, minute, and updatedAt are required");
            return;
        }

        Long createdAt = getLongValue(call, "createdAt");
        AlarmData alarm = buildAlarmFromCall(call, id, hour, minute);
        alarm.createdAt = createdAt != null ? createdAt : System.currentTimeMillis();
        alarm.updatedAt = updatedAt;

        AlarmStore.upsert(getContext(), alarm);
        boolean armed = false;
        if (alarm.enabled) {
            armed = AlarmScheduler.arm(getContext(), alarm);
        } else {
            AlarmScheduler.disarm(getContext(), alarm.id);
        }

        JSObject ret = new JSObject();
        ret.put("id", alarm.id);
        ret.put("armed", armed);
        call.resolve(ret);
    }

    private AlarmData buildAlarmFromCall(PluginCall call, String id, int hour, int minute) {
        AlarmData alarm = new AlarmData();
        alarm.id = id;
        alarm.hour = hour;
        alarm.minute = minute;
        alarm.label = call.getString("label", "");
        alarm.repeatMode = call.getString("repeatMode", "today");
        alarm.enabled = call.getBoolean("enabled", true);
        alarm.soundUri = call.getString("soundUri", null);
        alarm.soundName = call.getString("soundName", null);
        alarm.backupEnabled = call.getBoolean("backupEnabled", false);
        alarm.backupOffsetsMin = parseBackupOffsets(call.getArray("backupOffsetsMin"));
        alarm.backupPersistOnSnooze = call.getBoolean("backupPersistOnSnooze", false);
        alarm.backupPersistOnStop = call.getBoolean("backupPersistOnStop", false);
        return alarm;
    }

    /** Clamps each value to [1,180] min, dedupes, sorts ascending, caps at MAX_BACKUPS entries. */
    private int[] parseBackupOffsets(JSArray arr) {
        if (arr == null || arr.length() == 0) return AlarmData.DEFAULT_BACKUP_OFFSETS_MIN;
        List<Integer> values = new ArrayList<>();
        for (int i = 0; i < arr.length() && values.size() < MAX_BACKUPS; i++) {
            int v;
            try {
                v = arr.getInt(i);
            } catch (JSONException e) {
                continue;
            }
            v = Math.max(MIN_BACKUP_OFFSET_MIN, Math.min(MAX_BACKUP_OFFSET_MIN, v));
            if (!values.contains(v)) values.add(v);
        }
        if (values.isEmpty()) return AlarmData.DEFAULT_BACKUP_OFFSETS_MIN;
        Collections.sort(values);
        int[] result = new int[values.size()];
        for (int i = 0; i < result.length; i++) result[i] = values.get(i);
        return result;
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        AlarmScheduler.disarm(getContext(), id);
        AlarmStore.remove(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void list(PluginCall call) {
        List<AlarmData> alarms = AlarmStore.loadAll(getContext());
        JSArray arr = new JSArray();
        try {
            for (AlarmData a : alarms) {
                arr.put(new JSObject(a.toJson().toString()));
            }
        } catch (JSONException e) {
            call.reject("Failed to read alarms", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("alarms", arr);
        call.resolve(ret);
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
    public void pickRingtone(PluginCall call) {
        Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
        Uri defaultUri = RingtoneManager.getActualDefaultRingtoneUri(getContext(), RingtoneManager.TYPE_ALARM);
        if (defaultUri != null) {
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, defaultUri);
        }
        startActivityForResult(call, intent, "onRingtonePicked");
    }

    @ActivityCallback
    private void onRingtonePicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data != null ? data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI) : null;
        JSObject ret = new JSObject();
        if (uri == null) {
            ret.put("cancelled", true);
        } else {
            ret.put("cancelled", false);
            ret.put("uri", uri.toString());
            android.media.Ringtone ringtone = RingtoneManager.getRingtone(getContext(), uri);
            ret.put("name", ringtone != null ? ringtone.getTitle(getContext()) : "Custom");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void checkExactAlarmPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", AlarmScheduler.canScheduleExactAlarms(getContext()));
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

    @PluginMethod
    public void listRingtones(PluginCall call) {
        JSArray arr = new JSArray();
        try {
            RingtoneManager rm = new RingtoneManager(getContext());
            rm.setType(RingtoneManager.TYPE_ALARM);
            Cursor cursor = rm.getCursor();
            Uri defaultUri = RingtoneManager.getActualDefaultRingtoneUri(getContext(), RingtoneManager.TYPE_ALARM);
            while (cursor.moveToNext()) {
                int position = cursor.getPosition();
                Uri uri = rm.getRingtoneUri(position);
                if (uri == null) continue;
                JSObject entry = new JSObject();
                entry.put("uri", uri.toString());
                entry.put("name", cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX));
                entry.put("isDefault", defaultUri != null && uri.equals(defaultUri));
                arr.put(entry);
            }
        } catch (Exception e) {
            call.reject("Failed to list ringtones", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("sounds", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void previewSound(PluginCall call) {
        String uriStr = call.getString("uri");
        stopPreviewInternal();

        Uri uri = (uriStr == null || uriStr.isEmpty())
                ? RingtoneManager.getActualDefaultRingtoneUri(getContext(), RingtoneManager.TYPE_ALARM)
                : Uri.parse(uriStr);
        if (uri == null) {
            call.resolve();
            return;
        }

        try {
            previewRingtone = RingtoneManager.getRingtone(getContext(), uri);
            if (previewRingtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    previewRingtone.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
                } else {
                    previewRingtone.setStreamType(AudioManager.STREAM_ALARM);
                }
                previewRingtone.play();
                // Safety auto-stop so a forgotten preview doesn't keep playing indefinitely.
                previewStopRunnable = this::stopPreviewInternal;
                previewHandler.postDelayed(previewStopRunnable, 12_000);
            }
        } catch (Exception ignored) {
            // some URIs/devices can throw; nothing else to do but skip the preview
        }
        call.resolve();
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        stopPreviewInternal();
        call.resolve();
    }

    private void stopPreviewInternal() {
        if (previewStopRunnable != null) {
            previewHandler.removeCallbacks(previewStopRunnable);
            previewStopRunnable = null;
        }
        if (previewRingtone != null && previewRingtone.isPlaying()) {
            previewRingtone.stop();
        }
        previewRingtone = null;
    }

    @PluginMethod
    public void importCustomAudio(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "onCustomAudioPicked");
    }

    @ActivityCallback
    private void onCustomAudioPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;

        JSObject ret = new JSObject();
        if (uri == null) {
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        try {
            getContext().getContentResolver()
                    .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // Some providers don't support persistable permission - playback may fail after
            // the app or device restarts, but works for the current session either way.
        }

        String name = queryDisplayName(uri);
        ret.put("cancelled", false);
        ret.put("uri", uri.toString());
        ret.put("name", name != null ? name : "Custom audio");
        call.resolve(ret);
    }

    private String queryDisplayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return cursor.getString(idx);
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    @PluginMethod
    public void getCrashLog(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("log", CrashLogger.read(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void clearCrashLog(PluginCall call) {
        CrashLogger.clear(getContext());
        call.resolve();
    }
}
