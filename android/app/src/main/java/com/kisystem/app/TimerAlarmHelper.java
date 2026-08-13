package com.kisystem.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Vibrator;
import android.util.Log;
import androidx.core.app.NotificationCompat;

public class TimerAlarmHelper {
    private static final String CHANNEL_ID = "timer_alarm_channel";
    private static Ringtone activeRingtone = null;

    public static synchronized void playAlarmSound(Context context) {
        try {
            stopAlarmSound();
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }

            activeRingtone = RingtoneManager.getRingtone(context.getApplicationContext(), alarmUri);
            if (activeRingtone != null) {
                AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                activeRingtone.setAudioAttributes(aa);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    activeRingtone.setLooping(true);
                }
                activeRingtone.play();
                Log.d("TimerAlarmHelper", "Playing alarm ringtone via STREAM_ALARM");
            }
        } catch (Exception e) {
            Log.e("TimerAlarmHelper", "Error playing alarm sound", e);
        }
    }

    public static synchronized void stopAlarmSound() {
        try {
            if (activeRingtone != null) {
                if (activeRingtone.isPlaying()) {
                    activeRingtone.stop();
                }
                activeRingtone = null;
                Log.d("TimerAlarmHelper", "Stopped alarm ringtone");
            }
        } catch (Exception e) {
            Log.e("TimerAlarmHelper", "Error stopping alarm sound", e);
        }
    }

    public static void showNotification(Context context, String title, String message, int timerId) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                CharSequence name = "Timer & Wecker";
                String desc = "Benachrichtigungen für abgelaufene Timer";
                int importance = NotificationManager.IMPORTANCE_HIGH;
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
                channel.setDescription(desc);
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 500, 200, 500});

                Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                channel.setSound(alarmUri, aa);

                nm.createNotificationChannel(channel);
            }

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                timerId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setSound(alarmUri)
                .setVibrate(new long[]{0, 500, 200, 500});

            nm.notify(timerId > 0 ? timerId : (int) System.currentTimeMillis(), builder.build());

            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                vibrator.vibrate(new long[]{0, 500, 200, 500}, -1);
            }
            Log.d("TimerAlarmHelper", "Showed notification for timer " + timerId + ": " + title);
        } catch (Exception e) {
            Log.e("TimerAlarmHelper", "Error showing notification", e);
        }
    }
}
