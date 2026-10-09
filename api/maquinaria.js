/* Anuncios de maquinaria en vivo, con la misma forma que tenía assets/ml-data.js.
 *
 *   GET /api/maquinaria.js           → window.ML_DATA = { categorias, vendedores, anuncios, ... }
 *   GET /api/maquinaria.js?panel=1   → lo mismo, sin caché (para el panel y el admin)
 *
 * Un anuncio ES un producto del sector Maquinaria y un vendedor ES una empresa
 * de ese sector: se derivan de /api/datos.js (misma clasificación, mismas
 * consultas). Marca, modelo, año, estado y precio no existen en la base y van
 * vacíos («a consultar»), exactamente como en el extracto anterior. La
 * taxonomía de 76 categorías, las fotos por categoría, los países, los tipos
 * de vendedor y los paquetes son fijos: viven en _maquinaria.json.
 */

const { datos, alcance } = require('./datos');
const FIJO = require('./_maquinaria.json');
const SECTORES = require('./_sectores.json');

const slug = txt => String(txt || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Subsector del producto → categoría de maquinaria. Los seis pares son los que
   tenía el extracto (31 de 31 anuncios); para subsectores nuevos se busca la
   categoría cuyo id o nombre aparezca en el subsector o el título, y si no,
   «varios». */
const CAT_POR_SUB = {
  'centros-de-mecanizado-cnc': 'centros-de-mecanizado-cnc',
  'chapadoras-de-cantos': 'encoladoras-de-cantos',
  'escuadradoras': 'escuadradoras-y-sierras-circulares',
  'fabricantes-de-herramientas-de-mecanizado-fresas-brocas-sierras-cuchillas': 'herramientas',
  'regruesadoras-y-cepilladoras': 'regruesadoras',
  'seccionadoras-y-sierras': 'seccionadoras-horizontales',
};
function catDe(p) {
  const s = slug(p.sub);
  if (CAT_POR_SUB[s]) return CAT_POR_SUB[s];
  // El panel guarda la categoría con su nombre exacto: vuelve tal cual.
  const exacta = FIJO.categorias.find(c => c.id === s || slug(c.nombre) === s);
  if (exacta) return exacta.id;
  const texto = slug(p.sub + ' ' + p.titulo);
  const c = FIJO.categorias.find(c => texto.includes(c.id) || texto.includes(slug(c.nombre)));
  return c ? c.id : 'varios';
}

/* Tipo de vendedor, deducido de lo que la empresa dice de sí misma. Sin
   pistas, ninguno: no se le atribuye lo que no ha dicho. */
function tiposDe(desc) {
  const t = String(desc || '').toLowerCase();
  const tipos = [];
  // Solo «fabrica»: «producción a medida» o «diseño» no bastan para decir que fabrica.
  if (/fabric/.test(t)) tipos.push('produccion');
  if (/distribu|venta|comerc|compraventa|representa/.test(t)) tipos.push('comercio');
  if (/reparaci|asistencia|servicio t[eé]cnico|mantenimiento|asesor/.test(t)) tipos.push('asistencia');
  return tipos;
}

async function maquinaria(opc) {
  const d = await datos(opc);
  // Vendedor = empresa de Maquinaria o que tenga al menos un anuncio de maquinaria.
  const conAnuncio = new Set(d.productos.filter(p => p.sector === 'maquinaria').map(p => p.empresa_id));
  const empresas = d.empresas.filter(e => e.sectores.includes('maquinaria') || e.sectores.includes('maquinaria-ocasion') || conAnuncio.has(e.id));
  const porId = Object.fromEntries(empresas.map(e => [e.id, e]));

  const vendedores = empresas.map(e => ({
    id: e.id, nombre: e.nombre, tipos: tiposDe(e.desc), ciudad: e.ciudad, region: e.region, pais: 'ES',
    desc: e.desc, web: e.web, telefono: e.telefono, anio: e.anio,
    destacado: e.plan === 'premium' && !e.demo, servicios: e.servicios,
  }));

  const anuncios = d.productos
    .filter(p => p.sector === 'maquinaria' && porId[p.empresa_id])
    .map(p => { const v = porId[p.empresa_id]; return {
      id: p.id, titulo: p.titulo, cat: catDe(p), sub: p.sub, marca: '', modelo: '', anio: null, estado: '', precio: null,
      desc: p.desc, vendedor_id: p.empresa_id, vendedor: v.nombre, pais: 'ES',
      zona: [v.ciudad, v.region].filter(Boolean).join(', '), ce: null, specs: [],
      fotos: p.fotos, destacado: p.destacado, fecha: p.fecha,
    }; })
    .sort((a, b) => (b.destacado - a.destacado) || String(b.fecha).localeCompare(String(a.fecha)) || (b.id - a.id));

  const categorias = FIJO.categorias.map(c => ({ ...c, anuncios: anuncios.filter(a => a.cat === c.id).length }));

  return { generado: d.generado, categorias, vendedores, anuncios,
           paises: FIJO.paises, tiposVendedor: FIJO.tiposVendedor, paquetes: FIJO.paquetes, fotos: FIJO.fotos,
           whatsapp: FIJO.whatsapp || '',
           sectores: SECTORES.map(x => ({ id: x.id, n: x.n, nombre: x.nombre, corto: x.corto, empresas: d.empresas.filter(e => e.sectores.includes(x.id)).length })) };
}

module.exports = async function handler(req, res) {
  try {
    const salida = await maquinaria(await alcance(req));
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', req.query?.panel !== undefined
      ? 'no-store'
      : 'public, max-age=0, must-revalidate');
    // El navegador pregunta siempre; la CDN guarda un minuto. Antes la CDN podía servir la copia
    // vieja hasta 10 min tras desplegar y el navegador la guardaba sin caducidad («public» a secas).
    if (req.query?.panel === undefined) res.setHeader('Vercel-CDN-Cache-Control', 'max-age=60, stale-while-revalidate=30');
    res.status(200).send('window.ML_DATA=' + JSON.stringify(salida) + ';');
  } catch (err) {
    console.error(JSON.stringify({ evt: 'maquinaria_error', msg: err.message }));
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).send('window.ML_DATA=null;');
  }
};

module.exports.maquinaria = maquinaria;
module.exports.catDe = catDe;
