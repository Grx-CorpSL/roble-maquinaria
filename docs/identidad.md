# ROBLE — identidad: auditoría, modelo propuesto y plan de migración

Fase 1 del ecosistema: pasar de `usuario = empresa` a `usuario ← membresía → empresa`, sin romper
nada de lo que hoy funciona en producción.

**Estado: propuesta. No se ha ejecutado ninguna migración ni se ha tocado la base de datos.**

Auditoría hecha sobre el código real de `Proyectos/api/` (1.626 líneas de identidad) el 2026-09-22.

---

# A. Arquitectura actual

## A.1. Lo que ya existe y funciona

El prompt de partida daba por hecho que había que construir la identidad desde cero. **No es así.**
Producción tiene un sistema de identidad completo y en uso:

| Pieza | Dónde | Estado |
|---|---|---|
| Registro, acceso, cierre de sesión | `registro.js`, `login.js`, `logout.js` | Funciona |
| Contraseñas con bcrypt (coste configurable) | `_auth.js` | Funciona |
| Sesiones en base de datos, con caducidad | tabla `sesiones` | Funciona |
| Cookie `HttpOnly` + `Secure` + `SameSite=Lax` | `cookieSesion()` | Funciona |
| Recuperación de contraseña con código de un solo uso | `password.js`, tabla `recuperaciones` | Funciona |
| Cambio de contraseña y cierre del resto de sesiones | `cambiaPassword()`, `cierraOtrasSesiones()` | Funciona |
| Correo transaccional (Resend) | `_correo.js` | Funciona |

**Conclusión: no se reescribe nada de esto.** La identidad existente sigue siendo la fuente de
verdad. Lo que falta se añade alrededor.

## A.2. El modelo de datos real

Base de datos PostgreSQL (Neon). Trece tablas. La tabla `usuarios` hace **tres papeles a la vez**:

```
usuarios  ←── cuenta de acceso  (email, password_hash, rol, sesiones)
          ←── ficha de empresa  (empresa, sector, ciudad, logo, fotos, descripción…)
          ←── suscripción       (plan, stripe_customer, stripe_subscription, plan_hasta)
```

Columnas de `usuarios`: `id`, `email`, `password_hash`, `nombre`, `rol`, `empresa`, `creado`,
`ultimo_acceso`, más 24 columnas añadidas después para la ficha pública, las visitas y el plan.

`rol` solo admite dos valores: `empresa` o `comprador`. No hay más granularidad.

`empresa` es **el nombre comercial en texto**, no una referencia. Puede ser nulo.

Hay una columna `eliminada` usada como borrado lógico: las consultas públicas filtran
`eliminada IS NULL`.

## A.3. Quién depende de `usuarios`

Ocho tablas apuntan a `usuarios(id)`, y aquí está el riesgo real de la migración: **el mismo `id`
significa cosas distintas según la columna.**

| Tabla | Columna | Qué significa el id | Al separar empresa |
|---|---|---|---|
| `sesiones` | `user_id` | **Persona** | Se queda en usuario |
| `recuperaciones` | `user_id` | **Persona** | Se queda en usuario |
| `facturas` | `user_id` | **Empresa** (quien paga) | Pasa a empresa |
| `publicaciones` | `user_id` | **Empresa** (autora) | Pasa a empresa |
| `productos` | `user_id` | **Empresa** (dueña) | Pasa a empresa |
| `favoritos` | `usuario_id` | **Persona** (quien guarda) | Se queda en usuario |
| `favoritos` | `empresa_id` | **Empresa** (la guardada) | Pasa a empresa |
| `resenas` | `empresa_id` | **Empresa** (reseñada) | Pasa a empresa |
| `resenas` | `autor_id` | **Persona** (quien escribe) | Se queda en usuario |
| `conversaciones` | `comprador_id` | **Persona** | Se queda en usuario |
| `conversaciones` | `empresa_id` | **Empresa** | Pasa a empresa |
| `solicitudes` | `destino_id` | **Empresa** (sin clave foránea) | Pasa a empresa |

