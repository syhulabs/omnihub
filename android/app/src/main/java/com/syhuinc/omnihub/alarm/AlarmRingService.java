package com.syhuinc.omnihub.alarm;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import com.syhuinc.omnihub.flashalert.FlashAlertPrefs;
import com.syhuinc.omnihub.flashalert.TorchBlinker;

public class AlarmRingService extends Service {
    private static final String CHANNEL_ID = "omnihub_alarm_ring";
    private static final int NOTIFICATION_ID = 991;

    /**
     * Tapping "Stop" on the notification stops this specific ringing instance without needing
     * the full-screen activity - the only other way to reach it, and one the user can end up
     * completely unable to get back to (e.g. pressed Home while ringing; the activity is
     * singleInstance with the back button swallowed, so the notification becomes the sole way
     * back in). This is a second, independent path that doesn't depend on that activity at all.
     */
    public static final String ACTION_STOP = "com.syhuinc.omnihub.alarm.ACTION_STOP";

    /** Absolute safety net: never ring longer than this even if every other stop path fails. */
    private static final long MAX_RING_MS = 10 * 60 * 1000L;

    private static AlarmRingService activeInstance;

    private Ringtone ringtone;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private String currentAlarmId;
    private boolean currentIsBackup;
    private int currentBackupIndex;
    private final Handler autoStopHandler = new Handler(Looper.getMainLooper());
    private final Runnable autoStopRunnable = this::stopSelf;

    public static void stopRinging(Context ctx) {
        ctx.stopService(new Intent(ctx, AlarmRingService.class));
    }

