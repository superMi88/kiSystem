package com.kisystem.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MailSyncWorker extends Worker {
    private static final String TAG = "MailSyncWorker";

    public MailSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        Log.d(TAG, "Starting MailSyncWorker background check for new emails...");

        try {
            SharedPreferences prefs = context.getSharedPreferences("WidgetStorage", Context.MODE_PRIVATE);
            boolean notificationsEnabled = prefs.getBoolean("mail_notifications_enabled", true);
            if (!notificationsEnabled) {
                Log.d(TAG, "Mail notifications are disabled by user preference.");
                return Result.success();
            }

            String serverUrl = prefs.getString("server_url", "");
            if (serverUrl.isEmpty()) serverUrl = prefs.getString("serverUrl", "");
            if (serverUrl.isEmpty()) serverUrl = "https://ki.kleiner-wald-server.de";

            String username = prefs.getString("api_username", "");
            if (username.isEmpty()) username = prefs.getString("username", "");

            String password = prefs.getString("api_password", "");
            if (password.isEmpty()) password = prefs.getString("password", "");

            if (username.isEmpty()) {
                SharedPreferences defaultPrefs = context.getSharedPreferences("com.kisystem.app_preferences", Context.MODE_PRIVATE);
                if (username.isEmpty()) username = defaultPrefs.getString("api_username", "");
                if (username.isEmpty()) username = defaultPrefs.getString("username", "");
                if (password.isEmpty()) password = defaultPrefs.getString("api_password", "");
                if (password.isEmpty()) password = defaultPrefs.getString("password", "");
            }

            String baseUrl = serverUrl != null ? serverUrl.trim() : "";
            while (baseUrl.endsWith("/")) {
                baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
            }

            if (baseUrl.isEmpty() || username.isEmpty()) {
                Log.w(TAG, "Server URL or username not configured, skipping background check.");
                return Result.success();
            }

            int lastNotifiedMailId = prefs.getInt("last_notified_mail_id", 0);
            String endpoint = baseUrl + "/api/mail/notifications/latest" + (lastNotifiedMailId > 0 ? "?sinceId=" + lastNotifiedMailId : "");

            HttpURLConnection conn = null;
            try {
                URL url = new URL(endpoint);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                if (!username.isEmpty() && !password.isEmpty()) {
                    String auth = username + ":" + password;
                    String encodedAuth = Base64.encodeToString(auth.getBytes(), Base64.NO_WRAP);
                    conn.setRequestProperty("Authorization", "Basic " + encodedAuth);
                }

                int responseCode = conn.getResponseCode();
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = in.readLine()) != null) {
                        response.append(line);
                    }
                    in.close();

                    JSONObject json = new JSONObject(response.toString());
                    int latestMailId = json.optInt("latestMailId", 0);
                    int unreadCount = json.optInt("unreadCount", 0);
                    JSONArray newEmails = json.optJSONArray("newEmails");

                    Log.d(TAG, "Mail check response: latestMailId=" + latestMailId + ", unreadCount=" + unreadCount + ", newEmailsCount=" + (newEmails != null ? newEmails.length() : 0));

                    if (newEmails != null && newEmails.length() > 0) {
                        // Wenn lastNotifiedMailId noch 0 ist (Erster Aufruf), benachrichtigen wir über bis zu 3 neuere ungelesene Mails
                        int maxToNotify = (lastNotifiedMailId == 0) ? Math.min(3, newEmails.length()) : newEmails.length();
                        for (int i = 0; i < maxToNotify; i++) {
                            JSONObject mail = newEmails.getJSONObject(i);
                            int mailId = mail.optInt("id", 0);
                            String fromName = mail.optString("fromName", "");
                            String from = mail.optString("from", "");
                            String subject = mail.optString("subject", "(Kein Betreff)");
                            String snippet = mail.optString("snippet", "");
                            String accountEmail = mail.optString("accountEmail", "");

                            String displayName = (!fromName.isEmpty() && !fromName.equals("Unbekannt")) ? fromName : from;
                            MailNotificationHelper.showMailNotification(context, displayName, subject, snippet, mailId, accountEmail);
                        }

                        // Speichere die höchste gemeldete ID
                        int maxSeenId = Math.max(lastNotifiedMailId, latestMailId);
                        for (int i = 0; i < newEmails.length(); i++) {
                            int mid = newEmails.getJSONObject(i).optInt("id", 0);
                            if (mid > maxSeenId) maxSeenId = mid;
                        }

                        prefs.edit().putInt("last_notified_mail_id", maxSeenId).apply();
                        Log.d(TAG, "Updated last_notified_mail_id to " + maxSeenId);

                        // Aktualisiere ggf. Widgets
                        try {
                            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
                            ComponentName cn = new ComponentName(context, CalendarWidgetProvider.class);
                            int[] ids = mgr.getAppWidgetIds(cn);
                            mgr.notifyAppWidgetViewDataChanged(ids, R.id.calendar_list);
                        } catch (Exception ignored) {}
                    } else if (latestMailId > lastNotifiedMailId) {
                        prefs.edit().putInt("last_notified_mail_id", latestMailId).apply();
                    }
                } else {
                    Log.w(TAG, "Mail check failed with HTTP response: " + responseCode);
                }
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }

            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "Error checking mail notifications in background worker", e);
            return Result.retry();
        }
    }
}
