# Macchine-Legno.com — ingeniería inversa, veredicto y arquitectura moderna

**Para:** el agente de IA que implementa el portal de Lucas (directorio/marketplace B2B sectorial).
**De:** Equipo técnico SIMBAI.
**Fecha del análisis:** 21 de septiembre de 2026.
**Objeto analizado:** `https://www.macchine-legno.com` — el dominio que se me pasó, `maccinnelegno.com`, no resuelve; el portal real es éste: portal italiano de anuncios de maquinaria para la madera, nueva y usada, operado por *CHG di Chessa Francesco* (Arezzo, P.IVA 03223720545), en activo desde 2004.

## Cómo leer este documento

Cada afirmación lleva una marca:

- **[MEDIDO]** — comprobado en vivo contra el servidor: cabeceras HTTP, HTML servido, navegador Chrome real con Playwright. Es un hecho, no una impresión.
- **[INFERIDO]** — deducido de huellas fiables (rutas de módulo que devuelven 403 en vez de 301, nombres de campos de formulario). Muy probable, no certificado.
- **[PROPUESTA]** — diseño nuestro. No existe en el original.

Las partes 1 y 2 son *qué hace y cuánto vale*. De la parte 3 en adelante es *qué implementar*, escrito contra el stack real del proyecto de Lucas — HTML estático + funciones serverless en `/api` sobre Vercel + Postgres + Stripe + Resend — no contra un stack hipotético.

---

# PARTE 1 — Cómo funciona por dentro, pieza por pieza

## 1.1 El negocio antes que la tecnología

Entender el modelo explica todas las decisiones técnicas que vienen después.

**No es un marketplace. Es un tablón de anuncios de pago por publicación.** [MEDIDO]

- El portal **no toca la transacción** de la máquina. No hay carrito de máquinas, no hay pasarela entre comprador y vendedor, no hay comisión de venta, no hay depósito en garantía. La máquina se negocia fuera, por teléfono o correo.
- Lo que se vende es **derecho a publicar**. Paquetes prepago de anuncios, publicados en `/it/prodotti`:

| Paquete | Precio | Precio por anuncio |
|---|---|---|
| 3 anuncios | 61,00 € | 20,33 € |
| 15 anuncios | 122,00 € | 8,13 € |
| 30 anuncios | 180,00 € | 6,00 € |
| 100 anuncios | 250,00 € | 2,50 € |
| 200 anuncios | 360,00 € | 1,80 € |
| 500 anuncios | 500,00 € | 1,00 € |

- Letra pequeña del producto, literal: *"3 annunci per ogni lingua modificabili per 6 mesi. In ogni momento potete togliere un annuncio e sostituirlo con un altro."* Es decir: **el anuncio se multiplica por idioma sin coste extra, caduca a los 6 meses, y la plaza es reutilizable** — quitas uno, metes otro. El activo que se vende no es el anuncio: es *el slot*.
- **Segunda línea de ingresos: banners.** *"Per banner contattateci: info@chgnet.com"* — sin tarifa pública, negociado a mano. En la página hay tres banners de fabricante en cabecera (Caselli Group, Imall, FerWood) y varios en la columna derecha (Tomesani, Amac). [MEDIDO]
- Escala real: **5.725 páginas de anuncio** en el sitemap de un solo idioma, y el nodo más alto tiene id 586.553 — veintidós años de rotación de contenido. [MEDIDO]

**La lección para Lucas:** el precio marginal cae de 20,33 € a 1,00 € por anuncio. Esa escala está diseñada para enganchar al concesionario grande que sube 500 máquinas, y a la vez sacarle una cuota fija al pequeño. Es el patrón correcto para un directorio B2B. Lo replicaremos con suscripción en lugar de prepago, por las razones de 3.6.

## 1.2 Stack detectado

| Capa | Qué es | Evidencia |
|---|---|---|
| CMS | **Drupal 7** | [MEDIDO] `robots.txt` de plantilla D7 (`INSTALL.mysql.txt`, `xmlrpc.php`); objeto `Drupal.settings` con `ajaxPageState`; cabecera `X-Drupal-Cache: HIT` |
| Servidor | **Apache**, HTTP/2 por ALPN, IP 80.211.23.81 (Aruba, Italia) | [MEDIDO] — servidor único, **sin CDN delante** |
| jQuery | **1.9.1** (2013), vía `jquery_update` | [MEDIDO] `window.jQuery.fn.jquery === "1.9.1"` |
| Tema | `gratis` (tema gratuito de terceros); `adminimal` en administración | [MEDIDO] / [INFERIDO] |
| Comercio | **Drupal Commerce** + **commerce_paypal** | [MEDIDO] CSS de `commerce/modules/cart`; [INFERIDO] el directorio `commerce_paypal` existe y `commerce_stripe` no |
| Multiidioma | `i18n` + `locale` + `languageicons` | [MEDIDO] |
| Listados | `views` + `views_fluid_grid` + `panels` + `ctools` | [MEDIDO] |
| Búsqueda | `search_api` con backend de base de datos + `custom_search` | [INFERIDO] el módulo existe; [MEDIDO] el formulario expone `keys` |
| SEO | `metatag`, `pathauto`, `xmlsitemap`, `token` | [INFERIDO] por huella de módulo, coherente con el HTML servido |
| Correo | `mailsystem` + `mimemail` + `simplenews` (boletín) | [INFERIDO] / [MEDIDO] |
| Antispam | `captcha` + **reCAPTCHA de Google** | [MEDIDO] `g-recaptcha-response` en los formularios |
| Importación | `feeds` | [INFERIDO] — explica cómo entran catálogos de concesionario en bloque |
| Resto | `ckeditor`, `imce`, `date`, `addressfield`, `entityreference`, `rules`, `admin_menu`, `module_filter` | [INFERIDO] |

**Lo que NO hay** [MEDIDO por ausencia]: ni CDN, ni Varnish, ni Redis/Memcache, ni `advagg`, ni optimización de imagen (`imageapi_optimize`, `webp`, `picture`/`breakpoints`), ni módulo de consentimiento de cookies, ni `seckit` (cabeceras de seguridad), ni Solr/Elasticsearch.

**Fecha de caducidad:** Drupal 7 llegó a fin de vida el **5 de enero de 2025**. No recibe parches de seguridad de la comunidad. Todo el portal corre hoy sobre una base sin soporte, con jQuery de 2013, sirviendo un checkout que pide datos fiscales. Es el riesgo número uno del sitio y no se arregla parcheando: se arregla migrando.

## 1.3 Mapa de rutas — la arquitectura de información completa

```
/                                   → 301 negociado por idioma (ver 1.4). OJO: bucle infinito
/{lang}                             → portada del idioma. lang ∈ it|en|fr|de|es|cs|pl|ro|ru (9)
/{lang}/{tid}-{slug}.html           → página de categoría (taxonomía). ~82 categorías
/{lang}/{nid}-{slug}.html           → ficha de anuncio. ~5.725 por idioma
/{lang}/{categoria}/{marca}         → landing long-tail categoría x marca (/en/edgebanders/biesse)
/{lang}/{tid}-{pais}.html           → landing por país (polonia, españa, rusia, usa...)
/{lang}/view/usermachinery          → listado global con filtros expuestos
/{lang}/view/usermachinery/{uid}    → escaparate de un vendedor concreto
/{lang}/view/spare-parts            → vertical de recambios
/{lang}/view/woodworking-machinery-requests → demandas de compra (el lado inverso del mercado)
/{lang}/view/woodworking-machinery-auction  → subastas
/{lang}/search-page?keys=...        → buscador
/{lang}/prodotti                    → tarifa de paquetes (y destino del menú "Vendi Macchine")
/{lang}/{n}-annunci                 → ficha de producto Commerce + formulario de añadir al carrito
/{lang}/cart, /{lang}/checkout/{order_id}   → carrito y checkout
/{lang}/user, /{lang}/user/register → acceso y alta
/{lang}/sitemap.xml                 → sitemap, uno por idioma (ver 1.10)
/admin/*                            → backoffice de Drupal [INFERIDO]
```

**Menú principal: cuatro entradas.** Home, Vendi Macchine, Ricerca Macchine, Login. [MEDIDO] Toda la navegación real vive en la columna izquierda: **las 82 categorías, listadas enteras, en todas y cada una de las páginas**. Son ~82 enlaces repetidos en cada documento HTML, con su coste (ver 1.13).

**Detalle revelador:** "Vendi Macchine" **no lleva a un formulario de publicación: lleva a la tarifa**. El embudo es *quieres vender → pagas → luego publicas*. No hay anuncio gratuito ni prueba. Es una decisión defendible en 2004 y letal en 2026: sin inventario no hay SEO, sin SEO no hay compradores, y sin compradores nadie paga.

## 1.4 El motor multiidioma — la pieza que preguntabas

Esto es lo de "que se ponga en francés si entra un francés". Funciona exactamente así:

### Cómo detecta el idioma [MEDIDO]

El servidor negocia con la cabecera `Accept-Language` del navegador y **redirige con 301 a un prefijo de ruta**:

```
GET /  con Accept-Language: fr-FR,fr;q=0.9   → 301 Location: /fr    (Content-Language: fr)
GET /  con Accept-Language: es-ES,es;q=0.9   → 301 Location: /es
GET /  con Accept-Language: it-IT,it;q=0.9   → 301 Location: /it
GET /  con Accept-Language: ru-RU,ru;q=0.9   → 301 Location: /ru
```

Es la cadena estándar de Drupal 7 (URL → navegador → idioma por defecto), y en 2026 sigue siendo la arquitectura correcta: prefijo en la ruta, no subdominios, no parámetros de consulta.

### Los cuatro fallos del motor, que no hay que copiar

**Fallo 1 — bucle de redirección infinito para cualquier cliente sin `Accept-Language`.** [MEDIDO — crítico]

```
GET /  User-Agent: GPTBot/1.0  (sin Accept-Language)  → 301 Location: /  → 301 → 301 → ...
curl agotó 12 redirecciones sin llegar a ningún sitio.
```

En esa rama no hay *idioma de último recurso*: si no puede negociar, redirige a sí mismo. Quién se lo come: GPTBot, ClaudeBot, PerplexityBot, muchos monitores de disponibilidad y los previsualizadores de enlace de WhatsApp, Telegram y LinkedIn. **La URL raíz del dominio es, para ellos, inalcanzable.** En una época en la que ser citado por una IA es un canal de adquisición, es un agujero en la línea de flotación.

**Fallo 2 — no hay lista blanca: la cabecera del cliente se convierte en ruta.** [MEDIDO] Lo que llegue en `Accept-Language` se usa tal cual para construir la URL de destino:

```
Accept-Language: xx-XX   → 301 Location: /xx    (idioma inexistente)
Accept-Language: *       → 301 Location: /*     (asterisco literal como ruta)
```

El segundo caso importa más de lo que parece: **`Accept-Language: *` es lo que envía por defecto el `fetch` de Node**, es decir, buena parte de los bots modernos, los monitores y los servicios que previsualizan enlaces. Esos clientes acaban en `https://www.macchine-legno.com/*`. Y `/xx` tampoco se valida: redirige a `/it/xx`. En ningún punto se comprueba el código contra la lista de idiomas soportados.

**Fallo 3 — `Vary` incorrecto.** [MEDIDO] La respuesta que varía según `Accept-Language` declara `Vary: Cookie, Accept-Encoding` y **no** `Accept-Language`. Hoy no explota porque no hay CDN. El día que pongan una Cloudflare delante, el primer visitante alemán fija `/de` en caché para todo el planeta. Es una bomba de relojería de caché.

**Fallo 4 — no hay `x-default`.** [MEDIDO] La portada declara los nueve `hreflang` pero ningún `hreflang="x-default"`, que es justo la etiqueta que le dice a Google qué servir a quien habla un idioma que no cubres.

