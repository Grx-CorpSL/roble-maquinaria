# Campos propios de máquina: marca, modelo, año y estado

Propuesta para aprobar antes de tocar la base. Sigue el mismo orden que la
migración de identidad: auditoría → números → propuesta → backup → migración.

## Por qué

Un anuncio de maquinaria se busca por marca, modelo, año y si es nueva o de
segunda mano. Hoy esos datos no tienen columna: el formulario pide meterlos en
el título y la descripción, y `/api/maquinaria.js` los manda vacíos a
propósito. La ficha pública (`anuncio.html`) ya sabe pintarlos cuando llegan,
con sus datos estructurados para buscadores; solo falta que lleguen.

## Auditoría (hecha sin tocar Neon)

Del volcado del 24-09 (`backups/20260924-2357/`):

```
productos (id, user_id, titulo, descripcion, sector, subsector, fotos,
           destacado, visitas, creada)           465 filas
```

No existe ninguna de las cuatro columnas. `roble_app` tiene
`SELECT, INSERT, UPDATE, DELETE` **de tabla** sobre `productos`, así que las
columnas nuevas quedan cubiertas sin tocar privilegios.

## Números

| | |
|---|---|
| Filas que cambian | **0**: columnas anulables sin valor por defecto, Postgres no reescribe nada |
| Tiempo | instantáneo (solo catálogo) |
| Bloqueo | el de un `ALTER TABLE` corto; en una tabla de 465 filas, milisegundos |
| Reversible | sí: `--revertir` quita las columnas y se niega si ya tienen datos |

## Qué se añade

```sql
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS marca  text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS anio   smallint CHECK (anio IS NULL OR anio BETWEEN 1900 AND 2100),
  ADD COLUMN IF NOT EXISTS estado text     CHECK (estado IS NULL OR estado IN ('nueva', 'usada'));
```

Los dos estados son los que ya entiende la web (`ML.ESTADO`). «Sin
especificar» es NULL. El precio no entra: lo que ya hace la ficha («a
consultar») sigue igual; si se quiere, es una columna más del mismo tipo.

## Cómo se ejecuta

1. Copia de seguridad fresca con `backup.ps1` (lee `CONEXION.txt` y lo borra).
2. Simulacro, con la cadena del propietario en `ROBLE_DATABASE_URL`:
   `node api/_migracion-maquina.js` → dice qué añadiría y cuántas filas hay.
3. `node api/_migracion-maquina.js --confirmar` → un solo `ALTER`, y comprueba.
4. Desplegar el código que usa las columnas (se escribe después de este paso,
   no antes: código que nombra columnas que no existen rompería producción
   si alguien despliega).

## Lo que cambia después en el código

- `api/productos.js`: valida y guarda los cuatro campos en POST y PATCH.
- `api/maquinaria.js`: los lee en vez de mandarlos vacíos.
- `panel/anuncios.html`: cuatro campos más en el formulario; el título deja
  de tener que llevar marca, modelo y año.
- Buscar por marca y filtrar por estado en `buscar.html`, que ya tiene el
  selector de estado en la portada.

Lo que ya está escrito en título y descripción no se migra a las columnas:
no se puede saber con certeza qué parte del título es la marca, y adivinar
atribuiría datos a quien no los dijo. Los vendedores los rellenan al editar.
