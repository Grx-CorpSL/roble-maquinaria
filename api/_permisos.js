/* Autorización de ROBLE: quién puede hacer qué, decidido SIEMPRE en servidor.
 *
 * La interfaz puede ocultar botones, pero la única decisión válida es esta.
 * Un empresa_id que llegue del navegador nunca se acepta sin comprobar antes
 * que el usuario tiene membresía activa en esa empresa.
 */

const { db, init } = require('./_esquema');

const PERMISOS = {
  propietario: [
    'empresa.ver', 'empresa.editar', 'empresa.borrar',
    'maquinas.ver', 'maquinas.crear', 'maquinas.editar', 'maquinas.borrar',
    'productos.ver', 'productos.crear', 'productos.editar', 'productos.borrar',
    'contactos.ver', 'contactos.gestionar',
    'miembros.ver', 'miembros.invitar', 'miembros.cambiar_rol', 'miembros.quitar',
  ],
  editor: [
    'empresa.ver', 'empresa.editar',
    'maquinas.ver', 'maquinas.crear', 'maquinas.editar', 'maquinas.borrar',
    'productos.ver', 'productos.crear', 'productos.editar', 'productos.borrar',
    'contactos.ver', 'contactos.gestionar',
    'miembros.ver',
  ],
  lector: [
    'empresa.ver', 'maquinas.ver', 'productos.ver', 'contactos.ver', 'miembros.ver',
  ],
};

const permisosDe = rol => PERMISOS[rol] || [];

/* Membresía activa del usuario en una empresa, o null. Es la comprobación que
   sostiene toda la autorización: si devuelve null, no se puede hacer nada. */
async function membresia(userId, empresaId) {
  if (!userId || !empresaId) return null;
  await init();
  const filas = await db()`
    SELECT m.rol, m.estado, e.estado AS estado_empresa, e.nombre
    FROM membresias m JOIN empresas e ON e.id = m.empresa_id
    WHERE m.user_id = ${userId} AND m.empresa_id = ${Number(empresaId)}
      AND m.estado = 'activa'`;
  return filas[0] || null;
}

/* ¿Puede este usuario hacer esta acción en esta empresa? */
async function puede(userId, empresaId, permiso) {
  const m = await membresia(userId, empresaId);
  if (!m) return false;
  // Una empresa suspendida o rechazada solo permite mirar.
  if (m.estado_empresa === 'suspendida' || m.estado_empresa === 'rechazada') {
    return permiso.endsWith('.ver');
  }
  return permisosDe(m.rol).includes(permiso);
}

/* Empresas a las que este usuario tiene acceso. */
async function empresasDe(userId) {
  if (!userId) return [];
  await init();
  return db()`
    SELECT e.id, e.nombre, e.estado, m.rol
    FROM membresias m JOIN empresas e ON e.id = m.empresa_id
    WHERE m.user_id = ${userId} AND m.estado = 'activa'
    ORDER BY e.nombre`;
}

/* Guarda de endpoint. Devuelve { ok } o { error, codigo } listo para responder.
   Uso:  const g = await exige(usuario, empresaId, 'maquinas.crear');
         if (!g.ok) return res.status(g.codigo).json({ error: g.error }); */
async function exige(usuario, empresaId, permiso) {
  if (!usuario) return { ok: false, codigo: 401, error: 'Tienes que haber iniciado sesión.' };
  const m = await membresia(usuario.id, empresaId);
  // Mismo mensaje si no existe o si no es tuya: no se revela qué empresas hay.
  if (!m) return { ok: false, codigo: 404, error: 'Esa empresa no existe o no tienes acceso.' };
  if (!(await puede(usuario.id, empresaId, permiso))) {
    return { ok: false, codigo: 403, error: 'Tu rol no permite esta acción.', rol: m.rol };
  }
  return { ok: true, rol: m.rol, empresa: m.nombre };
}

module.exports = { PERMISOS, permisosDe, membresia, puede, empresasDe, exige };
