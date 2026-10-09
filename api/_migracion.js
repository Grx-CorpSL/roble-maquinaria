/* Poblado inicial de empresas y membresias desde el sistema existente.
 *
 * NO SE EJECUTA SOLO. Hay que lanzarlo a mano y con --confirmar.
 *
 * Garantías:
 *   · Solo INSERT en tablas NUEVAS (empresas, membresias).
 *   · Ni un UPDATE ni un DELETE sobre tablas existentes.
 *   · Los ids se copian de usuarios: nunca se renumera nada.
 *   · Repetible: ON CONFLICT DO NOTHING. Lanzarlo dos veces no duplica.
 *   · No migra cuentas borradas lógicamente (eliminada IS NOT NULL).
 *   · No migra compradores.
 *   · Un correo generado NO cuenta como verificado.
 *
 * Uso:
 *   node roble-ml/api/_migracion.js              → simulacro, no escribe
 *   node roble-ml/api/_migracion.js --confirmar  → escribe
 *   node roble-ml/api/_migracion.js --revertir   → deshace el poblado
 */

const { db, init, compruebaEliminada } = require('./_esquema');

const CORREO_GENERADO = '%@directorio.roble.es';

/* Qué se migraría. Solo lectura: sirve igual para el simulacro y para comprobar. */
async function previsualiza() {
  await init();
  await compruebaEliminada();
  const sql = db();
  const [n] = await sql`
    SELECT
      COUNT(*)                                                       AS candidatas,
      COUNT(*) FILTER (WHERE empresa IS NULL OR TRIM(empresa) = '')  AS usaran_nombre_contacto,
      COUNT(*) FILTER (WHERE email LIKE ${CORREO_GENERADO})          AS correo_generado
    FROM usuarios
    WHERE rol = 'empresa' AND eliminada IS NULL`;
  const [ya] = await sql`
    SELECT (SELECT COUNT(*) FROM empresas)   AS empresas,
           (SELECT COUNT(*) FROM membresias) AS membresias`;
  return { candidatas: Number(n.candidatas), usaran_nombre_contacto: Number(n.usaran_nombre_contacto),
           correo_generado: Number(n.correo_generado), ya_migradas: Number(ya.empresas), membresias: Number(ya.membresias) };
}

async function migra() {
  await init();
  await compruebaEliminada();
  const sql = db();

  /* 1. Una empresa por cada cuenta de empresa viva, con SU MISMO id.
        Si no tiene nombre comercial, se usa el nombre de contacto: no se
        descarta ninguna fila por eso. */
  const empresas = await sql`
    INSERT INTO empresas (id, nombre, estado, origen, creada)
    SELECT u.id,
           COALESCE(NULLIF(TRIM(u.empresa), ''), NULLIF(TRIM(u.nombre), ''), 'Sin nombre'),
           'activa', 'legacy', u.creado
    FROM usuarios u
    WHERE u.rol = 'empresa' AND u.eliminada IS NULL
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;

  /* 2. La cuenta que originó la empresa es su propietaria. */
  const membresias = await sql`
    INSERT INTO membresias (user_id, empresa_id, rol, estado)
    SELECT u.id, u.id, 'propietario', 'activa'
    FROM usuarios u
    WHERE u.rol = 'empresa' AND u.eliminada IS NULL
      AND EXISTS (SELECT 1 FROM empresas e WHERE e.id = u.id)
    ON CONFLICT (user_id, empresa_id) DO NOTHING
    RETURNING id`;

  return { empresas_creadas: empresas.length, membresias_creadas: membresias.length };
}

/* Las cuatro comprobaciones de F.4. Si alguna falla, la migración no vale. */
async function comprueba() {
  await init();
  const sql = db();
  const [r] = await sql`
    SELECT
      (SELECT COUNT(*) FROM usuarios WHERE rol = 'empresa' AND eliminada IS NULL) AS esperadas,
      (SELECT COUNT(*) FROM empresas WHERE origen = 'legacy')                     AS empresas,
      (SELECT COUNT(*) FROM membresias)                                           AS membresias,
      (SELECT COUNT(*) FROM empresas e
         WHERE NOT EXISTS (SELECT 1 FROM membresias m
                           WHERE m.empresa_id = e.id AND m.rol = 'propietario'))  AS sin_propietario,
      (SELECT COUNT(*) FROM empresas e
         WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = e.id))           AS sin_cuenta,
      (SELECT COUNT(*) FROM productos p
         WHERE NOT EXISTS (SELECT 1 FROM empresas e WHERE e.id = p.user_id))      AS productos_sin_empresa,
      (SELECT COUNT(*) FROM resenas s
         WHERE NOT EXISTS (SELECT 1 FROM empresas e WHERE e.id = s.empresa_id))   AS resenas_sin_empresa`;

  const pruebas = [
    ['empresas = cuentas de empresa vivas', Number(r.empresas) === Number(r.esperadas)],
    ['membresias = empresas', Number(r.membresias) === Number(r.empresas)],
    ['toda empresa tiene propietario', Number(r.sin_propietario) === 0],
    ['toda empresa tiene su cuenta legacy', Number(r.sin_cuenta) === 0],
  ];
  // Informativas: pueden ser > 0 si ya había huérfanos antes de migrar.
  const avisos = [
    ['productos sin empresa (huérfanos previos)', Number(r.productos_sin_empresa)],
    ['reseñas sin empresa (huérfanas previas)', Number(r.resenas_sin_empresa)],
  ];
  return { cifras: r, pruebas, avisos, ok: pruebas.every(p => p[1]) };
}

/* Deshace SOLO el poblado. No toca el esquema ni nada legacy. */
async function revierte() {
  await init();
  const sql = db();
  const m = await sql`DELETE FROM membresias WHERE empresa_id IN (SELECT id FROM empresas WHERE origen = 'legacy') RETURNING id`;
  const e = await sql`DELETE FROM empresas WHERE origen = 'legacy' RETURNING id`;
  return { membresias_borradas: m.length, empresas_borradas: e.length };
}

module.exports = { previsualiza, migra, comprueba, revierte };

if (require.main === module) {
  const arg = process.argv[2] || '';
  (async () => {
    if (arg === '--revertir') {
      console.log('Revirtiendo el poblado (tablas nuevas)…');
      console.log(JSON.stringify(await revierte(), null, 1));
      return;
    }
    const prev = await previsualiza();
    console.log('Se migrarían:', JSON.stringify(prev, null, 1));
    if (arg !== '--confirmar') {
      console.log('\nSIMULACRO: no se ha escrito nada.');
      console.log('Antes de ejecutar de verdad: copia de seguridad (docs/identidad.md, F.1).');
      console.log('Para ejecutar:  node roble-ml/api/_migracion.js --confirmar');
      return;
    }
    console.log('\nMigrando…');
    console.log(JSON.stringify(await migra(), null, 1));
    const c = await comprueba();
    console.log('\nComprobaciones:');
    for (const [q, ok] of c.pruebas) console.log(' ', ok ? 'OK ' : 'FALLA', q);
    for (const [q, n] of c.avisos) console.log('  aviso:', q, '=', n);
    if (!c.ok) {
      console.log('\nALGUNA COMPROBACIÓN HA FALLADO. Revertir con: node roble-ml/api/_migracion.js --revertir');
      process.exit(1);
    }
    console.log('\nMigración correcta.');
  })().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}
