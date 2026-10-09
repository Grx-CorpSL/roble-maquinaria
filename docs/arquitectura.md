# ROBLE — lista para crear la arquitectura

Estado a 2026-09-21. Parte de lo que ya existe en `roble-ml/` (24 páginas públicas, panel de empresa,
dos administraciones, 9 módulos de datos, estilos y lógica) y ordena lo que falta para pasar de
prototipo a una web con arquitectura propia.

Leyenda: `[x]` hecho en el prototipo · `[ ]` por hacer · `[?]` decisión que hay que tomar antes de seguir.
Fuera de esta lista: precios y pagos, que lleva otra persona.

## Orden recomendado

1. Decisiones que bloquean lo demás: **A4** ya está tomada (sustituye). Quedan **E7** (cómo se
   pinta el HTML) y **B3** (URLs limpias, con propuesta escrita).
2. Modelo de datos (C) y capa de datos (D).
3. Presentación sobre esa base (E) y acceso real (F).
4. SEO e idiomas (H).
5. Pruebas automáticas (I) y despliegue (J).

---

## A. Alcance y reglas

- [x] A1. Una sola web: maquinaria es el inicio y el directorio vive dentro con la misma estructura.
- [x] A2. Tres zonas: web pública, panel de empresa y administración (maquinaria y directorio).
- [x] A3. Producción (`Proyectos/`) no se toca desde el prototipo. Una rama de git por sesión; el merge lo hace el propietario.
- [x] A4. **Decidido el 21-09-2026: la web unificada sustituye a la de producción.** El servidor que ya funciona (acceso, altas, correos, asistente) se conserva y se conecta a la web nueva.

## B. Arquitectura de información

- [x] B1. Tipos de página: portada · listados (buscar, categoría, categorías, vendedores, empresas, productos, sector, directorio, repuestos, solicitudes, guías) · fichas (anuncio, vendedor, empresa, producto, guía) · utilidad (guardados, acceso, contacto, legal, vender, alta de empresa, 404).
- [x] B2. Navegación de 6 entradas, barra lateral contextual (76 categorías o 14 sectores) y columna de banners contextual.
- [?] B3. URLs limpias. Propuesta escrita en `docs/redirecciones.md` (patrón por tipo de página, id al final, cinco reglas). Pendiente de tu visto bueno; se aplica junto con E7.
- [ ] B4. Una URL canónica por contenido (una empresa que vende máquinas tiene hoy dos: ficha y página de vendedor). Decidir cuál manda y enlazar la otra.
- [ ] B5. Migas coherentes con esa jerarquía en todas las fichas.
- [?] B6. Buscador único en la cabecera (máquinas, categorías, empresas y sectores) o dos buscadores como ahora.

## C. Modelo de datos

- [x] C1. Entidades: sector (14) y subsector (123) · empresa (154) · producto (465) · categoría de maquinaria (76) · anuncio (31) · solicitud · alerta · contacto · usuario y sesión · orden de banners · guía (3).
- [x] C2. Relaciones: empresa ↔ sectores (varios) · producto → empresa · anuncio → empresa y → categoría · contacto → empresa, y opcionalmente → producto o anuncio · alerta → categoría o búsqueda.
- [x] C3. Regla clave: un vendedor es una empresa con al menos una máquina publicada. No es una entidad aparte.
- [x] C4. Estados: anuncio (pendiente, publicado, rechazado, borrador) · empresa (pendiente, publicada) · producto (publicado, borrador) · solicitud (pendiente, publicada, rechazada) · contacto (nuevo, en curso, cerrado).
- [ ] C5. Identificadores únicos y estables en todo el sitio (hoy los anuncios nuevos empiezan en 900000 para no chocar).
- [ ] C6. Por entidad, qué campos son obligatorios y cuáles pueden quedar «a consultar».
- [ ] C7. Fotos como entidad: hasta 12 por anuncio, orden, portada, autor y licencia, y las tres variantes de tamaño (640, 800, 1.200 px).
- [ ] C8. Qué se hace con los datos de prueba (9 empresas marcadas así en origen).

## D. Capa de datos

- [x] D1. Hoy: `data.js` (directorio, 200 KB), `ml-data.js` (maquinaria), `data-home.js` (extracto de portada), `ml-guias.js`.
- [x] D2. Hoy los cambios viven en cinco almacenes del navegador: `roble_ml_v1`, `roble_admin_v1`, `roble_leads`, `roble_altas`, `roble_session`.
- [x] D3. Contrato de `/api/maquinaria` escrito (`docs/api-maquinaria.md`). `/api/directorio` ya existe en producción, solo lectura.
- [ ] D4. Sustituir los cinco almacenes por la API: leer, escribir y moderar.
- [ ] D5. Dejar de cargar los 200 KB del directorio en cada página: por sector, paginado o búsqueda en servidor.
- [ ] D6. Generar los derivados (extracto de portada, sitemap, miniaturas) en un paso automático, no a mano.

