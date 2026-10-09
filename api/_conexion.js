/* Comprobación de la conexión antes de auditar.
 *
 * La auditoría debe correr con una cadena de SOLO LECTURA. Aquí no se confía en
 * que lo sea: se consultan los permisos reales del usuario en el catálogo de
 * Postgres. Si la cadena puede escribir, se avisa, porque auditar con una
 * conexión de escritura es un riesgo innecesario.
 *
 * Este archivo NO escribe nada: todas sus consultas son SELECT.
 *
 * Nunca imprime la cadena ni ninguna de sus partes salvo el host y la base.
 *
 * Uso:  node roble-ml/api/_conexion.js
 */

const { neon } = require('@neondatabase/serverless');

/* Busca la cadena en el entorno. Se prefiere una variable explícita de solo
   lectura; si no, cualquiera que acabe en DATABASE_URL o POSTGRES_URL. */
function cadena() {
  const preferidas = ['ROBLE_DATABASE_URL_RO', 'ROBLE_DATABASE_URL', 'DATABASE_URL_RO'];
  for (const k of preferidas) if (process.env[k]) return { url: process.env[k], nombre: k };
  for (const [k, v] of Object.entries(process.env)) {
    if (v && /(DATABASE|POSTGRES)_URL$/.test(k)) return { url: v, nombre: k };
  }
  return null;
}

/* Describe la conexión sin revelar usuario ni contraseña. */
function describe(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, base: u.pathname.replace('/', ''), neon: /neon\.tech$/.test(u.hostname) };
  } catch { return null; }
}

async function comprueba() {
  const c = cadena();
  if (!c) return { ok: false, error: 'No hay cadena de conexión en el entorno.' };

  const info = describe(c.url);
  if (!info) return { ok: false, error: `La variable ${c.nombre} no contiene una URL válida.` };

  /* El driver de Neon habla por HTTP: contra un Postgres normal (localhost) no
     conecta y el error es poco claro. Se avisa antes de intentarlo. */
  if (!info.neon) {
    return { ok: false, error:
      `La variable ${c.nombre} apunta a ${info.host}/${info.base}, que no es Neon. ` +
      'La base de ROBLE está en Neon; esta conexión no sirve para la auditoría.' };
  }

  const sql = neon(c.url);

  const [quien] = await sql`SELECT current_database() AS base, current_user AS usuario`;

  // ¿Es la base de ROBLE? Se reconoce por sus tablas, no por el nombre.
  const tablas = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('usuarios','productos','resenas','sesiones')`;
  const esRoble = tablas.length === 4;

  /* Permisos de escritura, consultados al catálogo de Postgres. Es una lectura
     pura: no se ejecuta ningún CREATE ni ninguna escritura contra la base. */
  const [perm] = await sql`
    SELECT
      has_table_privilege(current_user, 'usuarios', 'INSERT') AS insert_usuarios,
      has_table_privilege(current_user, 'usuarios', 'UPDATE') AS update_usuarios,
      has_table_privilege(current_user, 'usuarios', 'DELETE') AS delete_usuarios,
      has_database_privilege(current_user, current_database(), 'CREATE') AS create_en_base`;
  const soloLectura = !(perm.insert_usuarios || perm.update_usuarios ||
                        perm.delete_usuarios || perm.create_en_base);

  return {
    ok: esRoble,
    variable: c.nombre,
    host: info.host,
    base: quien.base,
    usuario: quien.usuario,
    es_neon: info.neon,
    es_base_roble: esRoble,
    solo_lectura: soloLectura,
    permisos: {
      insert_usuarios: perm.insert_usuarios,
      update_usuarios: perm.update_usuarios,
      delete_usuarios: perm.delete_usuarios,
      create_en_base: perm.create_en_base,
    },
    tablas_roble_encontradas: tablas.length,
  };
}

module.exports = { comprueba, cadena, describe };

if (require.main === module) {
  comprueba()
    .then(r => {
      // Se escribe en stdout, no en stderr: el fallo se comunica por el código
      // de salida. Así PowerShell no lo envuelve en un NativeCommandError.
      if (r.error) { console.log('ERROR: ' + r.error); process.exit(1); }
      console.log(`variable ......... ${r.variable}`);
      console.log(`host ............. ${r.host}`);
      console.log(`base ............. ${r.base}`);
      console.log(`usuario .......... ${r.usuario}`);
      console.log(`es Neon .......... ${r.es_neon ? 'si' : 'no'}`);
      console.log(`es base de ROBLE . ${r.es_base_roble ? 'si' : `NO (${r.tablas_roble_encontradas}/4 tablas)`}`);
      console.log(`solo lectura ..... ${r.solo_lectura ? 'si' : 'NO — tiene permiso de escritura'}`);
      if (!r.solo_lectura) {
        const p = Object.entries(r.permisos).filter(([, v]) => v).map(([k]) => k);
        console.log(`  permisos ....... ${p.join(', ')}`);
      }
      if (!r.es_base_roble) {
        console.log('\nEsta no es la base de ROBLE: la auditoría no serviría.');
        process.exit(1);
      }
      if (!r.solo_lectura) {
        console.log('\nAVISO: la cadena permite escribir. La auditoría solo lee, pero\n' +
                    'conviene usar una de solo lectura para este paso.');
      }
      console.log('\nConexión válida para auditar.');
    })
    .catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
}
