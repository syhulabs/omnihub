package com.syhuinc.omnihub.sleepmode;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Calendar;

/**
 * Drives Sleep Mode's nightly loop with a single self-rescheduling exact alarm rather than a
 * long-lived service: one "bedtime" firing starts a session, then repeated "beat" firings (every
 * intervalMin) each decide whether to speak and reschedule the next beat, until wake time is
 * reached — at which point the loop stops and tomorrow's bedtime is armed instead. At most one
 * of these is ever pending, since REQUEST_CODE is fixed and every schedule() call replaces it.
 *
 * Uses AlarmManager.setAlarmClock() for the same reason the Alarm feature does: it's the API
 * built for user-facing wake behavior and survives Doze/battery-optimization more reliably
 * across OEMs than setExactAndAllowWhileIdle(), at the cost of showing the status-bar alarm-clock
 * icon while a check is pending — an acceptable, arguably clarifying, side effect here.
 */
public class SleepModeScheduler {
    public static final String EXTRA_KIND = "kind"; // "bedtime" | "beat"
    public static final String KIND_BEDTIME = "bedtime";
    public static final String KIND_BEAT = "beat";

    private static final int REQUEST_CODE = "sleepmode_next".hashCode();

    public static boolean canScheduleExactAlarms(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    /** Arms tonight's (or tomorrow's, if already past) bedtime firing. Cancels any pending beat.
     *  When bedtime has already passed and it's not yet wake time, the session starts right
     *  away: otherwise any settings change after bedtime would silently skip tonight. */
    public static boolean armBedtime(Context ctx, SleepModeData data) {
        if (!data.enabled) return false;
        long now = System.currentTimeMillis();
        if (isWithinSleepWindow(data, now)) {
            return scheduleAt(ctx, now + 1_000L, KIND_BEDTIME);
        }
        return scheduleAt(ctx, nextBedtimeTriggerMillis(data), KIND_BEDTIME);
    }

    /** True between the most recent bedtime and the wake time that follows it. */
    static boolean isWithinSleepWindow(SleepModeData data, long nowMillis) {
        Calendar bed = Calendar.getInstance();
        bed.setTimeInMillis(nowMillis);
        bed.set(Calendar.HOUR_OF_DAY, data.bedtimeHour);
        bed.set(Calendar.MINUTE, data.bedtimeMinute);
        bed.set(Calendar.SECOND, 0);
        bed.set(Calendar.MILLISECOND, 0);
        if (bed.getTimeInMillis() > nowMillis) bed.add(Calendar.DAY_OF_YEAR, -1);
        Calendar wake = (Calendar) bed.clone();
        wake.set(Calendar.HOUR_OF_DAY, data.wakeHour);
        wake.set(Calendar.MINUTE, data.wakeMinute);
        if (!wake.after(bed)) wake.add(Calendar.DAY_OF_YEAR, 1);
        return nowMillis >= bed.getTimeInMillis() && nowMillis < wake.getTimeInMillis();
    }

    public static boolean scheduleBeat(Context ctx, long triggerAtMillis) {
        return scheduleAt(ctx, triggerAtMillis, KIND_BEAT);
    }

    private static boolean scheduleAt(Context ctx, long triggerAtMillis, String kind) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return false;

        Intent intent = new Intent(ctx, SleepModeReceiver.class);
        intent.putExtra(EXTRA_KIND, kind);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQUEST_CODE, intent, flags);

        Intent showIntent = new Intent(ctx, com.syhuinc.omnihub.MainActivity.class);
        PendingIntent showPi = PendingIntent.getActivity(ctx, REQUEST_CODE, showIntent, flags);

        try {
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAtMillis, showPi), pi);
            return true;
        } catch (SecurityException e) {
            // Missing SCHEDULE_EXACT_ALARM — never let this crash a receiver/service thread.
            return false;
        }
    }

    public static void disarm(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(ctx, SleepModeReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        am.cancel(PendingIntent.getBroadcast(ctx, REQUEST_CODE, intent, flags));
    }

    public static long nextBedtimeTriggerMillis(SleepModeData data) {
        Calendar now = Calendar.getInstance();
        Calendar candidate = (Calendar) now.clone();
        candidate.set(Calendar.HOUR_OF_DAY, data.bedtimeHour);
        candidate.set(Calendar.MINUTE, data.bedtimeMinute);
        candidate.set(Calendar.SECOND, 0);
        candidate.set(Calendar.MILLISECOND, 0);
        if (!candidate.after(now)) {
            candidate.add(Calendar.DAY_OF_YEAR, 1);
        }
        return candidate.getTimeInMillis();
    }

    /** The wake timestamp for the session that started at data.sessionStartMillis. */
    public static long wakeMillisForSession(SleepModeData data) {
        Calendar wake = Calendar.getInstance();
        wake.setTimeInMillis(data.sessionStartMillis);
        wake.set(Calendar.HOUR_OF_DAY, data.wakeHour);
        wake.set(Calendar.MINUTE, data.wakeMinute);
        wake.set(Calendar.SECOND, 0);
        wake.set(Calendar.MILLISECOND, 0);
        if (wake.getTimeInMillis() <= data.sessionStartMillis) {
            wake.add(Calendar.DAY_OF_YEAR, 1);
        }
        return wake.getTimeInMillis();
    }
}
