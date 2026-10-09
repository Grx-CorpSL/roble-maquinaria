/* Contacto con una empresa desde su ficha o desde un anuncio. Público.
 *
 * Módulo interno: lo sirve /api/contactos (POST). Vivía en /api/contacto como
 * función propia, pero el plan de Vercel admite 12 funciones y era la 13.ª:
 * es la misma tabla que el panel lee, así que van juntas.
 *
 *   POST /api/contactos  { destino_id, nombre, email, telefono, empresa?, ciudad?, mensaje, producto?, _honey? }
 *   (telefono = WhatsApp, obligatorio: la venta se cierra por ahí)
 *   → 201 { ok: true }
 *
 * Se guarda en `solicitudes`, la misma tabla del sistema actual (tipo
 * 'consulta-empresa', destino_id = la empresa), y se avisa por correo a la
 * empresa si tiene un correo real. «Sobre qué» (el producto o anuncio) no tiene
 * columna: va como primera línea del mensaje y el panel la separa al leerla.
 *
 * Antispam: límite por IP y trampa _honey (un campo que solo rellenan los
 * bots; si viene, se responde ok y no se guarda nada).
 */

const { db, init } = require('./_esquema');
const { cuerpo } = require('./sesion');
const { avisaContacto } = require('./_correo');

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const MAX_POR_HORA = 5;
const HITS = new Map();
/* ponytail: límite en memoria por instancia, como el resto. */
function demasiados(ip) {
  const ahora = Date.now();
  const r = HITS.get(ip);
  if (!r || ahora - r.desde > 3600e3) { HITS.set(ip, { desde: ahora, n: 1 }); return false; }
  r.n++;
  return r.n > MAX_POR_HORA;
}

const rec = (v, n) => { const s = String(v == null ? '' : v).trim().slice(0, n); return s || null; };
const esGenerado = email => /@directorio\.roble\.es$/i.test(String(email || ''));

/* Número de WhatsApp en formato internacional sin «+», como lo quiere wa.me:
   «612 34 56 78» → 34612345678; «+34 612…» y «0034 612…» → 34612345678; de
   otro país solo con su prefijo. null si no parece un número. */
function telefonoWhatsApp(v) {
  let d = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  d = d.replace(/\D/g, '');
  if (/^[6-9]\d{8}$/.test(d)) d = '34' + d;
  return /^\d{10,15}$/.test(d) ? d : null;
}

/* El POST público. Quien lo llama ya ha puesto Cache-Control y comprobado el método. */
async function recibe(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  if (demasiados(ip)) {
    res.status(429).json({ error: 'Has enviado demasiados mensajes seguidos. Prueba dentro de un rato.' });
    return;
  }
  const b = cuerpo(req);
  if (b._honey) { res.status(200).json({ ok: true }); return; }

  const destinoId = Number(b.destino_id);
  const nombre = rec(b.nombre, 90);
  const email = String(b.email || '').toLowerCase().trim().slice(0, 120);
  const mensaje = rec(b.mensaje, 1200);
  const producto = rec(b.producto, 140);
  if (!destinoId) { res.status(400).json({ error: 'Falta la empresa a la que escribes.' }); return; }
  if (!nombre) { res.status(400).json({ error: 'Falta tu nombre.' }); return; }
  if (!RE_EMAIL.test(email)) { res.status(400).json({ error: 'Necesitamos un correo válido para que te respondan.' }); return; }
  if (!mensaje || mensaje.length < 5) { res.status(400).json({ error: 'Escribe un mensaje.' }); return; }
  const whatsapp = telefonoWhatsApp(b.telefono);
  if (!whatsapp) { res.status(400).json({ error: 'Necesitamos tu WhatsApp: 9 cifras si es español, con prefijo de país si no.' }); return; }

  try {
    await init();
    const sql = db();
    const [emp] = await sql`
      SELECT id, empresa, email, email_contacto FROM usuarios
      WHERE id = ${destinoId} AND rol = 'empresa' AND eliminada IS NULL`;
    if (!emp) { res.status(400).json({ error: 'La empresa a la que escribes no existe.' }); return; }

    const texto = producto ? `Sobre: ${producto}\n\n${mensaje}` : mensaje;
    await sql`
      INSERT INTO solicitudes (tipo, nombre, email, telefono, empresa, ciudad, mensaje, destino_id)
      VALUES ('consulta-empresa', ${nombre}, ${email}, ${'+' + whatsapp}, ${rec(b.empresa, 140)},
              ${rec(b.ciudad, 70)}, ${texto}, ${emp.id})`;

    // Aviso a la empresa, solo si tiene un correo real. Si falla, el contacto
    // ya está guardado y lo verá en su panel: no se le dice al remitente.
    const para = emp.email_contacto || (esGenerado(emp.email) ? null : emp.email);
    if (para) {
      try { await avisaContacto({ para, empresa: emp.empresa, nombre, email, whatsapp, mensaje, producto }); }
      catch (e) { console.error(JSON.stringify({ evt: 'aviso_contacto_error', msg: e.message })); }
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(JSON.stringify({ evt: 'contacto_error', msg: err.message }));
    res.status(500).json({ error: 'No hemos podido enviar tu mensaje. Inténtalo de nuevo.' });
  }
};
module.exports = { recibe, telefonoWhatsApp };
