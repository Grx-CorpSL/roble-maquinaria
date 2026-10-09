/* Esquema de la nueva capa de identidad de ROBLE.
 *
 * Reglas que cumple este archivo, sin excepción:
 *   · Solo CREATE TABLE IF NOT EXISTS y CREATE INDEX sobre tablas NUEVAS.
 *   · No toca ninguna tabla del sistema legacy (usuarios, sesiones, productos…).
 *   · No inserta, no actualiza y no borra datos existentes.
 *   · Las empresas conservan el id de la cuenta que las originó: nunca se renumera.
 *
 * El poblado inicial vive en _migracion.js y se ejecuta aparte, a mano.
 * Plan completo: roble-ml/docs/identidad.md
 */

const { neon } = require('@neondatabase/serverless');
const { cadena, describe } = require('./_conexion');

let cache = null;
/* La cadena se elige con la misma regla que la auditoría: primero
   ROBLE_DATABASE_URL, y solo si no está, cualquier *_DATABASE_URL. En este
   equipo existe también SIMBAI_DATABASE_URL (la base local de otros
   proyectos); coger "la primera que aparezca" no es aceptable para un
   script que escribe. Y se exige que sea Neon: la de ROBLE lo es. */
function db() {
  if (cache) return cache;
  const c = cadena();
  if (!c) throw new Error('Sin cadena de conexión a la base de datos (ROBLE_DATABASE_URL).');
  const info = describe(c.url);
  if (!info || !info.neon) {
    throw new Error(`La variable ${c.nombre} no apunta a Neon; la base de ROBLE está en Neon.`);
  }
  cache = neon(c.url);
  return cache;
}

/* Margen sobre el mayor id de usuarios para las empresas creadas desde la web
   nueva: así nunca chocan con una cuenta legacy creada mientras tanto. */
const MARGEN_IDS = 1000;

let listo = false;

/* El esquema NUNCA se crea solo desde una petición web. init() solo comprueba
   que las tablas existan; crearlas es una operación manual y deliberada.
 *
 * Antes init() ejecutaba los CREATE TABLE, y como /api/auth es público y lo
 * llamaba, cualquier visita anónima habría creado las seis tablas en producción
 * en cuanto hubiera conexión: sin auditoría previa, sin backup y sin que nadie
 * lo decidiera. El esquema se crea con: node api/_esquema.js --crear */
async function init() {
  if (listo) return;
  const sql = db();
  const faltan = await tablasQueFaltan();
  if (faltan.length) {
    throw new Error(
      `Faltan tablas de identidad: ${faltan.join(', ')}. ` +
      'Se crean a mano con: node api/_esquema.js --crear');
  }
  listo = true;
}

const TABLAS = ['empresas', 'membresias', 'invitaciones', 'verificaciones_email',
                'emails_verificados', 'auditoria', 'maquinas_guardadas'];

async function tablasQueFaltan() {
  const filas = await db()`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${TABLAS})`;
  const hay = new Set(filas.map(f => f.table_name));
  return TABLAS.filter(t => !hay.has(t));
}

