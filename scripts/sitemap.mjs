/* Regenera sitemap.xml desde la API pública. Antes era un volcado a mano del 20-09
 * que listaba las 9 empresas de demostración, legal.html (noindex) y los 14 sectores viejos.
 *
 *   node scripts/sitemap.mjs            (lee https://roble-maquinaria.vercel.app, o ROBLE_URL)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.ROBLE_URL || 'https://roble-maquinaria.vercel.app').replace(/\/+$/, '');
const carga = async (ruta, clave) => {
  const js = ruta.startsWith('http') ? await (await fetch(ruta)).text() : readFileSync(ruta, 'utf8');
  const window = {}; vm.runInNewContext(js, { window });
  if (!window[clave]) throw new Error(`${ruta} no define window.${clave}`);
  return window[clave];
};
const D = await carga(`${BASE}/api/datos.js`, 'ROBLE_DATA');
const M = await carga(`${BASE}/api/maquinaria.js`, 'ML_DATA');
const G = await carga(fileURLToPath(new URL('../assets/ml-guias.js', import.meta.url)), 'ML_GUIAS');

const empresas = D.empresas.filter(e => !e.demo);          // la demo no se indexa
const ids = new Set(empresas.map(e => e.id));
const url = (ruta, fecha) => `  <url><loc>${BASE}/${ruta}</loc>${fecha ? `<lastmod>${fecha}</lastmod>` : ''}</url>`;

const fijas = ['', 'buscar.html', 'vendedores.html', 'directorio.html', 'empresas.html',
  'productos.html', 'guias.html', 'vender.html', 'paquetes.html', 'solicitudes.html', 'para-empresas.html', 'contacto.html', 'creditos.html'];
const lineas = [
  ...fijas.map(r => url(r)),
  ...M.anuncios.filter(a => ids.has(a.vendedor_id)).map(a => url(`anuncio.html?id=${a.id}`, a.fecha)),
  ...M.vendedores.filter(v => ids.has(v.id)).map(v => url(`vendedor.html?id=${v.id}`)),
  ...D.sectores.map(s => url(`sector.html?s=${s.id}`)),
  ...empresas.map(e => url(`empresa.html?id=${e.id}`)),
  ...D.productos.filter(p => ids.has(p.empresa_id)).map(p => url(`producto.html?id=${p.id}`, p.fecha)),
  ...G.map(g => url(`guia.html?id=${g.id}`)),
];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lineas.join('\n')}\n</urlset>\n`;
writeFileSync(new URL('../sitemap.xml', import.meta.url), xml);
console.log(`sitemap.xml: ${lineas.length} URLs (${empresas.length} empresas, ${D.sectores.length} sectores, ${M.anuncios.length} anuncios)`);
