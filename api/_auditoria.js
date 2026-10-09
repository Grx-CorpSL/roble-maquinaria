/* Auditoría de SOLO LECTURA previa a la migración de identidad.
 *
 * No escribe nada: ni CREATE, ni INSERT, ni UPDATE, ni DELETE. Solo SELECT.
 * Devuelve los números exactos que hacen falta para decidir la migración
 * (ver roble-ml/docs/identidad.md, apartado E.4 y F.4).
 *
 * Necesita la cadena de conexión en el entorno, en ROBLE_DATABASE_URL.
 *
 * Lo más cómodo es lanzarla con el script, que pide la cadena sin mostrarla y
 * funciona desde cualquier carpeta:
 *   powershell -File "<ruta>\roble-ml\auditar.ps1"
 *
 * O a mano, con la ruta completa del archivo:
 *   node "<ruta>\roble-ml\api\_auditoria.js"
 */

const { neon } = require('@neondatabase/serverless');
const { cadena, describe } = require('./_conexion');

async function auditoria() {
  const c = cadena();
  if (!c) return { error: 'Sin cadena de conexión en el entorno (ROBLE_DATABASE_URL).' };

  // No auditar contra una base que no es la de ROBLE: los números no valdrían.
  const info = describe(c.url);
  if (!info) return { error: `La variable ${c.nombre} no contiene una URL válida.` };
  if (!info.neon) {
    return { error: `La variable ${c.nombre} apunta a ${info.host}/${info.base}, que no es Neon. ` +
                    'La base de ROBLE está en Neon.' };
  }

  const sql = neon(c.url);

  /* usuarios.eliminada la usa producción pero no la crea ningún archivo del
     repositorio. Si faltara, los recuentos de abajo mezclarían cuentas de baja
     con cuentas activas, así que se verifica antes de contar nada. */
  const col = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'eliminada'`;
  if (!col.length) {
    return { error: 'La tabla usuarios no tiene la columna "eliminada": no se puede ' +
                    'distinguir una cuenta borrada de una activa. Auditoría detenida.' };
  }

  const [totales] = await sql`
    SELECT
      COUNT(*)                                                                    AS cuentas_totales,
      COUNT(*) FILTER (WHERE rol = 'empresa')                                     AS rol_empresa,
      COUNT(*) FILTER (WHERE rol = 'comprador')                                   AS rol_comprador,
      COUNT(*) FILTER (WHERE rol = 'empresa' AND eliminada IS NULL)               AS migrables,
      COUNT(*) FILTER (WHERE rol = 'empresa' AND eliminada IS NOT NULL)           AS excluidas_borradas,
      COUNT(*) FILTER (WHERE rol = 'comprador' AND eliminada IS NOT NULL)         AS compradores_borrados
    FROM usuarios`;

  const [calidad] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE empresa IS NULL OR TRIM(empresa) = '')               AS sin_nombre_empresa,
      COUNT(*) FILTER (WHERE email LIKE '%@directorio.roble.es')                  AS correo_generado,
      COUNT(*) FILTER (WHERE email NOT LIKE '%@directorio.roble.es')              AS correo_real,
      COUNT(*) FILTER (WHERE nombre IS NULL OR TRIM(nombre) = '')                 AS sin_nombre_contacto,
      COUNT(*) FILTER (WHERE plan <> 'gratuito')                                  AS con_plan_pago
    FROM usuarios WHERE rol = 'empresa' AND eliminada IS NULL`;

  const duplicados = await sql`
    SELECT LOWER(TRIM(empresa)) AS nombre, COUNT(*) AS veces,
           ARRAY_AGG(id ORDER BY id) AS ids
    FROM usuarios
    WHERE rol = 'empresa' AND eliminada IS NULL AND empresa IS NOT NULL AND TRIM(empresa) <> ''
    GROUP BY 1 HAVING COUNT(*) > 1
    ORDER BY 2 DESC, 1 LIMIT 40`;

  // Un email es UNIQUE en la tabla, así que "un usuario con varias fichas" solo
  // puede darse por nombre de empresa repetido con emails distintos (arriba) o
  // por dominio de web repetido, que es la señal más fiable de duplicado real.
  const mismaWeb = await sql`
    SELECT LOWER(REGEXP_REPLACE(REGEXP_REPLACE(web, '^https?://', ''), '/.*$', '')) AS dominio,
           COUNT(*) AS veces, ARRAY_AGG(id ORDER BY id) AS ids
    FROM usuarios
    WHERE rol = 'empresa' AND eliminada IS NULL AND web IS NOT NULL AND TRIM(web) <> ''
    GROUP BY 1 HAVING COUNT(*) > 1
    ORDER BY 2 DESC LIMIT 40`;

  // Filas de otras tablas que apuntan a una cuenta que ya no existe o que no es
  // empresa viva: son las que quedarían fuera del modelo nuevo.
  const [huerfanos] = await sql`
    SELECT
      (SELECT COUNT(*) FROM productos p       WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = p.user_id))        AS productos_sin_cuenta,
      (SELECT COUNT(*) FROM productos p       JOIN usuarios u ON u.id = p.user_id WHERE u.eliminada IS NOT NULL)          AS productos_de_borradas,
      (SELECT COUNT(*) FROM resenas r         WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = r.empresa_id))     AS resenas_sin_empresa,
      (SELECT COUNT(*) FROM conversaciones c  WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = c.empresa_id))     AS conv_sin_empresa,
      (SELECT COUNT(*) FROM facturas f        WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = f.user_id))        AS facturas_sin_cuenta,
      (SELECT COUNT(*) FROM solicitudes s     WHERE s.destino_id IS NOT NULL
                                                AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = s.destino_id))     AS solicitudes_sin_destino`;

  // Cuántas filas legacy apuntan a cuentas de empresa: es lo que la tabla
  // empresas debe poder cubrir manteniendo el mismo id.
  const [dependencias] = await sql`
    SELECT
      (SELECT COUNT(*) FROM productos)                                            AS productos,
      (SELECT COUNT(*) FROM resenas)                                              AS resenas,
      (SELECT COUNT(*) FROM conversaciones)                                       AS conversaciones,
      (SELECT COUNT(*) FROM facturas)                                             AS facturas,
      (SELECT COUNT(*) FROM publicaciones)                                        AS publicaciones,
      (SELECT COUNT(*) FROM favoritos)                                            AS favoritos,
      (SELECT COUNT(*) FROM solicitudes WHERE destino_id IS NOT NULL)             AS solicitudes_a_empresa,
      (SELECT COUNT(*) FROM sesiones WHERE expira > now())                        AS sesiones_vivas`;

  const [rangos] = await sql`
    SELECT MIN(id) AS id_min, MAX(id) AS id_max, COUNT(*) AS n FROM usuarios`;

  // ¿Alguna cuenta de comprador tiene productos o facturas? Sería una cuenta que
  // se comporta como empresa sin tener el rol: caso ambiguo a revisar a mano.
  const compradoresConDatos = await sql`
    SELECT u.id, u.email, u.rol,
           (SELECT COUNT(*) FROM productos p WHERE p.user_id = u.id) AS productos,
           (SELECT COUNT(*) FROM facturas f WHERE f.user_id = u.id)  AS facturas
    FROM usuarios u
    WHERE u.rol <> 'empresa'
      AND (EXISTS (SELECT 1 FROM productos p WHERE p.user_id = u.id)
        OR EXISTS (SELECT 1 FROM facturas f WHERE f.user_id = u.id))
    LIMIT 20`;

  /* CORRESPONDENCIA usuario → empresa.
     La migración crea UNA empresa por cuenta, con el mismo id. Para que eso sea
     correcto, la relación tiene que ser 1:1 exacta. Aquí se comprueba, en vez
     de darlo por supuesto. Lo esperado: colisiones = 0 y sobrantes = 0. */
  /* Si la tabla empresas todavía no existe (aún no se ha migrado), no se puede
     nombrar en la consulta: Postgres valida las tablas al planificar, aunque el
     EXISTS que las protege sea falso. Por eso se comprueba antes. */
  const hayEmpresas = (await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'empresas'`).length > 0;

  const [base] = await sql`
    SELECT
      (SELECT COUNT(*) FROM usuarios WHERE rol = 'empresa' AND eliminada IS NULL)            AS origen,
      (SELECT COUNT(DISTINCT id) FROM usuarios WHERE rol = 'empresa' AND eliminada IS NULL)  AS ids_distintos`;

  let ocupados = { ya_tienen_empresa: 0, colisiones_no_migrables: 0 };
  if (hayEmpresas) {
    [ocupados] = await sql`
      SELECT
        (SELECT COUNT(*) FROM usuarios u
           WHERE u.rol = 'empresa' AND u.eliminada IS NULL
             AND EXISTS (SELECT 1 FROM empresas e WHERE e.id = u.id))          AS ya_tienen_empresa,
        -- Cuentas NO migrables cuyo id ya estaría ocupado: no debería pasar.
        (SELECT COUNT(*) FROM usuarios u
           WHERE (u.rol <> 'empresa' OR u.eliminada IS NOT NULL)
             AND EXISTS (SELECT 1 FROM empresas e WHERE e.id = u.id))          AS colisiones_no_migrables`;
  }
  const correspondencia = { ...base, ...ocupados, tabla_empresas_existe: hayEmpresas };

  /* RELACIONES AMBIGUAS. favoritos, resenas y conversaciones tienen dos
     columnas hacia usuarios(id): una es la persona y otra la empresa. Si una
     fila usa el MISMO id en ambas, no se puede saber qué representa. Es el caso
     que haría que renumerar reatribuyera datos en silencio. Esperado: 0. */
  const [ambiguas] = await sql`
    SELECT
      (SELECT COUNT(*) FROM resenas        WHERE autor_id   IS NOT NULL AND autor_id   = empresa_id) AS resena_autor_es_empresa,
      (SELECT COUNT(*) FROM conversaciones WHERE comprador_id IS NOT NULL AND comprador_id = empresa_id) AS conv_comprador_es_empresa,
      (SELECT COUNT(*) FROM favoritos      WHERE usuario_id = empresa_id)                                AS favorito_de_si_misma,
      -- Reseñas escritas por una cuenta de rol empresa (permitido, pero conviene saberlo).
      (SELECT COUNT(*) FROM resenas r JOIN usuarios u ON u.id = r.autor_id
        WHERE u.rol = 'empresa')                                                                     AS resenas_escritas_por_empresa,
      -- Filas que apuntan como "empresa" a una cuenta que NO es empresa.
      (SELECT COUNT(*) FROM resenas r JOIN usuarios u ON u.id = r.empresa_id
        WHERE u.rol <> 'empresa')                                                                    AS resenas_con_empresa_que_no_lo_es,
      (SELECT COUNT(*) FROM conversaciones c JOIN usuarios u ON u.id = c.empresa_id
        WHERE u.rol <> 'empresa')                                                                    AS conv_con_empresa_que_no_lo_es,
      /* Una cuenta de empresa ocupando la columna de persona. No es un error
         (una empresa puede comprarle a otra), pero es justo el caso en el que
         el mismo id significa cosas distintas segun la columna, asi que hay que
         verlo antes de migrar. Mirar solo si ambos ids coinciden no lo detecta. */
      (SELECT COUNT(*) FROM conversaciones c JOIN usuarios u ON u.id = c.comprador_id
        WHERE u.rol = 'empresa')                                                                     AS conv_comprador_con_rol_empresa,
      (SELECT COUNT(*) FROM favoritos f JOIN usuarios u ON u.id = f.usuario_id
        WHERE u.rol = 'empresa')                                                                     AS favorito_de_cuenta_empresa`;

  /* CASOS 1:N INESPERADOS. El modelo nuevo admite varias personas por empresa,
     pero la migración inicial asume una sola cuenta dueña. Si dos cuentas vivas
     comparten nombre Y dominio web, probablemente son la misma empresa con dos
     fichas: hay que decidirlas a mano, no fusionarlas automáticamente. */
  const posiblesMismaEmpresa = await sql`
    SELECT LOWER(TRIM(empresa)) AS nombre,
           LOWER(REGEXP_REPLACE(REGEXP_REPLACE(web, '^https?://(www\\.)?', ''), '/.*$', '')) AS dominio,
           COUNT(*) AS fichas, ARRAY_AGG(id ORDER BY id) AS ids
    FROM usuarios
    WHERE rol = 'empresa' AND eliminada IS NULL
      AND empresa IS NOT NULL AND TRIM(empresa) <> ''
      AND web IS NOT NULL AND TRIM(web) <> ''
    GROUP BY 1, 2 HAVING COUNT(*) > 1
    ORDER BY 3 DESC LIMIT 40`;

  // ¿Existen ya las tablas nuevas? (para saber si la migración ya corrió)
  const tablasNuevas = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('empresas','membresias','invitaciones','verificaciones_email','auditoria')
    ORDER BY 1`;

  // ¿Existe ya la columna email_verificado?
  const columna = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'email_verificado'`;

  return {
    generado: new Date().toISOString(),
    totales, calidad, dependencias, huerfanos, rangos,
    correspondencia, ambiguas,
    duplicados_nombre: duplicados,
    duplicados_web: mismaWeb,
    posibles_misma_empresa: posiblesMismaEmpresa,
    compradores_con_datos: compradoresConDatos,
    tablas_nuevas_existentes: tablasNuevas.map(t => t.table_name),
    columna_email_verificado: columna.length > 0,
  };
}

/* Informe legible. Los "bloqueantes" son condiciones que, de darse, harían que
   la migración fuese incorrecta: si aparece alguno, no se migra. */
function informe(r) {
  const L = [];
  const n = v => Number(v ?? 0);
  const t = r.totales, c = r.calidad, k = r.correspondencia, a = r.ambiguas, h = r.huerfanos;

  L.push('LOS 8 NUMEROS');
  L.push(` 1. Cuentas de empresa migrables .......... ${n(t.migrables)}`);
  L.push(` 2. Excluidas por borrado logico .......... ${n(t.excluidas_borradas)}`);
  L.push(` 3. Sin nombre de empresa ................. ${n(c.sin_nombre_empresa)}`);
  L.push(` 4. Con correo generado (sin verificar) ... ${n(c.correo_generado)}`);
  L.push(` 5. Con correo real ....................... ${n(c.correo_real)}`);
  L.push(` 6. Nombres de empresa duplicados ......... ${r.duplicados_nombre.length} grupos`);
  L.push(` 7. Posibles fichas de la misma empresa ... ${r.posibles_misma_empresa.length} grupos`);
  L.push(` 8. Filas huerfanas (total) ............... ${
    n(h.productos_sin_cuenta)+n(h.resenas_sin_empresa)+n(h.conv_sin_empresa)+
    n(h.facturas_sin_cuenta)+n(h.solicitudes_sin_destino)}`);

  L.push('', 'CORRESPONDENCIA usuario -> empresa (debe ser 1:1)');
  L.push(`  cuentas origen ......... ${n(k.origen)}`);
  L.push(`  ids distintos .......... ${n(k.ids_distintos)}`);
  L.push(`  ya tienen empresa ...... ${n(k.ya_tienen_empresa)}`);
  L.push(`  colisiones no migrables  ${n(k.colisiones_no_migrables)}`);

  L.push('', 'RELACIONES AMBIGUAS (esperado: 0)');
  for (const [key, val] of Object.entries(a)) L.push(`  ${key} = ${n(val)}`);

  L.push('', 'HUERFANOS');
  for (const [key, val] of Object.entries(h)) L.push(`  ${key} = ${n(val)}`);

  /* Un "0 huerfanos" sobre una tabla vacia no demuestra nada. Se dice cuantas
     filas tiene cada tabla para saber si el cero es una garantia o un vacio. */
  L.push('', 'VOLUMEN DE LAS TABLAS (contexto de los ceros de arriba)');
  for (const [key, val] of Object.entries(r.dependencias)) {
    L.push(`  ${key} = ${n(val)}${n(val) === 0 ? '   <- tabla vacia: el 0 de arriba no prueba nada' : ''}`);
  }

  const bloqueantes = [];
  if (n(k.origen) !== n(k.ids_distintos)) bloqueantes.push('Hay ids repetidos entre las cuentas a migrar: la relacion no es 1:1.');
  if (n(k.colisiones_no_migrables) > 0)   bloqueantes.push('Una cuenta NO migrable ya ocupa un id de empresa.');
  if (n(a.resena_autor_es_empresa) > 0)   bloqueantes.push('Hay resenas donde autor y empresa son el mismo id: relacion ambigua.');
  if (n(a.conv_comprador_es_empresa) > 0) bloqueantes.push('Hay conversaciones donde comprador y empresa son el mismo id.');

  const avisos = [];
  if (n(a.conv_comprador_con_rol_empresa) > 0)
    avisos.push(`${n(a.conv_comprador_con_rol_empresa)} conversaciones donde quien pregunta es una cuenta de empresa: ` +
                'legitimo (una empresa compra a otra), pero ese id vale como persona y como empresa.');
  if (n(a.favorito_de_cuenta_empresa) > 0)
    avisos.push(`${n(a.favorito_de_cuenta_empresa)} favoritos guardados por una cuenta de empresa.`);
  if (n(c.sin_nombre_empresa) > 0) avisos.push(`${n(c.sin_nombre_empresa)} cuentas sin nombre: usaran el nombre de contacto.`);
  if (n(c.correo_generado) > 0)    avisos.push(`${n(c.correo_generado)} correos generados: migran SIN verificar.`);
  if (r.posibles_misma_empresa.length) avisos.push(`${r.posibles_misma_empresa.length} grupos con mismo nombre y dominio: revisar a mano, no fusionar.`);
  if (n(h.resenas_sin_empresa) + n(h.conv_sin_empresa) > 0) avisos.push('Hay huerfanos previos: no los crea la migracion, pero quedaran fuera.');

  L.push('', bloqueantes.length ? 'BLOQUEANTES' : 'BLOQUEANTES: ninguno');
  bloqueantes.forEach(b => L.push('  - ' + b));
  L.push('', avisos.length ? 'AVISOS (no impiden migrar)' : 'AVISOS: ninguno');
  avisos.forEach(b => L.push('  - ' + b));
  L.push('', bloqueantes.length
    ? 'VEREDICTO: NO migrar hasta resolver los bloqueantes.'
    : 'VEREDICTO: la migracion es segura. Falta el backup verificado antes de ejecutarla.');
  return L.join('\n');
}

module.exports = { auditoria, informe };

if (require.main === module) {
  const json = process.argv.includes('--json');
  auditoria()
    .then(r => {
      if (r.error) { console.log('ERROR: ' + r.error); process.exit(1); }
      console.log(json ? JSON.stringify(r, null, 1) : informe(r));
      process.exit(0);
    })
    .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
}
