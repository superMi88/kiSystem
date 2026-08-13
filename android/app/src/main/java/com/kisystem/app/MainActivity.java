package com.kisystem.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetSettingsPlugin.class);
        super.onCreate(savedInstanceState);

        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new WidgetBridgeInterface(this), "AndroidWidgetInterface");
                Log.d("CalendarWidget", "AndroidWidgetInterface registered on WebView");
            }
        } catch (Exception e) {
            Log.e("CalendarWidget", "Error attaching JavascriptInterface", e);
        }

        requestNotificationPermission();
    }

    public void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        syncLocalStorageToWidgetStorage();
    }

    public void syncLocalStorageToWidgetStorage() {
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function() { return (localStorage.getItem('api_username') || '') + '|||' + (localStorage.getItem('api_password') || '') + '|||' + (localStorage.getItem('api_server_url') || ''); })()",
                        value -> {
                            if (value != null && !value.isEmpty() && !value.equals("null") && !value.equals("\"\"")) {
                                String clean = value.replace("\"", "");
                                String[] parts = clean.split("\\|\\|\\|", -1);
                                if (parts.length >= 3) {
                                    String user = parts[0].trim();
                                    String pass = parts[1].trim();
                                    String url = parts[2].trim();

                                    if (!user.isEmpty()) {
                                        saveToWidgetStorage(MainActivity.this, user, pass, url);
                                    }
                                }
                            }
                        }
                    );
                }
            } catch (Exception e) {
                Log.e("CalendarWidget", "Error syncing localStorage in onResume", e);
            }
        }, 1500);
    }

    public static void saveToWidgetStorage(Context context, String username, String password, String serverUrl) {
        if (username == null || username.trim().isEmpty()) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences("WidgetStorage", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("api_username", username.trim());
        if (password != null && !password.trim().isEmpty()) {
            editor.putString("api_password", password.trim());
        }
        if (serverUrl != null && !serverUrl.trim().isEmpty()) {
            editor.putString("server_url", serverUrl.trim());
        }
        editor.commit();

        Log.d("CalendarWidget", "saveToWidgetStorage success: username=" + username + ", serverUrl=" + serverUrl);

        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName cn = new ComponentName(context, CalendarWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(cn);

            for (int appWidgetId : ids) {
                CalendarWidgetProvider.updateWidget(context, mgr, appWidgetId);
            }
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.calendar_list);
        } catch (Exception e) {
            Log.e("CalendarWidget", "Error updating widget after saveToWidgetStorage", e);
        }
    }

    public static void scheduleTimerAlarm(Context context, int timerId, String title, long triggerAtMillis) {
        if (triggerAtMillis <= System.currentTimeMillis()) return;

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, TimerAlarmReceiver.class);
        intent.putExtra("timerId", timerId);
        intent.putExtra("title", title);

        PendingIntent pi = PendingIntent.getBroadcast(
            context,
            timerId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            }
            Log.d("CalendarWidget", "Scheduled alarm for timer " + timerId + " (" + title + ") at " + triggerAtMillis);
        } catch (Exception e) {
            Log.e("CalendarWidget", "Error scheduling exact alarm", e);
            try {
                am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            } catch (Exception ex) {
                Log.e("CalendarWidget", "Error scheduling fallback alarm", ex);
            }
        }
    }

    public static void cancelScheduledTimerAlarm(Context context, int timerId) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, TimerAlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(
            context,
            timerId,
            intent,
            PendingIntent.FLAG_NO_CREATE | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        if (pi != null) {
            am.cancel(pi);
            pi.cancel();
            Log.d("CalendarWidget", "Cancelled scheduled alarm for timer " + timerId);
        }
    }

    public class WidgetBridgeInterface {
        private Context mContext;

        public WidgetBridgeInterface(Context context) {
            mContext = context;
        }

        @JavascriptInterface
        public void saveWidgetSettings(String username, String password, String serverUrl) {
            Log.d("CalendarWidget", "JavascriptInterface saveWidgetSettings called: user=" + username);
            saveToWidgetStorage(mContext, username, password, serverUrl);
        }

        @JavascriptInterface
        public void playAlarmSound() {
            TimerAlarmHelper.playAlarmSound(mContext);
        }

        @JavascriptInterface
        public void stopAlarmSound() {
            TimerAlarmHelper.stopAlarmSound();
        }

        @JavascriptInterface
        public void showTimerNotification(String title, String message, int timerId) {
            TimerAlarmHelper.showNotification(mContext, title, message, timerId);
        }

        @JavascriptInterface
        public void scheduleTimerAlarm(int timerId, String title, double triggerAtMillis) {
            scheduleTimerAlarm(mContext, timerId, title, (long) triggerAtMillis);
        }

        @JavascriptInterface
        public void cancelScheduledTimerAlarm(int timerId) {
            cancelScheduledTimerAlarm(mContext, timerId);
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            MainActivity.this.requestNotificationPermission();
        }
    }
}
