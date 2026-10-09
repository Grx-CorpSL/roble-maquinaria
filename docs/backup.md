# Copia de seguridad antes de migrar

Este procedimiento es obligatorio antes de cualquier operación que escriba en la
base de datos. No basta con hacer la copia: hay que **comprobar que sirve para
restaurar**, porque una copia que no se ha probado no es una copia.

Nada de lo que hay aquí se ejecuta solo. Son pasos manuales.

## 0. Antes de empezar

La cadena de conexión va **siempre** en una variable de entorno de la sesión,
nunca en un archivo, un commit ni un mensaje.

```bash
# PowerShell (la variable dura solo lo que dure la ventana)
$env:ROBLE_DATABASE_URL = "<cadena de solo lectura>"
```

Para el backup hace falta una conexión con permiso de lectura sobre todas las
tablas. Para la migración, una con permiso de escritura: son dos cadenas
distintas y conviene que lo sigan siendo.

## 1. Copia completa

Neon guarda su propio historial, pero eso depende del proveedor. La copia que
vale es la que está en un disco que controlamos nosotros.

```bash
pg_dump "$ROBLE_DATABASE_URL" --format=custom --no-owner --no-acl \
  --file="roble-$(date +%Y%m%d-%H%M).dump"
```

`--format=custom` permite restaurar tablas sueltas, que es justo lo que hará
falta si algo sale mal.

## 2. Copia de las tablas que importan

Además del volcado completo, una copia legible de las tablas que la migración
lee, por si hay que comparar fila a fila:

```bash
for t in usuarios productos resenas conversaciones favoritos facturas solicitudes; do
  psql "$ROBLE_DATABASE_URL" -c "\copy $t TO 'backup-$t.csv' WITH CSV HEADER"
done
```

## 3. Comprobar que la copia sirve

Todo esto lo hace `backup.ps1` de una vez (volcado, CSV, restauración de
prueba y comparación de recuentos). Dos reglas que aprendimos ejecutándolo:

- **Endpoint directo, nunca el pooler.** El pooler de Neon es pgbouncer en
  modo transacción; `pg_dump` y `pg_restore` fijan `search_path=''` en su
  sesión y esa conexión vuelve al pool contaminada. La siguiente consulta que
  la herede —incluida la de la web en producción— falla con «relation
  "usuarios" does not exist». El script quita `-pooler` del host.
- **Base temporal, no esquema temporal.** `pg_dump` escribe los nombres con
  esquema (`public.usuarios`), así que restaurar «en otro esquema» caería
  sobre las tablas reales.

Este es el paso que no se salta. Restaurar sobre una base **temporal**, nunca
sobre la de producción:

```bash
createdb roble_prueba_restauracion
pg_restore --dbname=roble_prueba_restauracion --no-owner roble-AAAAMMDD-HHMM.dump
```

Y verificar que los recuentos coinciden con el original:

```sql
SELECT 'usuarios' AS tabla, COUNT(*) FROM usuarios
UNION ALL SELECT 'productos', COUNT(*) FROM productos
UNION ALL SELECT 'resenas', COUNT(*) FROM resenas
UNION ALL SELECT 'conversaciones', COUNT(*) FROM conversaciones
UNION ALL SELECT 'facturas', COUNT(*) FROM facturas;
```

Los números tienen que ser **idénticos** a los de la base real. Si no cuadran,
la copia no vale y no se migra.

Después:

```bash
dropdb roble_prueba_restauracion
```

## 4. Si hay que deshacer

La migración solo escribe en tablas nuevas, así que revertir no toca ni un dato
existente:

```bash
node roble-ml/api/_migracion.js --revertir
```

Eso vacía `empresas` y `membresias` de las filas de origen `legacy`. El sistema
actual sigue funcionando igual, porque nunca dependió de ellas.

La restauración del volcado del punto 1 solo haría falta si algo externo a esta
migración hubiese tocado datos existentes. No debería llegar a pasar.

## 5. Orden completo

1. Auditoría de solo lectura → números exactos.
2. Revisar bloqueantes. Si hay alguno, parar.
3. Backup (pasos 1 y 2) y **comprobarlo** (paso 3).
4. Simulacro: `node roble-ml/api/_migracion.js` sin argumentos.
5. Migración: `node roble-ml/api/_migracion.js --confirmar`.
6. Comprobaciones automáticas al terminar. Si falla alguna, revertir.
