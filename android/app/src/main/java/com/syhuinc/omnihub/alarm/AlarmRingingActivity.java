package com.syhuinc.omnihub.alarm;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import com.syhuinc.omnihub.R;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** Full-screen activity shown over the lock screen when an alarm fires. */
public class AlarmRingingActivity extends Activity {

    private String alarmId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        setContentView(R.layout.activity_alarm_ringing);
        bindAlarm(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // singleInstance: a later alarm reuses this instance, so it must show and act on the
        // new alarm rather than the one that rang earlier.
        setIntent(intent);
        bindAlarm(intent);
    }

    private void bindAlarm(Intent intent) {
        alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID);
        boolean isBackup = intent.getBooleanExtra(AlarmScheduler.EXTRA_IS_BACKUP, false);
        int backupIndex = intent.getIntExtra(AlarmScheduler.EXTRA_BACKUP_INDEX, 0);
        AlarmData alarm = alarmId != null ? AlarmStore.find(this, alarmId) : null;

        TextView timeText = findViewById(R.id.alarm_time_text);
        TextView labelText = findViewById(R.id.alarm_label_text);
        Button dismissButton = findViewById(R.id.dismiss_button);
        Button snoozeButton = findViewById(R.id.snooze_button);

        if (alarm != null) {
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, alarm.hour);
            c.set(Calendar.MINUTE, alarm.minute);
            timeText.setText(new SimpleDateFormat("h:mm a", Locale.getDefault()).format(c.getTime()));
            String label = alarm.label == null || alarm.label.isEmpty() ? "Alarm" : alarm.label;
            if (isBackup) label = label + " (Backup " + backupIndex + ")";
            labelText.setText(label);
        }

        boolean keepBackupsOnStop = alarm != null && alarm.backupPersistOnStop;
        boolean keepBackupsOnSnooze = alarm != null && alarm.backupPersistOnSnooze;

        final String boundAlarmId = alarmId;
        dismissButton.setOnClickListener(v -> {
            AlarmRingService.stopRinging(this);
            if (boundAlarmId != null && !keepBackupsOnStop) AlarmScheduler.cancelBackups(this, boundAlarmId);
            finish();
        });

        snoozeButton.setOnClickListener(v -> {
            AlarmRingService.stopRinging(this);
            if (boundAlarmId != null) {
                if (!keepBackupsOnSnooze) AlarmScheduler.cancelBackups(this, boundAlarmId);
                snooze(boundAlarmId);
            }
            finish();
        });
    }

    private void snooze(String alarmId) {
        AlarmData alarm = AlarmStore.find(this, alarmId);
        if (alarm == null) return;
        AlarmData snoozed = new AlarmData();
        snoozed.id = alarmId + "-snooze-" + System.currentTimeMillis();
        snoozed.label = alarm.label;
        snoozed.repeatMode = "today";
        snoozed.enabled = true;
        snoozed.soundUri = alarm.soundUri;
        snoozed.soundName = alarm.soundName;
        snoozed.backupEnabled = alarm.backupEnabled;
        snoozed.backupOffsetsMin = alarm.backupOffsetsMin;
        snoozed.backupPersistOnSnooze = alarm.backupPersistOnSnooze;
        snoozed.backupPersistOnStop = alarm.backupPersistOnStop;
        snoozed.createdAt = System.currentTimeMillis();

        Calendar c = Calendar.getInstance();
        c.add(Calendar.MINUTE, 10);
        snoozed.hour = c.get(Calendar.HOUR_OF_DAY);
        snoozed.minute = c.get(Calendar.MINUTE);

        AlarmStore.upsert(this, snoozed);
        AlarmScheduler.arm(this, snoozed);
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    public void onBackPressed() {
        // Swallow back — an alarm shouldn't be dismissible by accident via the back gesture/button.
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Whatever tears this screen down - Dismiss/Snooze (already stopped it, harmless to
        // repeat), the system reclaiming it, or any other path - the ringtone must never keep
        // playing with this screen gone and no way back to it. Only silences the current ring;
        // does not touch backups, since that's an explicit user decision made by the buttons.
        AlarmRingService.stopRinging(this);
    }
}
