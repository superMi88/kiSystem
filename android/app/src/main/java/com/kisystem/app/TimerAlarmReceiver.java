package com.kisystem.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class TimerAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int timerId = intent.getIntExtra("timerId", 0);
        String title = intent.getStringExtra("title");
        if (title == null || title.isEmpty()) {
            title = "Timer";
        }
        String notifTitle = "Timer abgelaufen! ⏰";
        String notifMessage = "Timer '" + title + "' ist abgelaufen.";

        Log.d("TimerAlarmReceiver", "Timer alarm broadcast received for timer: " + title + " (ID: " + timerId + ")");

        TimerAlarmHelper.showNotification(context, notifTitle, notifMessage, timerId);
        TimerAlarmHelper.playAlarmSound(context);
    }
}
