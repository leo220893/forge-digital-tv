package com.leo.streamlinkreporter;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

public final class StreamLinkReporter {
    private static final String MONITOR_PACKAGE = "com.leo.streamlinkmonitor";
    private static final String ACTION_REPORT_URL = "com.leo.streamlinkmonitor.REPORT_URL";

    private StreamLinkReporter() {}

    public static void report(Context context, String url) {
        report(context, url, null, null, 0L, 0);
    }

    public static void report(Context context, Uri uri) {
        if (uri != null) report(context, uri.toString(), null, null, 0L, 0);
    }

    public static void report(Context context, String url, String kind,
                              String source, long bytes, int status) {
        if (context == null || url == null) return;
        String clean = url.trim();
        if (!(clean.startsWith("http://") || clean.startsWith("https://"))) return;

        Intent intent = new Intent(ACTION_REPORT_URL);
        intent.setPackage(MONITOR_PACKAGE);
        intent.putExtra("url", clean);
        if (kind != null) intent.putExtra("kind", kind);
        if (source != null) intent.putExtra("source", source);
        intent.putExtra("bytes", Math.max(0L, bytes));
        intent.putExtra("status", status);
        context.getApplicationContext().sendBroadcast(intent);
    }
}
