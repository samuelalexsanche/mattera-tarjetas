/*!
 * Mattera Card runtime v1
 * Motor de funciones compartido por todas las tarjetas digitales de Mattera Systems.
 * El diseño de cada tarjeta es único (lo genera crear-web); las funciones se activan
 * con atributos data-mc y la configuración en <script id="mc-config" type="application/json">.
 *
 * Principio: la tarjeta funciona sin JS (enlaces reales a wa.me, tel:, .vcf, mapas).
 * Este archivo solo agrega: compartir, instalar, QR, abierto/cerrado, catálogo con pedido,
 * intercambio de contacto, asistente IA, agenda de citas, aviso editable y estadísticas.
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
  var TIPOS = ['view', 'wa', 'call', 'save', 'share', 'map', 'email', 'web', 'social', 'install', 'qr', 'order', 'lead', 'ask', 'review', 'cat', 'cita', 'agenda'];
  // El embudo de citas: el asistente resuelve dudas y lleva a la agenda con el servicio y la ciudad ya elegidos.
  var agendarEn = null, preguntarAsistente = null;
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); };
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
  function isoEnZona(k) {
    var d;
    try {
      var o = {}; new Intl.DateTimeFormat('en-US', { timeZone: C.tz || 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
      d = new Date(Date.UTC(+o.year, +o.month - 1, +o.day + k));
    } catch (e) { var n = new Date(); d = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() + k)); }
    return d.toISOString().slice(0, 10);
  }
  var aHora = function (m) { return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  // Quien atiende en varias ciudades (agenda.fechas): ese día manda la fecha, y un día
  // sin fecha que no está en su semana normal de citas (agenda.horas) está cerrado.
  function tramosDelDia(k, dia) {
    var base = C.horarios[DIAS[dia]] || [], ag = C.agenda;
    if (!ag || !ag.fechas) return { t: base, lugar: '' };
    var f = ag.fechas[isoEnZona(k)];
    if (f) {
      if (f.cerrado) return { t: [], lugar: '' };
      var t = f.tramos || (f.horas || []).map(function (h) { return [h, aHora(aMin(h) + (f.cada || ag.cada || 60))]; });
      return { t: t, lugar: f.lugar && f.lugar !== ag.lugar ? String(f.lugar).split(',')[0] : '' };
    }
    return { t: ag.horas && ag.horas[DIAS[dia]] && ag.horas[DIAS[dia]].length ? base : [], lugar: '' };
  }
  function estadoHorario() {
    var H = C.horarios; if (!H) return null;
    if (H === '24/7') return { abierto: true, texto: 'Abierto las 24 horas' };
    var now = ahoraEnZona();
    var td = tramosDelDia(0, now.d), hoy = td.t, en = td.lugar ? ' en ' + td.lugar : '';
    for (var i = 0; i < hoy.length; i++) {
      var a = aMin(hoy[i][0]), c = aMin(hoy[i][1]); if (c <= a) c += 1440;
      if (now.m >= a && now.m < c) {
        var faltan = c - now.m;
        return { abierto: true, pronto: faltan <= 45, texto: faltan <= 45 ? 'Cierra pronto' + en + ' · ' + fmtHora(hoy[i][1]) : 'Abierto ahora' + en + ' · cierra ' + fmtHora(hoy[i][1]) };
      }
    }
    // horario que viene del día anterior y cruza la medianoche
    var ayer = tramosDelDia(-1, (now.d + 6) % 7).t;
    for (var j = 0; j < ayer.length; j++) {
      var a2 = aMin(ayer[j][0]), c2 = aMin(ayer[j][1]);
      if (c2 <= a2 && now.m < c2) return { abierto: true, texto: 'Abierto ahora · cierra ' + fmtHora(ayer[j][1]) };
    }
    for (var k = 0; k < 7; k++) {
      var di = (now.d + k) % 7, dd = tramosDelDia(k, di), tramos = dd.t;
      for (var t = 0; t < tramos.length; t++) {
        if (k === 0 && aMin(tramos[t][0]) <= now.m) continue;
        var cuando = k === 0 ? 'hoy' : k === 1 ? 'mañana' : 'el ' + NOMBRES[DIAS[di]];
        return { abierto: false, texto: 'Cerrado · abre ' + cuando + ' a las ' + fmtHora(tramos[t][0]) + (dd.lugar ? ' en ' + dd.lugar : '') };
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
    function burbuja(quien, texto, wa, agenda) {
      var b = document.createElement('div'); b.className = 'mc-msg mc-msg--' + quien;
      var p = document.createElement('p'); p.textContent = texto; b.appendChild(p);
      // Si la tarjeta tiene agenda, la respuesta lleva directo a elegir día y hora,
      // con el servicio y la ciudad que salieron en la plática.
      var cajaAgenda = agenda && $('[data-mc="agenda"]');
      if (cajaAgenda) {
        var o = typeof agenda === 'object' ? agenda : {};
        var ciudad = o.lugar ? String(o.lugar).split(',')[0] : '';
        var ag = document.createElement('button'); ag.type = 'button'; ag.className = 'mc-btn mc-btn--solid';
        ag.textContent = o.servicio || ciudad ? 'Agendar' + (o.servicio ? ' ' + o.servicio : '') + (ciudad ? ' en ' + ciudad : '') : 'Elegir día y hora';
        ag.addEventListener('click', function () { if (agendarEn) agendarEn(o); else cajaAgenda.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
        b.appendChild(ag);
      }
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
      var resolver = function (r) { esc.remove(); burbuja('bot', r.a, r.wa, r.agenda); hist.push({ r: 'user', c: q }, { r: 'assistant', c: r.a }); hist = hist.slice(-8); };
      if (API && SLUG && tiene('business') && !LOCAL) {
        fetch(API + '/a/' + SLUG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: q, h: hist }) })
          .then(function (r) { if (!r.ok) throw 0; return r.json(); })
          .then(function (j) { resolver({ a: j.a, wa: !!j.wa, agenda: j.agenda ? { servicio: j.servicio || '', lugar: j.lugar || '' } : false }); })
          .catch(function () { resolver(local(q)); });
      } else setTimeout(function () { resolver(local(q)); }, 450);
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); preguntar(input.value); });
    $$('[data-q]', box).forEach(function (b) { b.addEventListener('click', function () { preguntar(b.getAttribute('data-q') || b.textContent); }); });
    if (!preguntarAsistente) preguntarAsistente = function (q) {
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (q) preguntar(q); else setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 350);
    };
  });
  // Botones en cualquier parte que invitan a preguntarle al asistente: data-mc-preguntar (vacío o con una pregunta).
  $$('[data-mc-preguntar]').forEach(function (b) {
    b.addEventListener('click', function (e) { if (!preguntarAsistente) return; e.preventDefault(); preguntarAsistente(b.getAttribute('data-mc-preguntar')); });
  });

  /* ---------- 12b. Agenda de citas (Profesional y Business) ----------
   * <div data-mc="agenda"> … fallback sin JS (enlace a WhatsApp) … </div>
   * mc-config.agenda = { horas: {lun:["10:00","11:00"], …}, servicios: [{nombre, dur, precio}],
   *                      dias: 45, anticipacion_min: 60, nota: "…",
   *                      lugar: "Zapotlanejo, Jalisco",            (dónde son las horas de la semana)
   *                      fechas: {"2026-11-07": {lugar, tramos: [["10:00","13:00"],["15:00","21:00"]], cada: 60}
   *                               | {lugar, horas: ["10:00", …]} | {cerrado: true}} }
   * Las fechas mandan sobre la semana: para quien atiende en distintas ciudades según el día.
   * Con más de una ciudad, primero se elige dónde, y el calendario solo enseña los días en que estará ahí.
   * Botones en otras partes: data-mc-agendar="Nombre del servicio" abren la agenda con él elegido.
   * Solo enseña las horas libres: las apartadas (y las que se empalman con su duración) no salen. */
  (function () {
    var A = C.agenda; var cajas = $$('[data-mc="agenda"]');
    if (!A || !(A.horas || A.fechas) || !cajas.length || !tiene('profesional')) return;
    A.horas = A.horas || {}; var FECHAS = A.fechas || {}; var LUGAR = A.lugar || '';
    var tz = C.tz || 'America/Mexico_City';
    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var iso = function (y, m, d) { return y + '-' + pad(m) + '-' + pad(d); };
    var dow = function (y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
    function ahora() {
      var o = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
      return { y: +o.year, m: +o.month, d: +o.day, min: (+o.hour % 24) * 60 + (+o.minute) };
    }
    var servicios = (A.servicios && A.servicios.length) ? A.servicios : [{ nombre: 'Cita', dur: A.dur || 60 }];
    var limite = A.dias || 45, antes = A.anticipacion_min == null ? 60 : A.anticipacion_min;
    var ocupados = [], cargado = false;
    var hoy = ahora(); var hoyIso = iso(hoy.y, hoy.m, hoy.d);
    var ultimo = new Date(Date.UTC(hoy.y, hoy.m - 1, hoy.d + limite));
    var hastaIso = iso(ultimo.getUTCFullYear(), ultimo.getUTCMonth() + 1, ultimo.getUTCDate());
    // Si hay fechas de viaje más lejos que el límite, el calendario llega hasta ellas.
    Object.keys(FECHAS).forEach(function (f) { if (f > hastaIso) hastaIso = f; });

    // El plan de un día: dónde estará y a qué horas. Las fechas mandan sobre la semana.
    function planDelDia(fecha) {
      var f = FECHAS[fecha];
      if (f) return f.cerrado ? null : { lugar: f.lugar || LUGAR, horas: f.horas || null, tramos: f.tramos || null, cada: f.cada || A.cada || 60 };
      var p = fecha.split('-'); var semana = A.horas[DIAS[dow(+p[0], +p[1], +p[2])]];
      return semana && semana.length ? { lugar: LUGAR, horas: semana, tramos: null, cada: 60 } : null;
    }
    // Las horas de inicio: la lista tal cual, o cada `cada` minutos dentro de cada tramo
    // sin pasarse del cierre con la duración del servicio.
    function inicios(plan, dur) {
      if (plan.horas) return plan.horas;
      var out = [];
      (plan.tramos || []).forEach(function (t) {
        for (var m = aMin(t[0]); m + dur <= aMin(t[1]); m += plan.cada) out.push(pad(Math.floor(m / 60)) + ':' + pad(m % 60));
      });
      return out;
    }
    // Las ciudades, en el orden de su próxima fecha.
    var lugares = [];
    (function () {
      var vistos = {}; var d = new Date(Date.UTC(hoy.y, hoy.m - 1, hoy.d));
      while (true) {
        var f = iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); if (f > hastaIso) break;
        var pl = planDelDia(f);
        if (pl && pl.lugar && !vistos[pl.lugar]) { vistos[pl.lugar] = true; lugares.push(pl.lugar); }
        d.setUTCDate(d.getUTCDate() + 1);
      }
    })();
    function fechasDe(lugar) {
      return Object.keys(FECHAS).filter(function (f) { return f >= hoyIso && FECHAS[f].lugar === lugar && !FECHAS[f].cerrado; }).sort();
    }

    function cargar() {
      if (!API || !SLUG || LOCAL) { cargado = true; return Promise.resolve(); }
      return fetch(API + '/ag/' + SLUG + '?desde=' + hoyIso + '&hasta=' + hastaIso)
        .then(function (r) { return r.ok ? r.json() : { ocupados: [] }; })
        .then(function (j) { ocupados = j.ocupados || []; cargado = true; })
        .catch(function () { cargado = true; });
    }
    function libres(fecha, dur, lugar) {
      var plan = planDelDia(fecha);
      if (!plan || (lugar && plan.lugar !== lugar)) return [];
      var lista = inicios(plan, dur);
      return lista.filter(function (h) {
        var ini = aMin(h), fin = ini + dur;
        if (fecha < hoyIso || fecha > hastaIso) return false;
        if (fecha === hoyIso && ini < ahora().min + antes) return false;
        return !ocupados.some(function (o) {
          if (o.fecha !== fecha) return false;
          var oi = aMin(o.hora), of = oi + (o.dur || dur);
          return ini < of && oi < fin;
        });
      });
    }
    var largo = function (fecha) {
      var p = fecha.split('-');
      return NOMBRES[DIAS[dow(+p[0], +p[1], +p[2])]] + ' ' + (+p[2]) + ' de ' + MESES[+p[1] - 1];
    };
    function nodo(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

    cajas.forEach(function (caja) {
      $$('[data-mc-ag-sinjs]', caja).forEach(function (n) { n.hidden = true; });
      var st = { sv: servicios[0], fecha: null, hora: null, y: hoy.y, m: hoy.m, lugar: lugares.length > 1 ? (LUGAR || lugares[0]) : null };
      var raiz = nodo('div', 'mc-ag'); caja.appendChild(raiz);
      var pLug = nodo('div', 'mc-ag__paso'); pLug.appendChild(nodo('p', 'mc-ag__t', '¿Dónde quieres tu cita?'));
      var lugBox = nodo('div', 'mc-ag__servicios'); pLug.appendChild(lugBox);
      if (lugares.length < 2) pLug.hidden = true;

      var pSv = nodo('div', 'mc-ag__paso'); pSv.appendChild(nodo('p', 'mc-ag__t', 'Tu servicio'));
      var svBox = nodo('div', 'mc-ag__servicios'); pSv.appendChild(svBox);
      var pDia = nodo('div', 'mc-ag__paso'); var cab = nodo('div', 'mc-ag__mes');
      var prev = nodo('button', 'mc-ag__nav', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Mes anterior');
      var tit = nodo('p', 'mc-ag__t'); var next = nodo('button', 'mc-ag__nav', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Mes siguiente');
      cab.append(prev, tit, next); pDia.appendChild(cab);
      var cal = nodo('div', 'mc-ag__cal'); cal.setAttribute('role', 'grid'); pDia.appendChild(cal);
      var pHora = nodo('div', 'mc-ag__paso'); pHora.hidden = true; var titHora = nodo('p', 'mc-ag__t'); var horasBox = nodo('div', 'mc-ag__horas');
      pHora.append(titHora, horasBox);
      var form = nodo('form', 'mc-ag__form'); form.hidden = true;
      var resumen = nodo('p', 'mc-ag__resumen');
      var inNom = nodo('input', 'mc-input'); inNom.placeholder = 'Tu nombre'; inNom.autocomplete = 'name'; inNom.required = true; inNom.setAttribute('aria-label', 'Tu nombre');
      var inTel = nodo('input', 'mc-input'); inTel.placeholder = 'Tu WhatsApp (10 dígitos)'; inTel.type = 'tel'; inTel.inputMode = 'tel'; inTel.autocomplete = 'tel'; inTel.required = true; inTel.setAttribute('aria-label', 'Tu WhatsApp');
      var trampa = nodo('input'); trampa.name = 'web'; trampa.tabIndex = -1; trampa.autocomplete = 'off'; trampa.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
      var enviar = nodo('button', 'mc-btn mc-btn--wa mc-ag__ok', 'Apartar y confirmar por WhatsApp'); enviar.type = 'submit';
      form.append(resumen, inNom, inTel, trampa);
      // Lo que pide el negocio para confirmar (anticipo, cambios): se acepta antes de apartar.
      var chk = null;
      if (A.compromiso) {
        var comp = nodo('label', 'mc-ag__compromiso'); chk = nodo('input'); chk.type = 'checkbox'; chk.required = true;
        comp.append(chk, nodo('span', null, A.compromiso)); form.appendChild(comp);
      }
      form.appendChild(enviar);
      var listo = nodo('div', 'mc-ag__listo'); listo.hidden = true;
      raiz.append(pLug, pSv, pDia, pHora, form, listo);
      if (A.nota) raiz.appendChild(nodo('p', 'mc-ag__nota', A.nota));

      // Cuándo estará en cada ciudad, para el botón: "sáb 7 y dom 8 de noviembre".
      function cuandoEn(lugar) {
        var fs = fechasDe(lugar);
        if (lugar === LUGAR && Object.keys(A.horas).length) return 'Entre semana' + (fs.length ? ', y ' + fs.length + (fs.length === 1 ? ' día' : ' días') + ' de fin de semana' : '');
        return fs.slice(0, 3).map(function (f) { var p = f.split('-'); return NOMBRES[DIAS[dow(+p[0], +p[1], +p[2])]].slice(0, 3) + ' ' + (+p[2]) + ' ' + MESES[+p[1] - 1].slice(0, 3); }).join(' · ') + (fs.length > 3 ? '…' : '');
      }
      // Una vez por visita: alguien empezó a elegir su cita.
      var vista = false; function abierta() { if (!vista) { vista = true; track('agenda'); } }
      raiz.addEventListener('click', abierta, true);
      // Abrir la agenda con un servicio y una ciudad ya elegidos (botones de la tarjeta y del asistente).
      function aplicar(o) {
        o = o || {};
        if (o.servicio) {
          var n = norm(o.servicio);
          var sv = servicios.filter(function (x) { return norm(x.nombre) === n; })[0]
            || servicios.filter(function (x) { var m = norm(x.nombre); return m.indexOf(n) >= 0 || n.indexOf(m) >= 0; })[0];
          if (sv) { st.sv = sv; st.hora = null; }
        }
        if (o.lugar && lugares.length > 1) {
          var c = norm(o.lugar).split(',')[0];
          var l = lugares.filter(function (x) { var y = norm(x).split(',')[0]; return y === c || y.indexOf(c) === 0 || c.indexOf(y) === 0; })[0];
          if (l && l !== st.lugar) {
            st.lugar = l; st.fecha = null; st.hora = null;
            var f = cargado && primerDiaCon(l); if (f) { var p = f.split('-'); st.y = +p[0]; st.m = +p[1]; }
          }
        }
        pintarLugares(); pintarServicios(); pintarCal(); pintarHoras(); abierta();
        caja.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      if (!agendarEn) agendarEn = aplicar;
      // Agregar la cita a su calendario, con aviso un día antes y dos horas antes.
      function enCalendario(sv, fecha, hora, lugar) {
        var ini = fecha.replace(/-/g, '') + 'T' + hora.replace(':', '') + '00';
        var finMin = aMin(hora) + (sv.dur || 60);
        var fin = fecha.replace(/-/g, '') + 'T' + pad(Math.floor(finMin / 60) % 24) + pad(finMin % 60) + '00';
        var titulo = sv.nombre + ' · ' + (C.nombre || document.title.split('·')[0].trim());
        var donde = lugar && lugar === LUGAR && A.direccion ? A.direccion : (lugar || A.direccion || '');
        var detalle = [A.recordatorio || '', urlTarjeta].filter(Boolean).join('\n\n');
        var b = nodo('a', 'mc-btn', 'Agregar a mi calendario');
        if (/iPhone|iPad|Macintosh/.test(navigator.userAgent)) {
          var esc = function (t) { return String(t).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n'); };
          var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mattera//Tarjeta//ES', 'BEGIN:VEVENT',
            'UID:' + Date.now() + '@matterasystems.com', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
            'DTSTART:' + ini, 'DTEND:' + fin, 'SUMMARY:' + esc(titulo), 'LOCATION:' + esc(donde), 'DESCRIPTION:' + esc(detalle),
            'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Mañana: ' + titulo), 'END:VALARM',
            'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('En 2 horas: ' + titulo), 'END:VALARM',
            'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
          b.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics); b.download = 'mi-cita.ics';
        } else {
          b.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo) + '&dates=' + ini + '/' + fin
            + '&ctz=' + encodeURIComponent(tz) + '&location=' + encodeURIComponent(donde) + '&details=' + encodeURIComponent(detalle);
          b.target = '_blank'; b.rel = 'noopener';
        }
        return b;
      }
      function primerDiaCon(lugar) {
        var d = new Date(Date.UTC(hoy.y, hoy.m - 1, hoy.d));
        while (true) {
          var f = iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); if (f > hastaIso) return null;
          if (libres(f, st.sv.dur || 60, lugar).length) return f;
          d.setUTCDate(d.getUTCDate() + 1);
        }
      }
      function pintarLugares() {
        lugBox.textContent = '';
        lugares.forEach(function (l) {
          var b = nodo('button', 'mc-ag__sv' + (l === st.lugar ? ' is-on' : '')); b.type = 'button';
          b.setAttribute('aria-pressed', l === st.lugar ? 'true' : 'false');
          b.appendChild(nodo('span', 'mc-ag__svn', l));
          var cuando = cuandoEn(l); if (cuando) b.appendChild(nodo('span', 'mc-ag__svx', cuando));
          b.addEventListener('click', function () {
            st.lugar = l; st.fecha = null; st.hora = null; pintarLugares();
            // El calendario salta al mes de su próxima fecha en esa ciudad.
            var f = cargado && primerDiaCon(l); if (f) { var p = f.split('-'); st.y = +p[0]; st.m = +p[1]; }
            pintarCal(); pintarHoras();
          });
          lugBox.appendChild(b);
        });
      }
      function pintarServicios() {
        svBox.textContent = '';
        if (servicios.length < 2) { pSv.hidden = true; return; }
        servicios.forEach(function (sv) {
          var b = nodo('button', 'mc-ag__sv' + (sv === st.sv ? ' is-on' : '')); b.type = 'button';
          b.setAttribute('aria-pressed', sv === st.sv ? 'true' : 'false');
          b.appendChild(nodo('span', 'mc-ag__svn', sv.nombre));
          var extra = [sv.precio != null ? dinero(sv.precio) : '', sv.dur ? (sv.dur >= 60 ? Math.floor(sv.dur / 60) + ' h' + (sv.dur % 60 ? ' ' + sv.dur % 60 + ' min' : '') : sv.dur + ' min') : ''].filter(Boolean).join(' · ');
          if (extra) b.appendChild(nodo('span', 'mc-ag__svx', extra));
          b.addEventListener('click', function () { st.sv = sv; st.hora = null; pintarServicios(); pintarCal(); if (st.fecha) pintarHoras(); });
          svBox.appendChild(b);
        });
      }
      function pintarCal() {
        cal.textContent = ''; tit.textContent = MESES[st.m - 1] + ' ' + st.y;
        ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (d) { cal.appendChild(nodo('span', 'mc-ag__dow', d)); });
        var primero = (dow(st.y, st.m, 1) + 6) % 7; var dias = new Date(Date.UTC(st.y, st.m, 0)).getUTCDate();
        for (var i = 0; i < primero; i++) cal.appendChild(nodo('span'));
        for (var d = 1; d <= dias; d++) {
          var f = iso(st.y, st.m, d); var hay = cargado && libres(f, st.sv.dur || 60, st.lugar).length > 0;
          var b = nodo('button', 'mc-ag__dia' + (f === st.fecha ? ' is-on' : ''), String(d)); b.type = 'button';
          b.disabled = !hay; b.setAttribute('aria-label', largo(f) + (hay ? '' : ', sin horarios'));
          (function (f) { b.addEventListener('click', function () { st.fecha = f; st.hora = null; pintarCal(); pintarHoras(); pHora.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }); })(f);
          cal.appendChild(b);
        }
        prev.disabled = st.y === hoy.y && st.m === hoy.m;
        next.disabled = iso(st.y, st.m, 1) > hastaIso;
      }
      function pintarHoras() {
        horasBox.textContent = ''; pHora.hidden = !st.fecha; form.hidden = !st.hora;
        if (!st.fecha) return;
        var plan = planDelDia(st.fecha); var donde = plan && plan.lugar ? ' · ' + plan.lugar : '';
        titHora.textContent = 'Horarios · ' + largo(st.fecha) + donde;
        var lista = libres(st.fecha, st.sv.dur || 60, st.lugar);
        if (!lista.length) horasBox.appendChild(nodo('p', 'mc-ag__vacio', 'Ese día ya no tiene horarios libres.'));
        lista.forEach(function (h) {
          var b = nodo('button', 'mc-ag__hora' + (h === st.hora ? ' is-on' : ''), fmtHora(h)); b.type = 'button';
          b.addEventListener('click', function () { st.hora = h; pintarHoras(); form.hidden = false; resumen.textContent = st.sv.nombre + ' · ' + largo(st.fecha) + ' a las ' + fmtHora(h) + donde; form.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); inNom.focus({ preventScroll: true }); });
          horasBox.appendChild(b);
        });
      }
      prev.addEventListener('click', function () { st.m--; if (st.m < 1) { st.m = 12; st.y--; } pintarCal(); });
      next.addEventListener('click', function () { st.m++; if (st.m > 12) { st.m = 1; st.y++; } pintarCal(); });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var nombre = inNom.value.trim(), tel = inTel.value.replace(/\D/g, '');
        if (!nombre || tel.length < 10) { toast('Escribe tu nombre y tu WhatsApp a 10 dígitos'); return; }
        if (chk && !chk.checked) { toast('Marca la casilla para apartar'); return; }
        var planCita = planDelDia(st.fecha); var lugarCita = planCita && planCita.lugar ? planCita.lugar : '';
        var msg = 'Hola, soy ' + nombre + '. Quiero apartar ' + st.sv.nombre + ' el ' + largo(st.fecha) + ' a las ' + fmtHora(st.hora) + (lugarCita ? ' en ' + lugarCita : '') + '. Mi WhatsApp es ' + tel + '.';
        var cita = { fecha: st.fecha, hora: st.hora, dur: st.sv.dur || 60, servicio: st.sv.nombre, lugar: lugarCita, nombre: nombre, tel: tel, web: trampa.value };
        enviar.disabled = true;
        var terminar = function () {
          track('cita');
          form.hidden = true; pHora.hidden = true; pDia.hidden = true; pSv.hidden = true; pLug.hidden = true; listo.hidden = false; listo.textContent = '';
          listo.appendChild(nodo('p', 'mc-ag__t', 'Listo, apartaste ' + largo(st.fecha) + ' a las ' + fmtHora(st.hora) + (lugarCita ? ' en ' + lugarCita : '')));
          listo.appendChild(nodo('p', null, 'Mándanos el mensaje por WhatsApp para confirmarla.'));
          var a = nodo('a', 'mc-btn mc-btn--wa', 'Confirmar por WhatsApp'); a.href = waURL(msg); a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-mc-t', 'wa');
          listo.appendChild(a);
          listo.appendChild(enCalendario(st.sv, st.fecha, st.hora, lugarCita));
          if (A.recordatorio) listo.appendChild(nodo('p', 'mc-ag__nota', A.recordatorio));
          try { window.open(waURL(msg), '_blank', 'noopener'); } catch (e2) {}
        };
        // En la vista previa no se aparta de verdad: se enseña el camino completo.
        if (!API || !SLUG || PREVIEW || LOCAL) { terminar(); return; }
        fetch(API + '/ag/' + SLUG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cita) })
          .then(function (r) {
            if (r.status === 409) { enviar.disabled = false; toast('Esa hora se acaba de ocupar, elige otra'); st.hora = null; return cargar().then(function () { pintarCal(); pintarHoras(); }); }
            if (!r.ok) throw 0; terminar();
          })
          .catch(function () { enviar.disabled = false; terminar(); });
      });

      pintarLugares(); pintarServicios(); pintarCal();
      cargar().then(function () {
        // Si en este mes no hay días en su ciudad, el calendario abre en el primero que haya.
        var f = st.lugar && primerDiaCon(st.lugar);
        if (f && f.slice(0, 7) !== iso(st.y, st.m, 1).slice(0, 7)) { var p = f.split('-'); st.y = +p[0]; st.m = +p[1]; }
        pintarCal();
      });
      // Botones de "Agendar" en otras partes de la tarjeta: abren la agenda con ese servicio.
      $$('[data-mc-agendar]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          aplicar({ servicio: b.getAttribute('data-mc-agendar'), lugar: b.getAttribute('data-mc-lugar') });
        });
      });
    });
  })();

  /* ---------- 13. Año en curso y utilidades ---------- */
  $$('[data-mc-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  window.MatteraCard = { track: track, toast: toast, config: C, version: '1.0.0' };
})();
