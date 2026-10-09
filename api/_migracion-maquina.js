/* Columnas propias de máquina en productos: marca, modelo, año y estado.
 *
 * NO SE EJECUTA SOLO. Hay que lanzarlo a mano, con la cadena del PROPIETARIO
 * en ROBLE_DATABASE_URL (roble_app no puede alterar tablas), y con --confirmar.
 *
 * Garantías:
 *   · Un solo ALTER TABLE: o entra todo o no entra nada.
 *   · Columnas anulables sin valor por defecto: Postgres no reescribe ninguna
 *     fila; las 465 existentes quedan como están, con NULL en lo nuevo.
 *   · Repetible: ADD COLUMN IF NOT EXISTS. Lanzarlo dos veces no hace nada.
 *   · roble_app ya tiene SELECT/INSERT/UPDATE/DELETE de tabla sobre productos:
 *     las columnas nuevas quedan cubiertas sin tocar privilegios.
 *   · --revertir se niega si alguna fila ya tiene datos en esas columnas,
 *     salvo --revertir --forzar.
 *
 * Uso:
 *   node roble-ml/api/_migracion-maquina.js               → simulacro, no escribe
 *   node roble-ml/api/_migracion-maquina.js --confirmar   → añade las columnas
 *   node roble-ml/api/_migracion-maquina.js --revertir    → las quita (si están vacías)
 */

const { db } = require('./_esquema');

// Los dos estados son los que ya entiende la web (ML.ESTADO en assets/ml.js);
// «sin especificar» es NULL, no una cadena vacía.
const COLUMNAS = [
  ['marca',  'text'],
  ['modelo', 'text'],
  ['anio',   'smallint', 'anio IS NULL OR anio BETWEEN 1900 AND 2100'],
  ['estado', 'text',     "estado IS NULL OR estado IN ('nueva', 'usada')"],
];
const NOMBRES = COLUMNAS.map(c => c[0]);

async function existentes(sql) {
  const filas = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'productos'`;
  return new Map(filas.map(f => [f.column_name, f.data_type]));
}

/* Qué haría. Solo lectura: sirve para el simulacro y para comprobar. */
async function previsualiza() {
  const sql = db();
  const cols = await existentes(sql);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM productos`;
  return {
    productos: n,
    ya_existen: NOMBRES.filter(c => cols.has(c)),
    se_anadirian: NOMBRES.filter(c => !cols.has(c)),
    filas_que_cambian: 0,
  };
}

async function migra() {
  const sql = db();
  const partes = COLUMNAS.map(([nombre, tipo, check]) =>
    `ADD COLUMN IF NOT EXISTS ${nombre} ${tipo}${check ? ` CHECK (${check})` : ''}`);
  await sql.query(`ALTER TABLE productos ${partes.join(', ')}`);
  return { alter: partes.length };
}

async function comprueba() {
  const sql = db();
  const cols = await existentes(sql);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM productos`;
  const [{ con_datos }] = await sql`
    SELECT COUNT(*)::int AS con_datos FROM productos
    WHERE marca IS NOT NULL OR modelo IS NOT NULL OR anio IS NOT NULL OR estado IS NOT NULL`;
  const pruebas = [
    ['las cuatro columnas existen', NOMBRES.every(c => cols.has(c))],
    ['anio es smallint', cols.get('anio') === 'smallint'],
    ['marca, modelo y estado son text', ['marca', 'modelo', 'estado'].every(c => cols.get(c) === 'text')],
    ['sigue habiendo las mismas filas', n > 0],
  ];
  return { productos: n, con_datos_nuevos: con_datos, pruebas, ok: pruebas.every(p => p[1]) };
}

/* Quita SOLO las columnas nuevas. Se niega si alguien ya las ha rellenado. */
async function revierte(forzar) {
  const sql = db();
  const cols = await existentes(sql);
  const presentes = NOMBRES.filter(c => cols.has(c));
  if (!presentes.length) return { quitadas: [], motivo: 'no había nada que quitar' };
  const [{ con_datos }] = await sql.query(
    `SELECT COUNT(*)::int AS con_datos FROM productos WHERE ${presentes.map(c => `${c} IS NOT NULL`).join(' OR ')}`);
  if (con_datos > 0 && !forzar) {
    return { quitadas: [], motivo: `${con_datos} productos ya tienen datos en esas columnas; usa --forzar para perderlos` };
  }
  await sql.query(`ALTER TABLE productos ${presentes.map(c => `DROP COLUMN IF EXISTS ${c}`).join(', ')}`);
  return { quitadas: presentes, filas_con_datos_perdidos: con_datos };
}

module.exports = { previsualiza, migra, comprueba, revierte };

if (require.main === module) {
  const args = process.argv.slice(2);
  (async () => {
    if (args.includes('--revertir')) {
      console.log('Quitando las columnas de máquina…');
      console.log(JSON.stringify(await revierte(args.includes('--forzar')), null, 1));
      return;
    }
    const prev = await previsualiza();
    console.log('Se haría:', JSON.stringify(prev, null, 1));
    if (!args.includes('--confirmar')) {
      console.log('\nSIMULACRO: no se ha escrito nada.');
      console.log('Antes de ejecutar de verdad: copia de seguridad (docs/backup.md).');
      console.log('Para ejecutar:  node roble-ml/api/_migracion-maquina.js --confirmar');
      return;
    }
    if (!prev.se_anadirian.length) { console.log('\nNo hay nada que añadir.'); return; }
    console.log('\nAñadiendo columnas…');
    console.log(JSON.stringify(await migra(), null, 1));
    const c = await comprueba();
    console.log('\nComprobaciones:');
    for (const [q, ok] of c.pruebas) console.log(' ', ok ? 'OK ' : 'FALLA', q);
    console.log('  productos:', c.productos, '| con datos nuevos:', c.con_datos_nuevos);
    if (!c.ok) {
      console.log('\nALGUNA COMPROBACIÓN HA FALLADO. Revertir con: node roble-ml/api/_migracion-maquina.js --revertir');
      process.exit(1);
    }
    console.log('\nMigración correcta.');
  })().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
