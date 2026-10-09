/* Credencial de la web nueva: rol de Postgres con privilegios mínimos, y su
 * cadena de conexión puesta en el proyecto Vercel roble-maquinaria.
 *
 * Por qué por SQL y no desde la consola de Neon: un rol creado en la consola
 * pertenece a neon_superuser, que puede leer y escribir TODAS las tablas. El
 * rol de la app solo debe LEER usuarios y sesiones (para resolver la sesión) y
 * escribir en las seis tablas de identidad. Nada más.
 *
 * La contraseña se genera aquí, se manda a Neon y a Vercel, y NO se imprime,
 * no se guarda en ningún archivo y no sale de este proceso. Si hace falta
 * rotarla, se vuelve a ejecutar con --rotar.
 *
 * Uso (con la cadena del propietario en ROBLE_DATABASE_URL):
 *   node scripts/credencial-app.mjs             crea el rol y pone la variable
 *   node scripts/credencial-app.mjs --rotar     nueva contraseña al rol existente
 *   node scripts/credencial-app.mjs --sin-vercel  solo Neon, no toca Vercel
 */

import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROL = 'roble_app';
const VARIABLE = 'ROBLE_DATABASE_URL';
const PROYECTO_VERCEL = 'roble-maquinaria';   // NUNCA maqdemad

/* usuarios: leer para resolver la sesión e insertar para dar de alta cuentas
   (el mismo alta que el sistema actual, sobre la misma tabla). Nunca
   actualizar ni borrar. */
const USUARIOS = 'usuarios';
/* productos: el directorio los lee en vivo (/api/datos.js) y el panel los
   crea, edita y borra. Que cada empresa solo toque los suyos lo decide la API
   con la membresía (WHERE user_id = empresa), no el rol de base de datos. */
const PRODUCTOS = 'productos';
const SOLO_LECTURA = [];
/* Columnas de la FICHA de empresa que el panel puede cambiar. Nunca email,
   rol, plan, stripe_* ni password_hash (esta última solo por recuperación). */
const FICHA = ['empresa', 'descripcion', 'descripcion_larga', 'sector', 'categorias', 'web',
               'telefono', 'ciudad', 'region', 'servicios', 'anio', 'empleados', 'ambito',
               'email_contacto', 'horario', 'direccion', 'linkedin', 'instagram', 'logo'];
/* sesiones: leer para resolver quién es, insertar al entrar y borrar al salir.
   Nunca actualizar. Es la misma tabla que usa el sistema actual: una sola
   fuente de verdad de sesiones. */
const SESIONES = 'sesiones';
/* recuperaciones: códigos de cambio de contraseña (hash, una hora, un uso),
   misma tabla que el sistema actual. Insertar al pedirlo y marcar como usado;
   nunca borrar. Y el ÚNICO UPDATE permitido en usuarios es la columna
   password_hash, para el cambio de contraseña. */
const RECUPERACIONES = 'recuperaciones';
/* solicitudes: los contactos que llegan a las empresas (misma tabla que el
   sistema actual). Se crean desde la web pública y el panel cambia su estado;
   nunca se borran. */
const SOLICITUDES = 'solicitudes';
const LECTURA_ESCRITURA = ['empresas', 'membresias', 'invitaciones',
                           'verificaciones_email', 'emails_verificados', 'auditoria',
                           'maquinas_guardadas'];

const rotar = process.argv.includes('--rotar');
const sinVercel = process.argv.includes('--sin-vercel');
/* --solo-privilegios: reaplica los GRANT al rol existente sin cambiar la
   contraseña ni tocar Vercel. Para cuando el rol necesita un permiso nuevo. */
const soloPrivilegios = process.argv.includes('--solo-privilegios');

const urlDueno = process.env[VARIABLE];
if (!urlDueno) { console.log(`ERROR: falta ${VARIABLE} (la cadena del propietario).`); process.exit(1); }
const u = new URL(urlDueno);
if (!/neon\.tech$/.test(u.hostname)) { console.log('ERROR: la cadena no es de Neon.'); process.exit(1); }

