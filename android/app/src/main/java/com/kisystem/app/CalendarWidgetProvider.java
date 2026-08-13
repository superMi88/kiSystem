package com.kisystem.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
import android.widget.RemoteViews;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CalendarWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.kisystem.app.ACTION_REFRESH";
    public static final String ACTION_TOGGLE_TASK = "com.kisystem.app.ACTION_TOGGLE_TASK";
    
    private final ExecutorService executorService = Executors.newSingleThreadExecutor();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.calendar_list);
        super.onUpdate(context, appWidgetManager, appWidgetIds);
    }

    public static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.calendar_widget);

        // Set up the intent pointing to CalendarWidgetService to provide RemoteViews for the ListView
        Intent serviceIntent = new Intent(context, CalendarWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        // Bind unique URI so the system knows this is a unique intent (important for ListView caching)
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.calendar_list, serviceIntent);

        // Set empty view
        views.setEmptyView(R.id.calendar_list, R.id.empty_view);

        // Click on Widget Title/Header -> Open App
        Intent openAppIntent = new Intent(context, MainActivity.class);
        PendingIntent openAppPendingIntent = PendingIntent.getActivity(context, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Set it on the top area by setting it to the refresh button or we can map it to R.id.calendar_list template if needed.
        // We will map it to the parent container click if they tap any non-list part, but we can set it on R.id.btn_refresh if we want a separate button.
        // Actually, we'll assign it to the root of the widget or title.

        // Refresh button click intent
        Intent refreshIntent = new Intent(context, CalendarWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH);
        PendingIntent refreshPendingIntent = PendingIntent.getBroadcast(context, 0, refreshIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.btn_refresh, refreshPendingIntent);

        // PendingIntent template for list items (ListView actions)
        Intent clickIntent = new Intent(context, CalendarWidgetProvider.class);
        clickIntent.setAction(ACTION_TOGGLE_TASK);
        PendingIntent clickPendingIntent = PendingIntent.getBroadcast(context, 0, clickIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        views.setPendingIntentTemplate(R.id.calendar_list, clickPendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        
        if (ACTION_REFRESH.equals(action) || AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action)) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName cn = new ComponentName(context, CalendarWidgetProvider.class);
            mgr.notifyAppWidgetViewDataChanged(mgr.getAppWidgetIds(cn), R.id.calendar_list);
        } else if (ACTION_TOGGLE_TASK.equals(action)) {
            final String taskId = intent.getStringExtra("task_id");
            final boolean completed = intent.getBooleanExtra("is_completed", false);
            
            if (taskId != null) {
                // Perform network post in background thread
                executorService.submit(() -> {
                    toggleTaskCompleted(context, taskId, completed);
                    
                    // Trigger refresh once update completes
                    AppWidgetManager mgr = AppWidgetManager.getInstance(context);
                    ComponentName cn = new ComponentName(context, CalendarWidgetProvider.class);
                    mgr.notifyAppWidgetViewDataChanged(mgr.getAppWidgetIds(cn), R.id.calendar_list);
                });
            }
        }
        
        super.onReceive(context, intent);
    }

    private void toggleTaskCompleted(Context context, String taskId, boolean completed) {
        SharedPreferences prefs = context.getSharedPreferences("WidgetStorage", Context.MODE_PRIVATE);
        String serverUrl = prefs.getString("server_url", "https://ki.kleiner-wald-server.de");
        String username = prefs.getString("api_username", "");
        String password = prefs.getString("api_password", "");

        if (serverUrl == null || serverUrl.isEmpty()) {
            return;
        }

        if (!serverUrl.endsWith("/")) {
            serverUrl += "/";
        }
        
        HttpURLConnection conn = null;
        try {
            URL url = new URL(serverUrl + "tasks/complete");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            if (!username.isEmpty() && !password.isEmpty()) {
                String auth = username + ":" + password;
                String encodedAuth = Base64.encodeToString(auth.getBytes(), Base64.NO_WRAP);
                conn.setRequestProperty("Authorization", "Basic " + encodedAuth);
            }

            String jsonPayload = "{\"taskId\":" + taskId + ",\"completed\":" + completed + "}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonPayload.getBytes("UTF-8"));
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            if (responseCode == HttpURLConnection.HTTP_OK) {
                android.util.Log.d("CalendarWidget", "Task toggle succeeded!");
            } else {
                android.util.Log.e("CalendarWidget", "Task toggle failed response code: " + responseCode);
            }
        } catch (Exception e) {
            android.util.Log.e("CalendarWidget", "Error toggling task on server", e);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }
}
