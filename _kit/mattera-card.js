/*!
 * Mattera Card runtime v1
 * Motor de funciones compartido por todas las tarjetas digitales de Mattera Systems.
 * El diseño de cada tarjeta es único (lo genera crear-web); las funciones se activan
 * con atributos data-mc y la configuración en <script id="mc-config" type="application/json">.
 *
 * Principio: la tarjeta funciona sin JS (enlaces reales a wa.me, tel:, .vcf, mapas).
 * Este archivo solo agrega: compartir, instalar, QR, abierto/cerrado, catálogo con pedido,
 * intercambio de contacto, asistente IA, aviso editable y estadísticas.
 */
(function () {
  'use strict';

  /* ---------- 0. Configuración ---------- */
  var cfgEl = document.getElementById('mc-config');
  var C = {};
  try { C = cfgEl ? JSON.parse(cfgEl.textContent) : {}; } catch (e) { console.warn('[MC] mc-config inválido'); }
  var API = (C.api || '').replace(/\/$/, '');
  var SLUG = C.slug || '';
  var PLAN = C.plan || 'esencial';
  var PREVIEW = /\/p\//.test(location.pathname) || C.preview === true;
  var LOCAL = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname) || location.protocol === 'file:';
  if (C.test === true) LOCAL = false; // pruebas locales contra wrangler dev
  var RANK = { esencial: 1, profesional: 2, business: 3 };
  var tiene = function (p) { return (RANK[PLAN] || 1) >= (RANK[p] || 9); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ss = {
    get: function (k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var dinero = function (n) {
    try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: C.moneda || 'MXN', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (e) { return '$' + n; }
  };
  var waURL = function (msg) { return 'https://wa.me/' + String(C.wa || '').replace(/\D/g, '') + (msg ? '?text=' + encodeURIComponent(msg) : ''); };

  /* ---------- 1. Estadísticas ---------- */
  var TIPOS = ['view', 'wa', 'call', 'save', 'share', 'map', 'email', 'web', 'social', 'install', 'qr', 'order', 'lead', 'ask', 'review', 'cat'];
  function track(t) {
    if (!API || !SLUG || PREVIEW || LOCAL || TIPOS.indexOf(t) < 0) return;
    var body = JSON.stringify({ t: t });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(API + '/e/' + SLUG, new Blob([body], { type: 'text/plain' }));
      else fetch(API + '/e/' + SLUG, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } });
    } catch (e) {}
  }
  if (!ss.get('mc-v-' + SLUG)) { ss.set('mc-v-' + SLUG, 1); track('view'); }
  // Cualquier elemento con data-mc-t="tipo" registra ese evento al tocarse (enlaces reales a wa.me, tel:, mapas...)
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-mc-t]');
    if (el) track(el.getAttribute('data-mc-t'));
  }, true);

  /* ---------- 2. Avisos (toast) ---------- */
  var toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'mc-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* ---------- 3. Compartir ---------- */
  var urlTarjeta = C.url || location.href.split('#')[0];
  $$('[data-mc="share"]').forEach(function (b) {
    b.addEventListener('click', function () {
      track('share');
      var data = { title: C.nombre || document.title, text: C.compartirTexto || ('Te comparto la tarjeta de ' + (C.nombre || 'mi negocio')), url: urlTarjeta };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      copiar(data.text + ' ' + data.url, 'Enlace copiado');
    });
  });
  $$('[data-mc="copy"]').forEach(function (b) {
    b.addEventListener('click', function () { copiar(b.getAttribute('data-value') || urlTarjeta, b.getAttribute('data-ok') || 'Copiado'); });
  });
  function copiar(txt, ok) {
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast(ok); }, function () { prompt('Copia el enlace', txt); });
    else prompt('Copia el enlace', txt);
  }

  /* ---------- 4. Guardar contacto (.vcf) ---------- */
  $$('[data-mc="save"]').forEach(function (a) {
    a.addEventListener('click', function () { track('save'); setTimeout(function () { toast(C.textoGuardado || 'Abre el archivo para guardar el contacto'); }, 400); });
  });

  /* ---------- 5. Instalar como app (PWA) ---------- */
  var diferido = null;
  var esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); diferido = e; });
  $$('[data-mc="install"]').forEach(function (b) {
    if (instalada) { b.hidden = true; return; }
    b.addEventListener('click', function () {
      track('install');
      if (diferido) { diferido.prompt(); diferido.userChoice.finally(function () { diferido = null; }); return; }
      hoja('Agregar a tu inicio', esIOS
        ? ['Toca el botón Compartir de Safari (el cuadro con la flecha).', 'Elige “Agregar a inicio”.', 'Toca “Agregar”. La tarjeta queda como una app.']
        : ['Abre el menú del navegador (los tres puntos).', 'Elige “Instalar app” o “Agregar a pantalla principal”.', 'Confirma. La tarjeta queda como una app.']);
    });
  });
  if ('serviceWorker' in navigator && C.sw !== false && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  /* ---------- 6. Hoja/diálogo genérico ---------- */
  function hoja(titulo, pasos, extraNodo) {
    var d = document.createElement('dialog'); d.className = 'mc-sheet';
    var h = document.createElement('h2'); h.textContent = titulo; d.appendChild(h);
    if (pasos && pasos.length) {
      var ol = document.createElement('ol');
      pasos.forEach(function (p) { var li = document.createElement('li'); li.textContent = p; ol.appendChild(li); });
      d.appendChild(ol);
    }
    if (extraNodo) d.appendChild(extraNodo);
    var c = document.createElement('button'); c.type = 'button'; c.className = 'mc-btn'; c.textContent = 'Cerrar';
    c.addEventListener('click', function () { d.close(); }); d.appendChild(c);
    d.addEventListener('close', function () { d.remove(); });
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    document.body.appendChild(d);
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    return d;
  }

  /* ---------- 7. QR en pantalla ---------- */
  $$('[data-mc="qr"]').forEach(function (b) {
    b.addEventListener('click', function () {
      track('qr');
      var w = document.createElement('div'); w.className = 'mc-qr';
      var img = new Image(); img.src = C.qr || 'qr.svg'; img.alt = 'Código QR de la tarjeta de ' + (C.nombre || ''); img.width = 260; img.height = 260;
      var p = document.createElement('p'); p.textContent = 'Pide que lo escaneen con la cámara.';
      var a = document.createElement('a'); a.href = C.qrPng || 'qr.png'; a.download = (SLUG || 'tarjeta') + '-qr.png'; a.className = 'mc-link'; a.textContent = 'Descargar QR';
      w.appendChild(img); w.appendChild(p); w.appendChild(a);
      hoja(C.nombre || 'Mi tarjeta', null, w);
    });
  });

  /* ---------- 8. Abierto ahora ---------- */
  var DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
  var NOMBRES = { dom: 'domingo', lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado' };
  function ahoraEnZona() {
    var tz = C.tz || 'America/Mexico_City';
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
      var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
      return { d: wd, m: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
    } catch (e) { var n = new Date(); return { d: n.getDay(), m: n.getHours() * 60 + n.getMinutes() }; }
  }
  var aMin = function (hhmm) { var p = String(hhmm).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1] || 0, 10); };
  var fmtHora = function (hhmm) {
    var m = aMin(hhmm), h = Math.floor(m / 60) % 24, mm = m % 60;
    var ap = h >= 12 ? 'p. m.' : 'a. m.'; var h12 = h % 12 || 12;
    return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + ' ' + ap;
  };
  function estadoHorario() {
    var H = C.horarios; if (!H) return null;
    if (H === '24/7') return { abierto: true, texto: 'Abierto las 24 horas' };
    var now = ahoraEnZona();
    var hoy = H[DIAS[now.d]] || [];
    for (var i = 0; i < hoy.length; i++) {
      var a = aMin(hoy[i][0]), c = aMin(hoy[i][1]); if (c <= a) c += 1440;
      if (now.m >= a && now.m < c) {
        var faltan = c - now.m;
        return { abierto: true, pronto: faltan <= 45, texto: faltan <= 45 ? 'Cierra pronto · ' + fmtHora(hoy[i][1]) : 'Abierto ahora · cierra ' + fmtHora(hoy[i][1]) };
      }
    }
    // horario que viene del día anterior y cruza la medianoche
    var ayer = H[DIAS[(now.d + 6) % 7]] || [];
    for (var j = 0; j < ayer.length; j++) {
      var a2 = aMin(ayer[j][0]), c2 = aMin(ayer[j][1]);
      if (c2 <= a2 && now.m < c2) return { abierto: true, texto: 'Abierto ahora · cierra ' + fmtHora(ayer[j][1]) };
    }
    for (var k = 0; k < 7; k++) {
      var di = (now.d + k) % 7, tramos = H[DIAS[di]] || [];
      for (var t = 0; t < tramos.length; t++) {
        if (k === 0 && aMin(tramos[t][0]) <= now.m) continue;
        var cuando = k === 0 ? 'hoy' : k === 1 ? 'mañana' : 'el ' + NOMBRES[DIAS[di]];
        return { abierto: false, texto: 'Cerrado · abre ' + cuando + ' a las ' + fmtHora(tramos[t][0]) };
      }
    }
    return { abierto: false, texto: 'Cerrado' };
  }
  function pintarHorario() {
    var est = estadoHorario(); if (!est) return;
    $$('[data-mc-open]').forEach(function (el) {
      el.textContent = est.texto;
      el.setAttribute('data-state', est.abierto ? (est.pronto ? 'soon' : 'open') : 'closed');
    });
  }
  pintarHorario(); setInterval(pintarHorario, 60000);

  /* ---------- 9. Aviso editable (promo) ---------- */
  function pintarAviso(aviso) {
    $$('[data-mc="aviso"]').forEach(function (el) {
      var vigente = aviso && aviso.texto && (!aviso.hasta || new Date(aviso.hasta + 'T23:59:59') >= new Date());
      if (!vigente) { if (el.hasAttribute('data-mc-dyn')) el.hidden = true; return; }
      var t = $('[data-f="texto"]', el) || el; t.textContent = aviso.texto; el.hidden = false;
    });
  }

  /* ---------- 10. Catálogo con pedido por WhatsApp ---------- */
  var cat = { productos: [], categorias: [] };
  var carrito = ss.get('mc-cart-' + SLUG) || {};
  var cont = $('[data-mc="catalog"]');
  var filtro = { cat: 'todo', q: '' };
  function imgURL(src) { if (!src) return ''; if (/^(https?:|data:|\/|\.)/.test(src)) return src; return API + '/i/' + src; }
  function renderCatalogo() {
    if (!cont) return;
    var tpl = $('template[data-mc-tpl="item"]', cont); var lista = $('[data-mc-list]', cont);
    if (!tpl || !lista) return;
    var prods = (cat.productos || []).filter(function (p) { return p.activo !== false; });
    // chips de categoría
    var chips = $('[data-mc-filters]', cont);
    if (chips && !chips._listo && cat.categorias && cat.categorias.length > 1) {
      chips._listo = true; chips.textContent = '';
      ['todo'].concat(cat.categorias).forEach(function (c) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'mc-chip';
        b.textContent = c === 'todo' ? 'Todo' : c; b.setAttribute('aria-pressed', c === filtro.cat ? 'true' : 'false');
        b.addEventListener('click', function () {
          filtro.cat = c; $$('.mc-chip', chips).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true'); renderCatalogo(); track('cat');
        });
        chips.appendChild(b);
      });
    }
    var q = filtro.q.trim().toLowerCase();
    var vis = prods.filter(function (p) {
      return (filtro.cat === 'todo' || p.cat === filtro.cat) &&
        (!q || (p.nombre + ' ' + (p.desc || '')).toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return (b.dest ? 1 : 0) - (a.dest ? 1 : 0) || (a.orden || 0) - (b.orden || 0); });
    lista.textContent = '';
    vis.forEach(function (p) {
      var n = tpl.content.firstElementChild.cloneNode(true);
      n.setAttribute('data-id', p.id);
      var set = function (f, v) { $$('[data-f="' + f + '"]', n).forEach(function (el) { if (v === undefined || v === null || v === '') { el.hidden = true; } else { el.textContent = v; } }); };
      set('nombre', p.nombre); set('desc', p.desc); set('cat', p.cat);
      set('precio', p.precio != null && p.precio !== '' ? (p.desde ? 'Desde ' : '') + dinero(Number(p.precio)) : (C.textoSinPrecio || 'Cotizar'));
      set('antes', p.antes ? dinero(Number(p.antes)) : '');
      set('badge', p.badge || (p.dest ? (C.textoDestacado || 'Recomendado') : ''));
      $$('img[data-f="img"]', n).forEach(function (im) {
        if (p.img) { im.src = imgURL(p.img); im.alt = p.nombre; im.loading = 'lazy'; im.decoding = 'async'; }
        else im.hidden = true;
      });
      $$('[data-mc-add]', n).forEach(function (b) {
        b.addEventListener('click', function () { sumar(p.id, 1); toast((p.nombre || 'Producto') + ' agregado'); });
      });
      lista.appendChild(n);
    });
    var vacio = $('[data-mc-empty]', cont); if (vacio) vacio.hidden = vis.length > 0;
    pintarCarrito();
  }
  function porId(id) { for (var i = 0; i < cat.productos.length; i++) if (cat.productos[i].id === id) return cat.productos[i]; return null; }
  function sumar(id, d) {
    carrito[id] = Math.max(0, (carrito[id] || 0) + d); if (!carrito[id]) delete carrito[id];
    ss.set('mc-cart-' + SLUG, carrito); pintarCarrito();
  }
  function lineas() {
    return Object.keys(carrito).map(function (id) { var p = porId(id); return p ? { p: p, n: carrito[id] } : null; }).filter(Boolean);
  }
  var barra;
  function pintarCarrito() {
    if (!cont) return;
    var ls = lineas(); var piezas = 0, total = 0, cotiza = false;
    ls.forEach(function (l) { piezas += l.n; if (l.p.precio != null && l.p.precio !== '') total += l.n * Number(l.p.precio); else cotiza = true; });
    if (!barra) {
      barra = $('[data-mc-cart]') || (function () {
        var b = document.createElement('div'); b.className = 'mc-cart'; b.setAttribute('data-mc-cart', ''); b.hidden = true;
        b.innerHTML = '<span class="mc-cart__info" data-f="resumen"></span><button type="button" class="mc-btn mc-btn--solid" data-f="ver">Ver pedido</button>';
        document.body.appendChild(b); return b;
      })();
      var ver = $('[data-f="ver"]', barra); if (ver) ver.addEventListener('click', abrirPedido);
    }
    barra.hidden = piezas === 0;
    var r = $('[data-f="resumen"]', barra);
    if (r) r.textContent = piezas + (piezas === 1 ? ' artículo' : ' artículos') + (total ? ' · ' + dinero(total) : '') + (cotiza ? ' + cotización' : '');
    document.documentElement.classList.toggle('mc-has-cart', piezas > 0);
  }
  function abrirPedido() {
    var w = document.createElement('div'); w.className = 'mc-order';
    var ul = document.createElement('ul'); w.appendChild(ul);
    var tot = document.createElement('p'); tot.className = 'mc-order__total'; w.appendChild(tot);
    var nota = document.createElement('textarea'); nota.rows = 2; nota.placeholder = C.textoNotaPedido || 'Nombre, entrega o recoger, comentarios'; nota.className = 'mc-input'; nota.setAttribute('aria-label', 'Comentarios del pedido');
    w.appendChild(nota);
    var enviar = document.createElement('a'); enviar.className = 'mc-btn mc-btn--solid mc-btn--wa'; enviar.textContent = 'Enviar pedido por WhatsApp'; enviar.target = '_blank'; enviar.rel = 'noopener';
    w.appendChild(enviar);
    function pintar() {
      ul.textContent = ''; var total = 0, cotiza = false;
      lineas().forEach(function (l) {
        var li = document.createElement('li');
        var nom = document.createElement('span'); nom.textContent = l.p.nombre; li.appendChild(nom);
        var ctl = document.createElement('span'); ctl.className = 'mc-qty';
        var menos = document.createElement('button'); menos.type = 'button'; menos.textContent = '−'; menos.setAttribute('aria-label', 'Quitar uno');
        var num = document.createElement('output'); num.textContent = l.n;
        var mas = document.createElement('button'); mas.type = 'button'; mas.textContent = '+'; mas.setAttribute('aria-label', 'Agregar uno');
        menos.onclick = function () { sumar(l.p.id, -1); pintar(); }; mas.onclick = function () { sumar(l.p.id, 1); pintar(); };
        ctl.appendChild(menos); ctl.appendChild(num); ctl.appendChild(mas); li.appendChild(ctl);
        var pr = document.createElement('span'); pr.className = 'mc-mono';
        if (l.p.precio != null && l.p.precio !== '') { pr.textContent = dinero(l.n * Number(l.p.precio)); total += l.n * Number(l.p.precio); } else { pr.textContent = 'Cotizar'; cotiza = true; }
        li.appendChild(pr); ul.appendChild(li);
      });
      tot.textContent = total ? 'Total estimado: ' + dinero(total) + (cotiza ? ' + cotización' : '') : (cotiza ? 'Solicitud de cotización' : '');
      enviar.href = waURL(mensajePedido(nota.value));
      if (!lineas().length) d.close();
    }
    nota.addEventListener('input', function () { enviar.href = waURL(mensajePedido(nota.value)); });
    enviar.addEventListener('click', function () { track('order'); });
    var d = hoja(C.textoTituloPedido || 'Tu pedido', null, w);
    pintar();
  }
  function mensajePedido(nota) {
    var total = 0, cotiza = false;
    var txt = (C.textoInicioPedido || 'Hola, quiero hacer este pedido desde tu tarjeta digital:') + '\n';
    lineas().forEach(function (l) {
      var conPrecio = l.p.precio != null && l.p.precio !== '';
      if (conPrecio) total += l.n * Number(l.p.precio); else cotiza = true;
      txt += '\n• ' + l.n + ' × ' + l.p.nombre + (conPrecio ? ' — ' + dinero(l.n * Number(l.p.precio)) : ' — cotizar');
    });
    if (total) txt += '\n\nTotal estimado: ' + dinero(total) + (cotiza ? ' + cotización' : '');
    if (nota && nota.trim()) txt += '\n\n' + nota.trim();
    return txt;
  }
  if (cont) {
    cat = C.catalogo || cat;
    var busc = $('[data-mc-search]', cont);
    if (busc) busc.addEventListener('input', function () { filtro.q = busc.value; renderCatalogo(); });
    renderCatalogo();
  }
  // Datos vivos (catálogo y aviso editables desde el panel) — plan business
  if (API && SLUG && tiene('business') && (cont || $('[data-mc="aviso"]'))) {
    fetch(API + '/c/' + SLUG, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        if (j.catalogo && j.catalogo.productos) { cat = j.catalogo; if (cont) { var ch = $('[data-mc-filters]', cont); if (ch) ch._listo = false; renderCatalogo(); } }
        pintarAviso(j.aviso);
      }).catch(function () {});
  } else { pintarAviso(C.aviso); }

  /* ---------- 11. Intercambio de contacto (lead) ---------- */
  $$('form[data-mc="lead"]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(f);
      var datos = { nombre: (fd.get('nombre') || '').toString().trim(), tel: (fd.get('tel') || '').toString().trim(), nota: (fd.get('nota') || '').toString().trim(), web: (fd.get('web') || '').toString() };
      if (!datos.nombre || datos.tel.replace(/\D/g, '').length < 8) { toast('Escribe tu nombre y un teléfono válido'); return; }
      var btn = $('[type="submit"]', f); if (btn) btn.disabled = true;
      var listo = function (porApi) {
        track('lead');
        var ok = $('[data-mc-ok]', f.parentNode) || $('[data-mc-ok]', f);
        if (ok) { ok.hidden = false; }
        f.reset(); if (btn) btn.disabled = false;
        if (!porApi) window.open(waURL('Hola, soy ' + datos.nombre + '. Te dejo mi número desde tu tarjeta digital: ' + datos.tel + (datos.nota ? '\n' + datos.nota : '')), '_blank', 'noopener');
        else toast(C.textoLeadOk || 'Listo. Te contactaremos pronto.');
      };
      if (API && SLUG && tiene('profesional') && !PREVIEW) {
        fetch(API + '/l/' + SLUG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
          .then(function (r) { if (!r.ok) throw 0; listo(true); }).catch(function () { listo(false); });
      } else listo(false);
    });
  });

  /* ---------- 12. Asistente IA ---------- */
  $$('[data-mc="ask"]').forEach(function (box) {
    var log = $('[data-mc-log]', box); var form = $('form', box); var input = form && $('input,textarea', form);
    if (!log || !form || !input) return;
    var hist = [];
    function burbuja(quien, texto, wa) {
      var b = document.createElement('div'); b.className = 'mc-msg mc-msg--' + quien;
      var p = document.createElement('p'); p.textContent = texto; b.appendChild(p);
      if (wa) {
        var a = document.createElement('a'); a.className = 'mc-btn mc-btn--wa'; a.href = waURL(C.textoWaAsistente || 'Hola, vengo de tu tarjeta digital. Tengo una pregunta.'); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Seguir por WhatsApp'; a.setAttribute('data-mc-t', 'wa');
        b.appendChild(a);
      }
      log.appendChild(b); log.scrollTop = log.scrollHeight; return b;
    }
    function local(q) {
      var faq = C.faq || []; var qs = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      var mejor = null, pts = 0;
      faq.forEach(function (f) {
        var claves = (f.q + ' ' + (f.k || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\W+/).filter(function (w) { return w.length > 3; });
        var s = claves.reduce(function (acc, w) { return acc + (qs.indexOf(w) >= 0 ? 1 : 0); }, 0);
        if (s > pts) { pts = s; mejor = f; }
      });
      if (/horario|abren|cierran|abierto/.test(qs)) { var e = estadoHorario(); if (e) return { a: e.texto + '.', wa: false }; }
      return mejor ? { a: mejor.a, wa: false } : { a: C.textoNoSe || 'Esa respuesta te la da mejor una persona del equipo. Escríbenos por WhatsApp.', wa: true };
    }
    function preguntar(q) {
      if (!q.trim()) return;
      burbuja('yo', q); input.value = ''; track('ask');
      var esc = burbuja('bot', '…'); esc.classList.add('is-typing');
      var resolver = function (r) { esc.remove(); burbuja('bot', r.a, r.wa); hist.push({ r: 'user', c: q }, { r: 'assistant', c: r.a }); hist = hist.slice(-8); };
      if (API && SLUG && tiene('business') && !LOCAL) {
        fetch(API + '/a/' + SLUG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: q, h: hist }) })
          .then(function (r) { if (!r.ok) throw 0; return r.json(); })
          .then(function (j) { resolver({ a: j.a, wa: !!j.wa }); })
          .catch(function () { resolver(local(q)); });
      } else setTimeout(function () { resolver(local(q)); }, 450);
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); preguntar(input.value); });
    $$('[data-q]', box).forEach(function (b) { b.addEventListener('click', function () { preguntar(b.getAttribute('data-q') || b.textContent); }); });
  });

  /* ---------- 13. Año en curso y utilidades ---------- */
  $$('[data-mc-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  window.MatteraCard = { track: track, toast: toast, config: C, version: '1.0.0' };
})();
