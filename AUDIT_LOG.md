# Registro de auditorías (Lighthouse, móvil, producción)

## Iteración 2026-10-13 22:05
Antes:   Perf 89 | A11y 100 | BP 100 | SEO 100   (LCP 3,4 s · TBT 170 ms · CLS 0,007)
Después: Perf 82–90 (dos pasadas; la variación es del propio Lighthouse) | A11y 100 | BP 100 | SEO 100   (LCP 3,4–3,6 s)
Hecho:
- Caché de un año e `immutable` para `/assets/img/` (antes una semana). Los nombres de archivo no cambian; si cambia una foto, cambia el archivo.
- Comprobado y descartado: WebP del hero solo ahorra un 10 % (foto con grano), no compensa un `<picture>` más preload nuevo. El preload del hero ya lleva `fetchpriority="high"`. El resto de imágenes ya van a calidad 72 progresiva.
Pendiente:
- LCP: el hero lo pinta JavaScript tras cargar `api/datos.js`, `api/maquinaria.js`, `roble.js` y `ml.js` (retardo de render ≈ 430 ms en la traza, 3,4 s con la emulación móvil). La única palanca real es pintar el hero en el HTML estático antes del JS, pero exige reproducir la cabecera y la rejilla de tres columnas para no provocar un salto de diseño (CLS): no es un cambio pequeño. Se deja para una iteración propia, con captura antes/después.
- `ml-visual.css` sin minificar (2 KB): sin impacto en puntuación.
- Fuente Archivo variable (88 KB): recortar los ejes cambiaría pesos usados en el diseño; no se toca.
ESTADO: SEGUIR (Perf < 95 solo por el LCP; el resto ya está al máximo)

## Iteración 2026-10-14 00:40
Antes:   portada Perf 98 | A11y 100 | BP 100 | SEO 100 (LCP 2,2 s) · sector 95 (LCP 2,9 s) · anuncio 90 (LCP 3,5 s). La portada ha subido de 89 a 98 con las tipografías propias de la revisión del socio (§42).
Después: portada 98 · sector 95 · anuncio 90 (LCP 3,5 s: igual; el tiempo lo manda la espera del JS, no los bytes).
Hecho:
- Ficha de anuncio: la foto de categoría bajaba a 1200 px (332 KB) en cualquier pantalla. Ahora `srcset` con la variante `sm` (640 px): en móvil y en la columna de la ficha carga la pequeña (~40 KB); la grande solo si el vendedor sube foto propia (externa, sin variantes).
- Portada de sector: mismo `srcset`; a 390 px carga `sm/`, a 1280 la de 1200 px (la portada ocupa la columna de 780 px).
- `ML.sm()` exportado para poder derivar la variante pequeña de una ruta.
Pendiente:
- LCP de la ficha de anuncio (3,5 s): la imagen se descubre cuando el JS pinta la ficha (retardo de carga 300 ms en la traza). No se puede precargar: depende del `?id`. La salida es la misma que la del hero: HTML generado antes (contexto.md §7).
- Falta medir buscar, empresas y directorio en la siguiente iteración.
ESTADO: SEGUIR
