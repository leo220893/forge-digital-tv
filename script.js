/* ============================================================
   FORGE DIGITAL TV — script principal
   Vanilla JS, sin build. Lee catalog.json y reproduce canales
   HLS (.m3u8), DASH nativo, MP4 y audio.
   Navegación: mouse, touch y control remoto / teclado (D-pad).
   ============================================================ */

(() => {
  'use strict';

  /* ---------------------------------------------------------- CONFIG */
  const CONFIG = {
    catalogUrl: 'catalog.json',
    hlsCdn: 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js',
    osdTimeout: 4500,       // ms que tarda el OSD en ocultarse
    zapTimeout: 1800,       // ms para confirmar el número tipeado
    splashMin: 900,         // ms mínimos de splash
    retryMax: 3             // reintentos automáticos ante error de red
  };

  const STORE = {
    favs:   'forge:favorites',
    last:   'forge:lastChannel',
    volume: 'forge:volume',
    muted:  'forge:muted'
  };

  /* ------------------------------------------------------------ DOM */
  const $  = (sel, root = document) => root.querySelector(sel);
  const el = {
    splash:   $('#splash'),
    rail:     $('#rail'),
    grid:     $('#grid'),
    empty:    $('#empty'),
    catTitle: $('#cat-title'),
    catCount: $('#cat-count'),
    search:   $('#search-input'),
    status:   $('#status-pill'),
    clock:    $('#clock'),

    player:   $('#player'),
    video:    $('#video'),
    spinner:  $('#player-spinner'),
    perror:   $('#player-error'),
    perrorMsg:$('#player-error-msg'),
    osd:      $('#osd'),
    osdNum:   $('#osd-number'),
    osdName:  $('#osd-name'),
    osdDesc:  $('#osd-desc'),
    osdType:  $('#osd-type'),
    osdLive:  $('#osd-live'),
    zap:      $('#zap'),
    zapDigits:$('#zap-digits'),
    toast:    $('#toast'),

    btnPlay:  $('#btn-playpause'),
    btnMute:  $('#btn-mute'),
    btnFav:   $('#btn-fav'),
    btnFull:  $('#btn-fullscreen'),
    btnExit:  $('#btn-exit'),
    btnRetry: $('#btn-retry'),
    btnBackErr: $('#btn-back-error'),
    volume:   $('#volume'),
    iconPlay: $('#icon-playpause'),
    iconVol:  $('#icon-volume')
  };

  const ICONS = {
    play:  'M8 5v14l11-7z',
    pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
    vol:   'M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z',
    mute:  'M4 9v6h4l5 4V5L8 9H4zm15.5 3l2.1-2.1-1.4-1.4L18 10.6l-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.2 2.1 1.4-1.4-2.1-2.1z'
  };

  /* ----------------------------------------------------------- STATE */
  const state = {
    catalog: null,
    categories: [],        // [{id, name, channels:[]}]
    channels: [],          // todos los canales, con número global
    catId: null,
    query: '',
    visible: [],           // canales renderizados
    focus: { zone: 'grid', index: 0 },
    favs: new Set(readJSON(STORE.favs, [])),
    hls: null,
    current: null,
    suppressError: false,
    retries: 0,
    zapBuffer: '',
    timers: {}
  };

  /* --------------------------------------------------------- HELPERS */
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado */ }
  }
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function initials(name) {
    return String(name || '?')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase() || '?';
  }
  function norm(str) {
    return String(str ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  function toast(msg, ms = 1800) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(state.timers.toast);
    state.timers.toast = setTimeout(() => { el.toast.hidden = true; }, ms);
  }

  function setStatus(text, kind = 'ok') {
    el.status.textContent = text;
    el.status.className = `pill pill--${kind}`;
  }

  /* Silencia los eventos "error" del <video> mientras se vacía o cambia la fuente:
     al hacer removeAttribute('src') + load() los navegadores emiten un error espurio. */
  function quietVideo(fn) {
    state.suppressError = true;
    try { fn(); } finally {
      clearTimeout(state.timers.quiet);
      state.timers.quiet = setTimeout(() => { state.suppressError = false; }, 400);
    }
  }

  /* ------------------------------------------------------- CATÁLOGO */
  async function loadCatalog() {
    setStatus('Cargando catálogo…', 'warn');
    const res = await fetch(`${CONFIG.catalogUrl}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const cats = (data.categories || [])
      .map(c => ({
        id: String(c.id || '').trim() || 'sin-categoria',
        name: c.name || 'Sin categoría',
        channels: (c.channels || []).filter(ch => ch && ch.url)
      }))
      .filter(c => c.channels.length);

    let n = 0;
    const all = [];
    cats.forEach(cat => cat.channels.forEach(ch => {
      ch.number = ++n;
      ch.categoryId = cat.id;
      ch.categoryName = cat.name;
      ch.type = detectType(ch);
      all.push(ch);
    }));

    state.catalog = data;
    state.categories = cats;
    state.channels = all;
    setStatus(`${all.length} canales`, 'ok');
  }

  function detectType(ch) {
    const t = String(ch.type || '').toLowerCase();
    if (t) return t;
    const u = String(ch.url).split('?')[0].toLowerCase();
    if (u.endsWith('.m3u8')) return 'hls';
    if (u.endsWith('.mpd'))  return 'dash';
    if (u.endsWith('.mp4') || u.endsWith('.webm')) return 'mp4';
    if (u.endsWith('.mp3') || u.endsWith('.aac'))  return 'audio';
    return 'hls';
  }

  const isLive = ch => ch.type === 'hls' || ch.type === 'dash' || ch.live === true;

  /* -------------------------------------------------------- CATEGORÍAS */
  function railCategories() {
    const favCount = state.channels.filter(c => state.favs.has(c.id)).length;
    const list = [{ id: '__all', name: 'Todos', count: state.channels.length }];
    if (favCount) list.push({ id: '__fav', name: 'Favoritos', count: favCount });
    state.categories.forEach(c => list.push({ id: c.id, name: c.name, count: c.channels.length }));
    return list;
  }

  function renderRail() {
    const cats = railCategories();
    if (!cats.some(c => c.id === state.catId)) state.catId = cats[0].id;

    el.rail.innerHTML = cats.map(c => `
      <button class="rail__item" type="button" role="tab"
              data-focusable data-zone="rail" data-cat="${esc(c.id)}"
              aria-current="${c.id === state.catId}">
        ${c.id === '__fav' ? '★ ' : ''}${esc(c.name)}
        <span class="count">${c.count}</span>
      </button>`).join('');
  }

  function channelsForCategory() {
    if (state.catId === '__all') return state.channels;
    if (state.catId === '__fav') return state.channels.filter(c => state.favs.has(c.id));
    const cat = state.categories.find(c => c.id === state.catId);
    return cat ? cat.channels : [];
  }

  function renderGrid() {
    const q = norm(state.query);
    let list = channelsForCategory();
    if (q) {
      list = state.channels.filter(c =>
        norm(c.name).includes(q) ||
        norm(c.description).includes(q) ||
        norm(c.categoryName).includes(q));
    }
    state.visible = list;

    const cats = railCategories();
    const cat = cats.find(c => c.id === state.catId);
    el.catTitle.textContent = q ? `Resultados: “${state.query}”` : (cat ? cat.name : 'Canales');
    el.catCount.textContent = list.length
      ? `${list.length} ${list.length === 1 ? 'canal' : 'canales'}`
      : '';

    el.empty.hidden = list.length > 0;
    el.grid.innerHTML = list.map(ch => `
      <button class="card" type="button" role="listitem"
              data-focusable data-zone="grid" data-id="${esc(ch.id)}"
              data-fav="${state.favs.has(ch.id) ? 1 : 0}">
        <span class="card__thumb">
          <span class="card__num">${pad(ch.number)}</span>
          <svg class="card__fav" viewBox="0 0 24 24"><path d="M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z"/></svg>
          ${ch.logo
            ? `<img src="${esc(ch.logo)}" alt="" loading="lazy" onerror="this.remove()">`
            : `<span class="card__initials">${esc(initials(ch.name))}</span>`}
        </span>
        <span class="card__body">
          <span class="card__name">${esc(ch.name)}</span>
          ${ch.description ? `<span class="card__desc">${esc(ch.description)}</span>` : ''}
          <span class="card__type">${esc(ch.type)}${isLive(ch) ? ' · en vivo' : ''}</span>
        </span>
      </button>`).join('');

    if (state.focus.zone === 'grid') {
      state.focus.index = Math.min(state.focus.index, Math.max(0, list.length - 1));
      paintFocus();
    }
  }

  /* ------------------------------------------------------ NAVEGACIÓN */
  function zoneItems(zone) {
    const root = zone === 'osd' || zone === 'error' ? el.player : document;
    return [...root.querySelectorAll(`[data-zone="${zone}"]`)].filter(n => n.offsetParent !== null);
  }

  function paintFocus() {
    document.querySelectorAll('[data-focused="true"]').forEach(n => n.removeAttribute('data-focused'));
    const items = zoneItems(state.focus.zone);
    if (!items.length) return;
    state.focus.index = Math.max(0, Math.min(state.focus.index, items.length - 1));
    const node = items[state.focus.index];
    node.setAttribute('data-focused', 'true');
    if (node !== document.activeElement) node.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  function setFocus(zone, index = 0) {
    state.focus = { zone, index };
    paintFocus();
  }

  function gridColumns() {
    const cards = el.grid.children;
    if (cards.length < 2) return 1;
    const top = cards[0].getBoundingClientRect().top;
    let cols = 0;
    for (const c of cards) {
      if (Math.abs(c.getBoundingClientRect().top - top) > 4) break;
      cols++;
    }
    return Math.max(1, cols);
  }

  function moveGrid(dx, dy) {
    const total = state.visible.length;
    if (!total) return;
    const cols = gridColumns();
    let i = state.focus.index;

    if (dx) {
      const next = i + dx;
      if (next < 0) { setFocus('rail', railIndex()); return; }
      if (next >= total) return;
      i = next;
    }
    if (dy) {
      const next = i + dy * cols;
      if (next < 0) { el.search.focus(); setFocus('search'); return; }
      if (next >= total) i = total - 1;
      else i = next;
    }
    setFocus('grid', i);
  }

  function railIndex() {
    const items = zoneItems('rail');
    return Math.max(0, items.findIndex(n => n.dataset.cat === state.catId));
  }

  /* ------------------------------------------------------- FAVORITOS */
  function toggleFav(id) {
    if (!id) return;
    if (state.favs.has(id)) { state.favs.delete(id); toast('Quitado de favoritos'); }
    else { state.favs.add(id); toast('★ Agregado a favoritos'); }
    writeJSON(STORE.favs, [...state.favs]);
    renderRail();
    renderGrid();
    if (state.current) el.btnFav.dataset.on = state.favs.has(state.current.id) ? '1' : '0';
  }

  /* ---------------------------------------------------- REPRODUCTOR */
  function loadHlsLib() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (state.hlsLibPromise) return state.hlsLibPromise;
    state.hlsLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CONFIG.hlsCdn;
      s.onload = () => resolve(window.Hls);
      s.onerror = () => reject(new Error('No se pudo cargar hls.js (¿sin conexión?)'));
      document.head.appendChild(s);
    });
    return state.hlsLibPromise;
  }

  function destroyHls() {
    if (state.hls) { try { state.hls.destroy(); } catch {} state.hls = null; }
  }

  async function play(channel, { remember = true } = {}) {
    if (!channel) return;
    state.current = channel;
    state.retries = 0;

    document.body.dataset.view = 'player';
    el.player.hidden = false;
    el.perror.hidden = true;
    el.spinner.hidden = false;

    el.osdNum.textContent  = pad(channel.number);
    el.osdName.textContent = channel.name;
    el.osdDesc.textContent = channel.description || channel.categoryName || '';
    el.osdType.textContent = channel.type;
    el.osdLive.hidden = !isLive(channel);
    el.btnFav.dataset.on = state.favs.has(channel.id) ? '1' : '0';
    showOsd();

    if (remember) writeJSON(STORE.last, channel.id);

    clearTimeout(state.timers.watchdog);
    state.timers.watchdog = setTimeout(() => {
      if (el.video.readyState < 3 && el.perror.hidden) {
        showError('La señal tardó demasiado en responder.');
      }
    }, 20000);

    await attachSource(channel);
    setFocus('osd', 0);
  }

  async function attachSource(channel) {
    destroyHls();
    const v = el.video;
    quietVideo(() => {
      v.removeAttribute('src');
      v.load();
    });

    const needsHls = channel.type === 'hls';
    const nativeHls = v.canPlayType('application/vnd.apple.mpegurl');

    try {
      if (needsHls && !nativeHls) {
        const Hls = await loadHlsLib();
        if (!Hls || !Hls.isSupported()) throw new Error('Este dispositivo no soporta HLS.');
        const hls = new Hls({
          lowLatencyMode: true,
          enableWorker: true,
          backBufferLength: 60,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 3,
          fragLoadingMaxRetry: 4
        });
        state.hls = hls;
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && state.retries < CONFIG.retryMax) {
            state.retries++;
            setStatus(`Reintentando (${state.retries})…`, 'warn');
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && state.retries < CONFIG.retryMax) {
            state.retries++;
            hls.recoverMediaError();
          } else {
            showError(data.details || 'Error fatal de reproducción.');
          }
        });
        hls.loadSource(channel.url);
        hls.attachMedia(v);
      } else {
        v.src = channel.url;
      }
      state.suppressError = false;
      await v.play().catch(err => {
        // Autoplay bloqueado: probamos en silencio
        if (err && err.name === 'NotAllowedError') {
          v.muted = true;
          syncMuteIcon();
          toast('Autoplay silenciado — presioná M para activar el audio', 2600);
          return v.play();
        }
        throw err;
      });
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  function showError(msg) {
    if (state.suppressError || document.body.dataset.view !== 'player') return;
    clearTimeout(state.timers.watchdog);
    el.spinner.hidden = true;
    el.perror.hidden = false;
    el.perrorMsg.textContent = msg;
    setStatus('Error de señal', 'err');
    setFocus('error', 0);
  }

  function closePlayer() {
    clearTimeout(state.timers.watchdog);
    destroyHls();
    quietVideo(() => {
      el.video.pause();
      el.video.removeAttribute('src');
      el.video.load();
    });
    el.player.hidden = true;
    el.perror.hidden = true;
    document.body.dataset.view = 'grid';
    setStatus(`${state.channels.length} canales`, 'ok');

    const idx = state.visible.findIndex(c => state.current && c.id === state.current.id);
    setFocus('grid', idx >= 0 ? idx : 0);
    state.current = null;
  }

  function zap(step) {
    if (!state.current) return;
    const pool = state.visible.length ? state.visible : state.channels;
    let i = pool.findIndex(c => c.id === state.current.id);
    if (i < 0) i = 0;
    const next = pool[(i + step + pool.length) % pool.length];
    play(next);
    toast(`${pad(next.number)} · ${next.name}`, 1400);
  }

  function goToNumber(n) {
    const ch = state.channels.find(c => c.number === n);
    if (ch) play(ch);
    else toast(`No existe el canal ${pad(n)}`);
  }

  /* -------------------------------------------------------------- OSD */
  function showOsd() {
    el.osd.dataset.hidden = '0';
    clearTimeout(state.timers.osd);
    state.timers.osd = setTimeout(() => {
      if (!el.video.paused && el.perror.hidden) el.osd.dataset.hidden = '1';
    }, CONFIG.osdTimeout);
  }

  function syncMuteIcon() {
    const m = el.video.muted || el.video.volume === 0;
    el.iconVol.setAttribute('d', m ? ICONS.mute : ICONS.vol);
    el.btnMute.dataset.on = m ? '1' : '0';
  }
  function syncPlayIcon() {
    el.iconPlay.setAttribute('d', el.video.paused ? ICONS.play : ICONS.pause);
  }

  function togglePlay() {
    if (el.video.paused) el.video.play().catch(() => {});
    else el.video.pause();
    showOsd();
  }
  function toggleMute() {
    el.video.muted = !el.video.muted;
    writeJSON(STORE.muted, el.video.muted);
    syncMuteIcon();
    showOsd();
  }
  function setVolume(v) {
    const val = Math.max(0, Math.min(1, v));
    el.video.volume = val;
    el.volume.value = String(val);
    if (val > 0) el.video.muted = false;
    writeJSON(STORE.volume, val);
    syncMuteIcon();
    showOsd();
  }
  function toggleFullscreen() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      const r = el.player;
      (r.requestFullscreen || r.webkitRequestFullscreen || (() => {})).call(r);
    }
  }

  /* ------------------------------------------------------ ZAP NUMÉRICO */
  function pushDigit(d) {
    state.zapBuffer = (state.zapBuffer + d).slice(-3);
    el.zapDigits.textContent = state.zapBuffer;
    el.zap.hidden = false;
    clearTimeout(state.timers.zap);
    state.timers.zap = setTimeout(() => {
      el.zap.hidden = true;
      const n = parseInt(state.zapBuffer, 10);
      state.zapBuffer = '';
      if (!Number.isNaN(n)) goToNumber(n);
    }, CONFIG.zapTimeout);
  }

  /* ------------------------------------------------------------ TECLAS */
  const KEY_BACK = new Set(['Backspace', 'Escape', 'BrowserBack', 'GoBack', 'XF86Back']);

  function onKeyDown(e) {
    const k = e.key;
    const code = e.keyCode;
    const inPlayer = document.body.dataset.view === 'player';
    const typing = document.activeElement === el.search;

    // Teclas de retorno de TVs (Samsung 10009 / LG 461)
    if (code === 10009 || code === 461 || KEY_BACK.has(k)) {
      if (typing) { el.search.blur(); setFocus('grid', 0); e.preventDefault(); return; }
      if (inPlayer) { closePlayer(); e.preventDefault(); return; }
      if (state.query) { el.search.value = ''; state.query = ''; renderGrid(); e.preventDefault(); return; }
      return;
    }

    if (inPlayer) return onPlayerKey(e);

    // ----- catálogo -----
    if (k === '/' && !typing) { e.preventDefault(); el.search.focus(); el.search.select(); setFocus('search'); return; }

    if (typing) {
      if (k === 'ArrowDown' || k === 'Enter') { e.preventDefault(); el.search.blur(); setFocus('grid', 0); }
      return;
    }

    switch (k) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
        if (state.focus.zone === 'rail') {
          if (d[1]) setFocus('rail', state.focus.index + d[1]);
          else if (d[0] > 0) setFocus('grid', 0);
          if (d[1]) selectRail(zoneItems('rail')[state.focus.index]);
        } else if (state.focus.zone === 'search') {
          if (d[1] > 0) setFocus('grid', 0);
        } else {
          moveGrid(d[0], d[1]);
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        const node = zoneItems(state.focus.zone)[state.focus.index];
        if (node) node.click();
        break;
      }
      case 'f': case 'F': {
        const node = zoneItems('grid')[state.focus.index];
        if (state.focus.zone === 'grid' && node) toggleFav(node.dataset.id);
        break;
      }
      case 'Home': setFocus('grid', 0); break;
      case 'End':  setFocus('grid', state.visible.length - 1); break;
      default:
        if (/^\d$/.test(k)) { pushDigitFromGrid(k); }
    }
  }

  function pushDigitFromGrid(d) {
    state.zapBuffer = (state.zapBuffer + d).slice(-3);
    clearTimeout(state.timers.zap);
    toast(`Canal ${state.zapBuffer}…`, CONFIG.zapTimeout);
    state.timers.zap = setTimeout(() => {
      const n = parseInt(state.zapBuffer, 10);
      state.zapBuffer = '';
      if (!Number.isNaN(n)) goToNumber(n);
    }, CONFIG.zapTimeout);
  }

  function onPlayerKey(e) {
    const k = e.key;
    showOsd();

    switch (k) {
      case 'ArrowUp':    e.preventDefault(); zap(-1); break;
      case 'ArrowDown':  e.preventDefault(); zap(1); break;
      case 'ArrowLeft':
        e.preventDefault();
        if (state.focus.zone === 'osd' || state.focus.zone === 'error')
          setFocus(state.focus.zone, state.focus.index - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (state.focus.zone === 'osd' || state.focus.zone === 'error')
          setFocus(state.focus.zone, state.focus.index + 1);
        break;
      case 'Enter': {
        e.preventDefault();
        const node = zoneItems(state.focus.zone)[state.focus.index];
        if (node) node.click(); else togglePlay();
        break;
      }
      case ' ': case 'MediaPlayPause': e.preventDefault(); togglePlay(); break;
      case 'm': case 'M': toggleMute(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'l': case 'L': toggleFav(state.current && state.current.id); break;
      case '+': setVolume(el.video.volume + 0.1); break;
      case '-': setVolume(el.video.volume - 0.1); break;
      default:
        if (/^\d$/.test(k)) pushDigit(k);
    }
  }

  /* --------------------------------------------------------- EVENTOS */
  function selectRail(node) {
    if (!node) return;
    state.catId = node.dataset.cat;
    state.query = '';
    el.search.value = '';
    renderRail();
    renderGrid();
    const items = zoneItems('rail');
    const i = items.findIndex(n => n.dataset.cat === state.catId);
    if (state.focus.zone === 'rail' && i >= 0) setFocus('rail', i);
  }

  function bind() {
    // Rail
    el.rail.addEventListener('click', e => {
      const btn = e.target.closest('.rail__item');
      if (btn) selectRail(btn);
    });

    // Grid
    el.grid.addEventListener('click', e => {
      const card = e.target.closest('.card');
      if (!card) return;
      const ch = state.channels.find(c => c.id === card.dataset.id);
      if (ch) play(ch);
    });
    el.grid.addEventListener('mouseover', e => {
      const card = e.target.closest('.card');
      if (!card) return;
      const i = [...el.grid.children].indexOf(card);
      if (i >= 0) { state.focus = { zone: 'grid', index: i }; }
    });

    // Buscador
    let t;
    el.search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { state.query = el.search.value.trim(); renderGrid(); }, 160);
    });
    el.search.addEventListener('focus', () => { state.focus = { zone: 'search', index: 0 }; });

    // Controles del reproductor
    el.btnPlay.addEventListener('click', togglePlay);
    el.btnMute.addEventListener('click', toggleMute);
    el.btnFull.addEventListener('click', toggleFullscreen);
    el.btnExit.addEventListener('click', closePlayer);
    el.btnBackErr.addEventListener('click', closePlayer);
    el.btnFav.addEventListener('click', () => toggleFav(state.current && state.current.id));
    el.btnRetry.addEventListener('click', () => { if (state.current) play(state.current); });
    el.volume.addEventListener('input', () => setVolume(parseFloat(el.volume.value)));

    // Vídeo
    el.video.addEventListener('waiting',   () => { el.spinner.hidden = false; });
    el.video.addEventListener('playing',   () => { clearTimeout(state.timers.watchdog); el.spinner.hidden = true; el.perror.hidden = true; setStatus('Reproduciendo', 'ok'); showOsd(); });
    el.video.addEventListener('pause',     () => { syncPlayIcon(); showOsd(); });
    el.video.addEventListener('play',      () => { syncPlayIcon(); });
    el.video.addEventListener('volumechange', syncMuteIcon);
    el.video.addEventListener('error',     () => showError('La fuente no responde o el formato no es compatible.'));
    el.video.addEventListener('ended',     () => { if (!isLive(state.current || {})) zap(1); });
    el.player.addEventListener('mousemove', showOsd);
    el.player.addEventListener('click', e => { if (e.target === el.video) togglePlay(); });

    // Teclado / control remoto
    document.addEventListener('keydown', onKeyDown);

    // Reloj
    const tick = () => {
      const d = new Date();
      el.clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    tick();
    setInterval(tick, 15000);

    // Reflow del grid al cambiar tamaño
    window.addEventListener('resize', () => { if (state.focus.zone === 'grid') paintFocus(); });
  }

  /* ------------------------------------------------------------ BOOT */
  async function boot() {
    bind();

    // Preferencias de audio guardadas
    const vol = readJSON(STORE.volume, 1);
    el.video.volume = typeof vol === 'number' ? vol : 1;
    el.volume.value = String(el.video.volume);
    el.video.muted = readJSON(STORE.muted, false) === true;
    syncMuteIcon();
    syncPlayIcon();

    const started = Date.now();
    try {
      await loadCatalog();
      renderRail();
      renderGrid();
      setFocus('grid', 0);
    } catch (err) {
      setStatus('Catálogo no disponible', 'err');
      el.empty.hidden = false;
      el.empty.innerHTML = `
        <p class="empty__title">No se pudo cargar catalog.json</p>
        <p class="muted">${esc(err.message)} — revisá el archivo o serví el sitio por HTTP (no con file://).</p>`;
    }

    const wait = Math.max(0, CONFIG.splashMin - (Date.now() - started));
    setTimeout(() => { el.splash.dataset.done = '1'; }, wait);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
