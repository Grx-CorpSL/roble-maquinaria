#!/usr/bin/env node
/* scripts/auditar.mjs — auditoría de un sitio multiidioma, en vivo.
 *
 * Es la misma herramienta con la que se auditó macchine-legno.com. Sirve para
 * dos cosas: vigilar el sitio propio en CI, y medir a cualquier competidor.
 *
 * Comprueba, sobre URLs reales:
 *   1. Negociación de idioma: que no haya bucle para clientes sin Accept-Language
 *      (el fallo que deja fuera a GPTBot, ClaudeBot y las previsualizaciones de WhatsApp)
 *   2. Lista blanca de idiomas: que /xx sea 404 y no una redirección a la nada
 *   3. Vary correcto en las respuestas negociadas
 *   4. canonical + hreflang RECÍPROCO + x-default en todas las páginas
 *   5. JSON-LD y Open Graph presentes y parseables
 *   6. Cabeceras de seguridad
 *   7. Peso de página, número de peticiones, imágenes sin lazy/srcset
 *   8. robots.txt y sitemap: Crawl-delay, índice, lastmod
 *
 * Uso:
 *   node scripts/auditar.mjs https://midominio.com
 *   node scripts/auditar.mjs https://midominio.com --rutas /es,/es/bordeadoras
 *   node scripts/auditar.mjs https://www.macchine-legno.com --idiomas it,en,fr,de,es
 *
 * Sale con código 1 si hay fallos críticos: úsalo como puerta de despliegue.
 */

import http from 'node:http';
import https from 'node:https';

const args = process.argv.slice(2);
const BASE = (args[0] || '').replace(/\/+$/, '');
if (!BASE) {
  console.error('Uso: node scripts/auditar.mjs https://dominio [--rutas /a,/b] [--idiomas es,en]');
  process.exit(2);
}
const opt = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const IDIOMAS = opt('idiomas', 'es,en,fr').split(',');
const RUTAS = opt('rutas', '').split(',').filter(Boolean);
const RECIPROCIDAD = !args.includes('--sin-reciprocidad');   // descarga los alternos
const UA = 'Mozilla/5.0 (compatible; AuditorSIMBAI/1.0)';

const criticos = [];
const avisos = [];
const ok = [];

const marca = (nivel, msg) =>
  (nivel === 'critico' ? criticos : nivel === 'aviso' ? avisos : ok).push(msg);

/* Petición con control total de las cabeceras: fetch() de Node añade
 * "Accept-Language: *" por su cuenta y eso enmascara el caso "cliente sin
 * cabecera de idioma", que es justo el que rompe en el sitio auditado. */
function peticionCruda(url, acceptLanguage) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const headers = { 'User-Agent': 'GPTBot/1.0', Accept: '*/*', Connection: 'close' };
    if (acceptLanguage !== null) headers['Accept-Language'] = acceptLanguage;

    const req = mod.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', headers },
      (res) => {
        res.resume();   // se descarta el cuerpo: sólo interesan estado y Location
        resolve({ status: res.statusCode, location: res.headers.location || '' });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function cabeza(url, cabeceras = {}) {
  const r = await fetch(url, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA, ...cabeceras } });
  return { status: r.status, headers: r.headers, texto: r.status < 300 ? await r.text() : '' };
}

