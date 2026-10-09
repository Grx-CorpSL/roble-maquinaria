/* Banco de pruebas de la capa de identidad: usuario → membresía → empresa → permisos.
 *
 * Corre contra un Postgres LOCAL, nunca contra producción. Crea su propio
 * esquema, lo llena, comprueba y lo borra al terminar.
 *
 * Lo que verifica es lo que no se puede comprobar leyendo el código: que un
 * usuario no alcance datos de una empresa que no es suya, que un rol no pueda
 * más de lo que le toca, y que revocar una membresía corte el acceso de verdad.
 *
 * Uso:  node scripts/qa-identidad.mjs            (usa SIMBAI_DATABASE_URL)
 */

import pkg from 'pg';
const { Client } = pkg;

const URL = process.env.QA_DATABASE_URL || process.env.SIMBAI_DATABASE_URL;
if (!URL) { console.log('ERROR: falta SIMBAI_DATABASE_URL'); process.exit(1); }

const ESQUEMA = 'roble_qa_ident';
const cli = new Client({ connectionString: URL });

let fallos = 0, pruebas = 0;
function comprueba(titulo, ok, detalle = '') {
  pruebas++;
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${titulo}${detalle ? '  → ' + detalle : ''}`);
}

const sql = (t, ...v) => cli.query(
  t.reduce((a, p, i) => a + p + (i < v.length ? `$${i + 1}` : ''), ''), v).then(r => r.rows);

/* ── Copias de la lógica real de _permisos.js, contra este esquema ───────────
   Se replican las consultas para poder ejecutarlas sobre Postgres normal: el
   módulo real usa el driver HTTP de Neon, que no habla con un Postgres local.
   Las consultas son las mismas; si divergen, esta prueba deja de valer. */
const PERMISOS = {
  propietario: ['empresa.ver','empresa.editar','empresa.borrar','maquinas.ver','maquinas.crear',
    'maquinas.editar','maquinas.borrar','productos.ver','productos.crear','productos.editar',
    'productos.borrar','contactos.ver','contactos.gestionar','miembros.ver','miembros.invitar',
    'miembros.cambiar_rol','miembros.quitar'],
  editor: ['empresa.ver','empresa.editar','maquinas.ver','maquinas.crear','maquinas.editar',
    'maquinas.borrar','productos.ver','productos.crear','productos.editar','productos.borrar',
    'contactos.ver','contactos.gestionar','miembros.ver'],
  lector: ['empresa.ver','maquinas.ver','productos.ver','contactos.ver','miembros.ver'],
};

async function membresia(userId, empresaId) {
  if (!userId || !empresaId) return null;
  const f = await sql`
    SELECT m.rol, m.estado, e.estado AS estado_empresa, e.nombre
    FROM membresias m JOIN empresas e ON e.id = m.empresa_id
    WHERE m.user_id = ${userId} AND m.empresa_id = ${Number(empresaId)}
      AND m.estado = 'activa'`;
  return f[0] || null;
}

async function puede(userId, empresaId, permiso) {
  const m = await membresia(userId, empresaId);
  if (!m) return false;
  if (m.estado_empresa === 'suspendida' || m.estado_empresa === 'rechazada') return permiso.endsWith('.ver');
  return (PERMISOS[m.rol] || []).includes(permiso);
}

async function empresasDe(userId) {
  if (!userId) return [];
  return sql`
    SELECT e.id, e.nombre, e.estado, m.rol FROM membresias m
    JOIN empresas e ON e.id = m.empresa_id
    WHERE m.user_id = ${userId} AND m.estado = 'activa' ORDER BY e.nombre`;
}

async function usuarioDeSesion(token) {
  if (!token) return null;
  const f = await sql`
    SELECT u.id, u.email, u.rol FROM sesiones s JOIN usuarios u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expira > now()`;
  return f[0] || null;
}

async function monta() {
  await cli.query(`DROP SCHEMA IF EXISTS ${ESQUEMA} CASCADE`);
  await cli.query(`CREATE SCHEMA ${ESQUEMA}`);
  await cli.query(`SET search_path = ${ESQUEMA}`);

  await cli.query(`
    CREATE TABLE usuarios (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('empresa','comprador')),
      empresa TEXT, creado TIMESTAMPTZ NOT NULL DEFAULT now(), eliminada TIMESTAMPTZ);
    CREATE TABLE sesiones (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      expira TIMESTAMPTZ NOT NULL);
    CREATE TABLE empresas (
      id INTEGER PRIMARY KEY, nombre TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa'
        CHECK (estado IN ('borrador','pendiente','activa','rechazada','suspendida')),
      origen TEXT NOT NULL DEFAULT 'legacy' CHECK (origen IN ('legacy','alta','panel')),
      creada TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE membresias (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      rol TEXT NOT NULL DEFAULT 'editor' CHECK (rol IN ('propietario','editor','lector')),
      estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','suspendida')),
      UNIQUE (user_id, empresa_id));
    CREATE TABLE productos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, titulo TEXT NOT NULL);`);

  // 1 Ana propietaria de Alfa · 2 Beto propietario de Beta · 3 Caro en las dos
  // 4 Dani comprador sin empresa · 5 Eva eliminada · 6 Fran membresía revocada
  await cli.query(`
    INSERT INTO usuarios (id,email,password_hash,nombre,rol,empresa,eliminada) VALUES
      (1,'ana@x.es','h','Ana','empresa','Alfa',NULL),
      (2,'beto@x.es','h','Beto','empresa','Beta',NULL),
      (3,'caro@x.es','h','Caro','empresa','Gamma',NULL),
      (4,'dani@x.es','h','Dani','comprador',NULL,NULL),
      (5,'eva@x.es','h','Eva','empresa','Borrada',now()),
      (6,'fran@x.es','h','Fran','empresa','Delta',NULL);
    INSERT INTO empresas (id,nombre,estado) VALUES
      (1,'Alfa','activa'),(2,'Beta','activa'),(3,'Gamma','activa'),
      (5,'Borrada','activa'),(6,'Delta','suspendida');
    INSERT INTO membresias (user_id,empresa_id,rol,estado) VALUES
      (1,1,'propietario','activa'),
      (2,2,'propietario','activa'),
      (3,3,'propietario','activa'),
      (3,1,'lector','activa'),          -- Caro tambien lee Alfa: dos empresas
      (1,2,'editor','suspendida'),      -- membresia revocada
      (6,6,'propietario','activa');     -- empresa suspendida
    INSERT INTO sesiones (token,user_id,expira) VALUES
      ('t-ana',1,now()+interval '7 days'),
      ('t-dani',4,now()+interval '7 days'),
      ('t-vieja',2,now()-interval '1 day');
    INSERT INTO productos (user_id,titulo) VALUES (1,'Sierra de Alfa'),(2,'Torno de Beta');`);
}

/* Las consultas de aquí son copias de las de api/_permisos.js. Si el módulo real
   cambia y esta copia no, la suite seguiría en verde probando código viejo. Esta
   comprobación lo impide: compara ambas y falla si dejan de coincidir. */
async function consultasAlDia() {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const norm = s => s.replace(/\$\{[^}]*\}/g, '?').replace(/\s+/g, ' ').trim().toLowerCase();
  const saca = t => [...t.matchAll(/`\s*(SELECT[\s\S]*?)`/gi)].map(m => norm(m[1]));

  const real = saca(readFileSync(join(raiz, 'api/_permisos.js'), 'utf8'));
  const aqui = saca(readFileSync(fileURLToPath(import.meta.url), 'utf8'));
  const perdidas = real.filter(c => !aqui.includes(c));

  console.log('\nFIDELIDAD DE LA PRUEBA');
  comprueba('las consultas replican a api/_permisos.js', perdidas.length === 0,
    perdidas.length ? `${perdidas.length} divergen: ${perdidas[0].slice(0, 60)}…` : '');
}

async function main() {
  await cli.connect();
  await monta();
  await cli.query(`SET search_path = ${ESQUEMA}`);

  console.log('\nSESIONES');
  comprueba('sesión válida resuelve al usuario', (await usuarioDeSesion('t-ana'))?.id === 1);
  comprueba('sesión caducada NO vale', (await usuarioDeSesion('t-vieja')) === null);
  comprueba('token inventado NO vale', (await usuarioDeSesion('t-inventado')) === null);
  comprueba('sin token NO vale', (await usuarioDeSesion(null)) === null);

  console.log('\nUSUARIO → EMPRESAS');
  comprueba('usuario sin empresa: lista vacía', (await empresasDe(4)).length === 0);
  comprueba('usuario con una empresa', (await empresasDe(2)).length === 1);
  comprueba('usuario con dos empresas', (await empresasDe(3)).length === 2);
  comprueba('membresía revocada no aparece',
    !(await empresasDe(1)).some(e => e.id === 2), 'Ana no debe ver Beta');

  console.log('\nAISLAMIENTO ENTRE EMPRESAS (IDOR)');
  comprueba('Ana NO accede a Beta', !(await puede(1, 2, 'empresa.ver')));
  comprueba('Ana NO edita Beta', !(await puede(1, 2, 'empresa.editar')));
  comprueba('Beto NO accede a Alfa', !(await puede(2, 1, 'empresa.ver')));
  comprueba('comprador sin membresía no accede a nada', !(await puede(4, 1, 'empresa.ver')));
  comprueba('empresa inexistente no da acceso', !(await puede(1, 999, 'empresa.ver')));
  comprueba('usuario inexistente no da acceso', !(await puede(999, 1, 'empresa.ver')));

  console.log('\nROLES');
  comprueba('propietario edita su empresa', await puede(1, 1, 'empresa.editar'));
  comprueba('propietario invita', await puede(1, 1, 'miembros.invitar'));
  comprueba('lector ve', await puede(3, 1, 'empresa.ver'));
  comprueba('lector NO edita', !(await puede(3, 1, 'empresa.editar')));
  comprueba('lector NO invita', !(await puede(3, 1, 'miembros.invitar')));
  comprueba('lector NO borra máquinas', !(await puede(3, 1, 'maquinas.borrar')));

  console.log('\nESTADOS');
  comprueba('empresa suspendida: solo lectura', await puede(6, 6, 'empresa.ver'));
  comprueba('empresa suspendida NO deja editar', !(await puede(6, 6, 'empresa.editar')));
  comprueba('empresa suspendida NO deja crear', !(await puede(6, 6, 'maquinas.crear')));

  console.log('\nBORRADOS Y CASCADAS');
  const antes = (await sql`SELECT COUNT(*)::int n FROM membresias WHERE user_id = 1`)[0].n;
  await sql`DELETE FROM usuarios WHERE id = 1`;
  const despues = (await sql`SELECT COUNT(*)::int n FROM membresias WHERE user_id = 1`)[0].n;
  comprueba('borrar usuario arrastra sus membresías', antes > 0 && despues === 0);
  const hf = (await sql`SELECT COUNT(*)::int n FROM membresias m
    WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = m.user_id)`)[0].n;
  comprueba('no quedan membresías huérfanas', hf === 0);

  await sql`DELETE FROM empresas WHERE id = 2`;
  const he = (await sql`SELECT COUNT(*)::int n FROM membresias m
    WHERE NOT EXISTS (SELECT 1 FROM empresas e WHERE e.id = m.empresa_id)`)[0].n;
  comprueba('borrar empresa arrastra sus membresías', he === 0);

  console.log('\nINTEGRIDAD DEL MODELO');
  let dup = false;
  try {
    await sql`INSERT INTO membresias (user_id,empresa_id,rol) VALUES (3,3,'editor')`;
  } catch { dup = true; }
  comprueba('no se puede duplicar una membresía', dup);

  let rolMalo = false;
  try {
    await sql`INSERT INTO membresias (user_id,empresa_id,rol) VALUES (4,3,'admin')`;
  } catch { rolMalo = true; }
  comprueba('un rol inventado se rechaza', rolMalo);

  let fkMala = false;
  try {
    await sql`INSERT INTO membresias (user_id,empresa_id,rol) VALUES (999,3,'editor')`;
  } catch { fkMala = true; }
  comprueba('no se puede crear membresía de un usuario inexistente', fkMala);

  await consultasAlDia();

  await cli.query(`DROP SCHEMA ${ESQUEMA} CASCADE`);
  await cli.end();

  console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones correctas.`);
  if (fallos) { console.log(`${fallos} FALLOS`); process.exit(1); }
}

main().catch(async e => {
  console.log('ERROR: ' + e.message);
  try { await cli.query(`DROP SCHEMA IF EXISTS ${ESQUEMA} CASCADE`); await cli.end(); } catch {}
  process.exit(1);
});