### Cómo almacena las traducciones [MEDIDO — el hallazgo arquitectónico más importante]

Cada traducción de un anuncio **es un contenido distinto, con su propio id y su propia URL**:

```
/it/474724-fresatrice-bialbero-marca-bacci-modello-cp-cnb.html   ← nodo 474724
/en/474772-milling-machine-bacci-cp-cnb-second-hand.html         ← nodo 474772
/fr/474808-fraiseuse-bacci-cp-cnb-doccasion.html                 ← nodo 474808
/de/474867-kreuzsprossenfraese-bacci-cp-cnb-gebrauchte.html      ← nodo 474867
/es/474906-fresadora-bacci-cp-cnb-segunda-mano.html              ← nodo 474906
/cs/474935-milling-machine-bacci-cp-cnb-second-hand.html         ← nodo 474935  (título en inglés)
```

Es el modelo *node translation* de Drupal 7: seis filas de contenido para una misma máquina, unidas por un identificador de grupo de traducción. Consecuencias, todas visibles en vivo:

- **Deriva de contenido.** Corriges el precio en italiano y las otras cinco fichas siguen mintiendo. No hay fuente única de verdad.
- **Traducciones fantasma.** El checo de ese anuncio es literalmente el inglés, servido bajo `/cs/` con `<html lang="cs">`. Para Google es contenido duplicado en la lengua equivocada; para un checo, una ficha que no entiende.
- **Cobertura desigual.** Ese anuncio existe en 6 de 9 idiomas. Los otros tres no lo tienen y el conmutador los oculta.
- **Multiplicador de coste.** ~5.725 anuncios x ~6 idiomas ≈ **34.000 contenidos** para 5.725 máquinas reales.

Lo que sí está bien resuelto y hay que copiar: **los slugs están traducidos de verdad** (`fresatrici` / `milling-machines` / `fraisages` / `fraesmaschinen` / `fresadoras` / `frezky`), y **el conmutador de idioma conserva la página actual** en vez de tirarte a la portada. Dos detalles que el 90 % de los sitios multiidioma hacen mal.

### Lo que falta en las fichas [MEDIDO — grave]

En la página de anuncio — el 97 % de las URLs del sitio — **no hay `rel="canonical"` ni un solo `hreflang`**. Sólo las portadas y las categorías los llevan. Traducido: las seis versiones idiomáticas del mismo anuncio compiten entre sí en el índice de Google sin que nadie le diga que son la misma cosa en otra lengua.

## 1.5 Catálogo y taxonomía

- **82 categorías** de máquina en un único nivel plano: afiladoras, bordeadoras, calibradoras, centros de mecanizado, prensas, tornos... Sin jerarquía, sin agrupar por familia. [MEDIDO]
- Facetas adicionales como **taxonomías paralelas**: estado (nueva/usada), país (~12 landings), tipo de empresa (comercio / producción / asistencia). [MEDIDO]
- Las **landings categoría x marca** (`/en/edgebanders/biesse`, `/en/combination-machines/scm`) son la jugada SEO más inteligente del sitio: capturan la búsqueda real del comprador industrial, que no busca "bordeadora" sino "bordeadora Biesse". Hay 83 de estas páginas en el sitemap. **Copiar esto y multiplicarlo por diez.** [MEDIDO]
- El listado de categoría muestra título, foto, descripción truncada y **logo del vendedor**. El precio sale sólo si el vendedor lo puso, y en la mayoría de fichas no está. [MEDIDO]

## 1.6 La ficha de anuncio y la captación del contacto

Contenido de una ficha [MEDIDO]: título, categoría, **marca**, **modelo**, descripción libre, país, galería de fotos, bloque del vendedor (razón social, ciudad, teléfono a la vista), enlace a "todas las máquinas de este vendedor" y un bloque de "otras máquinas de esta categoría".

El formulario de contacto (`author-contact-node-form`) recoge:

```
name (nombre) · field_tipo (Utilizzatore | Rivenditore)  ← segmenta usuario final vs. revendedor
field_email · field_citta · field_telefono · field_commento
field_privacy (consentimiento RGPD, obligatorio)
field_subscribe_newsletter (alta en boletín, opt-in separado)  ← captación cruzada
field_send_a_copy (copia al remitente)
reCAPTCHA
```

El diseño del formulario es correcto para 2014. `field_tipo` y el opt-in de boletín separado del consentimiento están bien pensados. **Pero el lead se va por correo y ahí muere**: no hay indicio de que el vendedor vea el lead en un panel, ni de que se mida si respondió. Y no queda ninguna pieza de dato que devolverle para justificar la renovación.

**Lo que no tiene, y es lo que define el producto moderno:** sin precio estructurado, sin año, sin horas de uso, sin estado normalizado, sin ubicación en mapa, sin comparador, sin favoritos, sin alertas por búsqueda guardada, sin conversación, sin historial de visitas, sin datos estructurados JSON-LD.

## 1.7 Búsqueda

[MEDIDO] `/{lang}/search-page?keys=<texto>`. Funciona y es razonablemente relevante: `scm` devuelve máquinas SCM primero; `seghe a nastro usate` devuelve sierras de cinta; `zzzqqq` devuelve 0 resultados y no un error.

Pero:

- **Sin facetas en los resultados.** Los filtros expuestos (`field_machinery_category_tid_i18n`, `field_machinery_status_tid_i18n`, `field_machinery_localization_tid_i18n`, `field_make_value`, `field_year_value`) existen **sólo** en la vista `/view/usermachinery`, no en la página de búsqueda.
- **Sin recuento de resultados, sin ordenación, sin paginación visible** en la búsqueda.
- **Sin autocompletado, sin tolerancia a erratas, sin sinónimos.** Buscar "biese" en vez de "biesse" no devuelve nada.
- Es `search_api` sobre base de datos, no sobre un motor de búsqueda. Con 34.000 contenidos, eso es `LIKE %texto%` a escala.

## 1.8 Pagos y facturación — recorrido y verificado

Recorrí el flujo entero como usuario anónimo: añadí un paquete al carrito y abrí el checkout. **No envié el pedido**, para no meter basura en su base de datos.

```
/it/prodotti  →  /it/3-annunci  →  [Add to cart]  →  /it/cart  →  /it/checkout/{order_id}
```

**Lo que pide el checkout** [MEDIDO, leído del formulario real `commerce-checkout-form-checkout`]:

```
account[login][mail]                                     email
customer_profile_billing[...][country|name_line|thoroughfare|premise|postal_code|locality|administrative_area]
customer_profile_billing[field_commerce_vat_number]      Partita IVA / VAT
customer_profile_billing[field_commerce_tax_code]        Codice Fiscale
customer_profile_billing[field_codice_sdi_o_pec]         Código SDI o PEC
```

Ese último campo es la joya del análisis. **`Codice SDI o PEC` es el identificador del Sistema di Interscambio**, el sistema de factura electrónica obligatoria italiano. Es decir: **resolvieron en 2019 el problema al que se enfrenta el proyecto de Lucas en 2027 con Verifactu.** Y su solución fue la mínima viable y la correcta: *capturar el identificador fiscal en el checkout y emitir la factura desde un sistema externo homologado*. No intentaron que Drupal Commerce emitiera facturas legales. Toma nota: es exactamente la misma conclusión a la que llegamos con Stripe (ver 3.6).

**Lo que está mal en ese checkout:**

- El botón dice **"Add to cart"** en inglés dentro de una página italiana, y la tabla del carrito dice **"Product / Price / Quantity / Remove"**. Cadenas de interfaz sin traducir justo en el punto donde se pide el dinero. Es el peor sitio posible para perder confianza.
- **No hay línea de IVA.** El total del pedido es 61,00 € y punto. O el precio lleva IVA incluido sin decirlo, o el IVA se añade en un paso invisible. Con inversión del sujeto pasivo intracomunitaria en juego (venden a Polonia, Rumanía, Rusia), eso tiene que estar explícito.
- **Pasarela: PayPal** [INFERIDO por presencia de `commerce_paypal` y ausencia de `commerce_stripe`]. Sin Stripe, sin tarjeta directa, sin SEPA.
- Flujo prepago de pago único: **sin suscripción, sin renovación automática, sin recuperación de pagos fallidos**. Cada seis meses hay que reconquistar al cliente a mano.

## 1.9 Panel — anunciante y administración

[INFERIDO, con base sólida] No hay panel de anunciante propio. Lo que hay es **el backoffice de Drupal con un tema de administración** (`adminimal_admin_menu`): el vendedor entra por `/user` y crea o edita contenidos con el formulario de nodo estándar. El "escaparate del vendedor" (`/view/usermachinery/{uid}`) es una vista pública, no un panel.

Lo que eso implica, y que es el hueco de producto más grande del sitio:

- El vendedor **no ve cuántas visitas tiene su anuncio**, ni cuántos contactos ha generado, ni desde qué país, ni qué máquina suya funciona mejor.
- No tiene forma de **justificar la renovación** más allá de su intuición.
- No hay **cola de moderación** visible, ni verificación del vendedor, ni sellos de confianza.
- Publicar en seis idiomas es, presumiblemente, **crear seis contenidos a mano** o pegar traducciones.

Un panel con métricas reales es a la vez la funcionalidad más barata de construir y la que más retención compra. Está desarrollada en 3.7.

## 1.10 SEO técnico — auditoría

**Bien:**

- URLs limpias, semánticas y **traducidas por idioma**, con el id delante (`/es/13-fresadoras.html`). [MEDIDO]
- `<h1>` único y correcto por página; todas las imágenes con `alt`; todos los campos de formulario con `<label>`. [MEDIDO en navegador]
- `hreflang` completo de 9 idiomas en portadas y categorías, duplicado además en la cabecera HTTP `Link:`. [MEDIDO]
- Landings long-tail de categoría x marca y por país. [MEDIDO]
- `meta description` generada por plantilla a partir del contenido. [MEDIDO]

**Mal:**

- **Sin `canonical` ni `hreflang` en las fichas de anuncio** — el 97 % del sitio. [MEDIDO]
- **Sin `x-default`.** [MEDIDO]
- **Sin datos estructurados. Cero JSON-LD.** Un portal de 5.725 productos sin `Product`, sin `Offer`, sin `BreadcrumbList`, sin `Organization`. Se pierden enteros los resultados enriquecidos de Google y todo el consumo por agentes de IA. [MEDIDO]
- **Sin Open Graph útil.** Sólo `og:site_name`. Ni `og:title`, ni `og:description`, ni `og:image`. Un anuncio compartido en WhatsApp o LinkedIn sale como un enlace desnudo. [MEDIDO]
- **Sitemap mal montado.** [MEDIDO] `/sitemap.xml` es un 301 negociado por idioma, así que un crawler sólo ve **un** idioma. Es un archivo único de **965 KB con 5.849 URLs**, sin índice de sitemaps, **sin una sola etiqueta `<lastmod>`** y sin alternantes `xhtml:link`. Con `<changefreq>daily</changefreq>` en todas, señal que Google ignora desde hace una década.
- **`Crawl-delay: 10` en robots.txt.** [MEDIDO] Le estás pidiendo a los bots que esperen diez segundos entre peticiones. A ese ritmo, recorrer 34.000 URLs lleva **casi cuatro días**. Con contenido que caduca a los seis meses, es tirarse piedras al propio tejado.
- **`meta keywords`**, muerta desde 2009. [MEDIDO]
- Sin `llms.txt`, sin política explícita para crawlers de IA, y con la portada en **bucle infinito** para los que no mandan `Accept-Language` (1.4). [MEDIDO]

## 1.11 Analítica y datos

[MEDIDO en navegador real]

