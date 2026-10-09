/* Sesión de la web nueva: entrar y salir.
 *
 *   POST   /api/sesion  { email, password }  → Set-Cookie roble_sesion + identidad
 *   DELETE /api/sesion                        → borra la sesión y retira la cookie
 *
 * Mismo mecanismo que el sistema actual, sobre la MISMA tabla `sesiones`:
 * token hex de 32 bytes, 30 días, cookie HttpOnly/Secure/SameSite=Lax. Así hay
 * una sola fuente de verdad y, cuando esta web sustituya a la actual en el
 * mismo dominio, nadie pierde la sesión.
 *
 * No registra cuentas ni recupera contraseñas: eso sigue en el sistema actual.
 * El rol de la app puede INSERT/DELETE en sesiones y SELECT en usuarios; no
 * puede actualizar usuarios, así que `ultimo_acceso` no se toca desde aquí.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, init, registra } = require('./_esquema');
const { identidad, leeCookie, COOKIE } = require('./auth');

const DIAS_SESION = 30;

/* ponytail: limitador en memoria por instancia; en serverless se vacía con
   cada arranque en frío. Frena la fuerza bruta casual, no la distribuida.
   Si hiciera falta de verdad, contador en BD (tabla propia, por correo+IP). */
const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60e3;
const intentos = new Map();
function bloqueado(clave) {
  const e = intentos.get(clave);
  if (!e) return false;
  if (Date.now() > e.hasta) { intentos.delete(clave); return false; }
  return e.n >= MAX_INTENTOS;
}
function fallo(clave) {
  const e = intentos.get(clave) || { n: 0, hasta: Date.now() + VENTANA_MS };
  e.n++;
  intentos.set(clave, e);
}

const cookieSesion = (token, expira) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expira.toUTCString()}`;
const cookieBorrada = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// Mismo hash falso que producción: se compara siempre, exista o no la cuenta,
// para que el tiempo de respuesta no delate qué correos están registrados.
const HASH_FALSO = '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';

/* Lee el JSON del cuerpo respetando UTF-8: Vercel puede entregarlo como
   objeto, string o Buffer, y un Buffer sin decodificar rompe los acentos. */
function cuerpo(req) {
  const b = req.body;
  if (b == null) return {};
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8')); } catch { return {}; } }
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
  return typeof b === 'object' ? b : {};
}

/* Abre sesión: la usan entrar y el alta de cuenta. */
async function abreSesion(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + DIAS_SESION * 864e5);
  await db()`INSERT INTO sesiones (token, user_id, expira) VALUES (${token}, ${userId}, ${expira.toISOString()})`;
  return { token, expira };
}

async function entra(req, res) {
  const { email: e, password } = cuerpo(req);
  const email = String(e || '').toLowerCase().trim();
  const clave = String(password || '');
  if (!email || !clave) { res.status(400).json({ error: 'Faltan el correo o la contraseña.' }); return; }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
  const llave = `${email}|${ip}`;
  if (bloqueado(llave)) {
    res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos.' });
    return;
  }

  await init();
  const sql = db();
  const filas = await sql`SELECT id, password_hash FROM usuarios WHERE email = ${email}`;
  const ok = await bcrypt.compare(clave, filas[0]?.password_hash || HASH_FALSO);

  if (!filas.length || !ok) {
    fallo(llave);
    await registra({ accion: 'sesion.fallo', datos: { email }, ip });
    res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    return;
  }

  const { token, expira } = await abreSesion(filas[0].id);
  intentos.delete(llave);
  await registra({ user_id: filas[0].id, accion: 'sesion.entrar', ip });

  res.setHeader('Set-Cookie', cookieSesion(token, expira));
  // La identidad completa (empresas, permisos) leyendo la sesión recién creada.
  const id = await identidad({ headers: { cookie: `${COOKIE}=${token}` } });
  res.status(200).json({ ok: true, ...id });
}

async function sale(req, res) {
  const token = leeCookie(req, COOKIE);
  if (token) {
    try {
      await init();
      const [s] = await db()`DELETE FROM sesiones WHERE token = ${token} RETURNING user_id`;
      if (s) await registra({ user_id: s.user_id, accion: 'sesion.salir' });
    } catch (e) {
      // Aunque falle el borrado en base, la cookie se retira igualmente.
      console.error(JSON.stringify({ evt: 'logout_error', msg: e.message }));
    }
  }
  res.setHeader('Set-Cookie', cookieBorrada());
  res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') return await entra(req, res);
    if (req.method === 'DELETE') return await sale(req, res);
    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error(JSON.stringify({ evt: 'sesion_error', msg: err.message }));
    res.status(500).json({ error: 'No hemos podido comprobar tus datos. Inténtalo de nuevo.' });
  }
};

module.exports.abreSesion = abreSesion;
module.exports.cookieSesion = cookieSesion;
module.exports.cuerpo = cuerpo;
