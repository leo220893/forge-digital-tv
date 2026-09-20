# Integración con la app de streaming

El APK `StreamLink Monitor` muestra URLs completas que la app propietaria le reporta antes/después de que HTTPS las cifre.

## Opción recomendada: AndroidX Media3 / ExoPlayer

1. Copiar `reporter-release.aar` dentro de `app/libs/` de la app de streaming.
2. Agregar en Gradle:

```gradle
implementation files('libs/reporter-release.aar')
```

3. Agregar un `AnalyticsListener` al `ExoPlayer` y reportar `loadEventInfo.uri` en `onLoadCompleted`. Ese campo contiene la URI real desde la que se leyó, y refleja la URI posterior a una redirección cuando la hubo.

### Java

```java
player.addAnalyticsListener(new AnalyticsListener() {
    @Override
    public void onLoadCompleted(
            AnalyticsListener.EventTime eventTime,
            LoadEventInfo loadEventInfo,
            MediaLoadData mediaLoadData) {
        StreamLinkReporter.report(
                context,
                loadEventInfo.uri.toString(),
                null,
                "Media3",
                loadEventInfo.bytesLoaded,
                0
        );
    }

    @Override
    public void onLoadError(
            AnalyticsListener.EventTime eventTime,
            LoadEventInfo loadEventInfo,
            MediaLoadData mediaLoadData,
            IOException error,
            boolean wasCanceled) {
        StreamLinkReporter.report(
                context,
                loadEventInfo.uri.toString(),
                "ERROR",
                "Media3",
                loadEventInfo.bytesLoaded,
                0
        );
    }
});
```

Imports principales:

```java
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.source.LoadEventInfo;
import androidx.media3.exoplayer.source.MediaLoadData;
import com.leo.streamlinkreporter.StreamLinkReporter;
```

### Kotlin

```kotlin
player.addAnalyticsListener(object : AnalyticsListener {
    override fun onLoadCompleted(
        eventTime: AnalyticsListener.EventTime,
        loadEventInfo: LoadEventInfo,
        mediaLoadData: MediaLoadData
    ) {
        StreamLinkReporter.report(
            context,
            loadEventInfo.uri.toString(),
            null,
            "Media3",
            loadEventInfo.bytesLoaded,
            0
        )
    }
})
```

## Sin usar el AAR

También se puede enviar directamente un broadcast explícito:

```java
Intent i = new Intent("com.leo.streamlinkmonitor.REPORT_URL");
i.setPackage("com.leo.streamlinkmonitor");
i.putExtra("url", fullUrl);
i.putExtra("source", "Mi app");
context.sendBroadcast(i);
```

El monitor conserva las últimas 300 entradas y clasifica automáticamente `.m3u8`, `.mpd`, segmentos multimedia y URLs HTTP generales.
