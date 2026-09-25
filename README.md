# FORGE DIGITAL TV

Reproductor de canales propio de **FORGE DIGITAL**. Web estática (HTML + CSS + JavaScript, sin build ni
dependencias) que lee `catalog.json` y reproduce señales **HLS (.m3u8)**, **DASH**, **MP4/WebM** y **audio**.

Pensado para funcionar igual en Smart TV (navegación con control remoto), móvil y escritorio.

---

## Características

- **Catálogo por categorías** leído de `catalog.json`, con numeración automática de canales.
- **Reproductor HLS** con [hls.js](https://github.com/video-dev/hls.js) cargado bajo demanda desde CDN, y
  reproducción nativa en Safari / iOS / tvOS.
- **Recuperación ante fallos**: reintentos automáticos de red y de medios, pantalla de error con "Reintentar".
- **Navegación D-pad**: flechas, OK y tecla Back — incluye los códigos de Samsung Tizen (`10009`) y LG webOS (`461`).
- **Zapping numérico**: tipeá `0-9` para saltar directo a un canal por su número.
- **Favoritos** persistidos en `localStorage`, con categoría virtual ★ Favoritos.
- **Buscador** instantáneo (tecla `/`), insensible a acentos.
- **OSD** con nombre, descripción, indicador EN VIVO, volumen, mute, favorito y pantalla completa.
- Responsive real: rail lateral en escritorio/TV, carrusel de categorías en móvil.
- Respeta `prefers-reduced-motion`.

---

## Uso

Es un sitio estático: alcanza con servirlo por HTTP (no funciona con `file://` por la política CORS del `fetch`).

```bash
# Cualquiera de estas opciones
python3 -m http.server 3000
npx serve .
```

Luego abrí <http://localhost:3000>.

### Publicar en GitHub Pages

1. **Settings → Pages → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
2. El archivo `.nojekyll` ya está incluido para que Pages sirva todo tal cual.

---

## Atajos de teclado / control remoto

| Tecla | Catálogo | Reproductor |
|---|---|---|
| `↑ ↓ ← →` | Mover el foco entre categorías y canales | `↑ ↓` cambia de canal, `← →` mueve el foco del OSD |
| `OK` / `Enter` | Reproducir el canal enfocado | Activar el botón enfocado / play-pausa |
| `Back` / `Esc` | Limpiar la búsqueda | Volver al catálogo |
| `0-9` | Ir al canal por número | Ir al canal por número |
| `/` | Enfocar el buscador | — |
| `F` | Marcar/desmarcar favorito | Pantalla completa |
| `L` | — | Marcar/desmarcar favorito |
| `M` | — | Silenciar |
| `+` `-` | — | Volumen |
| `Espacio` | — | Play / Pausa |

---

## Estructura del catálogo

`catalog.json` es la única fuente de verdad. Para agregar canales basta editarlo:

```jsonc
{
  "version": 2,
  "brand": "FORGE DIGITAL",
  "updatedAt": "2026-09-25T00:00:00Z",
  "categories": [
    {
      "id": "deportes",              // único, sin espacios
      "name": "DEPORTES",            // se muestra en el rail
      "channels": [
        {
          "id": "canal-uno",         // único en todo el catálogo
          "name": "Canal Uno",
          "description": "Texto corto que aparece en la tarjeta y en el OSD.",
          "logo": "https://…/logo.png",  // opcional; si falta se usan las iniciales
          "url": "https://…/stream.m3u8",
          "type": "hls"              // hls | dash | mp4 | webm | audio (se autodetecta si se omite)
        }
      ]
    }
  ]
}
```

### Validación

```bash
node scripts/validate-catalog.mjs              # estructura, IDs duplicados, HTTPS
node scripts/validate-catalog.mjs --check-urls # además verifica que cada URL responda
```

---

## Archivos

```
index.html                    Estructura: splash, catálogo y reproductor
styles.css                    Tema negro + dorado, foco de TV, responsive
script.js                     Catálogo, navegación D-pad, HLS, favoritos, zapping
catalog.json                  Canales y categorías
logo.png                      Logo de marca (si falta, se dibuja un SVG de reserva)
scripts/validate-catalog.mjs  Validador del catálogo
.nojekyll                     Para GitHub Pages
```

---

## Notas

- Las señales deben servirse por **HTTPS** y con **CORS habilitado**; si no, el navegador las bloquea al
  publicar el sitio en HTTPS. El validador avisa cuando una URL usa `http://`.
- Los canales incluidos hoy son material de demostración y streams de prueba públicos (Blender Foundation,
  streams de referencia de Mux y Apple). Reemplazalos por las señales propias de FORGE DIGITAL.
- El autoplay con sonido está restringido por los navegadores: si se bloquea, el reproductor arranca en
  silencio y avisa para activar el audio con `M`.
