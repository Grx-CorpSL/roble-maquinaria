/* ROBLE — comportamiento compartido: iconos, datos, búsqueda, plantillas y componentes. */
window.ROBLE = (function () {
  'use strict';

  /* ---------- ICONOS (sprite único para toda la plataforma) ---------- */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    'arrow-right': '<path d="M4 12h15M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M20 12H5M11 6l-6 6 6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
    sliders: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><rect x="13" y="5.5" width="4" height="5"/><rect x="7" y="13.5" width="4" height="5"/>',
    pin: '<path d="M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11Z"/><circle cx="12" cy="10" r="2"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
    whatsapp: '<path d="M4 20.5l1.4-4.2A8.5 8.5 0 1 1 8.7 19L4 20.5Z"/><path d="M9.3 9c.1 1.9 3.9 5.7 5.7 5.7l1.3-1.5-2-1-.9.8a5 5 0 0 1-2.4-2.4l.8-.9-1-2L9.3 9Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14"/><path d="m3 7 9 6 9-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 13v7H4V6h7"/>',
    edit: '<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13 7 4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M3 3l18 18M10 6a9 9 0 0 1 2-.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.6M6.4 7.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    building: '<rect x="4" y="3" width="16" height="18"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
    box: '<path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
    warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    drag: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
    download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
    sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
    image: '<rect x="3" y="4" width="18" height="16"/><path d="m3 17 6-6 5 5 3-3 4 4"/><circle cx="16" cy="9" r="1.5"/>',
    file: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    inbox: '<path d="M4 4h16v16H4V4Z"/><path d="M4 14h5l1.5 2h3L15 14h5"/>',
    star: '<path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.3 6.4 20.3l1.2-6.3L3 9.6l6.3-.8L12 3Z"/>',
    lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    logout: '<path d="M10 4H4v16h6M15 8l5 4-5 4M20 12H9"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    compare: '<path d="M4 6h7v12H4zM13 6h7v12h-7z"/>',
    /* sectores */
    's-materias-primas': '<path d="M3 15h12v5H3zM9 9h12v5H9zM6 4h11v4H6z"/>',
    's-tableros-superficies': '<path d="M3 9h15v11H3z"/><path d="M3 9l3-4h15v11l-3 4M18 9l3-4"/>',
    's-herrajes-accesorios': '<rect x="3" y="6" width="7" height="12"/><rect x="14" y="6" width="7" height="12"/><circle cx="12" cy="12" r="1.5"/><path d="M6.5 9v.5M6.5 15v.5M17.5 9v.5M17.5 15v.5"/>',
    's-acabados-tratamientos': '<path d="M10 2.5h4V9h-4zM5 9h14v4H5z"/><path d="M6.5 13 8 21.5h8l1.5-8.5"/>',
    's-maquinaria': '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    's-tecnologia-software': '<rect x="6" y="6" width="12" height="12"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    's-carpinteria-construccion': '<rect x="5" y="3" width="14" height="18"/><path d="M8 3v18M15 12v.5"/>',
    's-construccion-madera': '<path d="M3 11 12 3l9 8M5 10v11h14V10M9 21v-8M15 21v-8M5 15h14"/>',
    's-mueble-por-ambiente': '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 12h18v6H3zM5 18v2M19 18v2M7 12V9h10v3"/>',
    's-mueble-por-producto': '<path d="M7 3h10v9H7zM5 12h14M6 12v9M18 12v9M6 17h12"/>',
    's-contract-proyectos': '<path d="M3 9 5 4h14l2 5M3 9h18v3H3zM5 12v9h14v-9M10 21v-5h4v5"/>',
    's-tapiceria-complementos': '<path d="M4 6h16v12H4z"/><path d="M4 6l3 3M20 6l-3 3M4 18l3-3M20 18l-3-3"/><circle cx="12" cy="12" r="1.5"/>',
    's-servicios-profesionales': '<path d="M2 7h13v10H2zM15 11h4l3 3v3h-7"/><circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/>',
    's-comunicacion-eventos': '<path d="M3 10v4h3l7 4V6l-7 4H3z"/><path d="M17 9a4.2 4.2 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/>',
    /* Sectores del cliente (2026-10-03). */
    's-tecnicos-de-maquinaria': '<path d="M14.5 4.5a4 4 0 0 0-5 5L4 15l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2-2z"/><path d="M15 15l4 4"/>',
    's-tablero-aglomerado-y-mdf': '<rect x="3" y="5" width="18" height="4"/><rect x="3" y="10" width="18" height="4"/><rect x="3" y="15" width="18" height="4"/>',
    's-almacenes-de-puertas': '<rect x="4" y="3" width="7" height="18"/><rect x="13" y="3" width="7" height="18"/><path d="M9 12h.5M15 12h.5"/>',
    's-puertas-de-cocina': '<rect x="5" y="3" width="14" height="18"/><path d="M5 9h14M5 15h14M15 6h1M15 12h1M15 18h1"/>',
    's-encimeras-de-cocina': '<path d="M2 8h20v3H2zM4 11v9M20 11v9"/><rect x="9" y="4" width="6" height="4"/>',
    's-cantos-para-muebles': '<rect x="4" y="7" width="16" height="10"/><path d="M4 7h16v2H4z"/>',
    's-colas-y-liquidos-de-limpieza': '<path d="M9 3h6v3H9zM8 6h8l2 4v11H6V10z"/><path d="M9 13h6"/>',
    's-herramientas-mecanizado': '<path d="M12 3v18"/><path d="M12 5l4 2-4 2 4 2-4 2 4 2-4 2 4 2"/><path d="M12 5L8 7l4 2-4 2 4 2-4 2 4 2-4 2"/>',
    's-ventanas': '<rect x="4" y="3" width="16" height="18"/><path d="M12 3v18M4 12h16"/>',
    's-consumibles-casas-prefabricadas': '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-5h6v5"/><path d="M11 16h2"/>',
    's-complementos-de-madera': '<rect x="3" y="12" width="18" height="8"/><path d="M3 16h18M8 12V8h8v4"/>',
    's-amueblamiento-tiendas': '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v3H3z"/><path d="M5 12v9h14v-9"/><path d="M9 21v-5h6v5"/>',
    's-armarios': '<rect x="4" y="3" width="16" height="18"/><path d="M12 3v18M10 11v2M14 11v2"/>',
    's-muebles-de-cocina': '<rect x="3" y="4" width="18" height="6"/><rect x="3" y="12" width="18" height="8"/><path d="M8 16h8M3 10v2M21 10v2"/>',
    's-muebles-de-bano': '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 12V5a2 2 0 0 1 4 0"/><path d="M7 20l-1 2M17 20l1 2"/>',
    's-muebles-de-oficina': '<rect x="2" y="7" width="20" height="3"/><path d="M4 10v10M20 10v10M4 15h8M12 10v10"/>',
    's-mueble-kit': '<rect x="3" y="5" width="8" height="14"/><rect x="13" y="5" width="8" height="14"/><path d="M11 12h2M7 9v6M17 9v6"/>',
    's-mueble-juvenil': '<path d="M3 20V10h18v10"/><path d="M3 14h18"/><path d="M6 10V4h12v6"/><path d="M6 7h12"/>',
    's-mesas': '<path d="M2 8h20"/><path d="M5 8v12M19 8v12M5 14h14"/>',
    's-sillas': '<path d="M6 3v10M18 3v10M6 8h12"/><path d="M4 13h16v3H4z"/><path d="M6 16v5M18 16v5"/>',
    's-canapes': '<rect x="2" y="9" width="20" height="8"/><path d="M4 17v3M20 17v3M2 13h20"/>',
    's-patas-para-canapes': '<path d="M3 5h18"/><path d="M6 5v14M18 5v14M12 5v14"/><path d="M4 19h4M16 19h4M10 19h4"/>',
    's-somieres': '<rect x="2" y="7" width="20" height="10"/><path d="M6 7v10M10 7v10M14 7v10M18 7v10M4 17v3M20 17v3"/>',
    's-colchones': '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M2 12h20M7 9.5v5M12 9.5v5M17 9.5v5"/>',
  };
  // Tres sectores nuevos heredan el símbolo del antiguo que absorbieron.
  ICONS['s-paneles-decorativos'] = ICONS['s-tableros-superficies'];
  ICONS['s-sofas'] = ICONS['s-tapiceria-complementos'];
  ICONS['s-carpinteros'] = ICONS['s-servicios-profesionales'];

  function injectSprite() {
    if (document.getElementById('roble-sprite')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'roble-sprite'; svg.setAttribute('aria-hidden', 'true'); svg.style.display = 'none';
    svg.innerHTML = Object.keys(ICONS).map(k => `<symbol id="i-${k}" viewBox="0 0 24 24">${ICONS[k]}</symbol>`).join('');
    document.body.prepend(svg);
  }
  // Un sector sin símbolo propio pinta el de directorio, no un hueco.
  const icon = (name, cls) => { if (name.startsWith('s-') && !ICONS[name]) name = 'building'; return `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`; };

  /* ---------- DATOS ---------- */
  const D = window.ROBLE_DATA || { sectores: [], empresas: [], productos: [] };
  if (!/\/(admin|admin-directorio|panel)\//.test(location.pathname)) {
    let ov = {}; try { ov = JSON.parse(localStorage.getItem('roble_admin_v1') || '{}'); } catch (e) {}
    const pe = ov.empresas || {}, pp = ov.productos || {};
    // La base dice 'activa'; 'publicada' era el nombre del prototipo y puede
    // seguir en parches locales antiguos. Cualquier otro estado no se lista.
    D.empresas = [...(ov.nuevosE || []), ...D.empresas.map(e => Object.assign(e, pe[e.id] || {}))].filter(e => !e._deleted && (!e.estado || e.estado === 'activa' || e.estado === 'publicada'));
    const vivas = new Set(D.empresas.map(e => e.id));
    D.productos = [...(ov.nuevosP || []), ...D.productos.map(p => Object.assign(p, pp[p.id] || {}))].filter(p => !p._deleted && (!p.estado || p.estado === 'publicado') && vivas.has(p.empresa_id));
    D.productos.forEach(p => { p.fotos = p.fotos || []; }); D.empresas.forEach(e => { e.sectores = e.sectores && e.sectores.length ? e.sectores : [e.sector]; });
  }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const fmtNum = n => new Intl.NumberFormat('es-ES').format(n);

  // Un id antiguo (enlace guardado, buscador) se resuelve al sector que lo absorbió.
  const sector = id => { const a = (D.sectoresAlias || {})[id] || id; return D.sectores.find(s => s.id === a) || null; };
  const empresa = id => D.empresas.find(e => e.id === Number(id)) || null;
  const producto = id => D.productos.find(p => p.id === Number(id)) || null;
  const productosDe = eid => D.productos.filter(p => p.empresa_id === Number(eid));
  const empresasDe = sid => D.empresas.filter(e => e.sectores.includes(sid));
  const ref = e => 'REF ' + String(e.id).padStart(4, '0');
  const zona = e => [e.ciudad, e.region].filter(Boolean).join(', ');
  const iniciales = n => (String(n).match(/[\p{L}\p{N}]+/gu) || []).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const pais = { ES: 'España', PT: 'Portugal', IT: 'Italia', FR: 'Francia' };

  function scoreText(hay, q) {
    const h = norm(hay); if (!h) return 0;
    if (h === q) return 10;
    if (h.startsWith(q)) return 6;
    if (h.includes(q)) return 3;
    const words = q.split(/\s+/).filter(Boolean);
    let s = 0; for (const w of words) if (w.length > 2 && h.includes(w)) s += 1;
    return s;
  }

  function buscar(opts) {
    const q = norm(opts.q || '').trim();
    let E = D.empresas, P = D.productos;
    if (opts.sector) { E = E.filter(e => e.sectores.includes(opts.sector)); P = P.filter(p => p.sector === opts.sector); }
    if (opts.sub) { const ns = norm(opts.sub); P = P.filter(p => norm(p.sub) === ns); E = E.filter(e => productosDe(e.id).some(p => norm(p.sub) === ns) || scoreText(e.desc, ns) > 0); }
    if (opts.zona) { const z = norm(opts.zona); E = E.filter(e => norm(zona(e)).includes(z) || e.pais === opts.zona); P = P.filter(p => { const e = empresa(p.empresa_id); return e && (norm(zona(e)).includes(z) || e.pais === opts.zona); }); }
    if (q) {
      E = E.map(e => ({ e, s: scoreText(e.nombre, q) * 3 + scoreText(e.desc, q) + scoreText(zona(e), q) * 2 + scoreText((sector(e.sector) || {}).nombre, q) + productosDe(e.id).reduce((a, p) => a + (scoreText(p.titulo, q) > 0 ? 1 : 0), 0) }))
        .filter(x => x.s > 0).sort((a, b) => b.s - a.s || (b.e.plan === 'premium') - (a.e.plan === 'premium') || a.e.nombre.localeCompare(b.e.nombre)).map(x => x.e);
      P = P.map(p => ({ p, s: scoreText(p.titulo, q) * 3 + scoreText(p.sub, q) * 2 + scoreText(p.empresa, q) + scoreText(p.desc, q) * .5 }))
        .filter(x => x.s > 0).sort((a, b) => b.s - a.s || b.p.destacado - a.p.destacado).map(x => x.p);
    } else {
      E = [...E].sort((a, b) => (b.plan === 'premium') - (a.plan === 'premium') || a.nombre.localeCompare(b.nombre, 'es'));
      P = [...P].sort((a, b) => b.destacado - a.destacado || a.titulo.localeCompare(b.titulo, 'es'));
    }
    return { empresas: E, productos: P };
  }

  function sugerencias(qraw) {
    const q = norm(qraw).trim(); if (q.length < 2) return [];
    const out = [];
    D.sectores.forEach(s => { if (scoreText(s.nombre, q) || scoreText(s.corto, q)) out.push({ tipo: 'sector', label: s.corto, meta: 'Sector', href: `sector.html?s=${s.id}`, icon: 's-' + s.id }); });
    const subs = [];
    D.sectores.forEach(s => s.sub.forEach(sub => { const n = norm(sub); if (!n.includes(q)) return; const atWord = n.startsWith(q) || n.includes(' ' + q) || n.includes('(' + q); subs.push({ s: atWord ? 2 : 1, it: { tipo: 'sub', label: sub, meta: s.corto, href: `productos.html?sector=${s.id}&subsector=${encodeURIComponent(sub)}`, icon: 'filter' } }); }));
    subs.sort((a, b) => b.s - a.s || a.it.label.length - b.it.label.length).slice(0, 3).forEach(x => out.push(x.it));
    const r = buscar({ q });
    r.empresas.slice(0, 4).forEach(e => out.push({ tipo: 'empresa', label: e.nombre, meta: zona(e) || (sector(e.sector) || {}).corto || 'Empresa', href: `empresa.html?id=${e.id}`, icon: 'building' }));
    r.productos.slice(0, 3).forEach(p => out.push({ tipo: 'producto', label: p.titulo, meta: p.empresa, href: `producto.html?id=${p.id}`, icon: 'box' }));
    return out.slice(0, 9);
  }

  /* ---------- PLANTILLAS ---------- */
  const hl = (text, q) => { if (!q) return esc(text); const i = norm(text).indexOf(norm(q)); if (i < 0) return esc(text); return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length)); };
  const tpl = {
    logoTile: (e, cls) => `<div class="logo-tile${cls ? ' ' + cls : ''}" aria-hidden="true">${esc(iniciales(e.nombre))}</div>`,
    empresaRow(e) {
      const s = sector(e.sector); const z = zona(e); const feat = e.plan === 'premium';
      const tags = e.sectores.slice(0, 3).map(id => { const ss = sector(id); return ss ? `<a class="tag" href="sector.html?s=${ss.id}">${esc(ss.corto)}</a>` : ''; }).join('');
      return `<article class="result${feat ? ' is-featured' : ''}">
        ${tpl.logoTile(e)}
        <div class="result-main">
          <h3 class="result-name"><a href="empresa.html?id=${e.id}">${esc(e.nombre)}</a></h3>
          <div class="result-meta"><span>${esc(ref(e))}</span>${s ? `<span class="dot-sep"></span><span>${esc(s.corto)}</span>` : ''}${z ? `<span class="dot-sep"></span><span>${esc(z)}</span>` : ''}</div>
          ${e.desc ? `<p class="result-desc">${esc(e.desc)}</p>` : ''}
          ${tags ? `<div class="result-tags">${tags}</div>` : ''}
        </div>
        <div class="result-side">
          ${feat ? '<span class="featured">Destacada</span>' : ''}
          <span class="result-cta">Ver ficha ${icon('arrow-right')}</span>
        </div>
      </article>`;
    },
    productoCard(p) {
      const s = sector(p.sector); const foto = p.fotos && p.fotos[0];
      return `<article class="pcard">
        <div class="pcard-media">${icon('s-' + (s ? s.id : 'maquinaria'))}<span class="label">${esc(s ? s.nombre : '')}</span>${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" width="640" height="480">` : ''}${p.destacado ? '<span class="featured">Destacado</span>' : ''}</div>
        <div class="pcard-body">
          <h2 class="pcard-title"><a href="producto.html?id=${p.id}">${esc(p.titulo)}</a></h2>
          <div class="pcard-meta">${esc(p.empresa)}</div>
        </div>
      </article>`;
    },
    sectorRow: s => `<a class="sector-row" href="sector.html?s=${s.id}"><span class="n">${pad2(s.n)}</span>${icon('s-' + s.id)}<span class="name">${esc(s.corto)}</span><span class="count">${plural(s.empresas, 'empresa', 'empresas')}</span></a>`,
    sectorTile: s => `<a class="stile" href="sector.html?s=${s.id}">
        <div class="stile-top"><span class="n">${pad2(s.n)} / ${pad2(D.sectores.length)}</span>${icon('s-' + s.id)}</div>
        <h3 class="stile-name">${esc(s.corto)}</h3>
        <p class="stile-desc">${esc(s.desc)}</p>
        <div class="stile-count">${plural(s.empresas, 'empresa', 'empresas')} · ${plural(s.productos, 'producto', 'productos')}</div>
      </a>`,
  };

  /* ---------- COMPONENTES ---------- */
  function header() {
    const h = document.querySelector('.site-header'); if (!h) return;
    const btn = h.querySelector('.nav-toggle'); if (!btn) return;
    const panel = document.createElement('div'); panel.className = 'nav-panel'; panel.id = 'nav-panel';
    ['.hsearch', '.nav', '.header-actions'].forEach(sel => { const el = h.querySelector(sel); if (el) { const c = el.cloneNode(true); c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id')); panel.appendChild(c); } });
    h.querySelector('.wrap').appendChild(panel);
    btn.addEventListener('click', () => { const open = h.classList.toggle('is-open'); btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú'); btn.innerHTML = icon(open ? 'x' : 'menu', 'i-24'); document.body.style.overflow = open ? 'hidden' : ''; if (open) { const f = panel.querySelector('input'); f && f.focus(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && h.classList.contains('is-open')) btn.click(); });
    const page = location.pathname.split('/').pop() || 'index.html';
    const tipo = new URLSearchParams(location.search).get('tipo');
    h.querySelectorAll('.nav a').forEach(a => { const href = a.getAttribute('href').split('?')[0]; if (href === page && (page !== 'buscar.html' || a.dataset.tipo === tipo)) a.setAttribute('aria-current', 'page'); });
  }

  function suggest(input, opts) {
    opts = opts || {};
    const wrap = input.closest('.search') || input.parentElement; wrap.style.position = 'relative';
    const box = document.createElement('div'); box.className = 'suggest'; box.setAttribute('role', 'listbox'); wrap.appendChild(box);
    input.setAttribute('autocomplete', 'off'); input.setAttribute('aria-autocomplete', 'list');
    let items = [], sel = -1, t;
    const close = () => { box.classList.remove('is-open'); input.setAttribute('aria-expanded', 'false'); sel = -1; };
    const render = () => {
      const q = input.value;
      items = sugerencias(q);
      if (!q.trim() || q.trim().length < 2) { close(); return; }
      if (!items.length) { box.innerHTML = `<div class="suggest-empty">Nada con «${esc(q)}». Pulsa Intro para buscar en todo el directorio.</div>`; }
      else {
        let html = '', last = '';
        items.forEach((it, i) => {
          const g = it.tipo === 'sector' || it.tipo === 'sub' ? 'Sectores' : it.tipo === 'empresa' ? 'Empresas' : 'Productos';
          if (g !== last) { html += `<div class="suggest-group label">${g}</div>`; last = g; }
          html += `<a class="suggest-item" role="option" href="${it.href}" data-i="${i}">${icon(it.icon)}<span>${hl(it.label, q)}</span><span class="meta">${esc(it.meta)}</span></a>`;
        });
        box.innerHTML = html;
      }
      box.classList.add('is-open'); input.setAttribute('aria-expanded', 'true'); sel = -1;
    };
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 90); });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) render(); });
    input.addEventListener('keydown', e => {
      const els = box.querySelectorAll('.suggest-item');
      if (e.key === 'ArrowDown' && els.length) { e.preventDefault(); sel = (sel + 1) % els.length; els.forEach((el, i) => el.setAttribute('aria-selected', String(i === sel))); els[sel].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp' && els.length) { e.preventDefault(); sel = (sel - 1 + els.length) % els.length; els.forEach((el, i) => el.setAttribute('aria-selected', String(i === sel))); }
      else if (e.key === 'Enter' && sel >= 0 && els[sel]) { e.preventDefault(); location.href = els[sel].getAttribute('href'); }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  }

  function dropdowns() {
    document.querySelectorAll('[data-menu]').forEach(btn => {
      const menu = document.getElementById(btn.dataset.menu); if (!menu) return;
      btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', e => { e.stopPropagation(); const open = menu.classList.toggle('is-open'); btn.setAttribute('aria-expanded', String(open)); if (open) { const f = menu.querySelector('.menu-item'); f && f.focus(); } });
      menu.addEventListener('keydown', e => { const its = [...menu.querySelectorAll('.menu-item')]; const i = its.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); (its[i + 1] || its[0]).focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); (its[i - 1] || its[its.length - 1]).focus(); } if (e.key === 'Escape') { menu.classList.remove('is-open'); btn.focus(); } });
    });
    document.addEventListener('click', () => document.querySelectorAll('.menu.is-open').forEach(m => { m.classList.remove('is-open'); const b = document.querySelector(`[data-menu="${m.id}"]`); b && b.setAttribute('aria-expanded', 'false'); }));
  }

  let lastFocus = null;
  function trap(container) {
    const f = container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    container.addEventListener('keydown', e => { if (e.key !== 'Tab') return; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } });
  }

  function confirmDialog(o) {
    return new Promise(resolve => {
      let ov = document.getElementById('roble-confirm');
      if (!ov) { ov = document.createElement('div'); ov.id = 'roble-confirm'; ov.className = 'overlay'; document.body.appendChild(ov); }
      ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rc-title">
        <div class="dialog-head"><h2 id="rc-title">${esc(o.title || 'Confirmar')}</h2><button class="btn btn-ghost btn-icon btn-sm" data-x aria-label="Cerrar">${icon('x')}</button></div>
        <div class="dialog-body">${o.html || esc(o.text || '')}</div>
        <div class="dialog-foot"><button class="btn" data-x>Cancelar</button><button class="btn ${o.danger ? 'btn-primary' : 'btn-ink'}" data-ok>${esc(o.ok || 'Confirmar')}</button></div></div>`;
      lastFocus = document.activeElement; ov.classList.add('is-open'); document.body.style.overflow = 'hidden';
      const done = v => { ov.classList.remove('is-open'); document.body.style.overflow = ''; lastFocus && lastFocus.focus(); resolve(v); };
      ov.querySelectorAll('[data-x]').forEach(b => b.onclick = () => done(false));
      ov.querySelector('[data-ok]').onclick = () => done(true);
      ov.onclick = e => { if (e.target === ov) done(false); };
      ov.onkeydown = e => { if (e.key === 'Escape') done(false); };
      trap(ov); ov.querySelector('[data-ok]').focus();
    });
  }

  function toast(msg, type) {
    let c = document.querySelector('.toasts'); if (!c) { c = document.createElement('div'); c.className = 'toasts'; c.setAttribute('aria-live', 'polite'); document.body.appendChild(c); }
    const t = document.createElement('div'); t.className = 'toast' + (type === 'error' ? ' is-error' : ''); t.innerHTML = `<span class="sq"></span><span>${esc(msg)}</span>`; c.appendChild(t);
    setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 200); }, 2600);
  }

  function drawer(id) {
    const d = document.getElementById(id); if (!d) return null;
    let ov = d.previousElementSibling; if (!ov || !ov.classList.contains('drawer-overlay')) { ov = document.createElement('div'); ov.className = 'drawer-overlay'; d.before(ov); }
    const api = {
      open() { lastFocus = document.activeElement; d.classList.add('is-open'); ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; const f = d.querySelector('input,select,textarea,button'); f && setTimeout(() => f.focus(), 30); },
      close() { d.classList.remove('is-open'); ov.classList.remove('is-open'); document.body.style.overflow = ''; lastFocus && lastFocus.focus(); },
    };
    ov.addEventListener('click', api.close);
    d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', api.close));
    d.addEventListener('keydown', e => { if (e.key === 'Escape') api.close(); });
    trap(d);
    return api;
  }

  function tabs(root) {
    root.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
      root.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', 'false'));
      t.setAttribute('aria-selected', 'true');
      const target = t.dataset.panel; if (!target) return;
      root.parentElement.querySelectorAll('[data-panel-id]').forEach(p => p.hidden = p.dataset.panelId !== target);
    }));
  }

  function validate(form) {
    let ok = true;
    form.querySelectorAll('.field').forEach(f => {
      const c = f.querySelector('input,select,textarea'); if (!c) return;
      /* Antes solo se miraban "obligatorio" y el formato del correo, así que
         minlength, pattern, min y max quedaban en decorado: una contraseña de
         tres caracteres pasaba pese al minlength="8". Se delega en la
         validación del navegador, que ya conoce todos esos atributos, y se
         mantienen las dos comprobaciones propias. */
      const vacio = c.required && !c.value.trim();
      const correoMalo = c.type === 'email' && c.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.value);
      const nativo = typeof c.checkValidity === 'function' && !c.checkValidity();
      const bad = vacio || correoMalo || nativo;
      f.classList.toggle('is-invalid', bad); c.setAttribute('aria-invalid', String(bad)); if (bad) ok = false;
    });
    if (!ok) { const first = form.querySelector('.is-invalid input,.is-invalid select,.is-invalid textarea'); first && first.focus(); }
    return ok;
  }

  const qs = () => new URLSearchParams(location.search);

  document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.closest('.pcard-media, .gallery, .logo-tile, .media')) t.remove(); }, true);
  document.addEventListener('DOMContentLoaded', () => {
    injectSprite(); header(); dropdowns();
    document.querySelectorAll('[data-suggest]').forEach(i => suggest(i));
    document.querySelectorAll('.tabs').forEach(tabs);
    document.addEventListener('click', e => { const s = e.target.closest('.switch'); if (s && !s.disabled) s.setAttribute('aria-checked', String(s.getAttribute('aria-checked') !== 'true')); });
  });

  /* Las páginas con ?id= comparten HTML: cada ficha declara su propia URL canónica. */
  const canon = q => { const u = location.origin + location.pathname + q; const l = document.querySelector('link[rel=canonical]'); if (l) l.href = u; const m = document.querySelector('meta[property="og:url"]'); if (m) m.content = u; const t = document.querySelector('meta[property="og:title"]'); if (t) t.content = document.title; };
  const noindex = () => { const m = document.querySelector('meta[name=robots]'); if (m) m.content = 'noindex, follow'; };

  return { D, icon, norm, esc, pad2, plural, fmtNum, sector, empresa, producto, productosDe, empresasDe, ref, zona, iniciales, pais, buscar, sugerencias, tpl, suggest, dropdowns, header, confirmDialog, toast, drawer, validate, qs, trap, tabs, canon, noindex };
})();