    public static String getRingingAlarmId() {
        return activeInstance != null ? activeInstance.currentAlarmId : null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        activeInstance = this;
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            String stopAlarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID);
            cancelBackupsUnlessPersisted(stopAlarmId);
            stopSelf();
            return START_NOT_STICKY;
        }

        String alarmId = intent != null ? intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) : null;
        currentAlarmId = alarmId;
        currentIsBackup = intent != null && intent.getBooleanExtra(AlarmScheduler.EXTRA_IS_BACKUP, false);
        currentBackupIndex = intent != null ? intent.getIntExtra(AlarmScheduler.EXTRA_BACKUP_INDEX, 0) : 0;
        AlarmData alarm = alarmId != null ? AlarmStore.find(this, alarmId) : null;

        startForegroundWithNotification(alarm);
        // A backup or a second alarm firing while one is still ringing must replace it, not
        // layer a second looping ringtone (and wake lock) on top that no Stop can reach.
        stopPlayback();
        acquireWakeLock();
        startRingtone(alarm);
        startVibration();
        startFlashBlink();

        autoStopHandler.removeCallbacks(autoStopRunnable);
        autoStopHandler.postDelayed(autoStopRunnable, MAX_RING_MS);

        return START_NOT_STICKY;
    }

    private void cancelBackupsUnlessPersisted(String alarmId) {
        if (alarmId == null) return;
        AlarmData a = AlarmStore.find(this, alarmId);
        if (a == null || !a.backupPersistOnStop) {
            AlarmScheduler.cancelBackups(this, alarmId);
        }
    }

    /**
     * Fires if the user swipes the whole app away from Recents while this is ringing. A
     * foreground service like this one is independent of any Activity's task and would
     * otherwise keep ringing indefinitely with no UI left to reach it.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        stopSelf();
    }

    private void startForegroundWithNotification(AlarmData alarm) {
        Intent fullScreenIntent = new Intent(this, AlarmRingingActivity.class);
        fullScreenIntent.putExtra(AlarmScheduler.EXTRA_ALARM_ID, currentAlarmId);
        fullScreenIntent.putExtra(AlarmScheduler.EXTRA_IS_BACKUP, currentIsBackup);
        fullScreenIntent.putExtra(AlarmScheduler.EXTRA_BACKUP_INDEX, currentBackupIndex);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent fullScreenPi = PendingIntent.getActivity(this, 0, fullScreenIntent, flags);

        String label = alarm != null && alarm.label != null && !alarm.label.isEmpty() ? alarm.label : "Alarm";
        if (currentIsBackup) label = label + " (Backup " + currentBackupIndex + ")";

        Intent stopIntent = new Intent(this, AlarmRingService.class);
        stopIntent.setAction(ACTION_STOP);
        stopIntent.putExtra(AlarmScheduler.EXTRA_ALARM_ID, currentAlarmId);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stopIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(label)
                .setContentText("Tap to open, or use Stop below")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setFullScreenIntent(fullScreenPi, true)
                .setContentIntent(fullScreenPi)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPi)
                .setOngoing(true)
                .setAutoCancel(false)
                // setOngoing(true) is meant to block swipe-dismiss, but some OEM notification
                // shades allow it anyway - if that happens here, treat it exactly like tapping
                // Stop instead of leaving the ringtone running with no visible way to reach it.
                .setDeleteIntent(stopPi);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    builder.build(),
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, builder.build());
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "Alarms", NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("Omni Hub alarm notifications");
                channel.setSound(null, null); // service plays the ringtone itself, looped
                channel.enableVibration(false); // service handles vibration itself
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK, "OmniHub:AlarmRingWakeLock");
        wakeLock.acquire(10 * 60 * 1000L); // safety cap: 10 min
    }

    private void startRingtone(AlarmData alarm) {
        Uri soundUri = null;
        if (alarm != null && alarm.soundUri != null && !alarm.soundUri.isEmpty()) {
            try {
                soundUri = Uri.parse(alarm.soundUri);
            } catch (Exception ignored) {
            }
        }

        ringtone = tryGetRingtone(soundUri);
        if (ringtone == null) {
            // The custom soundUri didn't resolve on this device - Uri.parse() above never fails
            // even on a URI nothing here can actually read, which is the common case for an
            // alarm synced from another device using a custom audio file that only exists there.
            // Fall back to the default alarm sound rather than ringing completely silently.
            ringtone = tryGetRingtone(RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM));
        }
        if (ringtone == null) {
            ringtone = tryGetRingtone(RingtoneManager.getValidRingtoneUri(this));
        }
        if (ringtone == null) return;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
            } else {
                ringtone.setStreamType(AudioManager.STREAM_ALARM);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ringtone.setLooping(true);
            }
            ringtone.play();
        } catch (Exception ignored) {
            // some devices/URIs can throw; ringing still shows the full-screen UI even without sound
        }
    }

    /** Returns null instead of throwing/crashing when a URI can't be read as a ringtone on this device. */
    private Ringtone tryGetRingtone(Uri uri) {
        if (uri == null) return null;
        try {
            return RingtoneManager.getRingtone(this, uri);
        } catch (Exception ignored) {
            return null;
        }
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 500, 500};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void startFlashBlink() {
        if (FlashAlertPrefs.isAlarmEnabled(this)) {
            TorchBlinker.startContinuous(this, TorchBlinker.SOURCE_ALARM, 300, 300);
        }
    }

    /** Silences and releases everything the current ring holds; safe to call when nothing is ringing. */
    private void stopPlayback() {
        if (ringtone != null) {
            try {
                if (ringtone.isPlaying()) ringtone.stop();
            } catch (Exception ignored) {
            }
            ringtone = null;
        }
        if (vibrator != null) vibrator.cancel();
        TorchBlinker.stop(this, TorchBlinker.SOURCE_ALARM);
        if (wakeLock != null) {
            try {
                if (wakeLock.isHeld()) wakeLock.release();
            } catch (Exception ignored) {
            }
            wakeLock = null;
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        autoStopHandler.removeCallbacks(autoStopRunnable);
        if (activeInstance == this) activeInstance = null;
        currentAlarmId = null;
        stopPlayback();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