`mensajes` cuelga de `conversaciones`, no de `usuarios`: no le afecta.

**Un dato crítico:** `favoritos`, `resenas` y `conversaciones` tienen columnas que apuntan a la misma
tabla con significados opuestos (persona y empresa). Una migración que renumere ids rompería estas
tres tablas de forma silenciosa. Es la razón principal para **no renumerar nada**.

## A.4. Cómo nace hoy una empresa

Dos caminos, y los dos crean una fila en `usuarios`:

1. **Registro propio** (`crearUsuario`): la persona elige email, contraseña y nombre de empresa.
2. **Alta captada** (`crearUsuarioProvisional`): el admin acepta una solicitud, se crea la cuenta con
   contraseña provisional y se envía por correo. Si la persona ya existía como comprador, la cuenta
   se **promueve** a empresa.

De las 154 empresas, 130 tienen correo generado del tipo `@directorio.roble.es`, que no son buzones
reales: son fichas de directorio, no cuentas usables. Esto importa para la migración y para la
verificación de correo.

## A.5. Autorización actual

No hay sistema de permisos. Hay dos comprobaciones:

- **Dueño del dato:** cada función recibe `userId` y filtra por él (`WHERE user_id = ${userId}`). Es
  correcto, pero solo contempla «una persona, sus cosas».
- **Administración:** una clave compartida en la query (`?clave=SOLICITUDES_KEY`). No hay usuario
  administrador como tal.

## A.6. La web nueva

`roble-ml/` **no llama a ninguna API**. Trabaja con una instantánea de datos en archivos y guarda los
cambios en cinco almacenes del navegador. Es un prototipo completo y funcional, pero sin servidor.

---

# B. Arquitectura propuesta

## B.1. Principio rector

> La tabla `usuarios` **no se toca**. Ni se renumera, ni se parte, ni se le quitan columnas.

Todo lo nuevo son **tablas añadidas** que conviven con las actuales. El sistema legacy sigue
funcionando exactamente igual el día 1 y el día 100.

## B.2. La idea: `empresas` con el mismo id

La clave de que esto sea seguro y reversible:

```
usuarios.id = 173  (Airmatic Madera)
                ↓  mismo número, sin renumerar
empresas.id  = 173  (Airmatic Madera)
```

La nueva tabla `empresas` se crea **copiando el id de la cuenta de empresa que le dio origen**. Así:

- `productos.user_id = 173` sigue siendo válido y ahora también apunta a `empresas.id = 173`.
- `resenas.empresa_id = 173` idem. `conversaciones.empresa_id = 173` idem.
- **Ninguna tabla existente necesita cambiar ni un dato.**

La ambigüedad de A.3 se resuelve sola: las columnas que significan «persona» siguen apuntando a
`usuarios`, y las que significan «empresa» pasan a poder interpretarse como `empresas`, con el mismo
número. No hay renumeración, así que no hay riesgo de cruce.

## B.3. Modelo objetivo

```
usuarios (legacy, intacta)          empresas (nueva)
   │  identidad + ficha + plan         │  ficha canónica
   │                                   │
   ├── sesiones (legacy)               ├── productos    (por user_id = empresa.id)
   ├── recuperaciones (legacy)         ├── resenas      (empresa_id)
   │                                   ├── conversaciones (empresa_id)
   └── membresias ────────────────────►├── facturas     (user_id = empresa.id)
          rol + estado                 └── solicitudes  (destino_id)
```

Durante la convivencia, la ficha vive en `usuarios` y `empresas` guarda solo lo que la tabla vieja no
puede: estado de moderación, quién la aprobó y cuándo. La ficha se migra en una fase posterior, ya
con el sistema nuevo rodado.

## B.4. Aislamiento entre sistemas

