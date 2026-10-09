/* ROBLE Maquinaria — panel de vendedor: shell, identificación del vendedor y utilidades. */
window.Panel = (function () {
  'use strict';
  const R = window.ROBLE, S = window.ML.store, esc = R.esc, icon = R.icon;
  const SECTIONS = [['index', 'Resumen'], ['anuncios', 'Máquinas'], ['productos', 'Productos'], ['leads', 'Contactos'], ['paquetes', 'Paquetes'], ['perfil', 'Perfil']];
  const empresa = id => window.Admin ? Admin.Store.empresa(id) : R.empresa(id);
  const vendor = () => { const s = S.session(); if (!s || !s.vendedor_id) return null; const v = ML.vend(s.vendedor_id); if (v) return v; const e = empresa(s.vendedor_id); return e ? { id: e.id, nombre: e.nombre, tipos: [], ciudad: e.ciudad || '', region: e.region || '', pais: e.pais || 'ES', desc: e.desc || '', web: e.web || '', telefono: e.telefono || '', anio: e.anio || null, destacado: false, servicios: [], derivado: true }
    // La empresa existe en servidor aunque no esté en los datos estáticos (p. ej. sin productos): se usa lo que dice la membresía.
    : { id: s.vendedor_id, nombre: s.empresa_nombre || 'Mi empresa', tipos: [], ciudad: '', region: '', pais: 'ES', desc: '', web: '', telefono: '', anio: null, destacado: false, servicios: [], derivado: true, soloServidor: true }; };
  const productos = v => window.Admin ? Admin.Store.productos().filter(p => p.empresa_id === v.id) : R.productosDe(v.id);
  /* Contactos reales de la empresa activa, cargados del servidor antes de que
     la página pinte (se encadenan a ML.auth.ready, que es lo que esperan las
     páginas del panel). leads(v) sigue siendo síncrono para no cambiarlas. */
  let LEADS = [];
  ML.auth.ready = ML.auth.ready.then(async a => {
    const s = S.session();
    if (s && s.vendedor_id) {
      try {
        const r = await fetch('/api/contactos?empresa=' + encodeURIComponent(s.vendedor_id), { credentials: 'same-origin', cache: 'no-store' });
        if (r.ok) LEADS = (await r.json()).contactos || [];
      } catch (e) { /* sin servidor: lista vacía */ }
    }
    return a;
  });
  const leads = v => LEADS.filter(l => l.empresa_id === v.id);
  const setLead = (id, patch) => { const l = LEADS.find(x => x.id === id); if (l) Object.assign(l, patch); };
  const misAnuncios = v => ML.D.anuncios.filter(a => a.vendedor_id === v.id);
  const STATUS = { publicado: ['status-live', 'Publicado'], pendiente: ['status-pending', 'Pendiente de revisión'], rechazado: ['status-rejected', 'Rechazado'], borrador: ['status-draft', 'Borrador'], nuevo: ['status-pending', 'Nuevo'], 'en-curso': ['status-live', 'En curso'], cerrado: ['status-draft', 'Cerrado'], pagado: ['status-live', 'Pagado'] };
  const status = s => { const x = STATUS[s] || ['status-draft', s]; return `<span class="status ${x[0]}">${x[1]}</span>`; };
  const fecha = iso => { const d = new Date(iso); return isNaN(d) ? esc(iso || '') : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }); };

  function shell(section) {
    /* Antes ?demo=<id> abría el panel como ese vendedor, con solo cambiar el
       número de la URL. Fuera: de qué empresa eres lo dice la membresía en
       servidor (/api/auth), nunca un parámetro que escribe el visitante. */
    const ses = S.session(); const v = vendor();
    document.body.classList.add('admin');
    document.body.insertAdjacentHTML('afterbegin', `<a class="skip" href="#main">Saltar al contenido</a>
      <div class="admin-header"><header class="site-header"><div class="wrap">
        <a class="brand" href="panel/index.html" aria-label="Panel de empresa"><img class="brand-mark" src="assets/img/mark.svg" alt="" width="28" height="28"><img class="brand-word" src="assets/img/wordmark.svg" alt="ROBLE" height="15"><span class="brand-tag">Mi empresa</span></a>
        <div class="user"><a class="btn btn-ghost btn-sm" href="index.html">${icon('external')} Ver portal</a>${ses ? `<div class="who"><b>${esc(v ? v.nombre : ses.nombre)}</b><span>${esc(ses.email)}</span></div>${ses.empresas && ses.empresas.length > 1 ? `<select class="select" id="cambia-empresa" aria-label="Cambiar de empresa" style="max-width:220px">${ses.empresas.map(c => `<option value="${c.id}" ${c.id === ses.vendedor_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}<div class="menu-wrap"><button class="avatar" data-menu="user-menu" aria-label="Cuenta">${esc(R.iniciales(v ? v.nombre : ses.nombre))}</button><div class="menu" id="user-menu">${v ? `<a class="menu-item" href="empresa.html?id=${v.id}">${icon('eye')} Mi ficha pública</a>${misAnuncios(v).length ? `<a class="menu-item" href="vendedor.html?id=${v.id}">${icon('s-maquinaria')} Mis máquinas</a>` : ''}` : ''}<button class="menu-item" id="do-logout">${icon('logout')} Salir</button></div></div>` : ''}</div>
      </div></header>
      <nav class="admin-nav" aria-label="Secciones del panel"><div class="wrap">${SECTIONS.map(([id, l]) => `<a href="panel/${id}.html" ${id === section ? 'aria-current="page"' : ''}>${l}${id === 'leads' && v && leads(v).filter(x => x.estado === 'nuevo').length ? `<span class="n">${leads(v).filter(x => x.estado === 'nuevo').length}</span>` : ''}${id === 'anuncios' && v && misAnuncios(v).filter(a => a.estadoPub === 'pendiente').length ? `<span class="n">${misAnuncios(v).filter(a => a.estadoPub === 'pendiente').length}</span>` : ''}</a>`).join('')}</div></nav></div>`);
    R.header(); R.dropdowns();
    const main = document.getElementById('main');
    document.addEventListener('click', e => {
      if (e.target.closest('#do-logout')) ML.salir('index.html');
    });
    document.addEventListener('change', e => {
      // Cambiar de empresa activa: lo valida el servidor contra la membresía y recarga.
      if (e.target.id === 'cambia-empresa') ML.elegirEmpresa(e.target.value).then(ok => { if (ok) location.reload(); else R.toast('No tienes acceso a esa empresa.', 'error'); });
    });
    if (!ses) {
      main.innerHTML = `<div class="gate plate"><div class="plate-head"><span class="label">Panel de empresa</span></div><div class="plate-body"><h1 class="h3">Entra para gestionar tu empresa.</h1><p class="muted small" style="margin-top:8px">Tu ficha del directorio, tus productos, tus máquinas en venta y los contactos que recibes, en un solo sitio.</p><div class="row" style="margin-top:18px"><a class="btn btn-ink" href="acceso.html">Entrar</a></div></div></div>`;
      return null;
    }
    if (!v) {
      // Con vendor() apoyándose en la empresa del servidor, aquí solo se llega si la cuenta no tiene ninguna membresía.
      main.innerHTML = `<div class="gate plate" style="max-width:560px"><div class="plate-head"><span class="label">Panel de empresa</span></div><div class="plate-body"><h1 class="h3">Tu cuenta no tiene ninguna empresa asociada.</h1><p class="muted small" style="margin-top:8px">Si eres responsable de una empresa del directorio, pide acceso a quien la administra o escríbenos desde <a href="contacto.html">contacto</a>.</p></div></div>`;
      return null;
    }
    return v;
  }
  return { shell, vendor, empresa, productos, leads, setLead, misAnuncios, status, fecha, SECTIONS };
})();
