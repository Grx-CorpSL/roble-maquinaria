/* Reclasifica las empresas en los 38 sectores leyendo lo que ellas mismas
 * escribieron en su descripción y servicios.
 *
 * NO SE EJECUTA SOLO. Simulacro por defecto; escribe con --confirmar.
 *
 * Qué hace: para cada empresa, busca en descripción + descripción larga +
 * servicios las palabras clave de cada sector (REGLAS). Cada sector con
 * coincidencia entra en `categorias` (hasta 5, el tope del panel); el de más
 * coincidencias pasa a `sector`. Si ninguna regla encaja, la empresa se queda
 * como está (en el general que le tocó por el mapa).
 *
 * Qué no hace: adivinar. Una empresa que dice «muebles de cocina y baño»
 * entra en cocina y baño; una que dice «mobiliario a medida» sin más se queda
 * en mueble de hogar. Las reglas se escribieron leyendo las 156 descripciones
 * reales, no al revés.
 *
 * Garantías: solo UPDATE de `sector` y `categorias` en usuarios (columnas que
 * roble_app ya puede escribir); cada cambio queda en auditoría como
 * 'empresa.reclasificada' con el antes y el después; --revertir deshace
 * leyendo la auditoría.
 *
 * Uso (con ROBLE_DATABASE_URL de roble_app):
 *   node api/_reclasifica.js               → simulacro, tabla empresa → sectores
 *   node api/_reclasifica.js --confirmar   → escribe
 *   node api/_reclasifica.js --revertir    → restaura desde auditoría
 */

const { db, init, registra } = require('./_esquema');
const SECTORES = require('./_sectores.json');
const IDS = new Set(SECTORES.map(s => s.id));

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* Cada regla: sector → expresiones sobre el texto normalizado (sin acentos,
   minúsculas). Van de lo específico a lo general; un término general como
   «mueble» NO asigna sector por sí solo. */
