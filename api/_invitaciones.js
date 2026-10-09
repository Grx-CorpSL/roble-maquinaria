/* Invitaciones y verificación de correo.
 *
 * El token viaja por correo; en la base de datos solo se guarda su hash, de
 * modo que ni leyendo la tabla se puede usar una invitación ajena.
 * Uso único, con caducidad y revocables.
 */

const crypto = require('crypto');
const { db, init, registra } = require('./_esquema');

const DIAS_INVITACION = 7;
const DIAS_VERIFICACION = 3;

const nuevoToken = () => crypto.randomBytes(32).toString('base64url');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const enDias = d => new Date(Date.now() + d * 864e5);

/* ─────────── invitaciones ─────────── */

/* Crea una invitación. Devuelve el token en claro UNA sola vez: es lo que se
   envía por correo y ya no se puede volver a consultar. */
async function invita({ empresaId, email, rol = 'editor', invitadaPor }) {
  await init();
  const sql = db();
  const mail = String(email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { error: 'Ese correo no es válido.' };
  if (!['propietario', 'editor', 'lector'].includes(rol)) return { error: 'Rol desconocido.' };

  // ¿Ya es miembro? Con el mismo id de empresa y su cuenta por email.
  const ya = await sql`
    SELECT 1 FROM membresias m JOIN usuarios u ON u.id = m.user_id
    WHERE m.empresa_id = ${empresaId} AND LOWER(u.email) = ${mail} AND m.estado = 'activa'`;
  if (ya.length) return { error: 'Esa persona ya forma parte de la empresa.' };

  // Una invitación pendiente por persona y empresa: la anterior se revoca.
  await sql`
    UPDATE invitaciones SET estado = 'revocada'
    WHERE empresa_id = ${empresaId} AND LOWER(email) = ${mail} AND estado = 'pendiente'`;

  const token = nuevoToken();
  const [fila] = await sql`
    INSERT INTO invitaciones (empresa_id, email, rol, token_hash, invitada_por, expira)
    VALUES (${empresaId}, ${mail}, ${rol}, ${hash(token)}, ${invitadaPor || null}, ${enDias(DIAS_INVITACION).toISOString()})
    RETURNING id, empresa_id, email, rol, expira`;
  await registra({ user_id: invitadaPor, empresa_id: empresaId, accion: 'miembro.invitar',
                   entidad: 'invitacion', entidad_id: fila.id, datos: { email: mail, rol } });
  return { invitacion: fila, token };
}

/* Datos públicos de una invitación, para la pantalla de aceptar. */
async function lee(token) {
  await init();
  const filas = await db()`
    SELECT i.id, i.empresa_id, i.email, i.rol, i.estado, i.expira, e.nombre AS empresa
    FROM invitaciones i JOIN empresas e ON e.id = i.empresa_id
    WHERE i.token_hash = ${hash(token)}`;
  const inv = filas[0];
  if (!inv) return { error: 'Esa invitación no existe.' };
  if (inv.estado === 'aceptada') return { error: 'Esa invitación ya se usó.' };
  if (inv.estado === 'revocada') return { error: 'Esa invitación se ha anulado.' };
  if (new Date(inv.expira) < new Date()) return { error: 'Esa invitación ha caducado.' };
  return { invitacion: inv };
}

/* Acepta la invitación con una cuenta ya existente. Si el usuario es nuevo,
   primero se registra con el sistema actual y después llama aquí. */
async function acepta(token, userId) {
  const r = await lee(token);
  if (r.error) return r;
  const sql = db();
  const inv = r.invitacion;

  const [u] = await sql`SELECT email FROM usuarios WHERE id = ${userId}`;
  if (!u) return { error: 'La cuenta no existe.' };
  // La invitación es para un correo concreto: no se puede usar desde otra cuenta.
  if (String(u.email).toLowerCase() !== String(inv.email).toLowerCase()) {
    return { error: 'Esta invitación es para otra dirección de correo.' };
  }

  await sql`
    INSERT INTO membresias (user_id, empresa_id, rol, estado)
    VALUES (${userId}, ${inv.empresa_id}, ${inv.rol}, 'activa')
    ON CONFLICT (user_id, empresa_id) DO UPDATE SET estado = 'activa', rol = EXCLUDED.rol`;
  await sql`UPDATE invitaciones SET estado = 'aceptada', aceptada_en = now() WHERE id = ${inv.id}`;
  await registra({ user_id: userId, empresa_id: inv.empresa_id, accion: 'miembro.aceptar_invitacion',
                   entidad: 'invitacion', entidad_id: inv.id, datos: { rol: inv.rol } });
  return { ok: true, empresa_id: inv.empresa_id, rol: inv.rol };
}

async function revoca(id, userId) {
  await init();
  const filas = await db()`
    UPDATE invitaciones SET estado = 'revocada'
    WHERE id = ${id} AND estado = 'pendiente' RETURNING empresa_id`;
  if (!filas.length) return { error: 'Esa invitación ya no está pendiente.' };
  await registra({ user_id: userId, empresa_id: filas[0].empresa_id, accion: 'miembro.revocar_invitacion',
                   entidad: 'invitacion', entidad_id: id });
  return { ok: true };
}

async function pendientes(empresaId) {
  await init();
  return db()`
    SELECT id, email, rol, estado, expira, creada FROM invitaciones
    WHERE empresa_id = ${empresaId} AND estado = 'pendiente' AND expira > now()
    ORDER BY creada DESC`;
}

/* ─────────── verificación de correo ─────────── */

/* Importante: las cuentas existentes NO se tocan. La ausencia de fila en
   emails_verificados se interpreta como "cuenta antigua", no como "no válida".
   La verificación solo se exige a las cuentas creadas por la web nueva, y
   nunca bloquea el acceso: limita acciones sensibles. */

async function pideVerificacion(userId, email) {
  await init();
  const sql = db();
  const token = nuevoToken();
  await sql`UPDATE verificaciones_email SET usada = now() WHERE user_id = ${userId} AND usada IS NULL`;
  await sql`
    INSERT INTO verificaciones_email (user_id, token_hash, expira)
    VALUES (${userId}, ${hash(token)}, ${enDias(DIAS_VERIFICACION).toISOString()})`;
  return { token, email };
}

async function verifica(token) {
  await init();
  const sql = db();
  const filas = await sql`
    SELECT v.id, v.user_id, u.email FROM verificaciones_email v
    JOIN usuarios u ON u.id = v.user_id
    WHERE v.token_hash = ${hash(token)} AND v.usada IS NULL AND v.expira > now()`;
  if (!filas.length) return { error: 'Ese enlace no es válido o ha caducado.' };
  const v = filas[0];
  await sql`UPDATE verificaciones_email SET usada = now() WHERE id = ${v.id}`;
  await sql`
    INSERT INTO emails_verificados (user_id, email) VALUES (${v.user_id}, ${v.email})
    ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, verificado = now()`;
  await registra({ user_id: v.user_id, accion: 'email.verificar' });
  return { ok: true, user_id: v.user_id };
}

async function estaVerificado(userId) {
  await init();
  const filas = await db()`SELECT 1 FROM emails_verificados WHERE user_id = ${userId}`;
  return filas.length > 0;
}

module.exports = { invita, lee, acepta, revoca, pendientes, pideVerificacion, verifica, estaVerificado,
                   DIAS_INVITACION, DIAS_VERIFICACION };