- **Dos etiquetas de Google a la vez:** GA4 `G-JPVMC6E2F1` **y** Universal Analytics `UA-11917659-1`. UA dejó de recoger datos en julio de 2023: llevan más de tres años cargando un script muerto en cada página.
- Hosts de terceros contactados: `googletagmanager.com`, `google-analytics.com`, `region1.analytics.google.com`, **`stats.g.doubleclick.net`** (señales publicitarias), `google.es`.
- **No hay analítica de producto.** Nadie mide lo que importa en un directorio: impresiones por anuncio, tasa de clic de listado a ficha, tasa de contacto, tiempo hasta el primer lead, qué buscan los que no encuentran nada. GA4 no da eso por anuncio salvo que se instrumente, y no está instrumentado.
- Los datos de mercado que el portal **tiene y no explota**: 22 años de precios pedidos, marcas, modelos, años, países y búsquedas. Eso es un informe sectorial anual vendible, y no existe.

## 1.12 Seguridad y cumplimiento

**Cabeceras de respuesta** [MEDIDO en `GET /it`]:

```
Presente:  X-Frame-Options: SAMEORIGIN · X-UA-Compatible: IE=Edge
Ausente:   Content-Security-Policy
           Strict-Transport-Security   (sin HSTS)
           Referrer-Policy
           Permissions-Policy
           X-Content-Type-Options      (sólo aparece en algunas respuestas de redirección)
```

**Cookies y RGPD** [MEDIDO]: no existe banner ni mecanismo de consentimiento. Busqué en el DOM cualquier elemento con `cookie` o `consent` en su id o clase: cero. **Google Analytics y DoubleClick se cargan antes de cualquier consentimiento.** Hay un enlace de pie llamado "Cookie Compliance" que es una página informativa, no un mecanismo. Eso incumple el artículo 5(3) de la ePrivacy y la posición del Garante italiano sobre Google Analytics; con el Reglamento aplicándose igual en España, es exactamente el fallo que Lucas no se puede permitir.

**Otros:**

- **Drupal 7 sin soporte desde enero de 2025.** Sin parches oficiales. [MEDIDO por huella de versión]
- **jQuery 1.9.1** (2013), con XSS conocidos parcheados después. Llevan retroparches sueltos (`jquery-extend-3.4.0.js`, `jquery-html-prefilter-3.5.0-backport.js`), señal de que alguien es consciente del problema y lo está tapando en vez de resolverlo. [MEDIDO]
- **Teléfonos de vendedor en texto plano y sin autenticar** en 5.725 fichas x 6 idiomas. Es una base de datos de contactos B2B servida gratis a cualquier raspador. Puede ser una decisión deliberada, pero regala el activo.
- **`html5shiv` cargado desde `oss.maxcdn.com`** — un CDN de terceros **dado de baja en 2020**. Es una petición, en cada carga de página, a un dominio que su dueño original ya no controla. Riesgo de cadena de suministro puro. [MEDIDO]

## 1.13 Rendimiento — números reales

Medido con Chrome real sobre `/it/13-fresatrici.html`, una página de categoría, que es el tipo de página más visitado:

| Métrica | Valor | Comentario |
|---|---|---|
| Peticiones | **110** | |
| Transferido | **1.772 KB** | |
| HTML | 18 KB | comprimido, bien |
| TTFB | 248 ms | **bien** — la caché de página de Drupal funciona (`X-Drupal-Cache: HIT`) |
| DOMContentLoaded | 1.384 ms | |
| Load | 1.513 ms | |
| **Imágenes en la página** | **118** | |
| GIF | **526 KB** | formato de 1987 |
| JPG + JPEG | 789 KB | |
| PNG | 344 KB | |
| JS | 82 KB | |
| CSS | 21 KB | |
| `loading="lazy"` | **0** | ninguna imagen diferida |
| `srcset` | **0** | ninguna imagen responsive |
| `.webp` / AVIF | **0** | |

**Diagnóstico:** el servidor es rápido — 248 ms de TTFB sin CDN es digno. **El problema es íntegramente de imágenes.** 1,66 MB de los 1,77 MB son imágenes; 118 de ellas, ninguna diferida, ninguna responsive, muchas en GIF y PNG donde tocaría WebP o AVIF. Las banderas del selector de idioma son nueve PNG de 48x32 px para mostrarse a 32x21: nueve peticiones HTTP que deberían ser un sprite SVG o simplemente texto.

Lo que se gana sin tocar el diseño: convertir a WebP calidad 80 y añadir `loading="lazy"` + `srcset` baja esa página de **1.772 KB a unos 300 KB en la primera pantalla**, un 83 % menos, en un sector donde el comprador entra desde el móvil dentro de una nave con mala cobertura.

**Móvil** [MEDIDO con captura a 390x844]: es responsive — hay menú hamburguesa y las tarjetas se apilan. Pero **cabe una sola tarjeta por pantalla**, los banners se encogen hasta ser ilegibles, y ni el buscador ni los filtros son alcanzables sin recorrer las 82 categorías. En la práctica, buscar desde el móvil es impracticable.

**Caché de estáticos** [MEDIDO]: el CSS agregado se sirve **sin `Cache-Control` ni `Expires`**, sólo con `ETag`. Cada visita revalida. En archivos cuyo nombre ya incluye el hash del contenido (`css_0z63t-nTs....css`), eso es dinero tirado: deberían ir con `max-age=31536000, immutable`.

---

# PARTE 2 — Veredicto

## Puntuación

| Área | Nota | Justificación en una línea |
|---|---|---|
| Modelo de negocio | **8/10** | Escala de precios inteligente, doble ingreso (anuncios + banners), 22 años de supervivencia |
| Arquitectura de información | **7/10** | 82 categorías + marca + país + estado; las landings categoría x marca son un acierto |
| Multiidioma (concepto) | **7/10** | 9 idiomas, slugs traducidos, conmutador que conserva la página |
| Multiidioma (ejecución) | **3/10** | Un contenido por idioma, traducciones fantasma, sin canonical/hreflang en fichas, bucle en la raíz |
| SEO técnico | **4/10** | Buenas URLs; cero datos estructurados, sitemap roto, `Crawl-delay: 10` |
| Rendimiento | **3/10** | Servidor rápido, carga de imágenes catastrófica |
| Móvil / UX | **3/10** | Responsive de 2014; buscar desde el móvil es impracticable |
| Pagos | **5/10** | Captura SDI/PEC correcta; sólo PayPal, sin IVA visible, sin suscripción, interfaz a medio traducir |
| Panel del anunciante | **2/10** | No existe; es el backoffice del CMS |
| Analítica y datos | **2/10** | Dos GA (uno muerto), cero métricas de producto, cero explotación del histórico |
| Seguridad | **2/10** | Drupal 7 sin soporte, jQuery de 2013, sin CSP/HSTS, CDN de terceros muerto |
| Cumplimiento RGPD | **1/10** | Rastreo sin consentimiento, sin banner |
| **Global** | **≈3,9/10** | Un negocio sólido sobre una base técnica caducada |

## Qué copiar, literalmente

1. **Prefijo de idioma en la URL + negociación por `Accept-Language` en la raíz.** Arquitectura correcta.
2. **Slugs traducidos por idioma.** No `/fr/13-fresatrici`, sino `/fr/13-fraisages`.
3. **Conmutador de idioma que conserva la página**, en vez de tirar a la portada.
4. **Landings categoría x marca** (`/es/bordeadoras/biesse`). Es el long-tail que convierte en B2B industrial.
5. **Landings por país y por zona.**
6. **Capturar el identificador fiscal en el checkout y facturar desde un sistema homologado externo** — ellos SDI/PEC, nosotros Verifactu.
7. **Escala de precio decreciente por volumen**, que separa al profesional grande del ocasional.
8. **Segmentar el lead en origen** (usuario final vs. revendedor) y **opt-in de boletín separado** del consentimiento de privacidad.
9. **El lado inverso del mercado**: la vista de *demandas de compra*. Quien busca publica lo que busca. Duplica el inventario de contenido sin coste.
10. **Caducidad del anuncio con plaza reutilizable.** Mantiene el catálogo fresco y fuerza el contacto recurrente.

## Qué no copiar bajo ningún concepto

1. Una fila de contenido por idioma. **Una entidad, N traducciones.**
2. Redirigir la raíz sin idioma de último recurso.
3. Cargar 118 imágenes sin `lazy`, sin `srcset` y sin formatos modernos.
4. Publicar sin datos estructurados.
5. Rastrear sin consentimiento.
6. Cobrar con la interfaz a medio traducir.
7. Un panel de anunciante que sea el backoffice del CMS.
8. `Crawl-delay: 10`.
9. Dejar al vendedor sin una sola métrica.
10. Construir sobre una versión de CMS que va a caducar.

---

# PARTE 3 — La versión moderna. Qué implementar y cómo

Todo lo que sigue es **[PROPUESTA]** salvo donde se diga otra cosa, y está escrito para el stack real del proyecto: páginas HTML servidas estáticas, funciones serverless CommonJS en `/api`, Postgres, Stripe, Resend, desplegado en Vercel (región `fra1`).

## 3.0 Seis principios que gobiernan todas las decisiones de abajo

1. **Una entidad, N traducciones.** El contenido tiene una fila canónica y una tabla de traducciones. Nunca N filas de contenido.
2. **Nada que dependa de JavaScript para ser indexado.** El HTML que llega al bot ya trae el contenido, el `canonical`, los `hreflang` y el JSON-LD.
3. **Cada dato que se pide al usuario tiene que volver a él convertido en valor.** Si pides el país del que contacta, el vendedor tiene que verlo en su panel.
4. **Ningún píxel de terceros antes del consentimiento.** La analítica propia, de primera parte y sin cookies, funciona siempre; la de terceros, sólo tras el "acepto".
5. **La factura legal no la emite la pasarela.** La pasarela cobra; el sistema homologado factura.
6. **Si no se puede medir, no se ha implementado.** Cada funcionalidad de las de abajo lleva su criterio de aceptación verificable en la parte 4.

## 3.1 Internacionalización, hecha bien

### 3.1.1 Las reglas

| Regla | Qué hacer |
|---|---|
| Forma de la URL | Prefijo de ruta siempre: `/es/...`, `/fr/...`. Nunca subdominios ni `?lang=`. |
| Idioma por defecto | **También lleva prefijo.** `/es/` existe; `/` sólo redirige. Evita tener la portada duplicada en dos URLs. |
| Detección | Sólo en la raíz `/` y sólo cuando **no** hay cookie de idioma. En cualquier URL con prefijo, **manda el prefijo**, no el navegador. |
| Orden de prioridad | 1) prefijo de la URL, 2) cookie `lang` fijada por elección explícita del usuario, 3) `Accept-Language`, 4) idioma por defecto. |
| Lista blanca | Cualquier idioma no soportado cae al idioma por defecto. Nunca se construye una URL con un código no validado. |
| Cabeceras | `Vary: Accept-Language, Cookie` en toda respuesta que negocie. `Content-Language` en todas. |
| Redirección | **302, no 301.** La respuesta depende del cliente: un 301 lo cachea el navegador para siempre y el usuario que luego cambia de idioma se queda atrapado. |
| Bots | Un cliente sin `Accept-Language` **nunca** entra en bucle: cae al idioma por defecto. |
| Conmutador | Enlaza a la URL equivalente de la página actual, y a la portada del idioma sólo si esa traducción no existe. Fija la cookie al pulsar. |
| `x-default` | Obligatorio, apuntando a la versión en inglés o a un selector. |

### 3.1.2 El código — `middleware.js` en la raíz del proyecto (Vercel Edge)