const REGLAS = {
  'maquinaria':                ['maquinaria (especial |industrial )?para (la )?madera', 'maquinaria para carpinteria', 'lineas de produccion', 'maquinaria para carpinteria', 'centros? de mecanizado', 'seccionadora', 'escuadradora', 'canteadora', 'encoladora', 'cnc\\b', 'maquinaria (nueva|usada|de ocasion|de segunda mano)'],
  'tecnicos-de-maquinaria':    ['mantenimiento de maquinaria', 'reparacion de maquinaria', 'servicio tecnico', 'reparacion de (maquinaria|centros)', 'asistencia tecnica.*maquin'],
  'tecnologia-software':       ['software', 'cad[ /-]?cam', 'erp\\b', 'optimizaci?on de corte', 'programa cad', 'solidworks', 'digitalizar'],
  'comunicacion-eventos':      ['\\bferias?\\b', 'eventos', 'asociacion', 'federacion', 'medio de comunicacion', 'publicacion del sector', 'portal de comunicacion', 'revista'],
  'materias-primas':           ['aserradero', 'madera maciza', 'maderas? (duras|serrada|tropical)', 'chapas? (natural|desenrollada|de madera)', 'rechapado', 'laminad[oa] encolad', 'importacion.*madera', 'distribuci?on de madera', 'industria maderera', 'chapas y tableros', 'chapas y (laminados|madera)'],
  'tablero-aglomerado-y-mdf':  ['tableros?( de madera)?[:,]', 'aglomerado', '\\bmdf\\b', 'contrachapado', 'melamin', '\\bosb\\b', 'alistonado', 'tableros melaminicos', 'tableros curvados', 'hpl\\b'],
  'almacenes-de-puertas':      ['almacen(es)? de puertas', 'distribuci?on de puertas'],
  'puertas-de-cocina':         ['puertas de cocina', 'frentes de cocina'],
  'paneles-decorativos':       ['paneles decorativos', 'revestimientos? de (pared|madera)', 'laminados decorativos', 'molduras'],
  'encimeras-de-cocina':       ['encimeras?', 'superficies compactas', 'compacto fenolico'],
  'cantos-para-muebles':       ['cantos?\\b.*mueble', 'canteado\\b', 'perfiles para mueble'],
  'herrajes-accesorios':       ['herrajes?', 'bisagras?', 'guias (correderas|de cajon)', 'tiradores?', 'cerraduras?', 'manillas?', 'ferreteria'],
  'colas-y-liquidos-de-limpieza': ['colas?\\b', 'adhesivos?', 'selladores?', 'disolventes?', 'limpieza', 'desengrasante'],
  // «poliuretanos» (barniz) sí; «poliuretano» a secas no: en tapicería es espuma.
  'acabados-tratamientos':     ['barniz', 'lacas?\\b', 'lacado', 'tintes?\\b', 'recubrimientos', 'pinturas?\\b', 'poliuretanos\\b', 'acabados? (para|de) (la )?madera', 'tratamientos? de proteccion', 'esmaltes'],
  'herramientas-mecanizado':   ['herramientas? de (corte|mecanizado)', 'fresas\\b', 'brocas\\b', 'cuchillas\\b', 'sierras de cinta'],
  'carpinteria-construccion':  ['puertas? (de madera|a medida|blindad|cortafuego|y ventanas)', 'fabrica(cion)? de puertas', 'puertas, ventanas', 'carpinteria de armar', 'escaleras de madera', 'tarimas?', 'pergolas?', 'portones', 'balconeras', 'cerramientos', 'contraventanas', 'miradores'],
  'ventanas':                  ['ventanas?\\b'],
  'consumibles-casas-prefabricadas': ['herrajes para construccion', 'aislamientos', 'membranas', 'consumibles.*construccion'],
  'construccion-madera':       ['\\bclt\\b', 'contralaminad', 'entramado ligero', 'casas? (prefabricada|de madera|en clt)', 'construccion (industrializada|con madera|en madera)', 'estructuras? de madera', 'madera laminada', 'passivhaus', 'viviendas? en madera'],
  'carpinteros':               ['ebanisteria', 'carpinteria (de madera )?a medida', 'mueble a medida en madera', 'montaje (e instalacion )?de muebles', 'montaje de mobiliario', 'montadores', 'transporte y (montaje|entrega)', 'logistica (del mueble|integral)', 'restauracion', 'carpinteria tecnica', 'taller propio'],
  'complementos-de-madera':    ['mueble auxiliar', 'cabeceros', 'recibidores', 'estanterias', 'mueble de tv', 'comodas', 'cajoneras', 'complementos de madera'],
  'contract-proyectos':        ['\\bcontract\\b', 'hosteleria', 'hoteles', 'restaurantes', 'interiorismo', 'llave en mano', 'stands?\\b', 'mobiliario (comercial|corporativo)', 'espacios comerciales'],
  // «tiendas online» es logística, no amueblar tiendas.
  'amueblamiento-tiendas':     ['tiendas(?! online)', 'franquicias', '\\bretail\\b', 'mostradores', 'vitrinas', 'expositores', 'corners'],
  'armarios':                  ['armarios?\\b', 'vestidores', 'frentes de armario'],
  'muebles-de-cocina':         ['muebles? de cocina', 'cocinas? (y|a medida)', 'fabricantes de cocinas', 'mobiliario de .*cocina', 'cocina, ba', 'estudios de cocina', 'modulos de cocina', 'diseno de cocina'],
  'muebles-de-bano':           ['muebles? (de|para) bano', 'mobiliario (de|para) bano', 'bano a medida', 'cocina y bano', 'accesorios para bano', 'banos?\\b.*(muebl|a medida)'],
  'muebles-de-oficina':        ['muebles? de oficina', 'mobiliario (de|para) oficinas?', 'oficinas?\\b.*mobiliario'],
  'mueble-kit':                ['mueble kit', '\\bkit\\b', 'listo para montar', '\\brta\\b', 'plegables'],
  'mueble-por-ambiente':       ['muebles? de hogar', 'mobiliario de (salon|hogar)', 'salon, dormitorio', 'dormitorio', 'mueble de exterior', 'mobiliario exterior', 'muebles de madera maciza', 'muebles a medida de madera', 'fabricante de muebles', 'fabricacion de muebles', 'muebles? a medida', 'mobiliario (a medida|personalizado|de alta gama|singular)'],
  'mueble-juvenil':            ['juvenil', 'infantil'],
  'mesas':                     ['\\bmesas?\\b'],
  'sillas':                    ['\\bsillas?\\b', 'silleria', 'taburetes', 'banquetas', 'sillones'],
  'canapes':                   ['canapes?\\b'],
  'patas-para-canapes':        ['patas (para|de) canap', 'patas\\b.*mueble', 'zocalos', 'niveladores'],
  'somieres':                  ['(fabric|vent|distribu)\w* .{0,40}somier', 'somieres y bases', 'bases? tapizadas?'],
  'sofas':                     ['sofas?\\b', 'butacas?', 'tapizad', 'tapiceria', 'tapiceros', 'espumas?\\b', 'goma ?espuma', 'tejidos', 'telas\\b', 'guata', 'textil', 'mueble tapizado', 'descanso'],
  'colchones':                 ['colchon', 'colchones'],
};
const RE = Object.fromEntries(Object.entries(REGLAS).map(([k, v]) => [k, v.map(p => new RegExp(p, 'i'))]));
for (const k of Object.keys(RE)) if (!IDS.has(k)) throw new Error('regla para un sector que no existe: ' + k);

