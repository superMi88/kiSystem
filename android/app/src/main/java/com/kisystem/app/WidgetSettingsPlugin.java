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
        String username = call.getString("username");
        String password = call.getString("password");
        String serverUrl = call.getString("serverUrl");

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
}