```js
/* middleware.js — negociación de idioma en el borde.
 * Corrige los cuatro fallos medidos en macchine-legno.com:
 * lista blanca, sin bucle, Vary correcto, cookie con prioridad sobre el navegador.
 */
export const config = {
  matcher: ['/((?!api|_next|assets|favicon|robots\\.txt|sitemap.*\\.xml|llms\\.txt).*)'],
};

const IDIOMAS = ['es', 'en', 'fr', 'de', 'it', 'pt'];
const POR_DEFECTO = 'es';
const COOKIE = 'lang';

function negocia(cabecera) {
  if (!cabecera) return null;
  const candidatos = cabecera
    .split(',')
    .map((trozo) => {
      const [etiqueta, q] = trozo.trim().split(';q=');
      return { codigo: etiqueta.trim().toLowerCase().split('-')[0], peso: q ? parseFloat(q) : 1 };
    })
    .filter((c) => c.codigo && !Number.isNaN(c.peso))
    .sort((a, b) => b.peso - a.peso);
  for (const c of candidatos) if (IDIOMAS.includes(c.codigo)) return c.codigo;
  return null; // no reconocido: el llamante decide, nunca se inventa un prefijo
}

export default function middleware(req) {
  const url = new URL(req.url);
  const primerTramo = url.pathname.split('/')[1];

  // 1. La URL ya declara idioma válido: manda ella. Ni cookie ni navegador.
  if (IDIOMAS.includes(primerTramo)) return;

  // 2. Prefijo con pinta de idioma pero no soportado (/xx, /zh): 404 honesto, no redirección.
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(primerTramo)) {
    return new Response(null, { status: 404 });
  }

  // 3. Sin prefijo: elegimos. Cookie > navegador > por defecto. Nunca vacío.
  const cookie = req.headers.get('cookie') || '';
  const guardado = (cookie.match(/(?:^|;\s*)lang=([a-z]{2})/) || [])[1];
  const idioma =
    (IDIOMAS.includes(guardado) && guardado) || negocia(req.headers.get('accept-language')) || POR_DEFECTO;

  const destino = new URL(url);
  destino.pathname = `/${idioma}${url.pathname === '/' ? '' : url.pathname}`;

  return new Response(null, {
    status: 302, // 302 a propósito: la respuesta depende del cliente
    headers: {
      Location: destino.toString(),
      'Content-Language': idioma,
      Vary: 'Accept-Language, Cookie',
      'Cache-Control': 'private, no-store',
    },
  });
}
```

Los tres puntos que hay que entender de ese fichero, porque son los que fallan en el original:

- El `return` vacío del paso 1 es lo que impide el bucle infinito: si la URL ya tiene prefijo, el middleware **no vuelve a negociar**.
- El paso 2 devuelve 404 en lugar de redirigir a `/xx`. Un 404 es información correcta; una redirección a una URL inexistente es basura en el índice.
- El `|| POR_DEFECTO` del paso 3 es la red de seguridad para GPTBot, ClaudeBot y el previsualizador de WhatsApp.

### 3.1.3 El conmutador de idioma

```html
<!-- Sin banderas: una bandera es un país, no un idioma. Texto, y el idioma escrito en su propia lengua. -->
<nav class="idiomas" aria-label="Idioma">
  <a hreflang="es" lang="es" href="/es/bordeadoras/biesse" data-lang="es" aria-current="true">Español</a>
  <a hreflang="en" lang="en" href="/en/edgebanders/biesse" data-lang="en">English</a>
  <a hreflang="fr" lang="fr" href="/fr/plaqueuses-de-chants/biesse" data-lang="fr">Français</a>
</nav>
<script type="module">
  document.querySelectorAll('.idiomas a').forEach((a) =>
    a.addEventListener('click', () => {
      // Elección explícita: gana a Accept-Language en las siguientes visitas.
      document.cookie = `lang=${a.dataset.lang}; path=/; max-age=31536000; samesite=lax; secure`;
    })
  );
</script>
```

Y en el `<head>` de **todas** las páginas, incluidas las fichas — que es donde el original no las pone:

```html
<link rel="canonical" href="https://DOMINIO/es/bordeadoras/biesse">
<link rel="alternate" hreflang="es" href="https://DOMINIO/es/bordeadoras/biesse">
<link rel="alternate" hreflang="en" href="https://DOMINIO/en/edgebanders/biesse">
<link rel="alternate" hreflang="fr" href="https://DOMINIO/fr/plaqueuses-de-chants/biesse">
<link rel="alternate" hreflang="x-default" href="https://DOMINIO/en/edgebanders/biesse">
```

Regla de oro del `hreflang`: **es recíproco**. Si A declara a B, B tiene que declarar a A, o Google descarta el grupo entero. Se genera desde la misma consulta que pinta el conmutador, nunca a mano.

### 3.1.4 Qué se traduce y qué no

| Capa | Estrategia |
|---|---|
| Interfaz (botones, etiquetas, errores, correos) | Diccionario JSON por idioma, revisado por humano. **Cobertura obligatoria del 100 % antes de publicar el idioma.** Un test de CI falla si falta una clave. Esto es lo que evita el "Add to cart" en mitad del checkout italiano. |
| Taxonomía (categorías, marcas, estados) | Traducción humana una sola vez. Son 82 términos: se hace en una tarde y dura años. |
| Slugs | Traducidos y **congelados**. Si cambia el nombre de la categoría, el slug viejo queda como redirección 301 permanente. |
| Contenido del anunciante | Traducción automática con LLM, **marcada como tal**, con el original disponible y opción de que el anunciante la corrija. |
| Campos estructurados (marca, modelo, año, potencia, precio) | **No se traducen.** Son datos, no texto. Se muestran formateados según la localización. |

Traducción automática honesta, en tres reglas:

1. Se guarda `origen: 'auto' | 'humana'` en cada traducción.
2. La página muestra un aviso discreto: *"Traducción automática. Ver original en italiano."*
3. La traducción automática **nunca reemplaza** al original en la base: se almacena aparte, así que corregir el original re-dispara la traducción de todos los idiomas. Esto es lo que mata la deriva de contenido que sufre el original.

```js
/* api/_traduce.js — traducción por lotes de una ficha a todos los idiomas.
 * Sólo traduce texto libre. Los campos estructurados viajan intactos.
 */
const CAMPOS_TRADUCIBLES = ['titulo', 'descripcion'];

async function traduceFicha(ficha, idiomas) {
  const carga = Object.fromEntries(CAMPOS_TRADUCIBLES.map((c) => [c, ficha[c]]));
  const salida = {};
  for (const idioma of idiomas) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system:
          'Traduces fichas de maquinaria industrial de segunda mano. Conserva marcas, modelos, ' +
          'referencias, unidades y cifras EXACTAMENTE como están. No adornes ni inventes ' +
          'características. Devuelve solo un objeto JSON con las mismas claves de entrada.',
        messages: [{ role: 'user', content: `Traduce a ${idioma}:\n${JSON.stringify(carga)}` }],
      }),
    });
    const j = await r.json();
    salida[idioma] = { ...JSON.parse(j.content[0].text), origen: 'auto', traducido_en: new Date().toISOString() };
  }
  return salida;
}
module.exports = { traduceFicha, CAMPOS_TRADUCIBLES };
```

Coste real: Haiku traduce una ficha a cinco idiomas por bastante menos de un céntimo. Traducir el catálogo entero de un competidor de 5.700 fichas a cinco idiomas cuesta menos que una comida. **Ésta es la ventaja competitiva más barata de todo el documento**: el original tarda semanas y deja huecos; aquí es un trabajo por lotes de una noche.

## 3.2 Modelo de datos

El esquema mínimo que soporta todo lo demás. Postgres.

```sql
-- ============ IDENTIDAD ============
create table empresa (
  id              bigserial primary key,
  nombre          text not null,
  slug            text not null unique,
  nif             text,                        -- para facturación
  vat_ue          text,                        -- para validación VIES
  vat_validado_en timestamptz,                 -- caduca: revalidar cada 90 días
  pais            char(2) not null,
  provincia       text, ciudad text, cp text,
  telefono        text, email  text not null,
  web             text, logo_url text,
  verificada      boolean not null default false,
  creada_en       timestamptz not null default now()
);

-- ============ TAXONOMÍA (una fila, N nombres) ============
create table categoria (
  id bigserial primary key,
  padre_id bigint references categoria(id),    -- jerarquía real, no 82 planas
  orden int not null default 0
);
create table categoria_i18n (
  categoria_id bigint not null references categoria(id) on delete cascade,
  idioma       char(2) not null,
  nombre       text not null,
  slug         text not null,
  descripcion  text,
  primary key (categoria_id, idioma),
  unique (idioma, slug)                        -- el slug es único DENTRO del idioma
);

-- ============ ANUNCIO: UNA FILA, TRADUCCIONES APARTE ============
create table anuncio (
  id             bigserial primary key,
  empresa_id     bigint  not null references empresa(id) on delete cascade,
  categoria_id   bigint  not null references categoria(id),
  -- Datos estructurados: NO se traducen nunca
  marca          text, modelo text,
  anio           int,
  estado         text not null check (estado in ('nuevo','usado','revisado','repuesto')),
  precio_cents   bigint, moneda char(3) default 'EUR',
  precio_visible boolean not null default true,
  horas_uso      int,
  potencia_kw    numeric(8,2),
  dimensiones    jsonb,
  pais char(2), provincia text,
  lat numeric(9,6), lon numeric(9,6),
  idioma_origen  char(2) not null,             -- en qué lo escribió el anunciante
  publicado_en   timestamptz,
  caduca_en      timestamptz,                  -- la caducidad de 6 meses, copiada del original
  estado_pub     text not null default 'borrador'
                 check (estado_pub in ('borrador','revision','publicado','caducado','retirado')),
  destacado_hasta timestamptz,                 -- monetización extra
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table anuncio_i18n (
  anuncio_id  bigint not null references anuncio(id) on delete cascade,
  idioma      char(2) not null,
  titulo      text not null,
  slug        text not null,
  descripcion text,
  origen      text not null default 'auto' check (origen in ('auto','humana')),
  revisada    boolean not null default false,
  actualizada_en timestamptz not null default now(),
  primary key (anuncio_id, idioma),
  unique (idioma, slug)
);

create table anuncio_foto (
  id bigserial primary key,
  anuncio_id bigint not null references anuncio(id) on delete cascade,
  url text not null, url_webp text, url_avif text,
  ancho int, alto int, orden int not null default 0,
  alt_i18n jsonb                                -- {"es":"...","en":"..."} generado por IA
);

-- ============ DEMANDA: el lado inverso del mercado ============
create table demanda (
  id bigserial primary key,
  empresa_id bigint references empresa(id),
  email_contacto text,
  categoria_id bigint references categoria(id),
  marca text, presupuesto_max_cents bigint,
  pais char(2), texto text,
  idioma_origen char(2),
  creada_en timestamptz not null default now(),
  caduca_en timestamptz
);

-- ============ LEAD: el activo que el original tira a la basura ============
create table lead (
  id bigserial primary key,
  anuncio_id bigint references anuncio(id) on delete set null,
  empresa_id bigint not null references empresa(id) on delete cascade,
  nombre text, email text not null, telefono text,
  ciudad text, pais char(2),
  tipo text check (tipo in ('usuario_final','revendedor')),   -- copiado del original: funciona
  mensaje text,
  idioma char(2),
  origen_url text, referer text,
  consent_privacidad boolean not null,
  consent_newsletter boolean not null default false,
  ip_hash text,                                 -- hash, nunca la IP en claro
  visto_en timestamptz, respondido_en timestamptz,   -- ciclo de vida: esto es lo que se enseña
  estado text not null default 'nuevo'
         check (estado in ('nuevo','visto','respondido','descartado','vendido')),
  creado_en timestamptz not null default now()
);

-- ============ EVENTOS: analítica propia, sin cookies ============
create table evento (
  id bigserial primary key,
  tipo text not null,          -- impresion|clic_ficha|ver_telefono|abrir_form|enviar_lead|buscar|sin_resultados
  anuncio_id bigint,
  empresa_id bigint,
  categoria_id bigint,
  idioma char(2), pais char(2),
  consulta text,               -- para 'buscar' y 'sin_resultados': oro puro de producto
  dispositivo text,
  sesion_hash text,            -- hash rotatorio diario: agregable, no identificable
  creado_en timestamptz not null default now()
) partition by range (creado_en);               -- partición mensual: se poda barato

-- ============ FACTURACIÓN ============
create table suscripcion (
  id bigserial primary key,
  empresa_id bigint not null references empresa(id) on delete cascade,
  plan text not null, ciclo text not null check (ciclo in ('mes','anual')),
  stripe_customer_id text, stripe_subscription_id text,
  estado text not null, cuota_anuncios int not null default 0,
  periodo_fin timestamptz
);
create table factura (
  id bigserial primary key,
  empresa_id bigint not null references empresa(id),
  serie char(4) not null, anio int not null, numero int not null,   -- sin huecos por serie+año
  base_cents bigint not null, iva_cents bigint not null, total_cents bigint not null,
  tipo_iva numeric(5,2) not null, regimen text not null,            -- nacional|intracom_rc|export
  stripe_invoice_id text,
  proveedor_legal_id text,     -- id en el emisor homologado (Verifactu)
  hash_encadenado text,        -- encadenamiento exigido por Verifactu
  pdf_url text,
  emitida_en timestamptz,
  unique (serie, anio, numero)
);

-- Índices que importan de verdad
create index on anuncio (estado_pub, categoria_id, publicado_en desc);
create index on anuncio (empresa_id, estado_pub);
create index on anuncio (caduca_en) where estado_pub = 'publicado';
create index on anuncio_i18n (idioma, slug);
create index on lead (empresa_id, estado, creado_en desc);
create index on evento (anuncio_id, tipo, creado_en);
```

