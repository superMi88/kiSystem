package com.kisystem.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;

public class CalendarWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new CalendarWidgetFactory(this.getApplicationContext(), intent);
    }
}

class CalendarWidgetFactory implements RemoteViewsService.RemoteViewsFactory {

    private static final int TYPE_HEADER = 0;
    private static final int TYPE_EVENT = 1;
    private static final int TYPE_TASK = 2;

    private final Context mContext;
    private final List<DisplayItem> mItems = new ArrayList<>();

    public CalendarWidgetFactory(Context context, Intent intent) {
        mContext = context;
    }

    @Override
    public void onCreate() {
        // No-op
    }

    @Override
    public void onDataSetChanged() {
        mItems.clear();

        SharedPreferences prefs = mContext.getSharedPreferences("WidgetStorage", Context.MODE_PRIVATE);
        String serverUrl = prefs.getString("server_url", "https://ki.kleiner-wald-server.de");
        String username = prefs.getString("api_username", "");
        String password = prefs.getString("api_password", "");

        Log.d("CalendarWidget", "onDataSetChanged: server_url=" + serverUrl + ", username=" + username + ", hasPassword=" + (!password.isEmpty()));

        String baseUrl = serverUrl != null ? serverUrl.trim() : "";
        while (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }

        if (baseUrl.isEmpty()) {
            Log.w("CalendarWidget", "No server URL configured for widget");
            mItems.add(new DisplayItem(TYPE_HEADER, "⚠️ Keine Server-URL konfiguriert"));
            return;
        }

        username = username != null ? username.trim() : "";
        password = password != null ? password.trim() : "";

        // Prepare time range (today 00:00:00 to 14 days later 23:59:59)
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date startDate = cal.getTime();

        Calendar calEnd = Calendar.getInstance();
        calEnd.setTime(startDate);
        calEnd.add(Calendar.DAY_OF_YEAR, 14);
        calEnd.set(Calendar.HOUR_OF_DAY, 23);
        calEnd.set(Calendar.MINUTE, 59);
        calEnd.set(Calendar.SECOND, 59);
        calEnd.set(Calendar.MILLISECOND, 999);
        Date endDate = calEnd.getTime();

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        String startIso = sdf.format(startDate);
        String endIso = sdf.format(endDate);

        HttpURLConnection conn = null;
        try {
            URL url = new URL(baseUrl + "/api/calendar/events?start=" + startIso + "&end=" + endIso);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

        if (!username.isEmpty()) {
            String auth = username + ":" + password;
            String encodedAuth = Base64.encodeToString(auth.getBytes("UTF-8"), Base64.NO_WRAP);
            conn.setRequestProperty("Authorization", "Basic " + encodedAuth);
        }

        int responseCode = conn.getResponseCode();
        if (responseCode == HttpURLConnection.HTTP_OK) {
            BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
            StringBuilder response = new StringBuilder();
            String inputLine;
            while ((inputLine = in.readLine()) != null) {
                response.append(inputLine);
            }
            in.close();

            JSONObject json = new JSONObject(response.toString());
            JSONArray eventsArray = json.optJSONArray("events");
            
            if (eventsArray != null && eventsArray.length() > 0) {
                String lastDateKey = "";
                SimpleDateFormat localDateKeyFormat = new SimpleDateFormat("yyyy-MM-dd");
                localDateKeyFormat.setTimeZone(TimeZone.getDefault());
                
                SimpleDateFormat humanDayFormat = new SimpleDateFormat("EEEE, dd.MM.");
                humanDayFormat.setTimeZone(TimeZone.getDefault());

                for (int i = 0; i < eventsArray.length(); i++) {
                    JSONObject ev = eventsArray.getJSONObject(i);
                    String timeStr = ev.optString("time", "");
                    if (timeStr.isEmpty()) timeStr = ev.optString("start", "");
                    if (timeStr.isEmpty()) timeStr = ev.optString("due", "");
                    if (timeStr.isEmpty()) timeStr = ev.optString("originalStart", "");
                    if (timeStr.isEmpty()) continue;

                    Date eventDate = parseIsoDate(timeStr);
                    String dateKey = localDateKeyFormat.format(eventDate);

                    // Inject Date Header if date changes
                    if (!dateKey.equals(lastDateKey)) {
                        lastDateKey = dateKey;
                        String headerTitle = formatFriendlyDate(eventDate, humanDayFormat);
                        mItems.add(new DisplayItem(TYPE_HEADER, headerTitle));
                    }

                    // Determine if it is a task or a regular calendar event
                    boolean isTask = ev.optBoolean("isTask", false);
                    String id = ev.optString("id", "");
                    String title = ev.optString("title", "");
                    String description = ev.optString("description", "");

                    // Resolve persons
                    StringBuilder personsBuilder = new StringBuilder();
                    JSONArray personsArray = ev.optJSONArray("persons");
                    if (personsArray != null && personsArray.length() > 0) {
                        for (int p = 0; p < personsArray.length(); p++) {
                            JSONObject person = personsArray.getJSONObject(p);
                            if (personsBuilder.length() > 0) personsBuilder.append(", ");
                            personsBuilder.append(person.optString("name", ""));
                        }
                    }

                    boolean isRec = ev.optBoolean("recurring", false);

                    if (isTask) {
                        boolean completed = ev.optBoolean("completed", false);
                        String rawId = id.replace("task-", "");
                        DisplayItem item = new DisplayItem(TYPE_TASK, title, rawId);
                        item.description = description;
                        item.isCompleted = completed;
                        item.isRecurring = isRec;
                        mItems.add(item);
                    } else {
                        String timeText = getEventTimeText(ev);
                        DisplayItem item = new DisplayItem(TYPE_EVENT, title, id);
                        item.timeText = timeText;
                        item.description = description;
                        item.persons = personsBuilder.toString();
                        item.isRecurring = isRec;
                        mItems.add(item);
                    }
                }
            }
        } else if (responseCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
            Log.e("CalendarWidget", "HTTP 401 Unauthorized");
            mItems.add(new DisplayItem(TYPE_HEADER, "⚠️ Bitte in der App anmelden"));
        } else {
            Log.e("CalendarWidget", "HTTP error code: " + responseCode);
            mItems.add(new DisplayItem(TYPE_HEADER, "⚠️ Serverfehler (HTTP " + responseCode + ")"));
        }
    } catch (Exception e) {
        Log.e("CalendarWidget", "Error fetching calendar data", e);
        mItems.add(new DisplayItem(TYPE_HEADER, "⚠️ Verbindung fehlgeschlagen"));
    } finally {
        if (conn != null) {
            conn.disconnect();
        }
    }
    }

