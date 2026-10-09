/* ROBLE Maquinaria — administración del portal: shell y utilidades sobre Admin (tabla, formularios) y ML.store. */
window.MLA = (function () {
  'use strict';
  const R = window.ROBLE, S = window.ML.store, esc = R.esc, icon = R.icon;
  // Contactos reales (los carga Admin.ready), solo los dirigidos a vendedores de maquinaria.
  const leads = () => Admin.Store.leads().filter(l => ML.D.vendedores.some(v => v.id === l.empresa_id));
  /* Un anuncio es un producto: eliminar es real (/api/productos) y devuelve la
     promesa para que la página espere. Publicar y destacar no existen en la base. */
  S.delAnuncio = id => { ML.D.anuncios = ML.D.anuncios.filter(a => a.id !== Number(id)); return Admin.api('/api/productos?id=' + Number(id), 'DELETE'); };
  const pend = () => ({ anuncios: ML.D.anuncios.filter(a => a.estadoPub === 'pendiente').length, solicitudes: ML.solicitudes().filter(s => s.pendiente).length, pedidos: S.pedidos().filter(p => p.estado === 'pendiente').length, leads: leads().filter(l => l.estado === 'nuevo').length });
  // Mismo panel que el directorio: misma cabecera, mismo menú, mismo control de acceso.
  const shell = section => Admin.shell(section);
  const STATUS = { publicado: ['status-live', 'Publicado'], pendiente: ['status-pending', 'Pendiente'], rechazado: ['status-rejected', 'Rechazado'], borrador: ['status-draft', 'Borrador'], pagado: ['status-live', 'Pagado'], cancelado: ['status-rejected', 'Cancelado'], nuevo: ['status-pending', 'Nuevo'], 'en-curso': ['status-live', 'En curso'], cerrado: ['status-draft', 'Cerrado'] };
  const status = s => { const x = STATUS[s] || ['status-draft', s]; return `<span class="status ${x[0]}">${x[1]}</span>`; };
  const fecha = iso => { const d = new Date(iso); return isNaN(d) ? esc(iso || '') : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + (String(iso).length > 10 ? ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''); };
  return { shell, status, fecha, leads, pend };
})();