/* Sectores para una empresa, por número de coincidencias (más primero). */
function clasifica(e) {
  const texto = norm([e.descripcion_larga, e.descripcion, e.servicios].filter(Boolean).join(' '));
  if (!texto.trim()) return [];
  const puntos = [];
  for (const [id, res] of Object.entries(RE)) {
    const n = res.reduce((a, r) => a + (r.test(texto) ? 1 : 0), 0);
    if (n) puntos.push([id, n]);
  }
  return puntos.sort((a, b) => b[1] - a[1]).map(p => p[0]).slice(0, 5);
}

async function empresas() {
  await init();
  return db()`
    SELECT id, empresa, sector, categorias, descripcion, descripcion_larga, servicios
    FROM usuarios WHERE rol = 'empresa' AND eliminada IS NULL ORDER BY id`;
}

/* Plan: qué cambiaría en cada empresa. Solo lectura. */
async function plan() {
  const filas = await empresas();
  const cambios = [];
  let sinReglas = 0;
  for (const e of filas) {
    const nuevos = clasifica(e);
    if (!nuevos.length) { sinReglas++; continue; }
    const actuales = String(e.categorias || '').split(/\n+/).filter(Boolean);
    const igual = nuevos.join('\n') === actuales.join('\n') && nuevos[0] === e.sector;
    if (!igual) cambios.push({ id: e.id, empresa: e.empresa, antes: { sector: e.sector, categorias: actuales }, despues: nuevos });
  }
  return { total: filas.length, cambian: cambios.length, sin_reglas: sinReglas, cambios };
}

async function aplica(cambios) {
  const sql = db();
  let n = 0;
  for (const c of cambios) {
    await sql`UPDATE usuarios SET sector = ${c.despues[0]}, categorias = ${c.despues.join('\n')} WHERE id = ${c.id}`;
    await registra({ user_id: null, empresa_id: c.id, accion: 'empresa.reclasificada', entidad: 'empresa', entidad_id: c.id,
                     datos: { antes: c.antes, despues: c.despues } });
    n++;
  }
  return n;
}

/* Deshace leyendo la auditoría: el último 'empresa.reclasificada' de cada empresa. */
async function revierte() {
  await init();
  const sql = db();
  const filas = await sql`
    SELECT DISTINCT ON (empresa_id) empresa_id, datos FROM auditoria
    WHERE accion = 'empresa.reclasificada' ORDER BY empresa_id, creada DESC`;
  let n = 0;
  for (const f of filas) {
    const a = (f.datos || {}).antes; if (!a) continue;
    await sql`UPDATE usuarios SET sector = ${a.sector}, categorias = ${a.categorias.join('\n') || null} WHERE id = ${f.empresa_id}`;
    await registra({ empresa_id: f.empresa_id, accion: 'empresa.reclasificada.revertida', entidad: 'empresa', entidad_id: f.empresa_id });
    n++;
  }
  return n;
}

module.exports = { clasifica, plan, aplica, revierte, REGLAS };

if (require.main === module) {
  const args = process.argv.slice(2);
  (async () => {
    if (args.includes('--revertir')) { console.log('Revertidas:', await revierte()); return; }
    const p = await plan();
    const nombre = id => (SECTORES.find(s => s.id === id) || {}).corto || id;
    for (const c of p.cambios) console.log(`${String(c.id).padStart(4)}  ${c.empresa.slice(0, 28).padEnd(28)}  ${c.antes.sector || '-'}  →  ${c.despues.map(nombre).join(' · ')}`);
    console.log(`\n${p.total} empresas · ${p.cambian} cambian · ${p.sin_reglas} sin regla que encaje (se quedan como están)`);
    const reparto = {};
    for (const c of p.cambios) for (const s of c.despues) reparto[s] = (reparto[s] || 0) + 1;
    console.log('sectores que reciben empresas:', Object.keys(reparto).length, 'de', SECTORES.length);
    if (!args.includes('--confirmar')) { console.log('\nSIMULACRO: no se ha escrito nada. Para escribir: --confirmar'); return; }
    console.log('\nEscribiendo…'); console.log('Actualizadas:', await aplica(p.cambios));
  })().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
