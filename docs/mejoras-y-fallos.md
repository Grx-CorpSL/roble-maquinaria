> **Nota (26-09-2026):** `assets/data.js`, `assets/data-home.js` y `assets/ml-data.js` ya no existen. Las páginas cargan `/api/datos.js` (y `?home=1` la portada), que sirve el directorio en vivo desde la base de datos con la misma forma, y `/api/maquinaria.js` los anuncios de maquinaria. Lo que sigue sobre esos extractos es historia. Detalle en `hardening.md`, apartado 8.

# ROBLE Maquinaria — mejoras y fallos (ronda del 19-09-2026)

Auditoría del portal tras la capa visual. Todo lo de esta lista está corregido o construido y probado a 390, 1024 y 1440 px.

## Fallos corregidos

| # | Fallo | Solución |
|---|---|---|
| 1 | Sin márgenes laterales entre 800 y 1240 px: la columna de categorías pegaba al borde | El layout ya no pisa el padding horizontal del contenedor |
| 2 | Titular del hero poco legible sobre la foto | Degradado más denso y etiqueta superior con más contraste |
| 3 | Crédito de la foto del hero arriba, compitiendo con el titular | Pasa abajo a la derecha y se oculta en móvil (sigue en la línea de créditos) |
| 4 | Título ilegible en las categorías con foto y sin anuncios | Texto claro sobre foto también en estado vacío |
| 5 | Números "01, 02…" en las categorías sin función | Eliminados; queda solo el cuadrado rojo de "tiene anuncios" |
| 6 | Enlaces de título de anuncio y de tablas por debajo de 24 px de alto en móvil | Área táctil ampliada |
| 7 | Categoría o búsqueda sin resultados era un callejón sin salida | Formulario "Avísame" que crea una alerta |
| 8 | "Acceder" llevaba siempre al inicio | Administración va al admin del portal; una empresa va a su panel |
| 9 | Los precios de paquetes fijados en el admin no llegaban a "Vender máquinas" | Se aplican al cargar en todo el portal |
| 10 | Buscador de cabecera con placeholder demasiado largo | "Buscar máquinas" |
| 11 | Navegación ordenada desde el vendedor, no desde el comprador | Inicio · Buscar · Vendedores · Guías · Vender |

## Mejoras construidas (ecosistema)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Guardar máquinas | estrella en cada anuncio, `favoritos.html` | Lista personal en el navegador |
| Alertas | categoría o búsqueda vacía, `favoritos.html` | "Avísame cuando haya"; alimenta la demanda que ve el admin |
| Guías | `guias.html`, `guia.html` | Tres guías de compra y venta con datos estructurados |
| Panel de vendedor | `panel/` | Resumen, anuncios (alta y edición), contactos, paquetes, perfil |
| Admin del portal | `admin/` | Moderación de anuncios y solicitudes, banners, precios y pedidos, contactos |
| Directorio ↔ maquinaria | cabecera y ficha de empresa de `roble-v2`, página de vendedor | Enlaces cruzados entre los dos productos |

## Flujo probado de punta a punta

1. Un comprador pide aviso en "Prensas" y guarda una máquina.
2. Un vendedor pide un paquete de 3 anuncios.
3. El admin confirma el pedido y el saldo del vendedor pasa a 3.
4. El vendedor publica una prensa: queda pendiente y el saldo baja a 2.
5. El admin la aprueba: aparece en la categoría, en la búsqueda y con su ficha.

## Pendiente (necesita al cliente o backend)

- Precios de los paquetes y del banner lateral: siguen como `[PRECIO]`.
- Fotos reales de cada máquina: hoy se muestra una foto orientativa por categoría.
- Persistencia real: todo lo anterior vive en el navegador. Falta API, subida de fotos, correo de alertas y pago con Stripe.
- Idiomas PT, IT y FR.
- Los enlaces entre `roble-v2` y `roble-ml` son relativos: funcionan en local y en un mismo dominio, no entre los dos artefactos publicados por separado.

---

# Ronda de calidad de entrega (21-09-2026)

Auditoría de toda la web unificada: enlaces, Lighthouse en móvil y regresión de los flujos.

## Enlaces

Rastreo de 26 páginas y 2.014 enlaces internos distintos: ningún archivo inexistente, ningún id
desconocido (empresas, productos, sectores, categorías, anuncios, vendedores, guías) y ningún error
de JavaScript.

