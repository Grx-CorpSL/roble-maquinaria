# Contrato de `/api/maquinaria`

Lo que necesitan los cuatro flujos n8n de `Workflows-n8n/` y lo que hoy vive en el navegador del
prototipo (`roble_ml_v1`). Una sola función serverless en `Proyectos/api/maquinaria.js`, al estilo de
`solicitudes.js`: la acción va en la query (`?alertas`, `?anuncios`, `?vendedores`, `?metricas`) y
todo se protege con `clave=<SOLICITUDES_KEY>`. Sin clave o con clave incorrecta: `401`.

Fechas en ISO 8601. Ids numéricos. Respuestas con `Cache-Control: no-store`.

## Tablas nuevas

| Tabla | Campos | Origen en el prototipo |
|---|---|---|
| `anuncios` | id, vendedor_id (= id de empresa en `usuarios`), cat, titulo, marca, modelo, anio, estado (`nueva`/`usada`), precio, desc, fotos (json), specs (json), zona, pais, ce, estadoPub (`pendiente`/`publicado`/`rechazado`/`borrador`), motivo, destacado, fecha, publicado_en, recordado_en, origen | `roble_ml_v1.anuncios` y `patches` |
| `alertas` | id, email, tipo (`categoria`/`busqueda`), cat, q, estado (`nueva`/`usada`/vacío), activa, creada, ultimo_envio | `roble_ml_v1.alertas` |
| `pedidos` | id, vendedor_id, anuncios (n), precio, estado (`pendiente`/`pagado`/`cancelado`), fecha | `roble_ml_v1.pedidos` |
| `solicitudes_maquinaria` | id, titulo, cat, cantidad, estado, pais, desc, nombre, email, pendiente, rechazada, fecha | `roble_ml_v1.solicitudes` |

Las categorías (76) son fijas y viven en `roble-ml/assets/ml-data.js`; el backend solo necesita el `id`
y el `nombre` para rellenar `cat_nombre`.

## Endpoints

### `GET ?alertas&estado=activa&clave=`

Alertas con `activa = true`.

```json
{ "alertas": [
  { "id": 41, "email": "comprador@ejemplo.es", "tipo": "categoria", "cat": "prensas", "q": "", "estado": "", "creada": "2026-09-19T10:12:00Z", "ultimo_envio": null },
  { "id": 42, "email": "otro@ejemplo.es", "tipo": "busqueda", "cat": "", "q": "italpresse", "estado": "usada", "creada": "2026-09-19T10:40:00Z", "ultimo_envio": "2026-09-19T22:00:11Z" }
] }
```

### `PATCH ?alertas&clave=`

Cuerpo `{ "ids": [41, 42], "ultimo_envio": "2026-09-20T22:00:05Z" }`. Actualiza `ultimo_envio` de esas
alertas. Respuesta `{ "ok": true, "actualizadas": 2 }`.

Baja de una alerta desde el correo: el enlace `favoritos.html?baja=<id>` que envía el flujo debe acabar
en `PATCH ?alertas&baja=<id>` sin clave, con `activa = false`. En el prototipo se resuelve en el navegador.

### `GET ?anuncios&estadoPub=publicado&desde=<ISO>&clave=`

Anuncios publicados con `publicado_en >= desde`. Con `antiguedad=90&sin_recordar=1` en lugar de `desde`:
publicados hace más de 90 días y con `recordado_en` vacío. Siempre con los datos del vendedor.

```json
{ "anuncios": [
  { "id": 900012, "titulo": "Prensa de platos calientes 3.000 x 1.300", "cat": "prensas", "cat_nombre": "Prensas",
    "marca": "Italpresse", "modelo": "", "anio": 2015, "estado": "usada", "precio": 12500, "desc": "…", "zona": "Valencia", "pais": "ES",
    "vendedor_id": 173, "vendedor": "Airmatic Madera", "vendedor_email": "ventas@ejemplo.es",
    "fecha": "2026-09-19", "publicado_en": "2026-09-19T16:03:00Z", "recordado_en": null }
] }
```

### `PATCH ?anuncios&clave=`

Cuerpo `{ "ids": [900012], "recordado": "2026-09-22T09:00:03Z" }`. Escribe `recordado_en`. Respuesta
`{ "ok": true, "actualizados": 1 }`.

### `GET ?vendedores&cat=<id>&clave=`

Empresas con al menos un anuncio publicado en esa categoría, con su correo de contacto.

```json
{ "vendedores": [ { "id": 173, "nombre": "Airmatic Madera", "email": "ventas@ejemplo.es" } ] }
```

### `GET ?metricas&clave=`

Semana = últimos 7 días.

```json
{
  "anuncios":    { "publicados": 31, "nuevos_semana": 4, "pendientes": 2, "destacados": 11 },
  "vendedores":  { "total": 13, "nuevos_semana": 1 },
  "contactos":   { "semana": 6, "nuevos": 3 },
  "solicitudes": { "semana": 1, "pendientes": 1 },
  "alertas":     { "activas": 5, "enviadas_semana": 2, "sin_oferta": [ { "cat": "tornos-para-madera", "cat_nombre": "Tornos para madera", "alertas": 2 } ] },
  "pedidos":     { "pendientes": 1, "anuncios_vendidos_semana": 30 }
}
```

`contactos` son las filas de `solicitudes` (la tabla del directorio) cuyo destino es un vendedor o cuyo
origen es `maquinaria`. `sin_oferta` son categorías con alertas activas y cero anuncios publicados.

## Webhook al aprobar una solicitud

Cuando el admin aprueba una solicitud de maquinaria, el backend hace:

```
POST {N8N_WEBHOOK_SOLICITUD}            (p. ej. https://n8n.tudominio/webhook/roble-solicitud-aprobada)
X-Roble-Key: <SOLICITUDES_KEY>
Content-Type: application/json

{ "id": 9, "titulo": "Prensa de 3.000 x 1.300", "cat": "prensas", "cat_nombre": "Prensas",
  "cantidad": 1, "estado": "usada", "pais": "España", "desc": "…", "email": "comprador@ejemplo.es" }
```

El flujo comprueba la cabecera contra `ROBLE_ADMIN_KEY` y avisa a los vendedores de la categoría. Si la
llamada falla, la solicitud queda aprobada igualmente: el aviso no es bloqueante.

## Variables

| Dónde | Variable | Valor |
|---|---|---|
| Vercel | `SOLICITUDES_KEY` | ya existe; protege también `/api/maquinaria` |
| Vercel | `N8N_WEBHOOK_SOLICITUD` | URL del webhook del flujo de solicitudes |
| n8n | `ROBLE_URL` | URL pública de la web, sin barra final |
| n8n | `ROBLE_ADMIN_KEY` | = `SOLICITUDES_KEY` |
| n8n | `RESEND_API_KEY`, `ROBLE_REMITENTE`, `ROBLE_ADMIN_EMAIL` | como en los flujos del directorio |
