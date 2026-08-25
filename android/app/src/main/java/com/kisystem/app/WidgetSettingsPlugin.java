package com.kisystem.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.appwidget.AppWidgetManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetSettings")
public class WidgetSettingsPlugin extends Plugin {

    @PluginMethod
    public void saveSettings(PluginCall call) {
        JSObject data = call.getData();

        String username = call.getString("username");
        if (username == null || username.trim().isEmpty()) {
            username = call.getString("api_username");
        }
        if (username == null || username.trim().isEmpty()) {
            username = data != null ? data.optString("api_username", "") : "";
        }

        String password = call.getString("password");
        if (password == null || password.trim().isEmpty()) {
            password = call.getString("api_password");
        }
        if (password == null || password.trim().isEmpty()) {
            password = data != null ? data.optString("api_password", "") : "";
        }

        String serverUrl = call.getString("serverUrl");
        if (serverUrl == null || serverUrl.trim().isEmpty()) {
            serverUrl = call.getString("server_url");
        }
        if (serverUrl == null || serverUrl.trim().isEmpty()) {
            serverUrl = data != null ? data.optString("server_url", "") : "";
        }

        SharedPreferences prefs = getContext().getSharedPreferences("WidgetStorage", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        if (username != null && !username.trim().isEmpty()) {
            editor.putString("api_username", username.trim());
        }
        if (password != null && !password.trim().isEmpty()) {
            editor.putString("api_password", password.trim());
        }
        if (serverUrl != null && !serverUrl.trim().isEmpty()) {
            editor.putString("server_url", serverUrl.trim());
        }
        editor.commit();

        android.util.Log.d("CalendarWidget", "WidgetSettingsPlugin saved: username=" + prefs.getString("api_username", "") + ", serverUrl=" + prefs.getString("server_url", ""));

        // Trigger widget update
        try {
            Context context = getContext();
            Intent intent = new Intent(context, CalendarWidgetProvider.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            int[] ids = AppWidgetManager.getInstance(context)
                .getAppWidgetIds(new ComponentName(context, CalendarWidgetProvider.class));
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            context.sendBroadcast(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }

        call.resolve();
    }

    @PluginMethod
    public void playAlarmSound(PluginCall call) {
        TimerAlarmHelper.playAlarmSound(getContext());
        call.resolve();
    }

    @PluginMethod
    public void stopAlarmSound(PluginCall call) {
        TimerAlarmHelper.stopAlarmSound();
        call.resolve();
    }

    @PluginMethod
    public void showTimerNotification(PluginCall call) {
        String title = call.getString("title", "Timer abgelaufen! ⏰");
        String message = call.getString("message", "Ein Timer ist abgelaufen.");
        int timerId = call.getInt("timerId", 0);
        TimerAlarmHelper.showNotification(getContext(), title, message, timerId);
        call.resolve();
    }

    @PluginMethod
    public void scheduleTimerAlarm(PluginCall call) {
        int timerId = call.getInt("timerId", 0);
        String title = call.getString("title", "Timer");
        Double triggerAt = call.getDouble("triggerAtMillis");
        if (triggerAt != null) {
            MainActivity.scheduleTimerAlarm(getContext(), timerId, title, triggerAt.longValue());
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelScheduledTimerAlarm(PluginCall call) {
        int timerId = call.getInt("timerId", 0);
        MainActivity.cancelScheduledTimerAlarm(getContext(), timerId);
        call.resolve();
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).requestNotificationPermission();
        }
        call.resolve();
    }

    @PluginMethod
    public void showMailNotification(PluginCall call) {
        String fromName = call.getString("fromName", "Neue E-Mail");
        String subject = call.getString("subject", "");
        String snippet = call.getString("snippet", "");
        int mailId = call.getInt("mailId", 0);
        String accountEmail = call.getString("accountEmail", "");
        MailNotificationHelper.showMailNotification(getContext(), fromName, subject, snippet, mailId, accountEmail);
        call.resolve();
    }

    @PluginMethod
    public void showTestMailNotification(PluginCall call) {
        MailNotificationHelper.showTestNotification(getContext());
        call.resolve();
    }

    @PluginMethod
    public void checkMailNotificationsNow(PluginCall call) {
        MainActivity.triggerImmediateMailSync(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setMailNotificationsEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        SharedPreferences prefs = getContext().getSharedPreferences("WidgetStorage", Context.MODE_PRIVATE);
        prefs.edit().putBoolean("mail_notifications_enabled", enabled != null ? enabled : true).apply();
        call.resolve();
    }

    @PluginMethod
    public void isMailNotificationsEnabled(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("WidgetStorage", Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("mail_notifications_enabled", true);
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }
}
