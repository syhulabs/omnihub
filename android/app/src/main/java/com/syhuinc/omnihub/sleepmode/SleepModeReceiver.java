package com.syhuinc.omnihub.sleepmode;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Calendar;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Fires on every Sleep Mode beat (the nightly bedtime kickoff, then every intervalMin after).
 * Never wakes the webview or JS — reads/writes native state directly so this works with the app
 * fully closed. Speaks only if the screen is currently on (PowerManager#isInteractive), which
 * needs no special permission and is the whole "still using the phone" signal: if the screen's
 * off, the beat is skipped silently and checked again next interval.
 */
public class SleepModeReceiver extends BroadcastReceiver {
    private static final int MAX_RECENT_KEYS = 10;

    public static final String ACTION_SNOOZE = "com.syhuinc.omnihub.sleepmode.SNOOZE";
    public static final String ACTION_STOP_TONIGHT = "com.syhuinc.omnihub.sleepmode.STOP_TONIGHT";
    /** Matches the notification's "5 more minutes" button label. */
    private static final long SNOOZE_MS = 5 * 60_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_SNOOZE.equals(action)) {
            mute(context, System.currentTimeMillis() + SNOOZE_MS);
            return;
        }
        if (ACTION_STOP_TONIGHT.equals(action)) {
            SleepModeData data = SleepModeStore.load(context);
            mute(context, SleepModeScheduler.wakeMillisForSession(data));
            return;
        }

        SleepModeData data = SleepModeStore.load(context);
        if (!data.enabled) return;

        String kind = intent.getStringExtra(SleepModeScheduler.EXTRA_KIND);
        long now = System.currentTimeMillis();

        if (SleepModeScheduler.KIND_BEDTIME.equals(kind)) {
            data.sessionStartMillis = now;
            data.nagCount = 0;
            data.recentKeysCsv = "";
            data.mutedUntilMillis = 0;
        }

        long wakeMillis = SleepModeScheduler.wakeMillisForSession(data);
        if (now >= wakeMillis) {
            // Session's over — record it for Sleep Insights, then re-arm tomorrow's bedtime.
            if (data.sessionStartMillis > 0) {
                SleepSession session = new SleepSession();
                session.bedtimeScheduledMillis = data.sessionStartMillis;
                session.wakeScheduledMillis = wakeMillis;
                session.lastNagMillis = data.lastNagMillis;
                session.nagCount = data.nagCount;
                SleepModeStore.appendSession(context, session);
            }
            SleepModeStore.save(context, data);
            SleepModeScheduler.armBedtime(context, data);
            return;
        }

        if (now >= data.mutedUntilMillis && isScreenOn(context)) {
            speak(context, data);
        }

        SleepModeStore.save(context, data);
        long nextBeat = now + Math.max(1, data.intervalMin) * 60_000L;
        SleepModeScheduler.scheduleBeat(context, nextBeat);
    }

    /** Silences remaining beats until `untilMillis` and clears the reminder notification right away. */
    private void mute(Context context, long untilMillis) {
        SleepModeData data = SleepModeStore.load(context);
        data.mutedUntilMillis = untilMillis;
        SleepModeStore.save(context, data);
        // Stop the service first: while it's in the foreground its notification can't be
        // cancelled, and the reminder would keep talking after "I'm going to sleep".
        context.stopService(new Intent(context, SleepModeSpeakService.class));
        SleepModeSpeakService.clearNotification(context);
    }

    private boolean isScreenOn(Context context) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isInteractive();
    }

    private void speak(Context context, SleepModeData data) {
        int tier = Math.min(data.nagCount, MessageBank.TIER_COUNT - 1);
        Set<String> recentKeys = new LinkedHashSet<>(Arrays.asList(data.recentKeysCsv.split(",")));
        String[][] aiPool = SleepModeStore.loadAiMessages(context, data.personality);

        MessageBank.Pick pick = MessageBank.pick(
                data.personality,
                tier,
                data.effectiveCallName(),
                data.effectiveWorkSchoolRoutine() != null,
                data.effectiveInterests(),
                formatWakeTime(data),
                recentKeys,
                aiPool
        );

        int clipResId = SleepModeClipBank.resIdFor(context, pick.key);
        String aiClipPath = clipResId == 0 ? SleepModeAiClipBank.filePathFor(context, pick.key) : null;

        Intent serviceIntent = new Intent(context, SleepModeSpeakService.class);
        serviceIntent.putExtra(SleepModeSpeakService.EXTRA_TEXT, pick.text);
        serviceIntent.putExtra(SleepModeSpeakService.EXTRA_PERSONALITY, data.personality);
        if (clipResId != 0) {
            serviceIntent.putExtra(SleepModeSpeakService.EXTRA_AUDIO_RES_ID, clipResId);
        } else if (aiClipPath != null) {
            serviceIntent.putExtra(SleepModeSpeakService.EXTRA_AUDIO_FILE_PATH, aiClipPath);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        data.nagCount += 1;
        data.lastNagMillis = System.currentTimeMillis();
        recentKeys.add(pick.key);
        while (recentKeys.size() > MAX_RECENT_KEYS) {
            recentKeys.remove(recentKeys.iterator().next());
        }
        data.recentKeysCsv = String.join(",", recentKeys);
    }

    private String formatWakeTime(SleepModeData data) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, data.wakeHour);
        c.set(Calendar.MINUTE, data.wakeMinute);
        return new SimpleDateFormat("h:mm a", Locale.US).format(c.getTime());
    }
}
