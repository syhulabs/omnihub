package com.syhuinc.omnihub.alarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID);
        if (alarmId == null) return;
        boolean isBackup = intent.getBooleanExtra(AlarmScheduler.EXTRA_IS_BACKUP, false);
        int backupIndex = intent.getIntExtra(AlarmScheduler.EXTRA_BACKUP_INDEX, 0);

        AlarmData alarm = AlarmStore.find(context, alarmId);
        if (alarm == null) return;

        if (!isBackup) {
            // One-shot "today" alarms disable themselves; repeating ones re-arm their next occurrence.
            if ("today".equals(alarm.repeatMode)) {
                alarm.enabled = false;
                // Counts as an edit for cloud sync: without the bump the cloud copy stayed
                // "enabled", so a reinstall or a second phone re-armed every old one-shot alarm.
                alarm.updatedAt = System.currentTimeMillis();
                AlarmStore.upsert(context, alarm);
            } else {
                AlarmStore.upsert(context, alarm);
                AlarmScheduler.arm(context, alarm);
            }
            AlarmScheduler.scheduleBackups(context, alarm, System.currentTimeMillis());
        }

        Intent serviceIntent = new Intent(context, AlarmRingService.class);
        serviceIntent.putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId);
        serviceIntent.putExtra(AlarmScheduler.EXTRA_IS_BACKUP, isBackup);
        serviceIntent.putExtra(AlarmScheduler.EXTRA_BACKUP_INDEX, backupIndex);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
