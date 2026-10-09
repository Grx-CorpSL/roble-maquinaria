> **Ejecutado el 26-09-2026.** La web antigua se retiró (proyecto Vercel `maqdemad` borrado, `Proyectos/` fuera del repositorio) y `maqdemad.vercel.app` es dominio del proyecto `roble-maquinaria`: las 103 reglas de abajo están activas en `roble-ml/vercel.json` y cada URL antigua salta a su página nueva. Detalle en `hardening.md`, apartado 7.

# Sustitución de producción: URLs y redirecciones

Decisión del 21-09-2026: **la web unificada sustituye a la de producción.** Este documento cubre lo
que hace falta para que el cambio no pierda visitas ni posicionamiento. Nada de esto está aplicado:
producción sigue intacta.

## 1. Inventario de producción

80 páginas HTML en `Proyectos/`, 38 de ellas en el sitemap. Todas tienen destino:

| Grupo | Páginas | Qué se hace |
|---|---|---|
| Con redirección 301 | 47 | Ver la tabla del punto 3 |
| Conservan el nombre | 5 | `contacto`, `legal`, `producto`, `productos`, `404`: mismo archivo y mismos parámetros |
| Precios y pagos | 4 | `precios`, `pago-ok`, `pago-exitoso`, `pago-cancelado`: fuera de este trabajo, los lleva otra persona |
| Internas, sin indexar | 24 | `modelo-*`, `intro*`, `og-*`, `componentes`, `emails`, `costes`, `diagnostico`, `cookie-banner`, `fondos-demo`, `_index`, `500`: no se migran |

El fragmento listo para `vercel.json` está en `docs/vercel-redirects.json`: 103 reglas, generadas
desde los archivos reales de producción y comprobadas contra los 14 sectores. La sintaxis (`has` con
captura de parámetros y `statusCode: 301`) está verificada en el código fuente de Vercel.

## 2. Contenido que producción tenía y la web nueva no

| Contenido | Estado |
|---|---|
| 14 páginas de preguntas frecuentes por sector (70 preguntas) | **Portado.** 69 preguntas viven ahora en cada página de sector, en `#preguntas`, con datos estructurados `FAQPage`. Se quitaron 41 frases que hablaban de la plataforma con el nombre anterior y una pregunta que solo era promocional |
| Bloques de texto SEO por sector (`seo-sectores.json`) | **No portado.** Afirman qué marcas y qué tipo de empresas hay en el directorio y no se puede comprobar. Si se quieren, hay que reescribirlos con datos reales |
| Comparador de proveedores (`comparar.html`) | No existe en la web nueva. Redirige al buscador de empresas |
| Centro de ayuda (`soporte.html`) | No existe. Redirige a contacto |
| Parámetro `subsector` en `productos.html` | **Compatible.** El buscador de productos nuevo lo acepta tal cual |

## 3. Redirecciones principales

| Producción | Web nueva hoy | URL limpia final |
|---|---|---|
| `/`, `/home.html` | `index.html` | `/` |
| `/sectores.html` | `directorio.html` | `/directorio/` |
| `/sector-<sector>.html` (14) | `sector.html?s=<sector>` | `/directorio/<sector>/` |
| `/faq-<sector>.html` (14), `/faq.html` | `sector.html?s=<sector>#preguntas` | `/directorio/<sector>/#preguntas` |
| `/perfil.html?id=N` | `empresa.html?id=N` | `/empresas/<nombre>-N/` |
| `/producto.html?id=N` | `producto.html?id=N` | `/productos/<nombre>-N/` |
| `/listado.html`, `/busqueda.html`, `/buscar.html` (con `q` y `sector`) | `empresas.html` con los mismos filtros | `/empresas/` |
| `/productos.html` (con `q`, `sector`, `subsector`) | `productos.html` | `/productos/` |
| `/para-anunciantes.html`, `/alta-empresa.html` | `para-empresas.html` | `/alta-empresa/` |
| `/login.html`, `/registro.html`, `/password.html` | `acceso.html` | `/acceso/` |
| `/mi-ficha.html`, `/dashboard.html`, `/panel-usuario.html`, `/panel-solicitudes.html` | `panel/…` | `/panel/…` |
| `/admin.html` | `admin/index.html` | `/admin/` |
| `/es/<sector>/` y `/es/sector/<antiguo>/` (37 rutas del esquema anterior) | `sector.html?s=<sector>` | `/directorio/<sector>/` |

## 4. Propuesta de URLs limpias

Español sin prefijo. Cuando lleguen otros idiomas: `/pt/`, `/it/`, `/fr/` delante del mismo patrón.