const sql = neon(urlDueno);

/* Contraseña: 32 caracteres de [A-Za-z0-9_-]. Son seguros dentro de una URL
   y dentro de una cadena SQL entre comillas simples, sin escapar nada. */
const contrasena = randomBytes(24).toString('base64url');

const [{ existe }] = await sql`SELECT COUNT(*)::int > 0 AS existe FROM pg_roles WHERE rolname = ${ROL}`;
if (soloPrivilegios && !existe) {
  console.log(`El rol ${ROL} no existe; --solo-privilegios necesita que exista.`);
  process.exit(1);
}
if (!soloPrivilegios) {
  if (existe && !rotar) {
    console.log(`El rol ${ROL} ya existe. Para cambiarle la contraseña: --rotar`);
    process.exit(1);
  }
  if (!existe && rotar) {
    console.log(`El rol ${ROL} no existe todavía; ejecútalo sin --rotar.`);
    process.exit(1);
  }
  // CREATE/ALTER ROLE no admiten parámetros: la contraseña va embebida, y por
  // eso se genera con un alfabeto que no necesita escape.
  if (rotar) {
    await sql.query(`ALTER ROLE ${ROL} WITH PASSWORD '${contrasena}'`);
    console.log(`Rol ${ROL}: contraseña rotada.`);
  } else {
    await sql.query(`CREATE ROLE ${ROL} WITH LOGIN PASSWORD '${contrasena}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    console.log(`Rol ${ROL}: creado.`);
  }
}

/* Privilegios. Se conceden siempre (también al rotar): así el script deja el
   rol exactamente como debe estar, aunque alguien haya tocado algo a mano. */
await sql.query(`GRANT USAGE ON SCHEMA public TO ${ROL}`);
if (SOLO_LECTURA.length) await sql.query(`GRANT SELECT ON ${SOLO_LECTURA.join(', ')} TO ${ROL}`);
await sql.query(`GRANT SELECT, INSERT ON ${USUARIOS} TO ${ROL}`);
await sql.query(`REVOKE UPDATE, DELETE ON ${USUARIOS} FROM ${ROL}`);
await sql.query(`GRANT USAGE, SELECT ON SEQUENCE usuarios_id_seq TO ${ROL}`);
await sql.query(`GRANT UPDATE (password_hash) ON ${USUARIOS} TO ${ROL}`);
await sql.query(`GRANT UPDATE (${FICHA.join(', ')}) ON ${USUARIOS} TO ${ROL}`);
await sql.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${PRODUCTOS} TO ${ROL}`);
await sql.query(`GRANT USAGE, SELECT ON SEQUENCE productos_id_seq TO ${ROL}`);
await sql.query(`GRANT SELECT, INSERT, UPDATE ON ${RECUPERACIONES} TO ${ROL}`);
await sql.query(`REVOKE DELETE ON ${RECUPERACIONES} FROM ${ROL}`);
await sql.query(`GRANT USAGE, SELECT ON SEQUENCE recuperaciones_id_seq TO ${ROL}`);
await sql.query(`GRANT SELECT, INSERT, UPDATE ON ${SOLICITUDES} TO ${ROL}`);
await sql.query(`REVOKE DELETE ON ${SOLICITUDES} FROM ${ROL}`);
await sql.query(`GRANT USAGE, SELECT ON SEQUENCE solicitudes_id_seq TO ${ROL}`);
await sql.query(`GRANT SELECT, INSERT, DELETE ON ${SESIONES} TO ${ROL}`);
await sql.query(`REVOKE UPDATE ON ${SESIONES} FROM ${ROL}`);
await sql.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${LECTURA_ESCRITURA.join(', ')} TO ${ROL}`);

// Secuencias de las tablas nuevas (los SERIAL) y la suelta de ids de empresa.
const secuencias = await sql`
  SELECT s.relname
  FROM pg_class s JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
  JOIN pg_class t ON t.oid = d.refobjid
  WHERE s.relkind = 'S' AND t.relname = ANY(${LECTURA_ESCRITURA})
  UNION ALL SELECT relname FROM pg_class WHERE relkind = 'S' AND relname = 'empresas_nuevas_seq'`;
for (const { relname } of secuencias) {
  // setval (siguienteIdEmpresa) necesita UPDATE sobre la secuencia.
  await sql.query(`GRANT USAGE, SELECT, UPDATE ON SEQUENCE ${relname} TO ${ROL}`);
}
console.log(`Privilegios concedidos sobre ${5 + LECTURA_ESCRITURA.length} tablas y ${secuencias.length + 4} secuencias.`);

/* Comprobación de mínimos. Con contraseña nueva se conecta COMO el rol; con
   --solo-privilegios no la hay, así que se pregunta POR el rol desde el
   propietario (has_table_privilege de tres argumentos). Mismo resultado. */
u.username = ROL;
u.password = contrasena;
const urlApp = u.toString();
const sqlChk = soloPrivilegios ? sql : neon(urlApp);

if (!soloPrivilegios) {
  const [quien] = await sqlChk`SELECT current_user AS usuario`;
  console.log(`\nConectado como: ${quien.usuario}`);
}
const matriz = await sqlChk`
  SELECT t AS tabla,
         has_table_privilege(${ROL}, t, 'SELECT') AS leer,
         has_table_privilege(${ROL}, t, 'INSERT') AS insertar,
         has_table_privilege(${ROL}, t, 'UPDATE') AS actualizar,
         has_table_privilege(${ROL}, t, 'DELETE') AS borrar
  FROM unnest(${[USUARIOS, SESIONES, RECUPERACIONES, PRODUCTOS, SOLICITUDES, ...LECTURA_ESCRITURA, ...SOLO_LECTURA, 'facturas', 'conversaciones']}::text[]) AS t`;
console.table(matriz);
// Los permisos de columna no aparecen en la matriz de tablas: se preguntan aparte.
const [col] = await sqlChk`
  SELECT has_column_privilege(${ROL}, 'usuarios', 'password_hash', 'UPDATE') AS password_hash,
         has_column_privilege(${ROL}, 'usuarios', 'empresa', 'UPDATE')       AS empresa,
         has_column_privilege(${ROL}, 'usuarios', 'web', 'UPDATE')           AS web,
         has_column_privilege(${ROL}, 'usuarios', 'email', 'UPDATE')         AS email,
         has_column_privilege(${ROL}, 'usuarios', 'rol', 'UPDATE')           AS rol,
         has_column_privilege(${ROL}, 'usuarios', 'plan', 'UPDATE')          AS plan,
         has_column_privilege(${ROL}, 'usuarios', 'stripe_customer', 'UPDATE') AS stripe`;
console.log(`usuarios, UPDATE por columna → password_hash: ${col.password_hash} | ficha (empresa, web): ${col.empresa}, ${col.web} | email: ${col.email} | rol: ${col.rol} | plan: ${col.plan} | stripe: ${col.stripe}`);

let fallos = 0;
for (const f of matriz) {
  const esNueva = LECTURA_ESCRITURA.includes(f.tabla);
  const esLectura = SOLO_LECTURA.includes(f.tabla);
  const esUsuarios = f.tabla === USUARIOS;
  const esSesiones = f.tabla === SESIONES;
  const esRecup = f.tabla === RECUPERACIONES;
  const esProductos = f.tabla === PRODUCTOS;
  const esSolic = f.tabla === SOLICITUDES;
  const escribe = f.insertar || f.actualizar || f.borrar;
  if (esProductos && !(f.leer && f.insertar && f.actualizar && f.borrar)) { fallos++; console.log(`FALLA: ${f.tabla} debería ser lectura y escritura completa`); }
  if (esSolic && !(f.leer && f.insertar && f.actualizar && !f.borrar)) { fallos++; console.log(`FALLA: ${f.tabla} debería ser leer/insertar/actualizar, nunca borrar`); }
  if (esNueva && !(f.leer && escribe)) { fallos++; console.log(`FALLA: ${f.tabla} debería ser lectura y escritura`); }
  if (esLectura && (!f.leer || escribe)) { fallos++; console.log(`FALLA: ${f.tabla} debería ser solo lectura`); }
  // En usuarios el UPDATE es solo de columna (password_hash): a nivel de tabla debe seguir en false.
  if (esUsuarios && !(f.leer && f.insertar && !f.actualizar && !f.borrar)) { fallos++; console.log(`FALLA: ${f.tabla} debería ser leer/insertar, nunca actualizar la tabla ni borrar`); }
  if (esSesiones && !(f.leer && f.insertar && f.borrar && !f.actualizar)) { fallos++; console.log(`FALLA: ${f.tabla} debería ser leer/insertar/borrar, nunca actualizar`); }
  if (esRecup && !(f.leer && f.insertar && f.actualizar && !f.borrar)) { fallos++; console.log(`FALLA: ${f.tabla} debería ser leer/insertar/actualizar, nunca borrar`); }
  if (!esNueva && !esLectura && !esUsuarios && !esSesiones && !esRecup && !esProductos && !esSolic && (f.leer || escribe)) { fallos++; console.log(`FALLA: ${f.tabla} no debería ser accesible`); }
}
if (!col.password_hash || !col.empresa || !col.web) { fallos++; console.log('FALLA: en usuarios deben poder actualizarse password_hash y las columnas de ficha'); }
if (col.email || col.rol || col.plan || col.stripe) { fallos++; console.log('FALLA: en usuarios NUNCA deben poder actualizarse email, rol, plan ni stripe_*'); }
if (fallos) { console.log(`\n${fallos} privilegios fuera de lo previsto. No se ha tocado Vercel.`); process.exit(1); }
console.log('Privilegios mínimos comprobados: lee y da de alta usuarios (cambia solo password_hash y la ficha), entra y sale en sesiones, gestiona recuperaciones y productos, escribe en identidad, nada más.');

if (soloPrivilegios) { console.log('\n--solo-privilegios: contraseña y Vercel sin tocar.'); process.exit(0); }
if (sinVercel) { console.log('\n--sin-vercel: la variable no se ha puesto en Vercel.'); process.exit(0); }

/* Vercel. Guardia dura: esta carpeta tiene que estar enlazada a
   roble-maquinaria. Sobre maqdemad no se usa la CLI jamás. */
const enlace = JSON.parse(readFileSync(join(RAIZ, '.vercel', 'project.json'), 'utf8'));
if (enlace.projectName !== PROYECTO_VERCEL) {
  console.log(`ERROR: la carpeta está enlazada a "${enlace.projectName}", no a ${PROYECTO_VERCEL}. No se toca.`);
  process.exit(1);
}

const vercel = (args, input) =>
  spawnSync('vercel', args, { cwd: RAIZ, shell: true, input, encoding: 'utf8' });

// Si ya existe, se quita primero; `env add` no sobreescribe.
vercel(['env', 'rm', VARIABLE, 'production', '-y']);
const r = vercel(['env', 'add', VARIABLE, 'production'], urlApp);
// La salida de la CLI no incluye el valor, pero se filtra igualmente por si acaso.
const limpia = s => (s || '').split('\n').filter(l => l.trim() && !l.includes(contrasena)).slice(-2).join('\n');
if (r.status !== 0) {
  console.log('\nERROR al poner la variable en Vercel:\n' + limpia(r.stderr) + limpia(r.stdout));
  process.exit(1);
}
console.log(`\n${VARIABLE} puesta en Vercel (${PROYECTO_VERCEL}, production).`);
console.log('Hace falta un despliegue nuevo para que las funciones la lean:  vercel deploy --prod');