| | Legacy | Nuevo |
|---|---|---|
| Código | `Proyectos/api/` | `roble-ml/api/` |
| Tablas | 13 actuales | 5 nuevas, con prefijo claro |
| Despliegue | proyecto `maqdemad` | proyecto `roble-maquinaria` |
| Escribe en tablas legacy | sí | **no, salvo lo indicado en E** |

La API nueva **lee** `usuarios` y `sesiones` (identidad compartida, sin duplicar contraseñas) y
**escribe** solo en sus tablas. Es la regla que garantiza que producción no se pueda romper.

---

# C. Esquema de tablas nuevas

Cinco tablas. Nombres en español, como el resto del esquema.

## C.1. `empresas`

```sql
CREATE TABLE IF NOT EXISTS empresas (
  id            INTEGER PRIMARY KEY,          -- mismo id que usuarios (sin SERIAL: se asigna)
  nombre        TEXT NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'activa'
                CHECK (estado IN ('borrador','pendiente','activa','rechazada','suspendida')),
  motivo        TEXT,                          -- por qué se rechazó o suspendió
  origen        TEXT NOT NULL DEFAULT 'legacy' -- legacy | alta | panel
                CHECK (origen IN ('legacy','alta','panel')),
  revisada_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  revisada_en   TIMESTAMPTZ,
  creada        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empresas_estado ON empresas(estado);
```

`id` **no es `SERIAL` a propósito**: para las empresas migradas se copia el id de `usuarios`. Para las
nuevas se usa una secuencia que arranca por encima del máximo actual, de modo que nunca choque.

## C.2. `membresias`

El corazón del cambio: rompe `1 usuario = 1 empresa`.

```sql
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
);
CREATE INDEX IF NOT EXISTS idx_membresias_user ON membresias(user_id);
CREATE INDEX IF NOT EXISTS idx_membresias_empresa ON membresias(empresa_id);
```

**Regla de negocio:** toda empresa debe tener al menos un `propietario`. Se comprueba en la API antes
de borrar o degradar una membresía; no como restricción de base de datos, porque impediría crear la
primera fila.

## C.3. `invitaciones`

```sql
CREATE TABLE IF NOT EXISTS invitaciones (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  rol         TEXT NOT NULL DEFAULT 'editor'
              CHECK (rol IN ('propietario','editor','lector')),
  token_hash  TEXT NOT NULL UNIQUE,      -- se guarda el hash, nunca el token
  estado      TEXT NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente','aceptada','caducada','revocada')),
  invitada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  expira      TIMESTAMPTZ NOT NULL,
  aceptada_en TIMESTAMPTZ,
  creada      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invit_empresa ON invitaciones(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_invit_email ON invitaciones(lower(email));
```

El token viaja por correo; en la base de datos solo queda su hash. Uso único: al aceptarla pasa a
`aceptada` y se comprueba `expira > now()`.

## C.4. `verificaciones_email`

```sql
CREATE TABLE IF NOT EXISTS verificaciones_email (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira     TIMESTAMPTZ NOT NULL,
  usada      TIMESTAMPTZ,
  creada     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verif_user ON verificaciones_email(user_id);
```

## C.5. `auditoria`

```sql
CREATE TABLE IF NOT EXISTS auditoria (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL,
  accion     TEXT NOT NULL,        -- login, empresa.aprobar, membresia.rol…
  entidad    TEXT,                 -- empresa, producto, anuncio…
  entidad_id INTEGER,
  datos      JSONB,                -- antes/después, sin datos sensibles
  ip         TEXT,
  creada     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_creada ON auditoria(creada DESC);
CREATE INDEX IF NOT EXISTS idx_audit_empresa ON auditoria(empresa_id, creada DESC);
```

Nunca se guarda contraseña, token ni cookie. Solo el hecho y sus identificadores.

## C.6. Una columna en `usuarios` (única excepción)