| Tipo | Patrón | Ejemplo |
|---|---|---|
| Portada | `/` | |
| Máquinas: buscador | `/maquinaria/` | `/maquinaria/?estado=usada` |
| Máquinas: categoría | `/maquinaria/<categoria>/` | `/maquinaria/prensas/` |
| Máquinas: anuncio | `/maquinaria/<categoria>/<titulo>-<id>/` | `/maquinaria/prensas/prensa-de-platos-calientes-900012/` |
| Vendedor | `/vendedores/<nombre>-<id>/` | `/vendedores/airmatic-madera-173/` |
| Directorio: sector | `/directorio/<sector>/` | `/directorio/herrajes-accesorios/` |
| Empresa | `/empresas/<nombre>-<id>/` | `/empresas/airmatic-madera-173/` |
| Producto | `/productos/<titulo>-<id>/` | `/productos/barniz-poliuretano-al-agua-231/` |
| Guía | `/guias/<titulo>/` | `/guias/comprar-maquinaria-segunda-mano/` |
| Utilidad | `/solicitudes/`, `/repuestos/`, `/guardados/`, `/vender/`, `/alta-empresa/`, `/acceso/`, `/contacto/`, `/legal/` | |
| Privado | `/panel/…`, `/admin/…` | sin indexar |

Reglas:

1. **El id va al final y es lo que manda.** Si una empresa cambia de nombre, la URL antigua sigue
   resolviendo por el id y redirige a la nueva. Ningún enlace se rompe.
2. **Una sola URL por contenido.** La ficha de empresa es la canónica. La página de vendedor es una
   vista de sus máquinas y apunta a la ficha con `rel="canonical"` solo si no tiene contenido propio.
3. **Minúsculas, sin tildes, guiones.** Máximo 60 caracteres de texto antes del id.
4. **Barra final siempre**, con redirección desde la versión sin barra.
5. **Filtros en la query, nunca en la ruta**, y con `noindex` cuando hay más de un filtro combinado.

## 5. Orden de ejecución

1. Publicar la web nueva en un dominio de pruebas con los nombres de archivo de hoy y cargar
   `vercel-redirects.json`. Comprobar las 103 reglas una a una con un rastreo.
2. Pasar a URLs limpias cuando exista el paso de generación de HTML (decisión E7 de
   `arquitectura.md`). Solo cambia la columna de destino de las reglas.
3. Cambiar el dominio. Enviar el sitemap nuevo y vigilar errores 404 en Search Console durante
   cuatro semanas.

## 6. Despliegue en Vercel (21-09-2026)

La web unificada tiene **su propio proyecto de Vercel**, separado del de producción:

| | Producción actual | Web nueva |
|---|---|---|
| Proyecto de Vercel | `maqdemad` | `roble-maquinaria` |
| Dirección | `maqdemad.vercel.app` | `roble-maquinaria.vercel.app` |
| Origen | carpeta `Proyectos/`, despliegue automático al subir a `master` | carpeta `roble-ml/`, despliegue manual |
| Indexación | sí | no, hasta el lanzamiento (`X-Robots-Tag: noindex` en `vercel.json`) |

Cómo se despliega la web nueva, siempre desde `roble-ml/` y nunca desde `Proyectos/`:

```
cd roble-ml
vercel deploy --prod --scope simbai
```

- `roble-ml/.vercel/` enlaza esa carpeta con `roble-maquinaria`. Está fuera de git.
- `roble-ml/.vercelignore` deja fuera `docs/`. `vercel.json` pone las cabeceras.
- En el proyecto `maqdemad` sigue valiendo la regla de siempre: solo `git push`, nunca la CLI.
- El proyecto nuevo no está conectado a GitHub. Para que se despliegue solo al subir cambios hay que
  conectarlo desde el panel de Vercel y fijar **Root Directory = `roble-ml`**.

Medido en vivo con Lighthouse móvil: rendimiento 83 en portada y 99 en directorio y ficha,
accesibilidad y buenas prácticas 100. SEO marca 66 solo por el `noindex` intencionado; vuelve a 100
al quitarlo.

Por qué la web nueva no ocupa todavía el dominio de producción: acceso, altas, contactos y pagos
funcionan hoy con servidor real y las páginas nuevas aún guardan en el navegador. El cambio de dominio
va después de conectar la web nueva a la API (bloque D de `arquitectura.md`). Ese día se quita el
`noindex`, se cargan las 103 redirecciones y se apunta el dominio al proyecto nuevo.
