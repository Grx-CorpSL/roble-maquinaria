/* ROBLE Admin — store (empresas, productos y contactos en servidor; el resto, local), shell compartido, tabla, formularios. */
window.Admin = (function () {
  'use strict';
  const R = window.ROBLE, D = R.D, esc = R.esc, icon = R.icon;
  const KEY = 'roble_admin_v1';

  /* ---------- STORE: capa de cambios sobre los datos reales ---------- */
  const empty = () => ({ empresas: {}, productos: {}, categorias: {}, nuevosE: [], nuevosP: [], usuarios: [], nuevosU: [], leads: {}, altas: {}, contenidos: {}, destacados: null, config: {}, log: [], nextId: 100000 });
  let st = empty();
  try { st = Object.assign(empty(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const now = () => new Date().toISOString();
  const log = (texto, tipo) => { st.log.unshift({ fecha: now(), texto, tipo: tipo || 'info' }); st.log = st.log.slice(0, 60); save(); };

  /* Empresas, productos y contactos se escriben en el servidor, que decide si
     eres administración. Cambio optimista en memoria; si el servidor falla,
     aviso y recarga para volver a lo que hay de verdad. keepalive: la página
     puede recargarse justo después de pedir el cambio. */
  const api = (url, method, body) => fetch(url, { method, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .then(async r => { if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'No se ha podido guardar.'); } });
  const falla = e => { R.toast((e && e.message) || 'Sin conexión con el servidor.', 'error'); setTimeout(() => location.reload(), 1800); };
  const A_BD = { publicada: 'activa', borrador: 'borrador', pendiente: 'pendiente', rechazada: 'rechazada', suspendida: 'suspendida' };
  const DE_BD = { activa: 'publicada', borrador: 'borrador', pendiente: 'pendiente', rechazada: 'rechazada', suspendida: 'suspendida' };
  const dePagos = () => R.toast('El plan y el destacado los gestiona pagos: no se cambian desde aquí.', 'error');
  const FICHA = ['nombre', 'desc', 'web', 'telefono', 'ciudad', 'region', 'email', 'sectores', 'servicios'];
  const TIPOS_FOTO = 'image/jpeg,image/png,image/webp,image/avif';
  let LEADS = [];
  /* ponytail: copia reducida de ML.auth (assets/ml.js). Este admin no carga
     ml.js ni sus datos de maquinaria; si aparece un tercer consumidor, extraer
     a assets/identidad.js. La sesión viene del servidor, nunca de localStorage. */
  const auth = { user: null, listo: false };
  const domListo = new Promise(r => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r());
  // Si ml.js ya está cargado (páginas del panel), se reutiliza su petición en vez de hacer otra.
  const ready = (window.ML && ML.auth
    ? ML.auth.ready.then(() => { auth.user = ML.auth.user; })
    : Promise.all([domListo,
        fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' })
          .then(r => r.ok ? r.json() : null).then(j => { if (j) auth.user = j.user; }).catch(() => {}),
      ])
  ).then(() => {
    auth.listo = true;
    if (!auth.user || !auth.user.isAdmin) return;
    return fetch('/api/contactos?todas=1', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(j => { if (j) LEADS = j.contactos || []; }).catch(() => {});
  });
  const session = () => auth.listo && auth.user
    ? { email: auth.user.email, nombre: auth.user.name, rol: auth.user.isAdmin ? 'admin' : auth.user.legacyRole, admin: !!auth.user.isAdmin }
    : null;
  const external = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || def); } catch (e) { return JSON.parse(def); } };

  const Store = {
    empresas() { return D.empresas.map(e => Object.assign({ destacada: e.plan === 'premium', actualizada: e.alta || '' }, e, { estado: DE_BD[e.estado] || 'publicada' })); },
    empresa(id) { return this.empresas().find(e => e.id === Number(id)) || null; },
    setEmpresa(id, patch) {
      const e = D.empresas.find(x => x.id === Number(id)); if (!e) return Promise.resolve();
      const tareas = [];
      if (patch.estado && A_BD[patch.estado] && A_BD[patch.estado] !== e.estado) {
        e.estado = A_BD[patch.estado]; e.motivo = patch.motivo || '';
        tareas.push(api('/api/admin?empresa=' + e.id, 'PATCH', { estado: e.estado, motivo: e.motivo }));
      }
      if (('destacada' in patch && patch.destacada !== (e.plan === 'premium')) || ('plan' in patch && (patch.plan === 'premium') !== (e.plan === 'premium'))) dePagos();
      if (FICHA.some(k => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(e[k]))) {
        FICHA.forEach(k => { if (k in patch) e[k] = patch[k]; }); if (patch.sectores && patch.sectores.length) e.sector = patch.sectores[0];
        tareas.push(api('/api/empresa?id=' + e.id, 'PATCH', Object.fromEntries(FICHA.map(k => [k, e[k]]))));
      }
      return Promise.all(tareas).catch(falla);
    },
    addEmpresa() { R.toast('Las empresas se dan de alta ellas mismas desde «Acceso»; aquí se revisan y aprueban.', 'error'); return null; },
    delEmpresa() { R.toast('Para quitar una empresa de la web, pásala a borrador o recházala.', 'error'); },
    productos() { return D.productos.map(p => Object.assign({ estado: 'publicado' }, p)); },
    producto(id) { return this.productos().find(p => p.id === Number(id)) || null; },
    setProducto(id, patch) {
      const p = D.productos.find(x => x.id === Number(id)); if (!p) return Promise.resolve();
      if (patch._deleted) { D.productos.splice(D.productos.indexOf(p), 1); return api('/api/productos?id=' + p.id, 'DELETE').catch(falla); }
      if (patch.estado && patch.estado !== 'publicado') { R.toast('Los productos se publican al guardarlos; para retirar uno, elimínalo.', 'error'); return Promise.resolve(); }
      if ('destacado' in patch && !!patch.destacado !== !!p.destacado) dePagos();
      const CAMPOS = ['titulo', 'sector', 'sub', 'desc', 'fotos'];
      if (!CAMPOS.some(k => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(p[k]))) return Promise.resolve();
      CAMPOS.forEach(k => { if (k in patch) p[k] = patch[k]; });
      return api('/api/productos?id=' + p.id, 'PATCH', { titulo: p.titulo, sector: p.sector, sub: p.sub, desc: p.desc, fotos: p.fotos }).catch(falla);
    },
    addProducto(obj) {
      api('/api/productos', 'POST', { empresa_id: obj.empresa_id, titulo: obj.titulo, sector: obj.sector, sub: obj.sub, desc: obj.desc, fotos: obj.fotos })
        .then(() => setTimeout(() => location.reload(), 600), falla);
      return Object.assign({ id: 0 }, obj);
    },
    categorias() {
      const list = D.sectores.map(s => Object.assign({ activo: true, orden: s.n }, JSON.parse(JSON.stringify(s)), st.categorias[s.id] || {}));
      Object.keys(st.categorias).filter(id => !D.sectores.find(s => s.id === id) && !st.categorias[id]._deleted).forEach(id => list.push(Object.assign({ activo: true, empresas: 0, productos: 0, sub: [] }, st.categorias[id])));
      return list.filter(c => !c._deleted).sort((a, b) => a.orden - b.orden);
    },
    setCategoria(id, patch) { st.categorias[id] = Object.assign(st.categorias[id] || {}, patch); save(); },
    usuarios() {
      const ses = session();
      const fijos = [
        { id: 'u1', nombre: 'Administración ROBLE', email: 'admin@roble.es', rol: 'admin', estado: 'activo', ultimo: ses && ses.rol === 'admin' ? ses.desde : null, nota: 'Cuenta del sistema' },
        { id: 'u2', nombre: 'Edición de contenidos', email: 'editor@roble.es', rol: 'editor', estado: 'activo', ultimo: null, nota: 'Cuenta del sistema' },
      ].map(u => Object.assign(u, st.usuarios.find(x => x.id === u.id) || {}));
      const emp = this.empresas().map(e => Object.assign({ id: 'e' + e.id, nombre: e.nombre, email: e.email || null, rol: 'empresa', estado: e.demo ? 'activo' : 'sin-acceso', empresa_id: e.id, ultimo: null, nota: e.demo ? 'Cuenta demo del directorio' : 'Ficha importada: sin credenciales' }, st.usuarios.find(x => x.id === 'e' + e.id) || {}));
      return [...fijos, ...st.nuevosU, ...emp].filter(u => !u._deleted);
    },
    setUsuario(id, patch) { const n = st.nuevosU.find(u => u.id === id); if (n) Object.assign(n, patch); else { const i = st.usuarios.findIndex(u => u.id === id); if (i >= 0) Object.assign(st.usuarios[i], patch); else st.usuarios.push(Object.assign({ id }, patch)); } save(); },
    addUsuario(obj) { obj.id = 'n' + (st.nextId++); st.nuevosU.unshift(obj); save(); return obj; },
    leads() { return LEADS; },
    setLead(id, patch) {
      const l = LEADS.find(x => x.id === Number(id)); if (!l) return Promise.resolve();
      if (patch._deleted) { R.toast('Los contactos no se borran: se cierran.', 'error'); return Promise.resolve(); }
      if (!patch.estado || patch.estado === l.estado) return Promise.resolve();
      l.estado = patch.estado;
      return api('/api/contactos?id=' + l.id, 'PATCH', { estado: l.estado }).catch(falla);
    },
    /* Altas = empresas que se registraron desde la web (origen «alta»). */
    altas() {
      return this.empresas().filter(e => e.origen === 'alta').map(e => ({ id: e.id, nombre: e.nombre, sector: e.sector, sub: '', ciudad: e.ciudad, pais: e.pais, web: e.web,
        email: e.cuenta || e.email, desc: e.desc, fecha: e.alta, motivo: e.motivo, empresa_id: e.id,
        estado: e.estado === 'publicada' ? 'aprobada' : e.estado }));
    },
    contenidos() {
      const base = [
        { id: 'inicio', pagina: 'Inicio', url: 'index.html', titulo: 'ROBLE — El buscador profesional del sector de la madera', desc: 'Encuentra fabricantes, maquinaria, proveedores y servicios del sector de la madera en España, Portugal, Italia y Francia.', h1: 'Encuentra quién lo fabrica.', estado: 'publicada' },
        { id: 'sectores', pagina: 'Sectores', url: 'sectores.html', titulo: 'Los sectores de la madera — ROBLE', desc: 'Los sectores del directorio ROBLE con sus subsectores.', h1: 'De la materia prima a la feria.', estado: 'publicada' },
        { id: 'para-empresas', pagina: 'Para empresas', url: 'para-empresas.html', titulo: 'Tu empresa en ROBLE — Alta en el directorio profesional de la madera', desc: 'Da de alta tu empresa en ROBLE. Ficha básica gratis; ficha completa desde 20 €/mes.', h1: 'Tu empresa, donde el sector busca.', estado: 'publicada' },
        { id: 'contacto', pagina: 'Contacto', url: 'contacto.html', titulo: 'Contacto — ROBLE', desc: 'Escribe al equipo de ROBLE.', h1: 'Habla con ROBLE.', estado: 'publicada' },
        { id: 'legal', pagina: 'Aviso legal y privacidad', url: 'legal.html', titulo: 'Aviso legal y privacidad — ROBLE', desc: 'Aviso legal, privacidad y cookies.', h1: 'Aviso legal y privacidad.', estado: 'publicada' },
      ];
      return base.map(c => Object.assign(c, st.contenidos[c.id] || {}));
    },
    setContenido(id, patch) { st.contenidos[id] = Object.assign(st.contenidos[id] || {}, patch); save(); },
    destacados() { return st.destacados || { empresas: D.empresas.filter(e => e.plan === 'premium' && e.desc).slice(0, 4).map(e => e.id), productos: [] }; },
    setDestacados(d) { st.destacados = d; save(); },
    config() { return Object.assign({ nombre: 'ROBLE', tagline: 'El buscador profesional del sector de la madera', email: '', idioma: 'es', paises: { ES: true, PT: false, IT: false, FR: false }, seoTitle: '%s — ROBLE', seoDesc: 'ROBLE, el buscador profesional del sector de la madera en España, Portugal, Italia y Francia.', porPagina: 20, revisionHoras: 48, altaLibre: true }, st.config); },
    setConfig(patch) { st.config = Object.assign(st.config, patch); save(); },
    log, logs: () => st.log,
    reset() { st = empty(); save(); },
  };

  /* ---------- SHELL ---------- */
  /* Un solo panel de administración: directorio y maquinaria en el mismo menú.
     Rutas absolutas, porque las páginas de /admin/ usan <base href="../">. */
  const D_ = '/admin-directorio/', M_ = '/admin/';
  const SECTIONS = [
    ['index', 'Panel', 'activity', D_ + 'index.html'], ['moderacion', 'Moderación', 'shield', D_ + 'moderacion.html'],
    ['empresas', 'Empresas', 'building', D_ + 'empresas.html'], ['productos', 'Productos', 'box', D_ + 'productos.html'],
    ['anuncios', 'Maquinaria', 'box', M_ + 'anuncios.html'], ['leads', 'Contactos', 'inbox', D_ + 'leads.html'],
    ['solicitudes', 'Solicitudes de compra', 'inbox', M_ + 'solicitudes.html'], ['vendedores', 'Vendedores y banners', 'users', M_ + 'vendedores.html'],
    ['pedidos', 'Paquetes', 'file', M_ + 'pedidos.html'], ['categorias', 'Categorías', 'grid', D_ + 'categorias.html'],
    ['usuarios', 'Usuarios', 'users', D_ + 'usuarios.html'], ['contenidos', 'Contenidos', 'file', D_ + 'contenidos.html'],
    ['configuracion', 'Configuración', 'settings', D_ + 'configuracion.html'],
  ];
  const pendientes = () => Store.empresas().filter(e => e.estado === 'pendiente').length;
  const nuevosLeads = () => Store.leads().filter(l => l.estado === 'nuevo').length;

  function shell(section) {
    // Antes ?demo en la URL daba sesión de administración a cualquiera. Fuera:
    // el rol lo decide el servidor, nunca un parámetro de la barra de direcciones.
    const s = session();
    const who = s && s.admin ? s : null;   // lo decide el servidor (ROBLE_ADMIN_EMAILS)
    document.body.classList.add('admin');
    const nav = SECTIONS.map(([id, label, , href]) => { const badge = id === 'moderacion' ? pendientes() : id === 'leads' ? nuevosLeads() : 0; return `<a href="${href}" ${id === section ? 'aria-current="page"' : ''}>${label}${badge ? `<span class="n">${badge}</span>` : ''}</a>`; }).join('');
    document.body.insertAdjacentHTML('afterbegin', `
      <a class="skip" href="#main">Saltar al contenido</a>
      <div class="admin-header">
        <header class="site-header"><div class="wrap">
          <a class="brand" href="/admin-directorio/index.html" aria-label="ROBLE admin, panel"><img class="brand-mark" src="/assets/img/mark.svg" alt="" width="28" height="28"><img class="brand-word" src="/assets/img/wordmark.svg" alt="ROBLE" height="15"><span class="brand-tag">Admin</span></a>
          <div class="user">
            <a class="btn btn-ghost btn-sm" href="/index.html">${icon('external')} Ver web</a>
            ${who ? `<div class="who"><b>${esc(who.nombre)}</b><span>${esc(who.rol)}</span></div><div class="menu-wrap"><button class="avatar" data-menu="user-menu" aria-label="Cuenta">${esc(R.iniciales(who.nombre))}</button><div class="menu" id="user-menu"><button class="menu-item" id="do-logout">${icon('logout')} Salir</button><div class="menu-sep"></div><button class="menu-item is-danger" id="do-reset">${icon('trash')} Borrar cambios locales</button></div></div>` : ''}
          </div>
        </div></header>
        <nav class="admin-nav" aria-label="Secciones del panel"><div class="wrap">${nav}</div></nav>
      </div>`);
    const main = document.getElementById('main');
    if (who) avisoLocal(section, main);
    if (!who) {
      main.innerHTML = `<div class="gate plate"><div class="plate-head"><span class="label">Acceso restringido</span></div><div class="plate-body"><h1 class="h3">Este panel es solo para el equipo de ROBLE.</h1><p class="muted small" style="margin-top:8px">Entra con una cuenta de administración para gestionar empresas, productos y contactos.</p><div class="row" style="margin-top:18px"><a class="btn btn-ink" href="/acceso.html">Entrar</a></div></div></div>`;
      return null;
    }
    R.dropdowns();
    document.addEventListener('click', e => {
      if (e.target.closest('#do-logout')) fetch('/api/sesion', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {}).finally(() => { location.href = '/acceso.html'; });
      if (e.target.closest('#do-reset')) { R.confirmDialog({ title: 'Borrar cambios locales', html: 'Se descartan todas las ediciones hechas en este navegador y el panel vuelve a los datos reales del directorio. <strong>No afecta a la base de datos.</strong>', ok: 'Borrar cambios', danger: true }).then(ok => { if (ok) { Store.reset(); try { localStorage.removeItem('roble_ml_v1'); } catch (e) {} location.reload(); } }); }
    });
    return who;
  }

  /* Secciones sin tabla en la base: se dice claro que lo que se cambia ahí solo
     vive en este navegador, para que nadie crea que ha cambiado la web. */
  const LOCALES = ['categorias', 'usuarios', 'contenidos', 'configuracion', 'solicitudes', 'vendedores', 'pedidos'];
  function avisoLocal(section, main) {
    if (!LOCALES.includes(section)) return;
    main.insertAdjacentHTML('beforebegin', `<div class="wrap" role="note" data-aviso-local style="margin-top:14px"><p class="small" style="padding:10px 14px;border:1px solid var(--line, #d9d2c4);border-radius:6px;background:var(--paper, #fff)"><b>Solo en este navegador.</b> Esta sección todavía no guarda en la base de datos: lo que cambies aquí no se ve en la web ni en otros equipos.</p></div>`);
  }

  /* ---------- HELPERS UI ---------- */
  const STATUS = { publicada: ['status-live', 'Publicada'], publicado: ['status-live', 'Publicado'], borrador: ['status-draft', 'Borrador'], pendiente: ['status-pending', 'Pendiente'], rechazada: ['status-rejected', 'Rechazada'], rechazado: ['status-rejected', 'Rechazado'], aprobada: ['status-live', 'Aprobada'], activo: ['status-live', 'Activo'], inactivo: ['status-draft', 'Inactivo'], 'sin-acceso': ['status-draft', 'Sin acceso'], nuevo: ['status-pending', 'Nuevo'], 'en-curso': ['status-live', 'En curso'], cerrado: ['status-draft', 'Cerrado'] };
  const status = s => { const x = STATUS[s] || ['status-draft', s]; return `<span class="status ${x[0]}">${x[1]}</span>`; };
  const fmtDate = iso => { if (!iso) return '—'; const d = new Date(iso); if (isNaN(d)) return esc(iso); return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + (iso.length > 10 ? ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''); };
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'ahora'; if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`; return `hace ${Math.round(h / 24)} d`; };
  const sw = (on, attrs) => `<button type="button" class="switch" role="switch" aria-checked="${on}" ${attrs || ''}></button>`;
  const ib = (name, label, attrs) => `<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="${esc(label)}" title="${esc(label)}" ${attrs || ''}>${icon(name, 'i-16')}</button>`;

  /* Tabla genérica con búsqueda, orden, selección y paginación */
  function table(el, opts) {
    const state = { sort: opts.sort || null, dir: opts.dir || 1, page: 1, sel: new Set(), per: opts.per || 20 };
    function render() {
      let rows = opts.rows();
      if (state.sort) { const c = opts.cols.find(c => c.key === state.sort); rows = [...rows].sort((a, b) => { const va = c.val ? c.val(a) : a[c.key], vb = c.val ? c.val(b) : b[c.key]; return (typeof va === 'number' ? va - vb : String(va || '').localeCompare(String(vb || ''), 'es')) * state.dir; }); }
      const pages = Math.max(1, Math.ceil(rows.length / state.per)); if (state.page > pages) state.page = pages;
      const slice = rows.slice((state.page - 1) * state.per, state.page * state.per);
      const ids = rows.map(r => r.id); state.sel.forEach(id => { if (!ids.includes(id)) state.sel.delete(id); });
      const head = (opts.select ? `<th class="col-check"><input type="checkbox" aria-label="Seleccionar todo" data-all ${slice.length && slice.every(r => state.sel.has(r.id)) ? 'checked' : ''}></th>` : '') + opts.cols.map(c => `<th class="${c.cls || ''} ${c.sortable ? 'sortable' : ''}" ${c.sortable ? `data-sort="${c.key}"` : ''} ${state.sort === c.key ? `aria-sort="${state.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.label}${c.sortable ? icon('sort') : ''}</th>`).join('') + (opts.actions ? '<th class="col-actions"><span class="sr-only">Acciones</span></th>' : '');
      const body = slice.length ? slice.map(r => `<tr data-id="${r.id}" class="${state.sel.has(r.id) ? 'is-selected' : ''}">${opts.select ? `<td class="col-check"><input type="checkbox" aria-label="Seleccionar" data-row="${r.id}" ${state.sel.has(r.id) ? 'checked' : ''}></td>` : ''}${opts.cols.map(c => `<td class="${c.cls || ''}">${c.render(r)}</td>`).join('')}${opts.actions ? `<td class="col-actions"><span class="row-actions">${opts.actions(r)}</span></td>` : ''}</tr>`).join('') : `<tr><td colspan="${opts.cols.length + 2}"><div class="empty" style="border:0;background:none;padding:40px 16px">${icon(opts.emptyIcon || 'search')}<p class="empty-title">${esc(opts.emptyTitle || 'Nada por aquí')}</p><p>${esc(opts.emptyText || 'Prueba con otro filtro.')}</p></div></td></tr>`;
      el.innerHTML = `<div class="table-wrap" tabindex="0"><table class="dtable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><div class="table-foot"><span>${rows.length ? `${(state.page - 1) * state.per + 1}–${Math.min(state.page * state.per, rows.length)} de ${rows.length}` : '0 resultados'}</span>${pages > 1 ? `<nav class="pager" aria-label="Paginación"><button type="button" data-p="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="Anterior">${icon('chevron-left', 'i-16')}</button><span class="mono" style="padding:0 8px">${state.page} / ${pages}</span><button type="button" data-p="${state.page + 1}" ${state.page === pages ? 'disabled' : ''} aria-label="Siguiente">${icon('chevron-right', 'i-16')}</button></nav>` : ''}</div>`;
      el.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => { const k = th.dataset.sort; if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = 1; } render(); }));
      el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { state.page = parseInt(b.dataset.p, 10); render(); }));
      el.querySelectorAll('[data-row]').forEach(cb => cb.addEventListener('change', () => { const id = isNaN(cb.dataset.row) ? cb.dataset.row : Number(cb.dataset.row); cb.checked ? state.sel.add(id) : state.sel.delete(id); render(); }));
      const all = el.querySelector('[data-all]'); all && all.addEventListener('change', () => { slice.forEach(r => all.checked ? state.sel.add(r.id) : state.sel.delete(r.id)); render(); });
      opts.onRender && opts.onRender(el, state);
      opts.onSelect && opts.onSelect([...state.sel]);
    }
    render();
    return { render, state, clearSel() { state.sel.clear(); render(); } };
  }

  /* Formulario declarativo dentro de un drawer */
  function form(fields, values) {
    values = values || {};
    return fields.map(f => {
      if (f.group) return `<span class="label">${esc(f.group)}</span>`;
      const v = values[f.name] != null ? values[f.name] : (f.value != null ? f.value : '');
      const req = f.required ? ' <span class="req">*</span>' : '';
      let ctl = '';
      if (f.type === 'select') ctl = `<select class="select" id="f-${f.name}" name="${f.name}" ${f.required ? 'required' : ''}>${(f.options || []).map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
      else if (f.type === 'textarea') ctl = `<textarea class="textarea" id="f-${f.name}" name="${f.name}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}" style="min-height:${f.rows ? f.rows * 24 : 96}px">${esc(v)}</textarea>`;
      // Direcciones de fotos, una por línea, con subida directa si está activa.
      else if (f.type === 'fotos') ctl = `<textarea class="textarea" id="f-${f.name}" name="${f.name}" placeholder="${esc(f.placeholder || '')}" style="min-height:${f.rows ? f.rows * 24 : 96}px">${esc(v)}</textarea><div class="subir" data-subir="f-${f.name}" data-empresa="${esc(f.empresa || '')}" hidden><button type="button" class="btn btn-sm">Subir fotos</button><input type="file" accept="${TIPOS_FOTO}" multiple hidden><span class="subir-estado small muted"></span></div>`;
      else if (f.type === 'checks') ctl = `<div class="checklist">${(f.options || []).map(o => `<label class="check"><input type="checkbox" name="${f.name}" value="${esc(o[0])}" ${(v || []).includes(o[0]) ? 'checked' : ''}> ${esc(o[1])}</label>`).join('')}</div>`;
      else if (f.type === 'switch') return `<div class="field"><div class="row" style="justify-content:space-between"><span class="field-label" id="l-${f.name}">${esc(f.label)}</span>${sw(!!v, `name="${f.name}" aria-labelledby="l-${f.name}"`)}</div>${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ''}</div>`;
      else ctl = `<input class="input" id="f-${f.name}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}" ${f.attrs || ''}>`;
      const inner = `<div class="field"><label for="f-${f.name}">${esc(f.label)}${req}</label>${ctl}${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ''}<span class="field-error">${esc(f.error || 'Este campo es obligatorio.')}</span></div>`;
      return f.half ? `<div class="form-row">${inner}${f.pair || ''}</div>` : inner;
    }).join('');
  }
  function read(formEl) {
    const out = {};
    formEl.querySelectorAll('input,select,textarea').forEach(c => { if (!c.name) return; if (c.type === 'checkbox') { if (!out[c.name]) out[c.name] = []; if (c.checked) out[c.name].push(c.value); } else out[c.name] = c.value.trim(); });
    formEl.querySelectorAll('.switch[name]').forEach(s => { out[s.getAttribute('name')] = s.getAttribute('aria-checked') === 'true'; });
    return out;
  }

  /* Da vida a los campos type:'fotos' que haya dentro de un contenedor. Se
     llama después de insertar el formulario. Si el almacén no está conectado,
     el bloque se queda oculto y el campo sigue siendo un textarea normal. */
  function activaSubidas(cont) {
    if (!window.Subir) return;
    (cont || document).querySelectorAll('.subir[data-subir]').forEach(caja => {
      if (caja.dataset.listo) return;
      caja.dataset.listo = '1';
      const area = document.getElementById(caja.getAttribute('data-subir'));
      const empresa = caja.getAttribute('data-empresa');
      if (!area || !empresa) return;
      const boton = caja.querySelector('button');
      const input = caja.querySelector('input[type=file]');
      const estado = caja.querySelector('.subir-estado');

      Subir.disponible().then(ok => { if (ok) caja.hidden = false; });

      boton.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        input.value = '';
        if (!files.length) return;
        boton.disabled = true;
        let hechas = 0;
        for (const f of files) {
          try {
            estado.textContent = files.length > 1
              ? `Subiendo ${hechas + 1} de ${files.length}…` : 'Subiendo…';
            const url = await Subir.una(f, empresa, p => {
              estado.textContent = files.length > 1
                ? `Subiendo ${hechas + 1} de ${files.length}… ${p}%` : `Subiendo… ${p}%`;
            });
            area.value = (area.value.trim() ? area.value.trim() + '\n' : '') + url;
            hechas++;
          } catch (e) {
            estado.textContent = e.message;
            status(e.message, 'error');
            break;
          }
        }
        boton.disabled = false;
        if (hechas) {
          estado.textContent = hechas === 1 ? 'Foto añadida. Guarda para publicarla.'
            : `${hechas} fotos añadidas. Guarda para publicarlas.`;
        }
      });
    });
  }

  function csv(rows, cols) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const txt = [cols.map(c => q(c[0])).join(';'), ...rows.map(r => cols.map(c => q(typeof c[1] === 'function' ? c[1](r) : r[c[1]])).join(';'))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' })); a.download = 'roble-export.csv'; a.click();
  }

  /* Altas: aprobar crea la empresa publicada; rechazar guarda el motivo */
  function aprobarAlta(a) {
    Store.setEmpresa(a.id, { estado: 'publicada' });
    log(`Alta aprobada: ${a.nombre} (REF ${String(a.id).padStart(4, '0')})`, 'ok');
    return Store.empresa(a.id);
  }
  function rechazarAlta(a, motivo) { Store.setEmpresa(a.id, { estado: 'rechazada', motivo: motivo || '' }); log(`Alta rechazada: ${a.nombre}${motivo ? ' · ' + motivo : ''}`, 'error'); }

  return { Store, shell, ready, avisoLocal, api, falla, status, fmtDate, ago, sw, ib, table, form, read, activaSubidas, csv, session, pendientes, nuevosLeads, SECTIONS, aprobarAlta, rechazarAlta };
})();