## Lighthouse (emulación móvil, 4G lenta)

| Página | Rendimiento antes | Rendimiento después | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|---|
| Portada | 61 | 96 | 96 → 100 | 100 | 100 |
| Categoría | 83 | 98 | 100 | 100 | 100 |
| Anuncio | 81 | 94 | 96 → 100 | 100 | 100 |
| Directorio | 76 | 87 | 100 | 100 | 100 |
| Ficha de empresa | 74 | 86 | 96 → 100 | 100 | 100 |
| Buscador de máquinas | 83 | 98 | 98 → 100 | 100 | 100 |
| Guías | 83 | 98 | 100 | 100 | 100 |

Mínimos de entrega: rendimiento > 75, accesibilidad > 90, SEO > 85. Se cumplen en todas.

## Qué se corrigió

| # | Problema | Solución |
|---|---|---|
| 1 | Salto de maquetación en móvil (CLS 0,16): al cargar Archivo, el encabezado de sección pasaba de una fila a dos y empujaba 40 px todo lo de abajo | En móvil el encabezado apila siempre título y enlace. CLS 0,00 en todas las páginas |
| 2 | La barra lateral se pintaba abierta y se cerraba después en móvil | Nace ya cerrada en móvil |
| 3 | Miniaturas servidas a 1.200 px (2,2 MB de fotos) | Variantes de 640 px en `assets/img/fotos/sm/` para tarjetas, tiles y banners: 626 KB en total |
| 4 | El hero pesaba 136 KB para cualquier pantalla | `srcset` con 640, 800 y 1.200 px, precarga y prioridad alta |
| 5 | La portada cargaba los 200 KB del directorio para pintar seis sectores y tres empresas | Extracto `assets/data-home.js` de 6 KB |
| 6 | La hoja de Google Fonts bloqueaba el primer pintado | Carga no bloqueante con `preload` en las 44 páginas |
| 7 | Imágenes sin `width` y `height` | Dimensiones intrínsecas en todas las plantillas |
| 8 | Contraste insuficiente en la línea de créditos (3,1:1) | Pasa a acero (5,2:1) |
| 9 | Listas de definición no válidas: un `<span>` de puntos entre término y valor | Los puntos son ahora un pseudoelemento CSS; 28 spans eliminados |
| 10 | Saltos de nivel de encabezado (h1 → h3) en listados | Las tarjetas de anuncio y de producto usan h2 |
| 11 | Ficha de anuncio y de producto apretadas en la columna central | La foto ocupa todo el ancho y los datos van debajo en dos columnas |

## Mantenimiento

`assets/data-home.js` es un extracto de `assets/data.js`. Si cambia `data.js`, se regenera con el
mismo criterio: los 14 sectores con su recuento de empresas y las tres primeras empresas destacadas
con descripción, con su número de productos. Las miniaturas de `fotos/sm/` se regeneran a 640 px de
ancho, calidad 70, cuando se añada una foto nueva.

Lo que Lighthouse sigue señalando y no se toca en el prototipo: minificar CSS y JS (ahorro de 15 KB)
y cabeceras de caché, que en producción pone Vercel.

---

# Fichas: que manden las fotos (21-09-2026)

| Pieza | Antes | Ahora |
|---|---|---|
| Galería del anuncio | Solo se veía la primera foto, aunque el vendedor subiera doce | Foto principal, miniaturas, flechas, contador y ampliación a pantalla completa. Teclado (flechas y Escape), deslizar en móvil, foco atrapado y devuelto al cerrar |
| Página de vendedor | Las máquinas quedaban en miniaturas de 110 px abajo a la izquierda; dos botones iban al mismo sitio | Máquinas justo bajo la cabecera a tres columnas; datos del vendedor debajo; botón "Contactar" con formulario; filtros solo con más de 6 máquinas |
| Contacto en móvil | El botón de contacto se perdía al hacer scroll | Barra fija inferior con "Pedir información" o "Contactar" (y guardar, en anuncios) cuando el botón principal sale de pantalla. En anuncio, producto, empresa y vendedor |
| Página 404 | No había | `404.html` con buscador y seis salidas |

Nota para producción: `404.html` usa rutas relativas para poder probarse en local. Si se sirve para
rutas con subcarpetas, hay que pasar sus enlaces y recursos a rutas absolutas.