```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado TIMESTAMPTZ;
```

Es aditiva, opcional y con valor nulo por defecto. **Ningún código legacy la lee**, así que no puede
alterar su comportamiento. Se comprueba antes de aplicarla (ver G.3).

---

# D. Relaciones

```
usuarios ──1:N── membresias ──N:1── empresas
   │                                   │
   │ (persona)                         │ (empresa, mismo id que su cuenta legacy)
   ├── sesiones            legacy      ├── productos        legacy (user_id)
   ├── recuperaciones      legacy      ├── resenas          legacy (empresa_id)
   ├── verificaciones_email  nueva     ├── conversaciones   legacy (empresa_id)
   ├── favoritos.usuario_id legacy     ├── favoritos.empresa_id legacy
   ├── resenas.autor_id    legacy      ├── facturas         legacy (user_id)
   └── auditoria.user_id     nueva     ├── solicitudes.destino_id legacy
                                       ├── invitaciones       nueva
                                       └── auditoria.empresa_id nueva
```

Cardinalidades del modelo objetivo:

- Un usuario puede pertenecer a **varias** empresas (`membresias`).
- Una empresa puede tener **varios** usuarios, con roles distintos.
- Una empresa tiene **al menos un** propietario (regla de API).
- Una invitación pertenece a **una** empresa y lleva **un** rol.

---

# E. Plan de migración

Tres pasos. Los dos primeros son reversibles y no tocan datos existentes.

## E.1. Paso 1 — crear tablas (sin riesgo)

Ejecuta los `CREATE TABLE IF NOT EXISTS` de C.1 a C.5. No modifica ninguna fila existente. Si algo
falla, se borran las tablas nuevas y todo queda como estaba.

## E.2. Paso 2 — poblar `empresas` y `membresias` (aditivo)

Para cada cuenta con `rol = 'empresa'` y `eliminada IS NULL`:

```sql
INSERT INTO empresas (id, nombre, estado, origen, creada)
SELECT u.id,
       COALESCE(NULLIF(TRIM(u.empresa), ''), u.nombre),
       'activa',
       'legacy',
       u.creado
FROM usuarios u
WHERE u.rol = 'empresa' AND u.eliminada IS NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO membresias (user_id, empresa_id, rol, estado)
SELECT u.id, u.id, 'propietario', 'activa'
FROM usuarios u
WHERE u.rol = 'empresa' AND u.eliminada IS NULL
ON CONFLICT (user_id, empresa_id) DO NOTHING;
```

Solo **inserta** en tablas nuevas. No hay `UPDATE` ni `DELETE` sobre nada existente. `ON CONFLICT DO
NOTHING` lo hace repetible sin efectos.

Después, ajustar la secuencia de ids nuevos para que no choque:

```sql
SELECT setval('empresas_id_seq', (SELECT COALESCE(MAX(id), 0) + 1000 FROM usuarios), false);
```

El margen de 1.000 evita colisiones con cuentas legacy creadas mientras tanto.

## E.3. Paso 3 — migrar la ficha (más adelante, no ahora)

Copiar sector, ciudad, web, descripción y logo de `usuarios` a `empresas`, y que la web lea de ahí.
**No se hace en esta fase.** Requiere que la web nueva ya funcione contra la API y que el legacy haya
dejado de escribir esas columnas. Se planificará aparte.

## E.4. Casos ambiguos detectados

| Caso | Cuántos | Tratamiento |
|---|---|---|
| Cuentas con `empresa` nulo o vacío | por contar | Se usa `nombre` como nombre de empresa. No se descarta ninguna |
| Correos generados `@directorio.roble.es` | ~130 | Se migran igual. Quedan como empresa **sin verificar**: son fichas, no cuentas usables |
| Nombres de empresa duplicados | por contar | **Se permiten.** El nombre no es clave; el id sí. Dos empresas pueden llamarse igual |
| Cuentas `rol = 'comprador'` | por contar | **No** generan empresa. Solo son personas |
| Cuentas con `eliminada` no nula | por contar | **No** se migran. Se respeta el borrado lógico |
| Cuenta promovida de comprador a empresa | posible | Ya tiene `rol = 'empresa'`: se migra como cualquier otra |
| Empresa con productos pero cuenta borrada | posible | Los productos quedan huérfanos, como hoy. El diagnóstico de producción ya los detecta |

