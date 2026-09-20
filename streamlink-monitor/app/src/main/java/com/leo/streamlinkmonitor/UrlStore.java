package com.leo.streamlinkmonitor;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;

public final class UrlStore {
    private static final String PREFS = "streamlink_monitor";
    private static final String KEY = "events";
    private static final int MAX_EVENTS = 300;
    private static final CopyOnWriteArrayList<Observer> OBSERVERS = new CopyOnWriteArrayList<>();

    private UrlStore() {}

    public interface Observer {
        void onStoreChanged();
    }

    public static void addObserver(Observer observer) {
        if (observer != null && !OBSERVERS.contains(observer)) OBSERVERS.add(observer);
    }

    public static void removeObserver(Observer observer) {
        OBSERVERS.remove(observer);
    }

    public static synchronized void record(Context context, String url, String kind,
                                           String source, long bytes, int status) {
        if (url == null) return;
        url = url.trim();
        if (!(url.startsWith("http://") || url.startsWith("https://"))) return;

        List<UrlEvent> events = load(context);
        UrlEvent event = new UrlEvent(
                System.currentTimeMillis(),
                url,
                normalizeKind(kind, url),
                source == null || source.trim().isEmpty() ? "streaming-app" : source.trim(),
                Math.max(0L, bytes),
                status
        );
        events.add(0, event);
        if (events.size() > MAX_EVENTS) {
            events = new ArrayList<>(events.subList(0, MAX_EVENTS));
        }
        save(context, events);
        notifyObservers();
    }

    public static synchronized List<UrlEvent> load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, "[]");
        List<UrlEvent> result = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj == null) continue;
                result.add(new UrlEvent(
                        obj.optLong("time", 0L),
                        obj.optString("url", ""),
                        obj.optString("kind", "HTTP"),
                        obj.optString("source", "streaming-app"),
                        obj.optLong("bytes", 0L),
                        obj.optInt("status", 0)
                ));
            }
        } catch (Exception ignored) {
        }
        return result;
    }

    public static synchronized void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY, "[]").apply();
        notifyObservers();
    }

    private static void save(Context context, List<UrlEvent> events) {
        JSONArray array = new JSONArray();
        for (UrlEvent event : events) {
            JSONObject obj = new JSONObject();
            try {
                obj.put("time", event.time);
                obj.put("url", event.url);
                obj.put("kind", event.kind);
                obj.put("source", event.source);
                obj.put("bytes", event.bytes);
                obj.put("status", event.status);
                array.put(obj);
            } catch (Exception ignored) {
            }
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY, array.toString()).apply();
    }

    private static String normalizeKind(String supplied, String url) {
        if (supplied != null && !supplied.trim().isEmpty()) return supplied.trim().toUpperCase(Locale.ROOT);
        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.contains(".m3u8")) return "HLS PLAYLIST";
        if (lower.contains(".mpd")) return "DASH MANIFEST";
        if (lower.matches(".*\\.(ts|m4s|m4v|mp4|aac|m4a|webm|vtt)(\\?.*)?$")) return "MEDIA SEGMENT";
        return "HTTP";
    }

    private static void notifyObservers() {
        for (Observer observer : OBSERVERS) {
            try { observer.onStoreChanged(); } catch (Exception ignored) {}
        }
    }

    public static final class UrlEvent {
        public final long time;
        public final String url;
        public final String kind;
        public final String source;
        public final long bytes;
        public final int status;

        UrlEvent(long time, String url, String kind, String source, long bytes, int status) {
            this.time = time;
            this.url = url;
            this.kind = kind;
            this.source = source;
            this.bytes = bytes;
            this.status = status;
        }

        public boolean isStreaming() {
            String lower = url.toLowerCase(Locale.ROOT);
            return kind.contains("HLS") || kind.contains("DASH") || kind.contains("MEDIA")
                    || lower.contains(".m3u8") || lower.contains(".mpd")
                    || lower.matches(".*\\.(ts|m4s|m4v|mp4|aac|m4a|webm|vtt)(\\?.*)?$" );
        }

        public String asDisplayText() {
            String clock = new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date(time));
            StringBuilder sb = new StringBuilder();
            sb.append("[").append(kind).append("] ").append(clock).append("\n");
            sb.append(url).append("\n");
            try {
                Uri uri = Uri.parse(url);
                if (uri.getHost() != null) sb.append("Servidor: ").append(uri.getHost());
            } catch (Exception ignored) {
            }
            sb.append(" • Origen: ").append(source);
            if (status > 0) sb.append(" • HTTP ").append(status);
            if (bytes > 0) sb.append(" • ").append(formatBytes(bytes));
            return sb.toString();
        }

        private static String formatBytes(long value) {
            if (value < 1024) return value + " B";
            double kb = value / 1024.0;
            if (kb < 1024) return String.format(Locale.getDefault(), "%.1f KB", kb);
            double mb = kb / 1024.0;
            return String.format(Locale.getDefault(), "%.1f MB", mb);
        }
    }
}