La diferencia con el original en una frase: **5.725 filas en `anuncio` en lugar de 34.000 nodos**, y corregir un precio es un `UPDATE` en un sitio, no seis.

## 3.3 Búsqueda y filtros

**Empezar en Postgres, no en Elasticsearch.** Con decenas de miles de fichas, Postgres con `pg_trgm` y `tsvector` sobra, y no añade un servicio más que mantener.

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;

alter table anuncio_i18n add column busqueda tsvector
  generated always as (
    setweight(to_tsvector('simple', unaccent(coalesce(titulo, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(descripcion, ''))), 'B')
  ) stored;

create index on anuncio_i18n using gin (busqueda);
create index on anuncio using gin ((marca || ' ' || modelo) gin_trgm_ops);  -- tolera "biese" → "biesse"
```

Lo que el buscador tiene que hacer y el del original no hace:

| Funcionalidad | Por qué |
|---|---|
| **Recuento de resultados** siempre visible | "1.284 bordeadoras" es una señal de tamaño de mercado; el original no lo enseña |
| **Facetas con recuento** en la misma página de resultados | Categoría, marca, estado, año, precio, país. El original las tiene sólo en otra vista |
| **Tolerancia a erratas** por trigramas | "biese" tiene que encontrar Biesse |
| **Sinónimos por idioma** en tabla, no en código | "bordeadora" = "chapadora de cantos" = "edgebander" |
| **Ordenación** por relevancia, fecha, precio | |
| **URL con estado** (`?marca=biesse&anio_min=2015`) | Compartible, indexable y medible |
| **Guardar la búsqueda** → alerta por correo | Ver 3.12; es la funcionalidad que más retención compra |
| **Registrar `sin_resultados`** | Cada búsqueda sin resultados es un anuncio que podrías vender. El original tira ese dato |

Detalle de SEO que vale dinero: las combinaciones de facetas con volumen real (categoría x marca, categoría x país) **se promueven a URL limpia e indexable** (`/es/bordeadoras/biesse`), y el resto de combinaciones se sirven con `noindex`. Así se replica el acierto del original sin generar un laberinto de URLs duplicadas.

## 3.4 Ficha, leads y antifraude

**La ficha** lleva, además de lo que ya tiene el original: precio estructurado (u "Oferta a consultar" explícito), año, horas, estado normalizado, ubicación en mapa aproximada, galería con zoom, ficha técnica en tabla, sello de vendedor verificado, fecha de publicación y de última actualización, anuncios similares y —esto es nuevo— **"otros compradores también miraron"**, calculado desde `evento`.

**El teléfono no se sirve en el HTML.** Se revela con un clic que registra un evento `ver_telefono`. Dos efectos: el raspador se lleva menos, y **el vendedor ve por fin cuánta gente quiso llamarle** — que es la métrica que justifica su renovación.

**El lead se guarda en base de datos y además se envía por correo.** El correo es una notificación, no el sistema de registro. Esto es lo que permite todo lo de 3.7.

Antifraude, por capas y sin CAPTCHA en el camino feliz:

```js
/* api/lead.js — recepción de contacto. Cuatro capas antes de tocar la base. */
const ratelimit = require('./_ratelimit');   // ya existe en el proyecto
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

  // Capa 1: trampa de miel. Campo oculto por CSS que un humano nunca rellena.
  if (cuerpo.apellido_2) return res.status(200).json({ ok: true });   // se acepta en falso, no se guarda

  // Capa 2: tiempo mínimo de formulario. Menos de 3 s es un bot.
  if (!cuerpo.ts || Date.now() - Number(cuerpo.ts) < 3000) {
    return res.status(200).json({ ok: true });
  }

  // Capa 3: límite por IP. 5 contactos por hora.
  if (!(await ratelimit.permite(`lead:${ip}`, 5, 3600))) {
    return res.status(429).json({ error: 'Demasiados envíos. Inténtalo más tarde.' });
  }

  // Capa 4: consentimiento explícito. Sin esto no se guarda nada.
  if (cuerpo.consent_privacidad !== true) {
    return res.status(400).json({ error: 'Falta aceptar la política de privacidad.' });
  }

  const ipHash = crypto.createHash('sha256')
    .update(ip + process.env.SAL_IP + new Date().toISOString().slice(0, 10))
    .digest('hex').slice(0, 32);   // hash con sal rotatoria diaria: agregable, no reidentificable

  // ... insertar lead, encolar correo al vendedor, registrar evento 'enviar_lead'
};
```

**Sólo se escala a CAPTCHA cuando las capas 1 a 3 se disparan.** El usuario legítimo nunca ve un reCAPTCHA, que además es una transferencia de datos a Google que hay que declarar.

## 3.5 Pagos: Stripe, planes y créditos

**Cambio de modelo respecto al original: suscripción en lugar de prepago.** El prepago de 6 meses obliga a reconquistar al cliente dos veces al año; la suscripción renueva sola y permite recuperación automática de pagos fallidos. Se conserva lo bueno del original: **escala decreciente por volumen** y **cupo de anuncios**.

| Plan | Cuota de anuncios activos | Incluye |
|---|---|---|
| Gratuito | 1 | Ficha de empresa, sin destacar |
| Base | 15 | Traducción automática, estadísticas básicas, alertas de demanda |
| Pro | 60 | Destacados, API de importación, estadísticas completas, exportar leads |
| Concesionario | 500 | Todo, más importación por feed y gestor de cuenta |

Extras de un solo pago, que es donde está el margen: **anuncio destacado** (7/30 días), **banner de sección** (lo que el original negocia por correo, aquí automatizado y autoservicio), **subida a lo alto del listado**.

```js
/* api/checkout.js — ampliación de lo que ya existe.
 * Novedades respecto a la versión actual: IVA correcto, VIES, y metadatos para facturar.
 */
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer: empresa.stripe_customer_id,
  line_items: [{ price: PRECIOS[plan][ciclo], quantity: 1 }],
  locale: idioma,                                     // el checkout en el idioma del usuario
  automatic_tax: { enabled: true },                   // Stripe Tax calcula el tipo por país
  tax_id_collection: { enabled: true, required: 'if_supported' },
  customer_update: { name: 'auto', address: 'auto' },
  billing_address_collection: 'required',
  metadata: { empresa_id: String(empresa.id), plan, ciclo, idioma },
  success_url: `${base}/${idioma}/panel?pago=ok&sid={CHECKOUT_SESSION_ID}`,
  cancel_url: `${base}/${idioma}/precios?pago=cancelado`,
});
```

### Reglas de IVA que hay que implementar sí o sí

| Caso | Tipo | Condición |
|---|---|---|
| Cliente en España | 21 % | siempre |
| Empresa UE fuera de España con VAT válido | 0 %, inversión del sujeto pasivo | **sólo tras validar el VAT contra VIES por nuestra cuenta** |
| Particular UE fuera de España | 21 % | servicio prestado a consumidor |
| Fuera de la UE | 0 %, no sujeto | |

**No fiarse de la validación de Stripe.** Se valida contra VIES en el propio servidor, se guarda `vat_validado_en`, y **se revalida cada 90 días**. Si la validación falla o VIES está caído, se cobra con IVA y se regulariza después: cobrar de menos es un problema tuyo con Hacienda; cobrar de más es un abono.

### La factura legal — exactamente la lección que nos da el original

El original captura `Codice SDI o PEC` en el checkout y factura fuera. Nosotros hacemos lo mismo con Verifactu:

- **Stripe cobra. Stripe no es un sistema de facturación homologado.** Sus facturas no valen como factura española bajo Verifactu: obligatorio para contribuyentes del Impuesto sobre Sociedades desde el **1 de enero de 2027**, y para el resto de obligados —autónomos y profesionales— desde el **1 de julio de 2027** (RD 1007/2023 y su desarrollo).
- **Stripe tampoco valida el VAT.** Su propia documentación dice que en la sesión de Checkout comprueba que los identificadores fiscales *tengan el formato correcto, pero no que sean válidos*, y Stripe Tax aplica la inversión del sujeto pasivo según el campo `tax_exempt` del cliente, que tenemos que poner nosotros tras consultar VIES. Si nos fiamos de él y el número no está registrado, dejamos de repercutir IVA sin derecho y la deuda es del vendedor.
- Se captura NIF y domicilio fiscal en el checkout (ya lo hace `tax_id_collection`).
- El webhook `invoice.paid` dispara la emisión en el proveedor homologado — **Invopop** es la recomendación, API primero.
- La numeración es **correlativa y sin huecos por serie y año**, con bloqueo de fila, y se asigna **sólo en el momento de emitir**, nunca al crear el pedido. Un pedido abandonado no puede consumir número.

```sql
-- Numeración sin huecos. Se llama DENTRO de la transacción de emisión.
create table contador_factura (
  serie char(4) not null, anio int not null, ultimo int not null default 0,
  primary key (serie, anio)
);

create or replace function siguiente_numero(p_serie char(4), p_anio int)
returns int language plpgsql as $$
declare n int;
begin
  insert into contador_factura(serie, anio, ultimo) values (p_serie, p_anio, 0)
    on conflict (serie, anio) do nothing;
  select ultimo + 1 into n from contador_factura
    where serie = p_serie and anio = p_anio for update;   -- bloqueo de fila: serializa
  update contador_factura set ultimo = n where serie = p_serie and anio = p_anio;
  return n;