/* ---------- 1 y 2: negociación de idioma ---------- */
async function pruebaIdioma() {
  console.log('\n== Negociación de idioma ==');

  /* Clientes "raros" en la raíz. Aquí es donde se cae macchine-legno.com:
   *   · sin Accept-Language  → Location: /   (bucle infinito)
   *   · Accept-Language: *   → Location: /*  (ruta basura)
   * Ambos casos son reales y los sufren GPTBot, ClaudeBot, monitores de uptime
   * y los previsualizadores de enlace de WhatsApp, Telegram y LinkedIn.
   *
   * Nota: fetch() de Node añade "Accept-Language: *" por su cuenta, así que el
   * caso "sin cabecera" se prueba con http nativo, no con fetch. */
  const casos = [
    ['sin Accept-Language', null],
    ['Accept-Language: *', '*'],
    ['Accept-Language: xx-XX', 'xx-XX'],
    ['Accept-Language vacío', ''],
  ];

  for (const [etiqueta, valor] of casos) {
    let url = BASE + '/';
    let saltos = 0;
    const vistos = new Set([url]);
    let destino = null;

    while (saltos < 10) {
      const r = await peticionCruda(url, valor);
      if (r.status < 300 || r.status >= 400) { destino = url; break; }
      const loc = new URL(r.location, url).toString();
      if (vistos.has(loc)) {
        marca('critico', `BUCLE de redirección en la raíz con ${etiqueta}: ${loc} se repite. Bots e IA no pueden entrar al sitio.`);
        destino = 'BUCLE';
        break;
      }
      vistos.add(loc);
      url = loc;
      saltos++;
    }

    if (destino === 'BUCLE') continue;
    if (saltos >= 10) { marca('critico', `Más de 10 redirecciones en la raíz con ${etiqueta}.`); continue; }

    // El destino tiene que ser un prefijo de idioma de la lista blanca.
    const tramo = new URL(url).pathname.split('/')[1] || '';
    if (IDIOMAS.includes(tramo)) {
      marca('ok', `Raíz con ${etiqueta} → /${tramo} en ${saltos} salto(s)`);
    } else {
      marca('critico', `Raíz con ${etiqueta} acaba en "${new URL(url).pathname}", que no es un idioma válido. Falta el idioma de último recurso.`);
    }
  }

  // Cada idioma llega a su prefijo
  for (const l of IDIOMAS) {
    const r = await fetch(BASE + '/', {
      method: 'GET', redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept-Language': `${l}-${l.toUpperCase()},${l};q=0.9` },
    });
    const loc = r.headers.get('location') || '';
    if (loc.endsWith('/' + l)) marca('ok', `Accept-Language ${l} → ${loc}`);
    else marca('aviso', `Accept-Language ${l} → ${loc || r.status} (esperado .../${l})`);

    const vary = (r.headers.get('vary') || '').toLowerCase();
    if (r.status >= 300 && r.status < 400 && !vary.includes('accept-language')) {
      marca('critico', `Redirección negociada por idioma SIN "Vary: Accept-Language" (Vary: ${vary || 'ausente'}). Un CDN envenenará la caché.`);
    }
    if (r.status === 301) {
      marca('aviso', 'La redirección de idioma es 301. Debería ser 302: la respuesta depende del cliente.');
    }
  }

  // Idioma inexistente
  const r = await fetch(BASE + '/xx', { redirect: 'manual', headers: { 'User-Agent': UA } });
  if (r.status === 404) marca('ok', '/xx devuelve 404 (lista blanca correcta)');
  else marca('critico', `/xx devuelve ${r.status} → ${r.headers.get('location') || ''}. Falta validar contra la lista de idiomas.`);
}

/* ---------- 4 y 5: cabeza de las páginas ---------- */
function extrae(html, re) {
  const salida = [];
  let m;
  while ((m = re.exec(html))) salida.push(m[1]);
  return salida;
}

