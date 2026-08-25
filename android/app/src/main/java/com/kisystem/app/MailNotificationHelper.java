package com.kisystem.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Vibrator;
import android.util.Log;
import androidx.core.app.NotificationCompat;

public class MailNotificationHelper {
    public static final String CHANNEL_ID = "mail_notification_channel";
    private static final String TAG = "MailNotificationHelper";

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            CharSequence name = "Neue E-Mails";
            String description = "Benachrichtigungen über neu empfangene E-Mails";
            int importance = NotificationManager.IMPORTANCE_HIGH;

            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 150, 250});

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (soundUri != null) {
                AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                channel.setSound(soundUri, aa);
            }

            nm.createNotificationChannel(channel);
            Log.d(TAG, "Notification channel 'mail_notification_channel' registered.");
        }
    }

    public static void showMailNotification(Context context, String fromName, String subject, String snippet, int mailId, String accountEmail) {
        try {
            createNotificationChannel(context);

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            Intent intent = new Intent(context, MainActivity.class);
            intent.setAction("OPEN_MAIL");
            intent.putExtra("open_mail_id", mailId);
            intent.putExtra("action", "open_mail");
            intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            int requestCode = mailId > 0 ? mailId : (int) (System.currentTimeMillis() % 100000);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            String title = (fromName != null && !fromName.trim().isEmpty())
                ? "📧 " + fromName.trim()
                : "📧 Neue E-Mail";

            String contentText = (subject != null && !subject.trim().isEmpty())
                ? subject.trim()
                : (snippet != null ? snippet.trim() : "Neue Nachricht empfangen");

            StringBuilder bigText = new StringBuilder();
            if (subject != null && !subject.trim().isEmpty()) {
                bigText.append(subject.trim());
            }
            if (snippet != null && !snippet.trim().isEmpty()) {
                if (bigText.length() > 0) bigText.append("\n");
                bigText.append(snippet.trim());
            }
            if (accountEmail != null && !accountEmail.trim().isEmpty()) {
                if (bigText.length() > 0) bigText.append("\n");
                bigText.append("An: ").append(accountEmail.trim());
            }

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentTitle(title)
                .setContentText(contentText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(bigText.toString()))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_EMAIL)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setSound(soundUri)
                .setVibrate(new long[]{0, 250, 150, 250});

            if (accountEmail != null && !accountEmail.trim().isEmpty()) {
                builder.setSubText(accountEmail.trim());
            }

            int notifId = mailId > 0 ? 10000 + mailId : 9999;
            nm.notify(notifId, builder.build());

            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                vibrator.vibrate(new long[]{0, 250, 150, 250}, -1);
            }

            Log.d(TAG, "Displayed mail push notification for mailId " + mailId + ": " + title + " - " + contentText);
        } catch (Exception e) {
            Log.e(TAG, "Error displaying mail push notification", e);
        }
    }

    public static void showTestNotification(Context context) {
        showMailNotification(
            context,
            "kiSystem Support",
            "🎉 Test-Benachrichtigung für neue E-Mails",
            "Wenn du diese Benachrichtigung auf deinem Smartphone siehst, funktionieren Mail-Push-Benachrichtigungen einwandfrei!",
            -1,
            "demo@kisystem.app"
        );
    }
}
