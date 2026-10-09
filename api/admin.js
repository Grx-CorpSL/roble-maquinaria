/* Moderación de empresas. Solo administración (ROBLE_ADMIN_EMAILS).
 *
 *   PATCH /api/admin?empresa=N { estado, motivo? } → 200 { ok, estado }
 *
 * estado: activa | pendiente | borrador | rechazada | suspendida (los de la
 * tabla empresas). La web pública solo muestra las activas. Quien no es
 * administrador recibe 404: no se revela que el endpoint existe.
 */

const { db, init, registra } = require('./_esquema');
const { usuarioDeSesion, esAdmin } = require('./auth');
const { cuerpo } = require('./sesion');
const { avisaModeracion } = require('./_correo');

// Los correos @directorio.roble.es los generó la importación: no son buzones.
const esGenerado = email => /@directorio\.roble\.es$/i.test(String(email || ''));

const ESTADOS = new Set(['activa', 'pendiente', 'borrador', 'rechazada', 'suspendida']);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const usuario = await usuarioDeSesion(req);
    if (!usuario) { res.status(401).json({ error: 'Tienes que haber iniciado sesión.' }); return; }
    if (!esAdmin(usuario.email)) { res.status(404).json({ error: 'No existe.' }); return; }
    if (req.method !== 'PATCH') { res.status(405).json({ error: 'Método no permitido.' }); return; }

    const id = Number(req.query?.empresa);
    const b = cuerpo(req);
    const estado = String(b.estado || '');
    const motivo = String(b.motivo || '').trim().slice(0, 300) || null;
    if (!id) { res.status(400).json({ error: 'Falta la empresa.' }); return; }
    if (!ESTADOS.has(estado)) { res.status(400).json({ error: 'Ese estado no existe.' }); return; }

    await init();
    const [e] = await db()`
      UPDATE empresas SET estado = ${estado}, motivo = ${estado === 'activa' ? null : motivo},
             revisada_por = ${usuario.id}, revisada_en = now(), actualizada = now()
      WHERE id = ${id}
      RETURNING id, nombre, (SELECT email FROM usuarios u WHERE u.id = empresas.id) AS email`;
    if (!e) { res.status(404).json({ error: 'Esa empresa no existe.' }); return; }
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    await registra({ user_id: usuario.id, empresa_id: id, accion: 'empresa.moderada', entidad: 'empresa', entidad_id: id, datos: { estado, motivo }, ip });
    /* La empresa se entera de la decisión. Si el correo falla, la moderación
       ya está guardada: se registra y no se le dice nada al administrador. */
    if ((estado === 'activa' || estado === 'rechazada') && e.email && !esGenerado(e.email)) {
      try { await avisaModeracion({ para: e.email, empresa: e.nombre, id, estado, motivo }); }
      catch (err) { console.error(JSON.stringify({ evt: 'aviso_moderacion_error', msg: err.message })); }
    }
    res.status(200).json({ ok: true, estado });
  } catch (err) {
    console.error(JSON.stringify({ evt: 'admin_error', msg: err.message }));
    res.status(500).json({ error: 'No se ha podido guardar.' });
  }
};
