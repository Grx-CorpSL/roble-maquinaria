# ROBLE — el ecosistema (estado a 2026-09-20)

Una sola web. El portal de maquinaria es la entrada y el directorio del sector vive dentro con la
misma estructura: categorías a la izquierda, contenido con fotos en el centro, banners a la derecha.
Alrededor, las piezas que hacen que la web se alimente sola.

```
   Guías ──────────┐                                        ┌────────── Solicitudes
   (SEO, tráfico)  │        ┌────────────────────────┐      │  (demanda que busca oferta)
                   └───────►│        LA WEB          │◄─────┘
   Favoritos y     ┌───────►│  Maquinaria + Directorio│◄─────┐
   alertas         │        │  categorías · anuncios │      │  Panel de empresa
   (retención)     │        │  sectores · empresas   │      │  (ficha, productos, máquinas,
                   │        │  productos · banners   │      │   contactos, paquetes)
                   │        └───────────┬────────────┘      │
                   │                    │                   │
                   │        ┌───────────▼────────────┐      │
                   └────────┤   ADMINISTRACIÓN       ├──────┘
                            │ maquinaria: anuncios,  │
                            │  solicitudes, banners, │
                            │  paquetes, contactos   │
                            │ directorio: altas,     │
                            │  empresas, productos   │
                            └───────────┬────────────┘
                                        ▼
                            Automatizaciones (n8n): alertas por correo,
                            avisos de alta, informe semanal, caducidad
```

## Piezas

| Pieza | Para quién | Qué hace | Estado |
|---|---|---|---|
| **Portal de maquinaria** (`index`, `categoria`, `anuncio`, `buscar`, `vendedores`, `vendedor`, `repuestos`) | Compradores | Encontrar máquinas por categoría, marca, estado, vendedor | Hecho, con fotos |
| **Directorio dentro del portal** (`directorio`, `sector`, `empresas`, `empresa`, `productos`, `producto`, `para-empresas`) | Todo el sector | 14 sectores, 154 empresas y 465 productos con el mismo shell de tres columnas | Hecho |
| **Panel de empresa** (`panel/`) | Cualquier empresa del directorio | Ficha, productos, máquinas en venta, contactos, paquetes. Una sola cuenta para directorio y portal | Hecho (local) |
| **Admin de maquinaria** (`admin/`) | Equipo ROBLE | Moderar anuncios y solicitudes, ordenar banners, precios y pedidos, contactos | Hecho (local) |
| **Admin del directorio** (`admin-directorio/`) | Equipo ROBLE | Altas, empresas, productos, categorías, contenidos, usuarios, configuración | Hecho (local), enlazado desde el admin de maquinaria |
| **Favoritos y alertas** (`favoritos`) | Compradores | Guardar máquinas; "avísame cuando haya" en categorías y búsquedas vacías | Hecho (local) |
| **Solicitudes** (`solicitudes`) | Compradores → vendedores | Demanda publicada; los vendedores responden | Hecho (local) |
| **Guías** (`guias`, `guia`) | Todos | Contenido que acaba en el buscador | 3 guías |
| **Banners laterales contextuales** | Anunciantes | En una categoría salen primero quienes venden esa máquina; en un sector, las empresas destacadas del sector; el resto se rellena con el orden fijado en el admin | Hecho |
| **SEO** (`sitemap.xml`, `robots.txt`) | Buscadores | 769 URL: categorías, anuncios, vendedores, sectores, empresas, productos y guías. Paneles y admin excluidos | Hecho, dominio pendiente |

## Una empresa, un sitio

El vendedor de maquinaria y la empresa del directorio son la misma cuenta:

- La ficha (`empresa.html`) muestra descripción, productos y, si anuncia máquinas, sus anuncios.
- La página de vendedor (`vendedor.html`) existe para cualquier empresa con al menos una máquina publicada. Si no era uno de los 12 vendedores iniciales, se deriva de su ficha automáticamente.
- En el panel, "Perfil" guarda a la vez en el directorio y en el portal. "Productos" publica al momento en la ficha. "Máquinas" pasa por moderación.

## Flujos que se alimentan (probados de punta a punta en el prototipo)