## E. Capa de presentación

- [x] E1. Un solo armazón de página: `ML.shell(sección, { dir, cat, sector })` pone cabecera, barra lateral, banners y pie.
- [x] E2. Plantillas de tarjeta: anuncio, categoría, sector, empresa, vendedor, producto, banner de vendedor y de empresa.
- [x] E3. Componentes: galería con ampliación, formulario de contacto, barra fija en móvil, avisos, confirmación, tabla y formulario de panel.
- [x] E4. Estilos por capas: `roble.css` (variables, base, componentes) → `ml.css` (estructura del portal) → `ml-visual.css` (capa visual) → `admin.css`.
- [ ] E5. Fundir `ml.css` y `ml-visual.css`: la segunda corrige a la primera y quedan entre 30 y 55 KB de reglas sin usar.
- [ ] E6. Una sola copia de `admin.js` y `admin.css` (hoy duplicadas entre `roble-v2` y `roble-ml`).
- [?] E7. Cómo se pinta el HTML. Hoy todo el contenido lo genera JavaScript en el navegador. Para buscadores y primer pintado conviene generar el HTML de cada ficha y listado en un paso previo (recomendado) y dejar JavaScript solo para filtros, guardados y paneles.

## F. Roles y acceso

- [x] F1. Tres roles: visitante, empresa y administración.
- [x] F2. Panel de empresa (resumen, máquinas, productos, contactos, paquetes, perfil), admin de maquinaria (6 secciones) y admin del directorio (9 secciones).
- [ ] F3. Sesión real ligada a la empresa (hoy simulada). Producción ya tiene acceso y recuperación de contraseña.
- [ ] F4. Permisos: una empresa solo ve y edita lo suyo; la administración modera y publica.
- [ ] F5. Un solo acceso y un solo panel de administración con dos áreas, en lugar de dos administraciones enlazadas.

## G. Flujos

- [x] G1. Alta de empresa → moderación → aparece en la web.
- [x] G2. Panel → ficha pública: perfil y productos se ven al momento.
- [x] G3. Anuncio → moderación → publicado → la empresa pasa a ser vendedor y entra en los banners de su categoría.
- [x] G4. Contacto desde ficha, producto o anuncio → panel de la empresa y administración.
- [x] G5. Categoría o búsqueda vacía → alerta → demanda registrada.
- [x] G6. Guía → buscador → anuncio → contacto.
- [ ] G7. Avisos por correo en cada cambio de estado. Los flujos de n8n están hechos; dependen de D4.

## H. SEO y contenido

- [x] H1. Título y descripción por página, datos estructurados en fichas (producto, organización, artículo), sitemap de 769 direcciones, robots y 404.
- [ ] H2. Etiqueta canónica y Open Graph por ficha; datos estructurados de listado y de migas.
- [ ] H3. Idiomas. Hoy solo español. Para portugués, italiano y francés: patrón de URL, diccionario de interfaz y qué contenido se traduce.
- [x] H4. Las 70 preguntas frecuentes por sector de producción, portadas a cada página de sector con datos estructurados (69, sin las frases promocionales).
- [ ] H5. Más guías y una página por marca o por zona si se quiere captar búsquedas.

## I. Calidad

- [x] I1. Mínimos de entrega: Lighthouse móvil con rendimiento > 75, accesibilidad > 90 y SEO > 85. Hoy 86–98, 100 y 100.
- [x] I2. Sin saltos de maquetación, sin enlaces rotos (2.014 comprobados), contraste AA, anchos 390, 768, 1.024 y 1.440 px.
- [x] I3. Seis flujos probados de punta a punta en navegador automatizado.
- [ ] I4. Guardar esas pruebas en el repositorio y ejecutarlas antes de cada entrega. Hoy están en una carpeta temporal.

## J. Despliegue

- [x] J1. Prototipo en local y publicado como artefacto.
- [x] J2. Plan de redirecciones: las 80 páginas de producción tienen destino y hay 103 reglas listas en `docs/vercel-redirects.json`. Sin aplicar.
- [x] J3. Entorno de pruebas: proyecto propio `roble-maquinaria` en Vercel (`roble-maquinaria.vercel.app`), con `noindex` hasta el lanzamiento.
- [ ] J4. Dominio definitivo: hoy el sitemap y los correos llevan un marcador.