/* Crea el esquema. Solo se ejecuta a mano, nunca desde una petición web. */
async function creaEsquema() {
  const sql = db();

  await sql`
    CREATE TABLE IF NOT EXISTS empresas (
      id           INTEGER PRIMARY KEY,
      nombre       TEXT NOT NULL,
      estado       TEXT NOT NULL DEFAULT 'activa'
                   CHECK (estado IN ('borrador','pendiente','activa','rechazada','suspendida')),
      motivo       TEXT,
      origen       TEXT NOT NULL DEFAULT 'legacy'
                   CHECK (origen IN ('legacy','alta','panel')),
      revisada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      revisada_en  TIMESTAMPTZ,
      creada       TIMESTAMPTZ NOT NULL DEFAULT now(),
      actualizada  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_empresas_estado ON empresas(estado)`;

  /* Secuencia propia para las empresas que nazcan en la web nueva. No se usa
     al migrar: allí el id se copia de usuarios. */
  await sql`CREATE SEQUENCE IF NOT EXISTS empresas_nuevas_seq`;

  await sql`
    CREATE TABLE IF NOT EXISTS membresias (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      rol        TEXT NOT NULL DEFAULT 'editor'
                 CHECK (rol IN ('propietario','editor','lector')),
      estado     TEXT NOT NULL DEFAULT 'activa'
                 CHECK (estado IN ('activa','suspendida')),
      creada     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, empresa_id)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_membresias_user ON membresias(user_id) WHERE estado = 'activa'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_membresias_empresa ON membresias(empresa_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS invitaciones (
      id           SERIAL PRIMARY KEY,
      empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      email        TEXT NOT NULL,
      rol          TEXT NOT NULL DEFAULT 'editor'
                   CHECK (rol IN ('propietario','editor','lector')),
      token_hash   TEXT NOT NULL UNIQUE,
      estado       TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','aceptada','caducada','revocada')),
      invitada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      expira       TIMESTAMPTZ NOT NULL,
      aceptada_en  TIMESTAMPTZ,
      creada       TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invit_empresa ON invitaciones(empresa_id, estado)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invit_email ON invitaciones(LOWER(email))`;

  await sql`
    CREATE TABLE IF NOT EXISTS verificaciones_email (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expira     TIMESTAMPTZ NOT NULL,
      usada      TIMESTAMPTZ,
      creada     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_verif_user ON verificaciones_email(user_id)`;

  /* Sustituye a la columna usuarios.email_verificado: una fila por cuenta
     verificada. Evita tocar la tabla legacy. */
  await sql`
    CREATE TABLE IF NOT EXISTS emails_verificados (
      user_id     INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      verificado  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS auditoria (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL,
      accion     TEXT NOT NULL,
      entidad    TEXT,
      entidad_id INTEGER,
      datos      JSONB,
      ip         TEXT,
      creada     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_creada ON auditoria(creada DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_empresa ON auditoria(empresa_id, creada DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_user ON auditoria(user_id, creada DESC)`;

  /* Máquinas guardadas por un comprador con cuenta. Tabla propia y no la
     `favoritos` del sistema actual: aquella guarda EMPRESAS (su empresa_id
     apunta a usuarios) y un anuncio es un producto. Si se borra el producto
     o la cuenta, la fila se va con ellos. */
  await sql`
    CREATE TABLE IF NOT EXISTS maquinas_guardadas (
      user_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      creada      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, producto_id)
    )`;

  listo = true;
  return TABLAS;
}

/* Registro de auditoría. Nunca guarda contraseñas, tokens ni cookies: solo el
   hecho y sus identificadores. Si falla, no interrumpe la acción principal. */
async function registra({ user_id, empresa_id, accion, entidad, entidad_id, datos, ip }) {
  try {
    await init();
    await db()`
      INSERT INTO auditoria (user_id, empresa_id, accion, entidad, entidad_id, datos, ip)
      VALUES (${user_id || null}, ${empresa_id || null}, ${accion},
              ${entidad || null}, ${entidad_id || null},
              ${datos ? JSON.stringify(datos) : null}, ${ip || null})`;
  } catch (e) {
    console.error(JSON.stringify({ evt: 'auditoria_error', accion, msg: e.message }));
  }
}

/* La columna usuarios.eliminada (borrado lógico) la usa producción pero NO la
   crea ningún archivo del repositorio: se añadió directamente en la base de
   datos. Como de ella depende no migrar cuentas borradas, se comprueba antes
   de auditar o migrar en vez de darla por supuesta. */
async function compruebaEliminada() {
  const filas = await db()`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'eliminada'`;
  if (!filas.length) {
    throw new Error(
      'La tabla usuarios no tiene la columna "eliminada". Sin ella no se puede ' +
      'distinguir una cuenta borrada de una activa y se migrarían cuentas dadas ' +
      'de baja. Revisa la base de datos antes de continuar.');
  }
  return true;
}

async function siguienteIdEmpresa() {
  const sql = db();
  const [r] = await sql`
    SELECT GREATEST(
      (SELECT COALESCE(MAX(id), 0) FROM usuarios),
      (SELECT COALESCE(MAX(id), 0) FROM empresas),
      (SELECT last_value FROM empresas_nuevas_seq)
    ) + 1 AS siguiente`;
  const id = Number(r.siguiente) + MARGEN_IDS;
  await sql`SELECT setval('empresas_nuevas_seq', ${id}, true)`;
  return id;
}

module.exports = { db, init, creaEsquema, tablasQueFaltan, registra, siguienteIdEmpresa,
                   compruebaEliminada, TABLAS, MARGEN_IDS };

/* Creación manual del esquema. Es la única vía: ninguna petición web lo hace.
     node api/_esquema.js           dice qué tablas faltan, sin tocar nada
     node api/_esquema.js --crear   las crea */
if (require.main === module) {
  const crear = process.argv.includes('--crear');
  (async () => {
    const faltan = await tablasQueFaltan();
    if (!faltan.length) { console.log(`Las ${TABLAS.length} tablas de identidad ya existen.`); return; }
    console.log('Faltan:', faltan.join(', '));
    if (!crear) { console.log('\nNo se ha creado nada. Para crearlas: --crear'); return; }
    await creaEsquema();
    console.log('\nCreadas. Ninguna tabla existente ha sido modificada.');
  })().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
}