1. **Alta → moderación → web.** El formulario de alta deja la empresa pendiente; al aprobarla en el admin del directorio aparece en el buscador de empresas y en su sector.
2. **Panel → ficha pública.** Editar el perfil o añadir un producto se ve en `empresa.html` y en la búsqueda de productos sin pasar por nadie.
3. **Paquete → saldo → anuncio → moderación → vendedor.** Una empresa que nunca vendió máquinas pide un paquete, el admin lo confirma, publica una lijadora, el admin la aprueba y la empresa aparece en Vendedores, en su página de vendedor, en su ficha y en los banners de esa categoría.
4. **Contacto desde ficha, producto o anuncio → panel de la empresa y admin.** Misma cola (`roble_leads`) con origen `directorio` o `maquinaria`.
5. **Categoría o búsqueda vacía → alerta → demanda registrada.** El admin la ve como "demanda sin oferta": argumento para vender paquetes en esa categoría.
6. **Guía → buscador → anuncio → contacto.**

## Monetización

| Fuente | Dónde se gestiona | Notas |
|---|---|---|
| Paquetes de anuncios (3 → 500) | `vender.html`, Admin › Paquetes | Precios `[PRECIO]` hasta que el cliente los fije; el admin ya puede fijarlos |
| Banners laterales | Admin › Vendedores y banners | Orden fijo del admin, rellenado con contexto (categoría, sector) |
| Destacados de maquinaria | Admin › Anuncios | Primero en listados y portada |
| Ficha completa del directorio | Admin directorio › Empresas | Cruzado: destacada en el directorio ⇄ banner en el portal |

## Automatizaciones (n8n)

Cuatro flujos construidos y validados en `MaqDeMad/Workflows-n8n/`, listos para importar. Trabajan contra
el contrato `/api/maquinaria` descrito en `docs/api-maquinaria.md`, que el backend tiene que implementar.

| Flujo | Cuándo | Qué hace |
|---|---|---|
| `roble-alertas-nocturnas` | Cada noche 22:00 | Cruza alertas activas con las máquinas publicadas en 24 h; un correo por alerta con coincidencias; marca el envío |
| `roble-aviso-solicitud` | Webhook al aprobar una solicitud | Correo a cada vendedor con máquinas publicadas en esa categoría |
| `roble-anuncios-antiguos` | Cada lunes 9:00 | "¿Sigue a la venta?" a cada vendedor con anuncios de más de 90 días; los marca para no repetir |
| `roble-informe-semanal-maquinaria` | Cada lunes 8:30 | Resumen al admin: anuncios, vendedores, contactos, solicitudes, alertas, paquetes, demanda sin oferta |

El aviso de alta aprobada ya lo envía el backend (`enviaBienvenida` en `api/solicitudes.js`); no hace
falta flujo. Los tres flujos anteriores del directorio (informe, captación, solicitudes pendientes) siguen
igual. La web atiende los enlaces de los correos: `favoritos.html?baja=<id>` da de baja una alerta y
`solicitudes.html#s-<id>` lleva a la solicitud.

## Datos y verdad

Todo lo que se ve es real o está marcado: 154 empresas y 465 productos del directorio en producción;
12 vendedores y 31 máquinas; marca, año, precio y estado "a consultar" porque no constan; fotos de
categoría con licencia libre y créditos, marcadas "imagen orientativa"; precios de paquetes como
`[PRECIO]`. Nueve empresas del directorio vienen marcadas como datos de prueba en la base de datos
(entre ellas las "destacadas"): retirarlas antes de enseñarlo como real.

Los cambios del panel y de los admin viven en el navegador: `roble_ml_v1` (portal), `roble_admin_v1`
(directorio), `roble_leads`, `roble_altas`, `roble_session`. La web pública los aplica al cargar; los
paneles trabajan sobre los datos base para no aplicarlos dos veces.

## Integración con producción

Mismo camino que el directorio: `solicitudes.js` ya gestiona altas y leads; falta una tabla
`anuncios` (id, vendedor_id, cat, marca, modelo, año, estado, precio, desc, fotos, specs, estadoPub,
destacado, fecha), otra `alertas` y otra `pedidos`. El panel usa la sesión de `login.js` ligada a la
empresa; los admin, el rol admin. Las fotos van a Vercel Blob como en el directorio.

## Siguientes pasos por valor

Precios de paquetes y banners, y todo lo relativo a pagos, quedan fuera de este trabajo: los lleva otra
persona. Aquí solo van los pasos de estética y funcionalidad.

1. Conectar anuncios, alertas y pedidos a la base de datos; sustituir los cinco almacenes locales.
2. Fotos propias de vendedores y productos.
3. Implementar `/api/maquinaria` (contrato en `docs/api-maquinaria.md`) e importar los cuatro flujos n8n.
4. Retirar los datos de prueba del directorio.
5. Portugués, italiano y francés cuando haya empresas fuera de España.
