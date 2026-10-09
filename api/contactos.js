/* Contactos: el formulario público los crea y el panel los lee y gestiona.
 *
 *   POST  /api/contactos { destino_id, nombre, email, telefono, mensaje, … } → público, sin sesión (ver _contacto.js)
 *   GET   /api/contactos?empresa=N      → lista (membresía con contactos.ver)
 *   PATCH /api/contactos?id=N { estado } → cambia el estado (contactos.gestionar)
 *
 * Lee `solicitudes` con destino_id = la empresa. La autorización se decide en
 * servidor contra la membresía; para cambiar un estado se mira primero a qué
 * empresa pertenece la solicitud. El administrador puede con cualquiera.
 * Los estados de la tabla (nueva / en-curso / aceptada / descartada) se
 * traducen a los del panel (nuevo / en-curso / cerrado) y viceversa.
 */

const { db, init } = require('./_esquema');
const { usuarioDeSesion, esAdmin } = require('./auth');
const { exige } = require('./_permisos');
const { cuerpo } = require('./sesion');
const { recibe, telefonoWhatsApp } = require('./_contacto');

const A_PANEL = { nueva: 'nuevo', 'en-curso': 'en-curso', aceptada: 'cerrado', descartada: 'cerrado' };
const A_TABLA = { nuevo: 'nueva', 'en-curso': 'en-curso', cerrado: 'aceptada' };
const NO_EXISTE = 'Ese contacto no existe o no tienes acceso.';

async function permite(usuario, empresaId, permiso) {
  if (esAdmin(usuario.email)) return { ok: true, admin: true };
  return exige(usuario, empresaId, permiso);
}

/* La solicitud tal como la pinta el panel. «Sobre: …» en la primera línea del
   mensaje vuelve a ser el campo producto. */
function aContacto(s) {
  let mensaje = s.mensaje || '', producto = '';
  const m = mensaje.match(/^Sobre: (.+?)\n\n([\s\S]*)$/);
  if (m) { producto = m[1]; mensaje = m[2]; }
  return {
    id: s.id, fecha: s.creada, empresa_id: s.destino_id, producto,
    nombre: s.nombre || '', contacto_empresa: s.empresa || '', email: s.email || '',
    telefono: s.telefono || '', whatsapp: telefonoWhatsApp(s.telefono), ciudad: s.ciudad || '', mensaje,
    estado: A_PANEL[s.estado] || 'nuevo',
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // El formulario de contacto es público: va antes de pedir sesión.
  if (req.method === 'POST') return recibe(req, res);
  try {
    const usuario = await usuarioDeSesion(req);
    if (!usuario) { res.status(401).json({ error: 'Tienes que haber iniciado sesión.' }); return; }
    await init();
    const sql = db();

    if (req.method === 'GET' && req.query?.todas !== undefined) {
      // Administración: todos los contactos, con el nombre de la empresa destino.
      if (!esAdmin(usuario.email)) { res.status(404).json({ error: NO_EXISTE }); return; }
      const filas = await sql`
        SELECT s.id, s.nombre, s.email, s.telefono, s.empresa, s.ciudad, s.mensaje, s.estado, s.creada, s.destino_id,
               u.empresa AS destino
        FROM solicitudes s JOIN usuarios u ON u.id = s.destino_id
        ORDER BY s.creada DESC LIMIT 1000`;
      res.status(200).json({ contactos: filas.map(s => ({ ...aContacto(s), empresa: s.destino || '' })) });
      return;
    }

    if (req.method === 'GET') {
      const empresaId = Number(req.query?.empresa);
      if (!empresaId) { res.status(400).json({ error: 'Falta la empresa.' }); return; }
      const g = await permite(usuario, empresaId, 'contactos.ver');
      if (!g.ok) { res.status(g.codigo).json({ error: g.error }); return; }
      const filas = await sql`
        SELECT id, nombre, email, telefono, empresa, ciudad, mensaje, estado, creada, destino_id
        FROM solicitudes WHERE destino_id = ${empresaId}
        ORDER BY creada DESC LIMIT 500`;
      res.status(200).json({ contactos: filas.map(aContacto) });
      return;
    }

    if (req.method === 'PATCH') {
      const id = Number(req.query?.id);
      const estado = A_TABLA[String(cuerpo(req).estado || '')];
      if (!id) { res.status(400).json({ error: 'Falta el contacto.' }); return; }
      if (!estado) { res.status(400).json({ error: 'Ese estado no existe.' }); return; }
      const [s] = await sql`SELECT id, destino_id FROM solicitudes WHERE id = ${id}`;
      if (!s || !s.destino_id) { res.status(404).json({ error: NO_EXISTE }); return; }
      const g = await permite(usuario, s.destino_id, 'contactos.gestionar');
      if (!g.ok) { res.status(g.codigo === 403 ? 403 : 404).json({ error: g.codigo === 403 ? g.error : NO_EXISTE }); return; }
      await sql`UPDATE solicitudes SET estado = ${estado} WHERE id = ${id} AND NOT (estado = 'descartada' AND ${estado} = 'aceptada')`;
      res.status(200).json({ ok: true, estado: A_PANEL[estado] });
      return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error(JSON.stringify({ evt: 'contactos_error', msg: err.message }));
    res.status(500).json({ error: 'No se han podido cargar los contactos.' });
  }
};