async function pruebaPagina(ruta) {
  const url = BASE + ruta;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) {
    marca('aviso', `${ruta} devuelve ${r.status}`);
    return;
  }
  const html = await r.text();
  const nombre = ruta || '/';

  // canonical
  const canonical = extrae(html, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/gi);
  if (!canonical.length) marca('critico', `${nombre}: SIN rel="canonical"`);
  else if (canonical.length > 1) marca('critico', `${nombre}: ${canonical.length} canonical distintos`);
  else marca('ok', `${nombre}: canonical → ${canonical[0]}`);

  // hreflang
  const bloque = html.match(/<link[^>]+hreflang="[^"]+"[^>]*>/gi) || [];
  const langs = bloque.map((b) => (b.match(/hreflang="([^"]+)"/i) || [])[1]);
  const alternos = bloque.map((b) => ({
    lang: (b.match(/hreflang="([^"]+)"/i) || [])[1],
    href: (b.match(/href="([^"]+)"/i) || [])[1],
  })).filter((a) => a.lang && a.href);

  if (!langs.length) marca('critico', `${nombre}: SIN hreflang (el fallo de las 5.725 fichas de macchine-legno)`);
  else {
    marca('ok', `${nombre}: ${langs.length} hreflang (${langs.join(', ')})`);
    if (!langs.includes('x-default')) marca('aviso', `${nombre}: falta hreflang="x-default"`);

    /* Reciprocidad real, no sólo presencia. Es el fallo que arruina la mayoría
     * de implementaciones: si A declara a B y B no declara a A, Google descarta
     * el grupo ENTERO y todo el trabajo no sirve de nada. Se comprueba yendo a
     * buscar la página alterna, que es la única forma de saberlo. */
    if (RECIPROCIDAD) {
      for (const alt of alternos.filter((a) => a.lang !== 'x-default').slice(0, 4)) {
        if (alt.href === url) continue;
        try {
          const ra = await fetch(alt.href, { headers: { 'User-Agent': UA } });
          if (!ra.ok) {
            marca('critico', `${nombre}: el alterno ${alt.lang} devuelve ${ra.status} → ${alt.href}`);
            continue;
          }
          const ha = await ra.text();
          const vuelta = (ha.match(/<link[^>]+hreflang="[^"]+"[^>]*>/gi) || [])
            .map((b) => (b.match(/href="([^"]+)"/i) || [])[1]);
          if (!vuelta.includes(url)) {
            marca('critico',
              `${nombre}: la versión ${alt.lang} NO declara de vuelta esta URL. ` +
              `El grupo hreflang entero queda invalidado.`);
          } else {
            marca('ok', `${nombre} ↔ ${alt.lang}: reciprocidad correcta`);
          }
        } catch (e) {
          marca('aviso', `${nombre}: no se pudo comprobar el alterno ${alt.lang} (${e.message})`);
        }
      }
    }
  }

  // JSON-LD
  const ld = extrae(html, /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  if (!ld.length) marca('critico', `${nombre}: SIN datos estructurados JSON-LD`);
  else {
    const tipos = [];
    for (const bloque of ld) {
      try {
        const j = JSON.parse(bloque);
        tipos.push(j['@type'] || '?');
      } catch {
        marca('critico', `${nombre}: JSON-LD que no parsea`);
      }
    }
    marca('ok', `${nombre}: JSON-LD ${tipos.join(', ')}`);
  }

  // Open Graph
  const og = ['og:title', 'og:description', 'og:image', 'og:url'].filter(
    (p) => !new RegExp(`property="${p}"`, 'i').test(html)
  );
  if (og.length) marca('aviso', `${nombre}: faltan ${og.join(', ')} — el enlace no se previsualiza en WhatsApp`);
  else marca('ok', `${nombre}: Open Graph completo`);

  // h1
  const h1 = (html.match(/<h1[^>]*>/gi) || []).length;
  if (h1 !== 1) marca('aviso', `${nombre}: ${h1} etiquetas h1 (debería ser 1)`);

  // imágenes
  const imgs = (html.match(/<img[^>]*>/gi) || []);
  const lazy = imgs.filter((i) => /loading="lazy"/i.test(i)).length;
  const srcset = imgs.filter((i) => /srcset=/i.test(i)).length;
  if (imgs.length > 20 && lazy / imgs.length < 0.5) {
    marca('critico', `${nombre}: ${imgs.length} imágenes y sólo ${lazy} con loading="lazy"`);
  }
  if (imgs.length > 10 && srcset === 0) {
    marca('aviso', `${nombre}: ${imgs.length} imágenes, ninguna con srcset`);
  }

  // peso
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  if (kb > 120) marca('aviso', `${nombre}: HTML de ${kb} KB sin comprimir`);
}

/* ---------- 6: cabeceras de seguridad ---------- */
async function pruebaSeguridad() {
  console.log('\n== Cabeceras de seguridad ==');
  const r = await fetch(BASE + '/' + IDIOMAS[0], { headers: { 'User-Agent': UA } });
  const req = {
    'strict-transport-security': 'critico',
    'content-security-policy': 'critico',
    'x-content-type-options': 'aviso',
    'referrer-policy': 'aviso',
    'permissions-policy': 'aviso',
  };
  for (const [h, nivel] of Object.entries(req)) {
    if (r.headers.get(h)) marca('ok', `${h}: presente`);
    else marca(nivel, `Falta la cabecera ${h}`);
  }
}

/* ---------- 8: robots y sitemap ---------- */
async function pruebaRobots() {
  console.log('\n== robots.txt y sitemap ==');
  const rb = await fetch(BASE + '/robots.txt', { headers: { 'User-Agent': UA } });
  if (rb.ok) {
    const t = await rb.text();
    const cd = t.match(/crawl-delay:\s*(\d+)/i);
    if (cd) marca('critico', `robots.txt tiene Crawl-delay: ${cd[1]}. Con miles de URLs, el rastreo tarda días.`);
    else marca('ok', 'robots.txt sin Crawl-delay');
    if (!/sitemap:/i.test(t)) marca('aviso', 'robots.txt no declara Sitemap:');
    for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot']) {
      if (new RegExp(`User-agent:\\s*${bot}[\\s\\S]{0,80}Disallow:\\s*/`, 'i').test(t)) {
        marca('aviso', `${bot} bloqueado en robots.txt. Si el objetivo es ser citado por IA, esto lo impide.`);
      }
    }
  } else marca('aviso', 'robots.txt no accesible');

  const sm = await fetch(BASE + '/sitemap.xml', { redirect: 'manual', headers: { 'User-Agent': UA } });
  if (sm.status >= 300 && sm.status < 400) {
    marca('critico', `/sitemap.xml REDIRIGE a ${sm.headers.get('location')}. Un crawler sólo verá un idioma.`);
  } else if (sm.ok) {
    const t = await sm.text();
    const esIndice = /<sitemapindex/i.test(t);
    const urls = (t.match(/<loc>/g) || []).length;
    const lastmod = (t.match(/<lastmod>/g) || []).length;
    marca('ok', `sitemap: ${esIndice ? 'índice' : 'urlset'} con ${urls} entradas`);
    if (!esIndice && urls > 10000) marca('aviso', `sitemap único con ${urls} URLs: trocéalo`);
    if (!esIndice && lastmod === 0) marca('critico', 'sitemap sin ninguna etiqueta <lastmod>');
  } else marca('aviso', `/sitemap.xml devuelve ${sm.status}`);
}

/* ---------- ejecución ---------- */
const rutas = RUTAS.length ? RUTAS : IDIOMAS.map((l) => '/' + l);

await pruebaIdioma();
console.log('\n== Páginas ==');
for (const r of rutas) await pruebaPagina(r);
await pruebaSeguridad();
await pruebaRobots();

console.log('\n' + '='.repeat(64));
console.log(`OK: ${ok.length}   Avisos: ${avisos.length}   Críticos: ${criticos.length}`);
if (args.includes('--verbose')) {
  console.log('\nCOMPROBACIONES CORRECTAS');
  ok.forEach((o) => console.log('  - ' + o));
}
if (avisos.length) {
  console.log('\nAVISOS');
  avisos.forEach((a) => console.log('  - ' + a));
}
if (criticos.length) {
  console.log('\nCRÍTICOS');
  criticos.forEach((c) => console.log('  - ' + c));
  process.exit(1);
}
console.log('\nSin fallos críticos.');
