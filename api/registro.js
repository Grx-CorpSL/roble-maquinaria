/* Alta de cuenta en la web nueva.
 *
 *   POST /api/registro  { email, password, nombre, rol: 'empresa'|'comprador', empresa? }
 *   → 201 + Set-Cookie roble_sesion + identidad (user, companies, permissions)
 *
 * Mismas reglas, mismo coste de bcrypt y misma tabla `usuarios` que el sistema
 * actual: la cuenta creada aquí vale en los dos sitios. Además crea la ficha de
 * identidad: una empresa con el MISMO id que la cuenta (como en la migración:
 * una empresa por cuenta, sin renumerar nada), origen 'alta' y estado
 * 'pendiente', y la membresía de propietario. Las cuentas de comprador no
 * tienen empresa.
 *
 * No manda correo: el sistema actual tampoco lo hace en el alta normal.
 */

const bcrypt = require('bcryptjs');
const { db, init, registra } = require('./_esquema');
const { identidad, COOKIE, esAdmin } = require('./auth');
const { abreSesion, cookieSesion, cuerpo } = require('./sesion');

const COSTE_BCRYPT = 10;                            // el mismo que producción
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;    // el mismo que producción

/* ponytail: límite en memoria por instancia, como el de sesión y como el del
   sistema actual. Se vacía en cada arranque en frío. */
const MAX_ALTAS_HORA = 5;
const ALTAS = new Map();
function demasiadas(ip) {
  const ahora = Date.now();
  const r = ALTAS.get(ip);
  if (!r || ahora - r.desde > 3600e3) { ALTAS.set(ip, { desde: ahora, n: 1 }); return false; }
  r.n++;
  return r.n > MAX_ALTAS_HORA;
}

// Las mismas comprobaciones que validaAlta() en producción.
function valida({ email, password, nombre, rol }) {
  const e = [];
  if (!email || !RE_EMAIL.test(email)) e.push('El email no es válido.');
  if (!password || password.length < 8) e.push('La contraseña debe tener al menos 8 caracteres.');
  if (password && password.length > 200) e.push('La contraseña es demasiado larga.');
  if (!nombre) e.push('Falta tu nombre.');
  if (rol !== 'empresa' && rol !== 'comprador') e.push('Elige un tipo de cuenta.');
  return e;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido.' }); return; }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  if (demasiadas(ip)) {
    res.status(429).json({ error: 'Demasiados registros seguidos. Inténtalo dentro de un rato.' });
    return;
  }

  const b = cuerpo(req);
  const email = String(b.email || '').toLowerCase().trim();
  const password = String(b.password || '');
  const nombre = String(b.nombre || '').trim().slice(0, 80);
  const rol = b.rol;
  const empresa = b.empresa ? String(b.empresa).trim().slice(0, 120) || null : null;

  const errores = valida({ email, password, nombre, rol });
  if (errores.length) { res.status(400).json({ error: errores[0], errores }); return; }
  // Un correo de ROBLE_ADMIN_EMAILS sin cuenta sería administrador en cuanto alguien lo registrase.
  if (esAdmin(email)) { res.status(400).json({ error: 'Ese correo no puede registrarse desde aquí.' }); return; }

  try {
    await init();
    const sql = db();

    const existe = await sql`SELECT id FROM usuarios WHERE email = ${email}`;
    if (existe.length) { res.status(409).json({ error: 'Ya hay una cuenta con ese email.', codigo: 'duplicado' }); return; }

    const hash = await bcrypt.hash(password, COSTE_BCRYPT);
    const [u] = await sql`
      INSERT INTO usuarios (email, password_hash, nombre, rol, empresa)
      VALUES (${email}, ${hash}, ${nombre}, ${rol}, ${empresa})
      RETURNING id, email, nombre, rol, empresa`;

    if (rol === 'empresa') {
      await sql`
        INSERT INTO empresas (id, nombre, estado, origen)
        VALUES (${u.id}, ${empresa || nombre}, 'pendiente', 'alta')
        ON CONFLICT (id) DO NOTHING`;
      await sql`
        INSERT INTO membresias (user_id, empresa_id, rol, estado)
        VALUES (${u.id}, ${u.id}, 'propietario', 'activa')
        ON CONFLICT (user_id, empresa_id) DO NOTHING`;
    }
    await registra({ user_id: u.id, empresa_id: rol === 'empresa' ? u.id : null, accion: 'cuenta.alta', datos: { rol }, ip });

    // La cuenta existe, pero no abre sesión: entra cuando administración la autorice desde Moderación.
    if (rol === 'empresa') { res.status(201).json({ ok: true, pendiente: true }); return; }

    const { token, expira } = await abreSesion(u.id);
    res.setHeader('Set-Cookie', cookieSesion(token, expira));
    const id = await identidad({ headers: { cookie: `${COOKIE}=${token}` } });
    res.status(201).json({ ok: true, ...id });
  } catch (err) {
    // Dos altas simultáneas con el mismo correo: la segunda choca con el UNIQUE.
    if (err.code === '23505' || /duplicate key/i.test(err.message || '')) {
      res.status(409).json({ error: 'Ya hay una cuenta con ese email.', codigo: 'duplicado' });
      return;
    }
    console.error(JSON.stringify({ evt: 'registro_error', msg: err.message }));
    res.status(500).json({ error: 'No hemos podido crear la cuenta. Inténtalo de nuevo.' });
  }
};
