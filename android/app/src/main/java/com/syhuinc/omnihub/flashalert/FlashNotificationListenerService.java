package com.syhuinc.omnihub.flashalert;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

public class FlashNotificationListenerService extends NotificationListenerService {
    private static final int BLINK_TIMES = 3;
    private static final long ON_MS = 250;
    private static final long OFF_MS = 200;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        super.onNotificationPosted(sbn);
        if (sbn == null) return;
        // Ignore our own notifications (e.g. the alarm-ringing one, already handled separately).
        if (getPackageName().equals(sbn.getPackageName())) return;
        if (!FlashAlertPrefs.isNotificationEnabled(this)) return;
        // Ongoing (media/download progress) and alert-once updates and group summaries would
        // otherwise blink the torch every time they refresh.
        if (sbn.isOngoing()) return;
        Notification n = sbn.getNotification();
        if (n != null && (n.flags & (Notification.FLAG_ONLY_ALERT_ONCE | Notification.FLAG_GROUP_SUMMARY)) != 0) return;
        TorchBlinker.blink(this, TorchBlinker.SOURCE_NOTIFICATION, BLINK_TIMES, ON_MS, OFF_MS);
    }
}
