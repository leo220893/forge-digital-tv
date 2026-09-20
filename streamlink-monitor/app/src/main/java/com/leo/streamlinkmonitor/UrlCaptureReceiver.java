package com.leo.streamlinkmonitor;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class UrlCaptureReceiver extends BroadcastReceiver {
    public static final String ACTION_REPORT_URL = "com.leo.streamlinkmonitor.REPORT_URL";
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_KIND = "kind";
    public static final String EXTRA_SOURCE = "source";
    public static final String EXTRA_BYTES = "bytes";
    public static final String EXTRA_STATUS = "status";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_REPORT_URL.equals(intent.getAction())) return;
        UrlStore.record(
                context.getApplicationContext(),
                intent.getStringExtra(EXTRA_URL),
                intent.getStringExtra(EXTRA_KIND),
                intent.getStringExtra(EXTRA_SOURCE),
                intent.getLongExtra(EXTRA_BYTES, 0L),
                intent.getIntExtra(EXTRA_STATUS, 0)
        );
    }
}