end $$;
```

**El webhook es el que manda, no la página de éxito.** El usuario puede cerrar el navegador antes de volver. Todo lo que cambia estado ocurre en `api/webhook.js`, con verificación de firma, **idempotencia por `event.id`** y reintentos.

```js
/* api/webhook.js — eventos mínimos que hay que tratar */
switch (evento.type) {
  case 'checkout.session.completed':  // alta: activar plan y cuota
  case 'invoice.paid':                // emitir factura legal + enviar PDF
  case 'invoice.payment_failed':      // recuperación: correo 1, reintento, aviso, degradación
  case 'customer.subscription.updated':  // cambio de plan: recalcular cuota
  case 'customer.subscription.deleted':  // baja: degradar a gratuito sin borrar contenido
  case 'charge.refunded':                // abono: factura rectificativa, no borrar la original
}
```

Detalle que el original hace mal y hay que hacer bien: **la interfaz de pago tiene que estar traducida al 100 %**, incluidos los correos de factura y los mensajes de error de tarjeta. Test de CI que falla si una clave del diccionario de pago está sin traducir en cualquier idioma publicado.

## 3.6 Panel del anunciante — el mayor hueco del original, y la mayor oportunidad

El original no tiene nada de esto. Es lo que convierte un tablón de anuncios en un producto que se renueva solo.

**Portada del panel, "tus números de los últimos 30 días":**

```
┌────────────────────────────────────────────────────────────────┐
│  Impresiones     Visitas a ficha    Teléfono visto    Contactos │
│      12.480            1.204               218             37  │
│      +12 %             +8 %                +21 %          -4 %  │
├────────────────────────────────────────────────────────────────┤
│  Tienes 4 contactos sin responder. El más antiguo, hace 3 días. │
│  [Responder ahora]                                             │
├────────────────────────────────────────────────────────────────┤
│  Tu anuncio que mejor funciona: Bordeadora Biesse Akron 1400    │
│    312 visitas · 11 contactos · 3,5 % de conversión             │
│  El que peor: Prensa hidráulica Italpresse                      │
│    18 visitas · 0 contactos                                     │
│    → Sugerencia: no tiene precio ni fotos. Los anuncios con     │
│      precio reciben 2,3 veces más contactos.                    │
└────────────────────────────────────────────────────────────────┘
```

Lo que tiene que haber, listado sin adornos:

| Bloque | Contenido |
|---|---|
| Rendimiento por anuncio | Impresiones, visitas, teléfono visto, contactos, tasa de conversión, evolución en el tiempo |
| Procedencia | **Países desde los que se ve cada anuncio** — en un portal a 6 idiomas esto es la prueba de que el multiidioma funciona, y es el argumento de venta del plan superior |
| Bandeja de leads | Estados nuevo → visto → respondido → vendido/descartado, con **tiempo de respuesta medido**. Exportable a CSV |
| Comparación con el sector | "Tu bordeadora recibe un 40 % menos de visitas que la media de su categoría" — sin revelar datos de terceros, sólo agregados |
| Consejos accionables | Generados por reglas sobre datos propios: sin precio, menos de 3 fotos, descripción de menos de 200 caracteres, sin año, traducción sin revisar |
| Cuota y caducidad | Anuncios activos frente a cupo, cuáles caducan en 15 días, renovar con un clic |
| Traducciones | Qué idiomas están traducidos, cuáles son automáticos sin revisar, editor lado a lado |
| Facturación | Facturas descargables, plan, próximo cobro, cambiar de plan, cancelar |

Y la funcionalidad que nadie del sector tiene: **el informe mensual por correo**. El día 1 de cada mes, automático:

> *Tus 6 anuncios recibieron 12.480 impresiones y 37 contactos en septiembre. Respondiste a 33 en una media de 4 horas. Tu mejor anuncio fue la bordeadora Biesse Akron. 2 anuncios caducan en 15 días. Hay 4 compradores buscando "prensa hidráulica" en tu zona y tú no tienes ninguna publicada.*

Ese correo es la herramienta de retención más barata que existe y **se construye con datos que el original ya podría tener y no recoge**.

## 3.7 Panel de administración

| Bloque | Contenido |
|---|---|
| Cola de moderación | Anuncios nuevos y editados, con detección automática de duplicados por marca+modelo+fotos |
| Verificación de empresas | Comprobación de NIF/VAT, estado de verificación, sello público |
| Salud del contenido | Anuncios sin foto, sin precio, sin traducir, caducados sin renovar |
| Embudo comercial | Registros → primer anuncio → primer lead → conversión a pago, por idioma y por país |
| Ingresos | MRR, altas, bajas, pagos fallidos, valor de vida por plan |
| **Búsquedas sin resultados** | La lista ordenada por frecuencia. Cada línea es una oferta por captar o una categoría que falta |
| Calidad de traducción | Cuántas fichas son automáticas sin revisar, por idioma |
| Registro de auditoría | Quién cambió qué y cuándo. Obligatorio para el 30.1 del RGPD |
| Exportaciones | Leads, facturas, contenido — en CSV y JSON, con registro de quién exportó |

## 3.8 Analítica y datos — "extracción legal de datos y estadísticas"

Éste es el punto que pediste explícitamente, y tiene tres capas muy distintas que conviene no mezclar.

### Capa 1 — analítica propia, de primera parte, sin cookies y sin consentimiento

Es legal **sin banner** al amparo de la excepción del artículo 22.2 de la LSSI, tal y como la lee la AEPD en su guía de cookies de medición de audiencia, y **hay que cumplir las cuatro condiciones a la vez: fallar una sola hace perder la exención**:

1. La finalidad se limita estrictamente a medir la audiencia del propio sitio.
2. El tratamiento se hace **exclusivamente por cuenta del editor**.
3. Sólo produce **datos estadísticos anónimos y agregados**, no combinados con otros tratamientos.
4. No permite seguir a la misma persona **entre sitios o aplicaciones distintos** con el mismo identificador.

Ésta es, por cierto, la razón exacta por la que Google Analytics no puede acogerse a la exención: comparte identificadores con la infraestructura publicitaria de Google, así que incumple la cuarta. Es decir, el sitio analizado no sólo no pide consentimiento: es que su herramienta jamás podría estar exenta de pedirlo.

Traducido a implementación, y hay que cumplirlo todo:

- No se usan cookies ni `localStorage` para identificar. La sesión es un **hash rotatorio diario** de IP + user-agent + sal del servidor. Al día siguiente el mismo visitante es otro hash: no se puede seguir a una persona en el tiempo.
- **No se almacena la IP en claro**, jamás.
- Los datos **no salen a ningún tercero** ni se usan para publicidad.
- Sólo se explotan de forma agregada.

Esto lo cubren las directrices de la AEPD y del EDPB para la medición estrictamente necesaria de primera parte. Da el 90 % del valor de GA4 con el 0 % del riesgo — y sustituye al `_stats.js` en memoria que hay hoy en el proyecto, que se pierde en cada arranque en frío.

```js
/* api/evt.js — receptor de eventos. Sin cookies, sin terceros. */
const crypto = require('crypto');
const TIPOS = new Set(['impresion','clic_ficha','ver_telefono','abrir_form','enviar_lead','buscar','sin_resultados']);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const e = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  if (!TIPOS.has(e.tipo)) return res.status(400).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const dia = new Date().toISOString().slice(0, 10);
  const sesion = crypto.createHash('sha256')
    .update(ip + (req.headers['user-agent'] || '') + process.env.SAL_ANALITICA + dia)
    .digest('hex').slice(0, 24);      // rota cada día: agregable, no identificable

  await db.query(
    `insert into evento (tipo, anuncio_id, empresa_id, categoria_id, idioma, pais, consulta, dispositivo, sesion_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [e.tipo, e.anuncio_id || null, e.empresa_id || null, e.categoria_id || null,
     e.idioma || null, req.headers['x-vercel-ip-country'] || null,
     (e.consulta || '').slice(0, 120) || null, e.dispositivo || null, sesion]
  );
  res.status(204).end();                // 204: ni cuerpo ni información de vuelta
};
```

En el cliente, con `sendBeacon` para no bloquear la navegación y `IntersectionObserver` para contar impresiones reales:

```js
const envia = (tipo, datos = {}) =>
  navigator.sendBeacon('/api/evt', new Blob([JSON.stringify({ tipo, ...datos })], { type: 'application/json' }));

// Impresión sólo cuando la tarjeta se ve de verdad, no al cargar el HTML
new IntersectionObserver((entradas, obs) => {
  for (const e of entradas) if (e.isIntersecting) {
    envia('impresion', { anuncio_id: e.target.dataset.anuncio });
    obs.unobserve(e.target);
  }
}, { threshold: 0.5 }).observe(document.querySelectorAll('[data-anuncio]'));
```

### Capa 2 — analítica de terceros, tras el consentimiento

Google Analytics, píxeles publicitarios y mapas de calor: **sólo después del "acepto"**, con banner de rechazo tan fácil como el de aceptar (ambos botones al mismo nivel; un "Rechazar" escondido es una infracción por sí mismo), y con registro del consentimiento fechado. El proyecto ya tiene `cookie-banner.html`: hay que verificar que **bloquea de verdad** y no sólo informa, que es justo donde falla el original.

### Capa 3 — extracción legal de datos de terceros

Sobre "extraer datos legalmente" hay una línea clara y conviene tenerla escrita:

| Fuente | Legalidad | Cómo |
|---|---|---|
| **Feeds y APIs que el propio concesionario te da** | Total | Es la vía principal: importación por CSV/XML/API, como el módulo `feeds` del original. Que el vendedor suba su catálogo es un servicio, no un raspado |
| **Registros públicos oficiales** (BORME, registros mercantiles, listas de empresas de cámaras y asociaciones) | Legal | Reutilización de información del sector público. Son datos de empresa, no personales |
| **Datos abiertos** (Overpass/OSM, portales de datos abiertos) | Legal, con atribución | Geolocalización, polígonos industriales, censo de empresas |
| **Webs de terceros sin permiso** | **No** | Aunque el dato sea público, la base de datos ajena está protegida por el derecho *sui generis* del fabricante de bases de datos. Raspar el catálogo de un competidor para poblar el tuyo es ilícito y, además, reputacionalmente suicida en un sector pequeño donde todos se conocen |
| **Contactos personales raspados** (correos y teléfonos de personas físicas) | **No** | Sin base legítima y sin información previa, es infracción directa del RGPD |

Lo que sí es legítimo y muy útil: **análisis de mercado sobre lo público** — cuántos competidores hay, qué marcas dominan, rangos de precio — sin copiar sus fichas. Eso es estudio de mercado, no extracción de base de datos.

### Capa 4 — el producto de datos que el original tiene delante y no ve

Con 22 años de precios, marcas, años y países, hay un producto vendible:

1. **Índice de precios de maquinaria de ocasión**, trimestral, por categoría y marca. Gratuito y resumido: es el mejor imán de enlaces y citas de IA que existe en un sector industrial.
2. **Informe sectorial anual** de pago: qué se vende, qué se busca, a qué precio, desde qué países hay demanda.
3. **Estimador de precio para el anunciante**: *"Bordeadoras Biesse de 2015 similares se publican entre 18.000 y 24.000 €"*. Funcionalidad de panel que sube la calidad del catálogo entero.
4. **Alertas de demanda**: *"3 compradores han buscado tu marca esta semana"*, que empuja la renovación justo en el momento correcto.

## 3.9 SEO, AEO y GEO — para buscadores y para IA

### Datos estructurados. Obligatorios en cada ficha

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Bordeadora Biesse Akron 1400",
  "image": ["https://DOMINIO/img/anuncio/12345-1600.webp"],
  "description": "Bordeadora automática...",
  "brand": { "@type": "Brand", "name": "Biesse" },
  "model": "Akron 1400",
  "productionDate": "2015",
  "itemCondition": "https://schema.org/UsedCondition",
  "offers": {
    "@type": "Offer",
    "price": "21500.00",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "url": "https://DOMINIO/es/bordeadoras/biesse-akron-1400-12345",
    "seller": { "@type": "Organization", "name": "Maquinaria Ejemplo SL" }
  }
}
</script>
```

Más `BreadcrumbList` en todas, `Organization` con `sameAs` en la portada, `ItemList` en los listados y `FAQPage` en las páginas de preguntas que el proyecto ya tiene (hay una docena de `faq-*.html` en el repositorio: cada una debería llevar su `FAQPage`).

### Sitemaps, corregidos

El original entrega un archivo de 965 KB, de un solo idioma, sin `lastmod`. Lo correcto:

```
/sitemap.xml            → índice, nunca redirige por idioma, nunca negocia
  /sitemap-es.xml       → máximo 50.000 URLs o 50 MB por archivo
  /sitemap-en.xml
  /sitemap-imagenes.xml
