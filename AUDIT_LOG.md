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