    private String formatFriendlyDate(Date date, SimpleDateFormat humanDayFormat) {
        Calendar today = Calendar.getInstance();
        Calendar target = Calendar.getInstance();
        target.setTime(date);

        if (today.get(Calendar.YEAR) == target.get(Calendar.YEAR) &&
            today.get(Calendar.DAY_OF_YEAR) == target.get(Calendar.DAY_OF_YEAR)) {
            return "Heute";
        }
        
        today.add(Calendar.DAY_OF_YEAR, 1);
        if (today.get(Calendar.YEAR) == target.get(Calendar.YEAR) &&
            today.get(Calendar.DAY_OF_YEAR) == target.get(Calendar.DAY_OF_YEAR)) {
            return "Morgen";
        }

        return humanDayFormat.format(date);
    }

    private Date parseIsoDate(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) {
            return new Date();
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try {
                return Date.from(java.time.Instant.parse(dateStr));
            } catch (Exception ignored) {}
            try {
                return Date.from(java.time.OffsetDateTime.parse(dateStr).toInstant());
            } catch (Exception ignored) {}
            try {
                return Date.from(java.time.LocalDate.parse(dateStr).atStartOfDay(java.time.ZoneId.systemDefault()).toInstant());
            } catch (Exception ignored) {}
        }
        String[] formats = new String[] {
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd"
        };
        for (String fmt : formats) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(fmt);
                sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                return sdf.parse(dateStr);
            } catch (Exception ignored) {}
        }
        return new Date();
    }

    private String getEventTimeText(JSONObject ev) {
        boolean isAllDay = ev.optBoolean("isAllDay", false);
        String fuzzyTime = ev.optString("fuzzyTime", "");

        if (isAllDay) {
            return "ganztägig";
        } else if (fuzzyTime != null && !fuzzyTime.isEmpty() && !fuzzyTime.equals("null")) {
            return fuzzyTime;
        } else {
            String timeStr = ev.optString("time", "");
            String endTimeStr = ev.optString("endTime", "");
            if (timeStr.isEmpty()) return "";

            Date start = parseIsoDate(timeStr);
            Date end = endTimeStr.isEmpty() ? start : parseIsoDate(endTimeStr);

            SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm");
            timeFormat.setTimeZone(TimeZone.getDefault());

            return timeFormat.format(start) + " - " + timeFormat.format(end);
        }
    }

    @Override
    public void onDestroy() {
        mItems.clear();
    }

    @Override
    public int getCount() {
        return mItems.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        if (position < 0 || position >= mItems.size()) {
            return null;
        }

        DisplayItem item = mItems.get(position);

        if (item.type == TYPE_HEADER) {
            RemoteViews views = new RemoteViews(mContext.getPackageName(), R.layout.calendar_widget_item_header);
            views.setTextViewText(R.id.header_title, item.title);
            return views;
        } else if (item.type == TYPE_EVENT) {
            RemoteViews views = new RemoteViews(mContext.getPackageName(), R.layout.calendar_widget_item_event);
            views.setTextViewText(R.id.event_title, item.title);
            views.setTextViewText(R.id.event_time, item.timeText);

            if (item.description != null && !item.description.trim().isEmpty()) {
                views.setViewVisibility(R.id.event_description, View.VISIBLE);
                views.setTextViewText(R.id.event_description, item.description);
            } else {
                views.setViewVisibility(R.id.event_description, View.GONE);
            }

            if (item.persons != null && !item.persons.trim().isEmpty()) {
                views.setViewVisibility(R.id.event_persons, View.VISIBLE);
                views.setTextViewText(R.id.event_persons, "👤 " + item.persons);
            } else {
                views.setViewVisibility(R.id.event_persons, View.GONE);
            }

            if (item.isRecurring) {
                views.setViewVisibility(R.id.event_repeat_badge, View.VISIBLE);
            } else {
                views.setViewVisibility(R.id.event_repeat_badge, View.GONE);
            }

            return views;
        } else {
            RemoteViews views = new RemoteViews(mContext.getPackageName(), R.layout.calendar_widget_item_task);
            views.setTextViewText(R.id.task_checkbox, item.isCompleted ? "☑" : "☐");

            if (item.isCompleted) {
                SpannableString spannable = new SpannableString("[Aufgabe] " + item.title);
                spannable.setSpan(new StrikethroughSpan(), 0, spannable.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                views.setTextViewText(R.id.task_title, spannable);
                views.setTextColor(R.id.task_checkbox, Color.GRAY);
            } else {
                views.setTextViewText(R.id.task_title, "[Aufgabe] " + item.title);
                views.setTextColor(R.id.task_checkbox, Color.parseColor("#a6e3a1"));
            }

            if (item.description != null && !item.description.trim().isEmpty()) {
                views.setViewVisibility(R.id.task_notes, View.VISIBLE);
                views.setTextViewText(R.id.task_notes, item.description);
            } else {
                views.setViewVisibility(R.id.task_notes, View.GONE);
            }

            if (item.isRecurring) {
                views.setViewVisibility(R.id.task_repeat_badge, View.VISIBLE);
            } else {
                views.setViewVisibility(R.id.task_repeat_badge, View.GONE);
            }

            // Fill-in Intent for list item click template
            Intent fillInIntent = new Intent();
            fillInIntent.putExtra("task_id", item.id);
            fillInIntent.putExtra("is_completed", !item.isCompleted);
            views.setOnClickFillInIntent(R.id.task_checkbox, fillInIntent);

            return views;
        }
    }

    @Override
    public RemoteViews getLoadingView() {
        return null; // Use default loading view
    }

    @Override
    public int getViewTypeCount() {
        return 3; // Header, Event, Task
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }

    private static class DisplayItem {
        final int type;
        final String title;
        final String id;
        
        String timeText = "";
        String description = "";
        String persons = "";
        boolean isCompleted = false;
        boolean isRecurring = false;

        DisplayItem(int type, String title) {
            this(type, title, "");
        }

        DisplayItem(int type, String title, String id) {
            this.type = type;
            this.title = title;
            this.id = id;
        }
    }
}