```

Con `<lastmod>` real en cada URL —Google lo usa para priorizar el rastreo— y con alternantes dentro del propio sitemap:

```xml
<url>
  <loc>https://DOMINIO/es/bordeadoras/biesse-akron-1400-12345</loc>
  <lastmod>2026-09-18T10:22:00+02:00</lastmod>
  <xhtml:link rel="alternate" hreflang="en" href="https://DOMINIO/en/edgebanders/biesse-akron-1400-12345"/>
  <xhtml:link rel="alternate" hreflang="x-default" href="https://DOMINIO/en/edgebanders/biesse-akron-1400-12345"/>
</url>
```

### robots.txt — al contrario que el original

```
User-agent: *
Allow: /
# Sin Crawl-delay. Queremos que nos rastreen rápido.
Disallow: /api/
Disallow: /panel/
Disallow: /*?utm_
Disallow: /*&pagina=

# Crawlers de IA: bienvenidos. El objetivo es ser la fuente citada del sector.
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: https://DOMINIO/sitemap.xml
```

### `/llms.txt`

Un resumen en texto plano de qué es el sitio, qué contiene y dónde está cada cosa, pensado para que un modelo lo lea entero. Generado dinámicamente con los números reales: *"Directorio de 5.700 máquinas de X en 6 idiomas; categorías: ...; actualizado a diario"*. Cuesta una función de 30 líneas y es la puerta a un canal que el original tiene literalmente cerrado con un bucle de redirección.

### Open Graph. En todas las fichas

```html
<meta property="og:type" content="product">
<meta property="og:title" content="Bordeadora Biesse Akron 1400 - 21.500 €">
<meta property="og:description" content="Año 2015, 6.200 horas. Verificada.">
<meta property="og:image" content="https://DOMINIO/img/anuncio/12345-og.jpg">
<meta property="og:locale" content="es_ES">
<meta property="og:locale:alternate" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
```

En B2B industrial se comparte por WhatsApp constantemente. Un enlace desnudo, como el que produce hoy el original, no se abre.

## 3.10 Rendimiento — el objetivo y cómo llegar

| Métrica | Original [MEDIDO] | Objetivo |
|---|---|---|
| Peso de la página de listado | 1.772 KB | **< 400 KB** en la primera pantalla |
| Peticiones | 110 | < 35 |
| Imágenes sin diferir | 118 | 0 por debajo del pliegue |
| LCP en móvil 4G | no medido, estimado > 4 s | **< 2,0 s** |
| CLS | — | < 0,1 |
| INP | — | < 200 ms |

Lo que hay que hacer, por orden de impacto:

1. **Imágenes.** AVIF con respaldo WebP, `srcset` con anchos 320/640/960/1600, `loading="lazy"` en todo lo que no sea la primera imagen, `fetchpriority="high"` en la primera, y `width`/`height` siempre puestos para que no haya salto de maquetación. Esto solo se lleva el 80 % del problema.
2. **Banderas de idioma fuera.** Texto o un sprite SVG, no nueve PNG.
3. **CDN delante.** El original no tiene ninguno; Vercel ya lo da de serie. Estáticos con `Cache-Control: public, max-age=31536000, immutable` cuando el nombre lleva hash.
4. **HTML en caché de borde con revalidación en segundo plano**: `s-maxage=300, stale-while-revalidate=86400`. La ficha de un anuncio no cambia cada segundo.
5. **CSS crítico en línea** para la primera pantalla; el resto, diferido.
6. **Paginación real** en los listados, 24 fichas por página, más "cargar más" bajo demanda. No 118 imágenes de golpe.
7. **Cero jQuery.** JavaScript nativo de módulos. El original arrastra 82 KB de JS para una hamburguesa y un menú desplegable.
8. **Fuentes**: como mucho dos pesos, `font-display: swap`, subconjunto latino, autoalojadas.

Y una comprobación que hay que dejar puesta en CI: presupuesto de rendimiento que **falla el despliegue** si una página de listado supera los 400 KB o el LCP de laboratorio pasa de 2,5 s.

## 3.11 Seguridad y cumplimiento

Cabeceras, en `vercel.json`, todas las que el original no tiene:

```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(self), interest-cohort=()" },
      { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
      { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data: https:; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; frame-src https://js.stripe.com; connect-src 'self' https://api.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'self'" }
    ]
  }]
}
```

Nota sobre la CSP: **estricta y sin nonce en las páginas públicas estáticas** —para no romper la caché de borde ni la indexación— y con nonce más `strict-dynamic` sólo en las rutas autenticadas del panel. Es la decisión que ya está tomada en el proyecto y sigue siendo la correcta.

Resto del cumplimiento:

- **Cero terceros antes del consentimiento.** Verificarlo con una carga limpia del navegador: la lista de hosts contactados tiene que ser exactamente uno, el propio dominio.
- **Registro de consentimiento** con fecha, versión del texto y alcance.
- **Derechos del interesado operativos**: exportación y borrado de los datos de un usuario en una función, no "escríbenos un correo".
- **Retención**: leads 24 meses, eventos en bruto 14 meses y luego sólo agregados, facturas 6 años por obligación mercantil.
- **Encargados del tratamiento**: contrato firmado con Vercel, Stripe, Resend y el proveedor de IA, y todos listados en la política de privacidad. El proveedor de traducción automática procesa texto del anunciante: tiene que estar declarado.
- **Nada de dependencias de CDN de terceros.** El `html5shiv` desde un CDN dado de baja en 2020 que carga el original es el ejemplo perfecto de lo que no hacer: todo autoalojado o desde un origen del que se controla la integridad, con `integrity` y `crossorigin` si es externo.

## 3.12 Las cosas verdaderamente buenas — IA aplicada donde paga

Ordenadas por relación entre valor y esfuerzo. Las tres primeras son las que yo haría primero.

**1. Traducción automática del catálogo completo (3.1.4).** Lo que al original le lleva semanas y deja huecos —seis nodos por anuncio, el checo en inglés—, aquí es un trabajo por lotes. Coste por debajo del céntimo por ficha. Es la funcionalidad con mejor relación valor/esfuerzo de todo el documento.

**2. Alertas de búsqueda guardada.** El comprador guarda "bordeadora Biesse menos de 25.000 € en España" y recibe un correo cuando aparece una. Convierte una visita en una relación, y es la razón por la que el comprador vuelve. Ningún portal del sector lo hace bien.

**3. Redactor de anuncios asistido.** El vendedor sube tres fotos y escribe "bordeadora biesse akron del 15". El sistema propone título, categoría, marca, modelo, año y una descripción estructurada, y le pide que confirme. **Nunca publica sin confirmación del vendedor** — inventarse datos de una máquina industrial es un problema legal, no un detalle. Sube la calidad media del catálogo, que es lo que sostiene el SEO.

**4. Extracción de características desde la foto.** Un modelo de visión lee la placa de características y propone marca, modelo y potencia. Se presenta como sugerencia, siempre revisable.

**5. Texto alternativo automático para las imágenes**, por idioma. Accesibilidad y SEO de imagen, gratis.

**6. Emparejamiento demanda-oferta.** Se cruza la tabla `demanda` con los anuncios nuevos por similitud semántica y se avisa a las dos partes. Es el activador de valor del lado inverso del mercado que el original tiene montado y no explota.

**7. Detección de duplicados y de fraude.** Similitud de imagen y texto para detectar el mismo anuncio publicado por tres "vendedores" distintos, y precios muy fuera de rango que suelen ser cebo.

**8. Normalización del catálogo importado.** Los CSV de los concesionarios vienen sucios. Un modelo pequeño normaliza marcas ("BIESSE", "Biesse S.p.A.", "biese") a una entidad canónica. Esto es lo que hace que las facetas funcionen de verdad.

**9. Asistente de búsqueda en lenguaje natural.** "Necesito una bordeadora para cantos de 2 mm, menos de 20.000 €, que esté cerca de Valencia" → filtros aplicados. Que **traduzca a filtros**, no que invente resultados.

**10. Resúmenes de mercado automáticos** para las landings de categoría: *"Precio medio de las bordeadoras de ocasión: 19.400 €. Las marcas más ofertadas son Biesse, SCM y Holzher."* Contenido único por página, generado de datos propios verificables, que es exactamente lo que las IA citan.

Tres reglas que aplican a las diez:

- **La IA propone, el humano publica.** Ningún dato de máquina se publica sin confirmación.
- **Todo lo generado se marca** como generado, y se guarda el original.
- **Nada de IA en el camino crítico de pago.** Los pagos son determinismo puro.

---

# PARTE 4 — Plan de ejecución y criterios de aceptación

Ordenado por impacto sobre esfuerzo. Cada fase es entregable por sí sola y **cada criterio es verificable con un comando**, no con una opinión.

## Fase 0 — Cimientos que condicionan todo lo demás (1 semana)

| Tarea | Criterio de aceptación |
|---|---|
| Esquema de base de datos de 3.2 | `anuncio` y `anuncio_i18n` separadas; migración probada con datos de ejemplo en 3 idiomas |
| Middleware de idioma de 3.1.2 | `curl -A "GPTBot/1.0" https://DOMINIO/` devuelve **302 a `/es` y un 200 en un salto**, nunca un bucle |
| Lista blanca de idiomas | `curl https://DOMINIO/xx` devuelve **404**, no una redirección |
| `Vary` correcto | La respuesta de `/` incluye `Vary: Accept-Language, Cookie` |
| Cabeceras de seguridad de 3.11 | securityheaders.com da **A o superior** |
| Presupuesto de rendimiento en CI | El despliegue falla si un listado supera 400 KB |

## Fase 1 — SEO e internacionalización correctos (1 semana)

| Tarea | Criterio |
|---|---|
| `canonical` + `hreflang` en **todas** las páginas, fichas incluidas | Un script recorre 100 URLs al azar: 100/100 con canonical y con el grupo hreflang recíproco completo |
| `x-default` | Presente en todos los grupos |
| Índice de sitemaps por idioma con `lastmod` real | `/sitemap.xml` es un índice, **no redirige**, y todos los `lastmod` coinciden con `actualizado_en` |
| JSON-LD `Product` + `BreadcrumbList` + `Organization` + `FAQPage` | Validador de resultados enriquecidos de Google: 0 errores en 20 URLs de muestra |
| Open Graph completo | El enlace se previsualiza con imagen en WhatsApp y LinkedIn |
| robots.txt pro-IA, sin `Crawl-delay` | Verificado |
| `/llms.txt` generado | Responde 200 con cifras reales del catálogo |
| Landings categoría x marca | Generadas para toda combinación con 3 o más anuncios, indexables; el resto con `noindex` |

## Fase 2 — Rendimiento (3 a 5 días)

| Tarea | Criterio |
|---|---|
| AVIF/WebP + `srcset` + `lazy` | Listado por debajo de **400 KB** en la primera pantalla, medido con Chrome real |
| Banderas fuera | 0 peticiones de imagen para el selector de idioma |
| Caché de borde del HTML | `s-maxage=300, stale-while-revalidate=86400` en páginas públicas |
| Estáticos inmutables | `max-age=31536000, immutable` en todo lo que lleva hash |
| Paginación 24 por página | Ninguna página con más de 30 imágenes |
| Lighthouse móvil | **rendimiento > 85, accesibilidad > 95, SEO > 95** |

## Fase 3 — Pagos y facturación legal (1 a 2 semanas)

| Tarea | Criterio |
|---|---|
| Stripe Checkout con `automatic_tax` y `locale` | Un cliente francés ve el checkout **en francés** con el IVA correcto |
| Validación VIES propia, con caché de 90 días | Una empresa alemana con VAT válido paga 0 % con inversión del sujeto pasivo; con VAT inválido, 21 % |
| Webhook idempotente y firmado | Reenviar el mismo `event.id` cinco veces produce **una** factura |
| Numeración sin huecos por serie y año | 1.000 emisiones concurrentes en prueba de carga: secuencia perfecta, sin huecos ni repeticiones |
| Emisión en proveedor homologado (Invopop) | La factura llega con hash encadenado y PDF descargable |
| Recuperación de pagos fallidos | `invoice.payment_failed` dispara la secuencia de 3 correos y la degradación al final |
| Interfaz de pago traducida al 100 % | Test de CI que falla si falta una clave en cualquier idioma publicado |

## Fase 4 — Panel del anunciante (2 semanas)

| Tarea | Criterio |
|---|---|
| Ingesta de eventos de 3.8 | Impresión, visita, teléfono visto y contacto se registran y cuadran con una comprobación manual |
| Cuadro de mando de 30 días | Carga en menos de 500 ms con 100.000 eventos en base |
| Bandeja de leads con estados | Tiempo de respuesta medido y visible |
| Consejos accionables | Al menos 5 reglas activas |
| Informe mensual por correo | Enviado el día 1, con datos reales, en el idioma del destinatario |
| Caducidad y renovación en un clic | Aviso a 15 días y a 3 días |

## Fase 5 — Panel de administración y datos (1 semana)

Cola de moderación, verificación de empresas, embudo por idioma y país, **informe de búsquedas sin resultados**, exportaciones con registro de auditoría.

## Fase 6 — IA (continuo, por orden de 3.12)

Traducción por lotes, alertas de búsqueda guardada, redactor asistido. Lo demás, después y medido.

---

## Los diez fallos del original, con su antídoto — tabla de una sola mirada

| # | Fallo medido en macchine-legno.com | Antídoto | Fase |
|---|---|---|---|
| 1 | Bucle de redirección infinito en la raíz para clientes sin `Accept-Language` | Idioma por defecto de último recurso en el middleware | 0 |
| 2 | Un contenido por idioma, ~34.000 filas para 5.725 máquinas | `anuncio` + `anuncio_i18n` | 0 |
| 3 | Sin `canonical` ni `hreflang` en el 97 % de las URLs | Generados en plantilla desde la consulta de traducciones | 1 |
| 4 | Cero datos estructurados | JSON-LD en todas | 1 |
| 5 | 1,77 MB y 118 imágenes sin diferir | AVIF/WebP + lazy + srcset + paginación | 2 |
| 6 | Sin consentimiento de cookies, con GA y DoubleClick cargando | Analítica propia sin cookies + banner que bloquea de verdad | 0 y 4 |
| 7 | Interfaz de pago a medio traducir | Cobertura de diccionario forzada por CI | 3 |
| 8 | Sin panel de anunciante ni métricas | Cuadro de mando con eventos propios | 4 |
| 9 | Sitemap único, de un idioma, sin `lastmod`, y `Crawl-delay: 10` | Índice por idioma con `lastmod` y robots pro-IA | 1 |
| 10 | Drupal 7 sin soporte desde enero de 2025 | Stack propio sobre plataforma con soporte | — |

---

# ANEXO A — Cómo he medido todo esto (reproducible)

Comandos que cualquiera puede repetir para comprobar cada afirmación marcada como [MEDIDO].

```bash
# Negociación de idioma: cambia el idioma, cambia el destino
for L in fr-FR es-ES it-IT de-DE ru-RU xx-XX; do
  curl -s -o /dev/null -D - -H "Accept-Language: $L" https://www.macchine-legno.com/ \
    | grep -Ei '^(HTTP|Location|Content-Language)'
done

# El bucle infinito: un cliente sin Accept-Language no llega nunca
curl -s -o /dev/null -w "%{num_redirects} %{http_code}\n" -L --max-redirs 12 \
  -A "GPTBot/1.0" https://www.macchine-legno.com/
# → 12 301  (agota las redirecciones sin salir de "/")

# Huella de módulos: 403 = el directorio existe; 301 = no existe
for m in commerce commerce_paypal commerce_stripe i18n pathauto xmlsitemap; do
  echo "$m $(curl -s -o /dev/null -w '%{http_code}' \
    https://www.macchine-legno.com/sites/all/modules/$m/$m.info)"
done

# Cabeceras de seguridad (ausencias reveladoras)
curl -s -I https://www.macchine-legno.com/it | grep -Ei 'strict-transport|content-security|referrer|permissions'

# Sitemap: tamaño, número de URLs, lastmod
curl -s -L https://www.macchine-legno.com/sitemap.xml -o sm.xml
grep -c '<loc>' sm.xml ; grep -c '<lastmod>' sm.xml
```

Y en el navegador real (Playwright), la medición de rendimiento y de terceros:

```js
const rs = performance.getEntriesByType('resource');
({
  peticiones: rs.length,
  kb: Math.round(rs.reduce((t, r) => t + (r.transferSize || 0), 0) / 1024),
  imagenes: document.images.length,
  lazy: document.querySelectorAll('img[loading="lazy"]').length,
  hosts: [...new Set(rs.map((r) => new URL(r.name).host))],
  banner: !!document.querySelector('[id*=cookie i],[class*=consent i]'),
})
// → 110 peticiones, 1772 KB, 118 imágenes, 0 lazy,
//   hosts incluye google-analytics/doubleclick, banner: false
```

# ANEXO B — Resumen de evidencias recogidas

| Evidencia | Valor medido |
|---|---|
| Plataforma | Drupal 7 (fin de vida 05/01/2025), Apache, Aruba Italia, sin CDN |
| Idiomas | 9 (it, en, fr, de, es, cs, pl, ro, ru) por prefijo de ruta |
| Redirección de idioma | 301 negociado por `Accept-Language`; bucle infinito sin esa cabecera |
| Traducciones | Un contenido por idioma; ejemplo verificado: nodos 474724/474772/474808/474867/474906/474935 |
| Anuncios | 5.725 URLs de ficha en el sitemap de un idioma; id máximo 586.553 |
| Categorías | 82, planas, con slug traducido por idioma |
| Precios de publicación | 61 € (3) · 122 € (15) · 180 € (30) · 250 € (100) · 360 € (200) · 500 € (500) |
| Checkout | Drupal Commerce, campos VAT + Codice Fiscale + **Codice SDI o PEC**, sin línea de IVA, botones en inglés |
| Pasarela | PayPal [INFERIDO] |
| Analítica | GA4 `G-JPVMC6E2F1` + UA `UA-11917659-1` (muerta desde 2023) + DoubleClick, **sin consentimiento** |
| Rendimiento (listado) | 110 peticiones · 1.772 KB · 118 imágenes · 0 lazy · 0 srcset · 0 webp · TTFB 248 ms |
| Cabeceras | Sin CSP, sin HSTS, sin Referrer-Policy, sin Permissions-Policy |
| Sitemap | 965 KB, 5.849 URLs, 0 `lastmod`, sin índice, redirige por idioma |
| robots.txt | Plantilla por defecto de Drupal 7 con `Crawl-delay: 10` |
| Terceros muertos | `html5shiv` desde `oss.maxcdn.com`, CDN dado de baja en 2020 |

---

# ANEXO C — Kit de código que acompaña a este informe

Todo lo que describe la parte 3 está escrito, ejecutado y listo para pegar, en
`entrega-lucas/`. Ver su `README.md` para el orden de instalación y la tabla completa
de lo verificado.

| Bloque | Ficheros | Sección |
|---|---|---|
| Idioma | `middleware.js`, `lib/i18n.js`, `scripts/check-i18n.mjs` | 3.1 |
| Datos | `sql/001_schema.sql`, `sql/004_extras.sql`, `scripts/migrar.mjs` | 3.2 |
| Búsqueda | `sql/002_busqueda.sql` | 3.3 |
| Ficha y leads | `api/lead.js`, `api/_ratelimit.js` | 3.4 |
| Pagos y factura legal | `api/webhook.js`, `api/_facturacion.js`, `api/_iva.js` | 3.5 |
| Panel del anunciante | `panel/index.html`, `api/panel.js`, `sql/003_panel.sql` | 3.6 |
| Panel de admin | vistas `admin_*` en `sql/003_panel.sql` y `sql/004_extras.sql` | 3.7 |
| Analítica propia | `api/evt.js`, `public/analitica.js` | 3.8 |
| SEO y AEO | `api/sitemap.js`, `lib/head.js`, `scripts/genera-landings.mjs` | 3.9 |
| Rendimiento | `scripts/imagenes.mjs`, `vercel.json` | 3.10 |
| Seguridad | `vercel.json` | 3.11 |
| IA aplicada | `scripts/traduce-lote.mjs`, `scripts/importar-catalogo.mjs` | 3.12 |
| Retención | `api/busqueda-guardada.js`, `api/cron-alertas.js`, `api/cron-informe.js`, `api/_correo.js` | 3.6, 3.12 |
| Auditoría | `scripts/auditar.mjs` | Fases 0 a 2 |
| Datos de prueba | `ejemplos/catalogo-ejemplo.csv`, `ejemplos/semilla.sql` | — |

**Nada de esto se entrega sin ejecutar.** Las cuatro migraciones se aplican limpias
contra un Postgres 17 real; el importador crea 12 anuncios del CSV de ejemplo y al
reimportarlo actualiza los 12 sin duplicar ninguno; la normalización funde "BIESSE",
"Biesse S.p.A." y "biesse" en una sola marca; el generador produce 20 landings con
slug traducido por idioma y texto compuesto de datos reales; el cron de alertas envía
una y a la segunda ejecución envía cero; el panel se ha abierto en un navegador real a
1440 y a 390 píxeles con 16.073 eventos y 4 contactos de prueba.

De esas pruebas salieron **seis fallos reales, ya corregidos**, entre ellos uno que
habría dolido en producción: las particiones de la tabla de eventos empezaban en el mes
en curso, de modo que cualquier evento con fecha anterior fallaba al insertarse — y el
informe mensual lee justo el mes anterior.

**`scripts/auditar.mjs` está verificado contra el propio objeto de este informe.**
Ejecutado contra macchine-legno.com devuelve por sí solo **12 fallos críticos y 10
avisos**: el bucle de la portada, las fichas sin `canonical` ni `hreflang`, la ausencia
de JSON-LD, las 118 imágenes sin diferir, el `Crawl-delay: 10` y el sitemap que redirige
por idioma. Reproduce de forma independiente los hallazgos de la parte 1, y puesto en CI
impide que el sitio de Lucas repita cualquiera de ellos.

---

**Última nota, para quien implemente.** Macchine-Legno lleva veintidós años en pie y factura. Su ventaja no es la tecnología: es el inventario y la costumbre del sector. La tecnología es, de hecho, su punto más débil, y eso es precisamente la puerta. Los tres movimientos que abren más hueco, por este orden: **catálogo traducido de verdad a seis idiomas el primer día** (ellos tardan meses y dejan el checo en inglés), **fichas que pesen una quinta parte y se puedan usar desde el móvil en una nave**, y **un panel que le demuestre al anunciante, con números suyos, que pagar merece la pena**. Lo demás es ejecución.