**Los recuentos exactos se obtienen con la consulta de lectura de F.4 antes de ejecutar nada.**

---

# F. Plan de rollback

## F.1. Copia de seguridad previa (obligatoria)

Antes del paso 2, y aunque sea aditivo:

```bash
pg_dump "$DATABASE_URL" -t usuarios -t sesiones --data-only --column-inserts > backup-usuarios-AAAAMMDD.sql
pg_dump "$DATABASE_URL" --schema-only > backup-esquema-AAAAMMDD.sql
```

La copia se guarda fuera del repositorio. Neon además permite restaurar a un punto en el tiempo.

## F.2. Deshacer el paso 1 y 2

```sql
DROP TABLE IF EXISTS auditoria, invitaciones, verificaciones_email, membresias, empresas CASCADE;
ALTER TABLE usuarios DROP COLUMN IF EXISTS email_verificado;
```

Como nada legacy depende de estas tablas, borrarlas devuelve el sistema al estado exacto anterior.
El `CASCADE` solo afecta a claves foráneas **entre tablas nuevas**.

## F.3. Deshacer solo los datos

```sql
DELETE FROM membresias;
DELETE FROM empresas WHERE origen = 'legacy';
```

Deja las tablas vacías y listas para repoblar, sin tocar el esquema.

## F.4. Comprobación previa y posterior

Antes de migrar, contar (solo lectura):

```sql
SELECT rol, eliminada IS NULL AS viva, COUNT(*),
       COUNT(*) FILTER (WHERE empresa IS NULL OR TRIM(empresa) = '') AS sin_nombre,
       COUNT(*) FILTER (WHERE email LIKE '%@directorio.roble.es') AS correo_generado
FROM usuarios GROUP BY 1, 2;
```

Después de migrar, debe cumplirse:

```sql
-- filas en empresas = cuentas de empresa vivas
-- filas en membresias = filas en empresas
-- toda empresa tiene exactamente un propietario
-- ningún producto/reseña/conversación apunta a una empresa inexistente
```

Si alguna falla, se aplica F.3 y se revisa. **La migración no se da por buena sin estas cuatro
comprobaciones en verde.**

---

# G. Plan de compatibilidad

## G.1. El legacy no se entera

Producción no lee ninguna tabla nueva, así que su comportamiento es idéntico antes y después. Los
puntos de contacto se limitan a:

- La API nueva **lee** `usuarios` y `sesiones` para saber quién eres. No escribe en ellas.
- La API nueva **comparte la cookie de sesión** del legacy: mismo nombre, misma validación. Quien
  entra en producción entra en la web nueva, y al revés. No se duplican contraseñas ni sesiones.

## G.2. Una sola fuente de identidad

```
El usuario entra en /login.html (legacy)
   → se crea una fila en sesiones y una cookie
   → la API nueva lee esa cookie y resuelve el usuario con usuarioDeSesion()
   → añade: sus empresas, la empresa actual y sus permisos
```

La API nueva **no implementa login propio en esta fase**. Reutiliza el que ya existe. Esto cumple
«no duplicar usuarios ni contraseñas» y evita dos sistemas de credenciales.

## G.3. La columna nueva en `usuarios`

Único cambio sobre una tabla legacy. Antes de aplicarlo se comprueba que ningún código de producción
hace `SELECT *` sobre `usuarios` esperando un número fijo de columnas. La auditoría muestra que todas
las consultas nombran columnas explícitamente, así que es seguro. Si hubiera cualquier duda, la
alternativa es llevar la verificación a su propia tabla, sin tocar `usuarios`.

