/* Productos de una empresa, para el panel.
 *
 *   POST   /api/productos           { empresa_id, titulo, sector, sub?, desc?, fotos? }  → crea
 *   PATCH  /api/productos?id=N      { titulo, sector, sub?, desc?, fotos? }              → edita
 *   DELETE /api/productos?id=N                                                          → borra
 *
 * La autorización se decide en servidor contra la membresía con la empresa
 * DUEÑA del producto (productos.crear / editar / borrar): para editar o borrar
 * se mira primero de quién es el producto, nunca se confía en un empresa_id
 * que llegue del navegador. El administrador puede con cualquiera. Un
 * producto que no existe y uno ajeno responden igual, para no revelar ids.
 * destacado no se toca desde aquí. Cada cambio queda en auditoría.
 */

const { db, init, registra } = require('./_esquema');
const { usuarioDeSesion, esAdmin } = require('./auth');
const { exige } = require('./_permisos');
const { cuerpo } = require('./sesion');
const SECTORES = require('./_sectores.json');

const IDS = new Set(SECTORES.map(s => s.id));
const MAX_POR_EMPRESA = 60;   // el mismo tope que tenía el sistema actual
const NO_EXISTE = 'Ese producto no existe o no tienes acceso.';

const rec = (v, n) => { const s = String(v == null ? '' : v).trim().slice(0, n); return s || null; };

async function permite(usuario, empresaId, permiso) {
  if (esAdmin(usuario.email)) return { ok: true, admin: true };
  return exige(usuario, empresaId, permiso);
}

function valida(b) {
  const errores = [];
  const titulo = rec(b.titulo, 140);
  if (!titulo) errores.push('Falta el título.');
  const sector = IDS.has(String(b.sector)) ? String(b.sector) : null;
  if (!sector) errores.push('Elige un sector.');
  const fotos = (Array.isArray(b.fotos) ? b.fotos : String(b.fotos || '').split(/\n+/))
    .map(s => String(s).trim()).filter(Boolean).slice(0, 12);
  if (fotos.some(u => !/^https:\/\/\S{5,500}$/i.test(u))) errores.push('Las fotos deben ser direcciones que empiecen por https://.');
  return {
    errores,
    datos: { titulo, sector, subsector: rec(b.sub, 120), descripcion: rec(b.desc, 2000), fotos: fotos.join('\n') || null },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const usuario = await usuarioDeSesion(req);
    if (!usuario) { res.status(401).json({ error: 'Tienes que haber iniciado sesión.' }); return; }
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    await init();
    const sql = db();

    if (req.method === 'POST') {
      const b = cuerpo(req);
      const empresaId = Number(b.empresa_id);
      if (!empresaId) { res.status(400).json({ error: 'Falta la empresa.' }); return; }
      const g = await permite(usuario, empresaId, 'productos.crear');
      if (!g.ok) { res.status(g.codigo).json({ error: g.error }); return; }
      const { errores, datos: d } = valida(b);
      if (errores.length) { res.status(400).json({ error: errores[0], errores }); return; }
      const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM productos WHERE user_id = ${empresaId}`;
      if (n >= MAX_POR_EMPRESA) { res.status(400).json({ error: `Has llegado al máximo de ${MAX_POR_EMPRESA} productos.` }); return; }
      const [p] = await sql`
        INSERT INTO productos (user_id, titulo, descripcion, sector, subsector, fotos)
        VALUES (${empresaId}, ${d.titulo}, ${d.descripcion}, ${d.sector}, ${d.subsector}, ${d.fotos})
        RETURNING id`;
      await registra({ user_id: usuario.id, empresa_id: empresaId, accion: 'producto.crear', entidad: 'producto', entidad_id: p.id, datos: { admin: !!g.admin }, ip });
      res.status(201).json({ ok: true, id: p.id });
      return;
    }

    if (req.method === 'PATCH' || req.method === 'DELETE') {
      const id = Number(req.query?.id);
      if (!id) { res.status(400).json({ error: 'Falta el producto.' }); return; }
      const [p] = await sql`SELECT id, user_id FROM productos WHERE id = ${id}`;
      if (!p) { res.status(404).json({ error: NO_EXISTE }); return; }
      const permiso = req.method === 'PATCH' ? 'productos.editar' : 'productos.borrar';
      const g = await permite(usuario, p.user_id, permiso);
      if (!g.ok) { res.status(g.codigo === 403 ? 403 : 404).json({ error: g.codigo === 403 ? g.error : NO_EXISTE }); return; }

      if (req.method === 'DELETE') {
        await sql`DELETE FROM productos WHERE id = ${id}`;
        await registra({ user_id: usuario.id, empresa_id: p.user_id, accion: 'producto.borrar', entidad: 'producto', entidad_id: id, datos: { admin: !!g.admin }, ip });
        res.status(200).json({ ok: true });
        return;
      }
      const { errores, datos: d } = valida(cuerpo(req));
      if (errores.length) { res.status(400).json({ error: errores[0], errores }); return; }
      await sql`
        UPDATE productos SET titulo = ${d.titulo}, descripcion = ${d.descripcion}, sector = ${d.sector},
                             subsector = ${d.subsector}, fotos = ${d.fotos}
        WHERE id = ${id}`;
      await registra({ user_id: usuario.id, empresa_id: p.user_id, accion: 'producto.editar', entidad: 'producto', entidad_id: id, datos: { admin: !!g.admin }, ip });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error(JSON.stringify({ evt: 'productos_error', msg: err.message }));
    res.status(500).json({ error: 'No se ha podido guardar el producto. Inténtalo de nuevo.' });
  }
};
