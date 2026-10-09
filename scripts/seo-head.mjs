/* Añade canonical y Open Graph a las páginas que no los tienen.
 *
 * Es el fallo que el informe de macchine-legno señala como más caro: sus fichas,
 * el 97 % de sus URLs, no llevan canonical, así que sus versiones compiten entre
 * sí en Google. Nosotros teníamos el mismo agujero.
 *
 * Idempotente: pasarlo dos veces no duplica nada.
 *
 * Uso:
 *   node scripts/seo-head.mjs            simulacro, no escribe
 *   node scripts/seo-head.mjs --escribir
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITIO = process.env.ROBLE_URL || 'https://roble-maquinaria.vercel.app';
const IMAGEN = '/assets/img/fotos/hero.jpg';

const escribir = process.argv.includes('--escribir');

/* Páginas cuyo contenido depende de la query (?id=...): su canonical debe
   apuntar a la página sin parámetros, o cada variante se indexa por separado. */
const CON_PARAMETROS = new Set([
  'producto.html', 'empresa.html', 'anuncio.html', 'categoria.html',
  'sector.html', 'vendedor.html', 'guia.html', 'buscar.html',
]);

const entrecomilla = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function paginas(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.html'))
    .map(e => join(dir, e.name));
}

function procesa(ruta) {
  const nombre = basename(ruta);
  let html = readFileSync(ruta, 'utf8');

  if (html.includes('rel="canonical"')) return { nombre, estado: 'ya lo tenía' };

  const titulo = (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1].trim();
  const desc = (html.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [, ''])[1].trim();
  if (!titulo) return { nombre, estado: 'sin <title>, se omite' };

  /* Una página noindex no lleva canonical: sería una señal contradictoria
     («no me indexes» + «esta es mi URL buena»). robots.txt ya las bloquea. */
  if (/name="robots"[^>]*noindex/.test(html)) return { nombre, estado: 'omitida (noindex)' };

  const url = nombre === 'index.html' ? SITIO + '/' : `${SITIO}/${nombre}`;
  const tipo = CON_PARAMETROS.has(nombre) ? 'article' : 'website';

  const bloque = [
    `  <link rel="canonical" href="${url}">`,
    `  <meta property="og:type" content="${tipo}">`,
    `  <meta property="og:url" content="${url}">`,
    `  <meta property="og:title" content="${entrecomilla(titulo)}">`,
    desc ? `  <meta property="og:description" content="${entrecomilla(desc)}">` : null,
    `  <meta property="og:image" content="${SITIO}${IMAGEN}">`,
    `  <meta property="og:site_name" content="ROBLE">`,
    `  <meta property="og:locale" content="es_ES">`,
    `  <meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join('\n');

  // Detrás de la descripción si existe; si no, detrás del <title>.
  const ancla = desc
    ? html.match(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/)[0]
    : html.match(/<\/title>/)[0];
  html = html.replace(ancla, ancla + '\n' + bloque);

  if (escribir) writeFileSync(ruta, html);
  return { nombre, estado: escribir ? 'añadido' : 'se añadiría' };
}

/* Solo las páginas públicas. panel/ y admin/ son privadas: no se indexan ni se
   comparten en redes, así que un canonical ahí no pinta nada. */
const rutas = paginas(RAIZ);
const r = rutas.map(procesa);
for (const x of r) console.log(`  ${x.nombre.padEnd(24)} ${x.estado}`);

const n = r.filter(x => x.estado.startsWith('añadid') || x.estado.startsWith('se añad')).length;
console.log(`\n${n} de ${r.length} páginas.`);
if (!escribir) console.log('SIMULACRO: no se ha escrito nada. Para aplicar: --escribir');