## G.4. Verificación de correo, sin romper cuentas

- Las cuentas existentes **se consideran verificadas de hecho**: `email_verificado` queda nulo y la
  API lo interpreta como «cuenta antigua, no se le exige verificar».
- Solo se exige verificación a las cuentas **creadas a partir de ahora** por la API nueva.
- La verificación **nunca bloquea el acceso** en esta fase: limita acciones sensibles, como publicar.
  Así ninguna de las 154 empresas se queda fuera.

## G.5. La web nueva, por fases

Cada pantalla pasa de almacén de navegador a API una a una. Mientras una no esté migrada, sigue
funcionando como hoy. En ningún momento hay una web a medias.

---

# H. Fases de implementación

| Fase | Qué | Toca datos | Reversible |
|---|---|---|---|
| **1a** | Crear las 5 tablas nuevas | No | Sí, borrándolas |
| **1b** | Poblar `empresas` y `membresias` desde el legacy | Solo inserta en tablas nuevas | Sí (F.3) |
| **1c** | API nueva: `/api/auth/me`, empresas del usuario, cambio de empresa | No | Sí |
| **1d** | Permisos en servidor y middleware de autorización | No | Sí |
| **1e** | La web nueva usa la sesión real en lugar de `roble_session` | No | Sí |
| **2** | Alta de empresa contra la API, con moderación real | Inserta | Sí |
| **3** | Invitaciones y gestión de miembros | Inserta | Sí |
| **4** | Verificación de correo para cuentas nuevas | Inserta | Sí |
| **5** | Panel: máquinas y productos contra la API | Migra datos del navegador | Parcial |
| **6** | Contactos y solicitudes contra la API | Migra | Parcial |
| **7** | Administración contra la API, con auditoría | Inserta | Sí |
| **8** | Activar los flujos de n8n | No | Sí |

## H.1. Permisos (diseño)

Tres roles, suficientes para el producto y ampliables:

| Permiso | propietario | editor | lector |
|---|:---:|:---:|:---:|
| `empresa.ver` | sí | sí | sí |
| `empresa.editar` | sí | sí | no |
| `maquinas.ver` | sí | sí | sí |
| `maquinas.crear` / `editar` / `borrar` | sí | sí | no |
| `productos.crear` / `editar` / `borrar` | sí | sí | no |
| `contactos.ver` | sí | sí | sí |
| `contactos.gestionar` | sí | sí | no |
| `miembros.ver` | sí | sí | sí |
| `miembros.invitar` / `cambiar_rol` / `quitar` | sí | no | no |
| `empresa.borrar` | sí | no | no |

La comprobación vive en el servidor, en una única función:

```
puede(usuario, empresa_id, 'maquinas.crear')
   → ¿hay membresía activa de ese usuario en esa empresa?
   → ¿el rol de esa membresía incluye ese permiso?
```

La interfaz oculta lo que no se puede hacer, pero **la decisión real siempre es del servidor**. Un
`empresa_id` enviado desde el navegador nunca se acepta sin comprobar la membresía.

Administración global: se mantiene la clave compartida actual en esta fase y se añade después un rol
de administrador en `usuarios`, para no romper el panel que ya funciona.

---

# Qué hace falta de ti antes de la fase 1b

1. **Acceso de solo lectura a la base de datos** para ejecutar los recuentos de F.4 y cerrar la
   columna «cuántos» de la tabla de casos ambiguos. Sin esos números, la migración no se ejecuta.
2. **Confirmar la copia de seguridad** (F.1) antes del paso de poblado.
3. **Visto bueno a la columna `email_verificado`** en `usuarios`, único cambio sobre una tabla legacy.

Las fases 1a y 1c a 1e no necesitan nada de esto y pueden empezar ya.
