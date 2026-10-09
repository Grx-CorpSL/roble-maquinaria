/* Ficha de la empresa, para el panel.
 *
 *   GET   /api/empresa?id=N   → campos editables (membresía con empresa.ver)
 *   PATCH /api/empresa?id=N   → guarda (membresía con empresa.editar)
 *
 * La autorización se decide aquí, en servidor, contra la membresía: el id que
 * llega del navegador nunca se acepta sin comprobarla. El administrador
 * (ROBLE_ADMIN_EMAILS) puede con cualquier empresa. Solo se tocan columnas
 * de ficha: nunca el correo de la cuenta, el rol, el plan ni la contraseña
 * (el rol de base de datos tampoco podría). Cada cambio queda en auditoría.
 */

const { db, init, registra } = require('./_esquema');
const { usuarioDeSesion, esAdmin } = require('./auth');
const { exige } = require('./_permisos');
const { cuerpo } = require('./sesion');
const SECTORES = require('./_sectores.json');

const IDS = new Set(SECTORES.map(s => s.id));
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const RE_URL = /^https?:\/\/\S{3,}$/i;

const rec = (v, n) => { const s = String(v == null ? '' : v).trim().slice(0, n); return s || null; };
const lineas = txt => String(txt || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

async function permite(usuario, empresaId, permiso) {
  if (esAdmin(usuario.email)) return { ok: true, admin: true };
  return exige(usuario, empresaId, permiso);
}

/* La ficha tal como la pinta el panel (mismos nombres que en /api/datos.js). */
function aFicha(e) {
  const sectores = lineas(e.categorias);
  if (e.sector && !sectores.includes(e.sector)) sectores.unshift(e.sector);
  return {
    id: e.id, nombre: e.empresa || '', desc: e.descripcion || '', web: e.web || '',
    telefono: e.telefono || '', ciudad: e.ciudad || '', region: e.region || '',
    email: e.email_contacto || '', sectores: sectores.filter(s => IDS.has(s)), servicios: lineas(e.servicios),
  };
}

function valida(b) {
  const errores = [];
  const nombre = rec(b.nombre, 120);
  if (!nombre) errores.push('Falta el nombre comercial.');
  const web = rec(b.web, 200);
  if (web && !RE_URL.test(web)) errores.push('La web debe empezar por http:// o https://.');
  const email = rec(b.email, 120);
  if (email && !RE_EMAIL.test(email)) errores.push('El correo de contacto no es válido.');
  const sectores = (Array.isArray(b.sectores) ? b.sectores : []).map(String).filter(s => IDS.has(s)).slice(0, 5);
  if (!sectores.length) errores.push('Elige al menos un sector.');
  const servicios = (Array.isArray(b.servicios) ? b.servicios : String(b.servicios || '').split(','))
    .map(s => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  return {
    errores,
    datos: {
      empresa: nombre, descripcion: rec(b.desc, 1000), web, telefono: rec(b.telefono, 40),
      ciudad: rec(b.ciudad, 70), region: rec(b.region, 60), email_contacto: email,
      sector: sectores[0] || null, categorias: sectores.join('\n') || null, servicios: servicios.join('\n') || null,
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const usuario = await usuarioDeSesion(req);
    if (!usuario) { res.status(401).json({ error: 'Tienes que haber iniciado sesión.' }); return; }
    const id = Number(req.query?.id);
    if (!id) { res.status(400).json({ error: 'Falta la empresa.' }); return; }
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

    if (req.method === 'GET') {
      const g = await permite(usuario, id, 'empresa.ver');
      if (!g.ok) { res.status(g.codigo).json({ error: g.error }); return; }
      await init();
      const [e] = await db()`
        SELECT id, empresa, descripcion, web, telefono, ciudad, region, email_contacto, sector, categorias, servicios
        FROM usuarios WHERE id = ${id} AND rol = 'empresa' AND eliminada IS NULL`;
      if (!e) { res.status(404).json({ error: 'Esa empresa no existe o no tienes acceso.' }); return; }
      res.status(200).json({ empresa: aFicha(e), rol: g.rol || 'admin' });
      return;
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const g = await permite(usuario, id, 'empresa.editar');
      if (!g.ok) { res.status(g.codigo).json({ error: g.error }); return; }
      const { errores, datos: d } = valida(cuerpo(req));
      if (errores.length) { res.status(400).json({ error: errores[0], errores }); return; }
      await init();
      const sql = db();
      const filas = await sql`
        UPDATE usuarios SET
          empresa = ${d.empresa}, descripcion = ${d.descripcion}, web = ${d.web}, telefono = ${d.telefono},
          ciudad = ${d.ciudad}, region = ${d.region}, email_contacto = ${d.email_contacto},
          sector = ${d.sector}, categorias = ${d.categorias}, servicios = ${d.servicios}
        WHERE id = ${id} AND rol = 'empresa' AND eliminada IS NULL
        RETURNING id`;
      if (!filas.length) { res.status(404).json({ error: 'Esa empresa no existe o no tienes acceso.' }); return; }
      // La ficha de identidad conserva el mismo nombre que la cuenta.
      await sql`UPDATE empresas SET nombre = ${d.empresa}, actualizada = now() WHERE id = ${id}`;
      await registra({ user_id: usuario.id, empresa_id: id, accion: 'empresa.editar',
                       datos: { campos: Object.keys(d).filter(k => d[k] != null), admin: !!g.admin }, ip });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error(JSON.stringify({ evt: 'empresa_error', msg: err.message }));
    res.status(500).json({ error: 'No se ha podido guardar la ficha. Inténtalo de nuevo.' });
  }
};
