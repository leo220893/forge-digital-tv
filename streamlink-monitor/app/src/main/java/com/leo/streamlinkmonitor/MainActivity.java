package com.leo.streamlinkmonitor;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity implements UrlStore.Observer {
    private TextView statusText;
    private ListView listView;
    private CheckBox streamsOnly;
    private final List<UrlStore.UrlEvent> visibleEvents = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("StreamLink Monitor");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(14);
        root.setPadding(p, p, p, p);

        TextView title = new TextView(this);
        title.setText("StreamLink Monitor");
        title.setTextSize(24f);
        title.setTypeface(null, 1);
        root.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView subtitle = new TextView(this);
        subtitle.setText("URLs completas usadas por tu reproductor (HLS, DASH, segmentos y redirecciones)");
        subtitle.setTextSize(14f);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subLp.topMargin = dp(4);
        root.addView(subtitle, subLp);

        statusText = new TextView(this);
        statusText.setTextSize(14f);
        LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        statusLp.topMargin = dp(12);
        root.addView(statusText, statusLp);

        streamsOnly = new CheckBox(this);
        streamsOnly.setText("Mostrar solo URLs de streaming");
        streamsOnly.setChecked(false);
        streamsOnly.setOnCheckedChangeListener((buttonView, isChecked) -> refresh());
        root.addView(streamsOnly);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);

        Button copy = new Button(this);
        copy.setText("Copiar última");
        copy.setOnClickListener(v -> copyLatest());
        buttons.addView(copy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button share = new Button(this);
        share.setText("Compartir");
        share.setOnClickListener(v -> shareLatest());
        buttons.addView(share, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button clear = new Button(this);
        clear.setText("Limpiar");
        clear.setOnClickListener(v -> UrlStore.clear(this));
        buttons.addView(clear, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(buttons);

        listView = new ListView(this);
        LinearLayout.LayoutParams listLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        listLp.topMargin = dp(8);
        root.addView(listView, listLp);

        setContentView(root);
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        UrlStore.addObserver(this);
        refresh();
    }

    @Override
    protected void onPause() {
        UrlStore.removeObserver(this);
        super.onPause();
    }

    @Override
    public void onStoreChanged() {
        runOnUiThread(this::refresh);
    }

    private void refresh() {
        List<UrlStore.UrlEvent> all = UrlStore.load(this);
        visibleEvents.clear();
        List<String> rows = new ArrayList<>();
        for (UrlStore.UrlEvent event : all) {
            if (streamsOnly.isChecked() && !event.isStreaming()) continue;
            visibleEvents.add(event);
            rows.add(event.asDisplayText());
        }
        statusText.setText(all.isEmpty()
                ? "Estado: esperando URLs de tu app de streaming"
                : "Capturadas: " + all.size() + " • visibles: " + visibleEvents.size());
        listView.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, rows));
    }

    private void copyLatest() {
        UrlStore.UrlEvent event = latestVisible();
        if (event == null) {
            Toast.makeText(this, "Todavía no hay URLs capturadas.", Toast.LENGTH_SHORT).show();
            return;
        }
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("URL de streaming", event.url));
        Toast.makeText(this, "URL copiada.", Toast.LENGTH_SHORT).show();
    }

    private void shareLatest() {
        UrlStore.UrlEvent event = latestVisible();
        if (event == null) {
            Toast.makeText(this, "Todavía no hay URLs capturadas.", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT, event.url);
        startActivity(Intent.createChooser(share, "Compartir URL"));
    }

    private UrlStore.UrlEvent latestVisible() {
        return visibleEvents.isEmpty() ? null : visibleEvents.get(0);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
