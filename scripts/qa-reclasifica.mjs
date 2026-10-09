/* Banco de api/_reclasifica.js sin Neon: el ciclo plan → aplica → revierte con
 * la base simulada, y las frases que más fácil engañan a las reglas.
 *
 * Uso:  node scripts/qa-reclasifica.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const esquema = require('../api/_esquema.js');
const U = {
  1: { id: 1, empresa: 'A', sector: 'materias-primas', categorias: 'materias-primas', descripcion: 'fabricantes de sillas y mesas de madera', descripcion_larga: '', servicios: '' },
  2: { id: 2, empresa: 'B', sector: 'maquinaria', categorias: 'maquinaria', descripcion: '', descripcion_larga: '', servicios: '' },
};
const AUD = [];
const sql = (s, ...v) => {
  const t = s.join('?').replace(/\s+/g, ' ');
  if (/FROM information_schema/.test(t)) return Promise.resolve([]);
  if (/SELECT id, empresa, sector, categorias/.test(t)) return Promise.resolve(Object.values(U));
  if (/UPDATE usuarios SET sector/.test(t)) { const [sec, cat, id] = v; U[id].sector = sec; U[id].categorias = cat; return Promise.resolve([]); }
  if (/SELECT DISTINCT ON \(empresa_id\)/.test(t)) return Promise.resolve(AUD.slice().reverse().map(a => ({ empresa_id: a.empresa_id, datos: a.datos })));
  throw new Error('consulta no simulada: ' + t.slice(0, 60));
};
esquema.db = () => sql; esquema.init = async () => {}; esquema.registra = async r => { AUD.push(r); };
for (const k of Object.keys(require.cache)) if (/_reclasifica\.js$/.test(k)) delete require.cache[k];
const R = require('../api/_reclasifica.js');

let total = 0, fallos = 0;
const ok = (t, c) => { total++; if (!c) fallos++; console.log(`  ${c ? 'OK   ' : 'FALLA'} ${t}`); };

console.log('\nfrases que deben ir donde dicen (o a ningún sitio)');
const trampas = [
  ['software de ventanas para windows', 'tecnologia-software'],
  ['distribuidor de tableros: aglomerado, MDF y melamina', 'tablero-aglomerado-y-mdf'],
  ['organizacion de ferias y eventos del sector', 'comunicacion-eventos'],
  ['aserradero de madera maciza', 'materias-primas'],
  ['espuma de poliuretano para tapiceria y descanso', 'sofas'],
  ['transporte y entrega de muebles para tiendas online', 'carpinteros'],
  ['maquinaria especial para la madera', 'maquinaria'],
];
for (const [t, esp] of trampas) { const r = R.clasifica({ descripcion: t }); ok(`«${t}» → ${r[0] || '-'}`, r[0] === esp); }
ok('«» → nada', R.clasifica({ descripcion: '' }).length === 0);
ok('«tapiceria» NO va a barnices por «poliuretano»', !R.clasifica({ descripcion: 'espuma de poliuretano para tapiceria' }).includes('acabados-tratamientos'));
ok('«tiendas online» NO va a amueblar tiendas', !R.clasifica({ descripcion: 'logistica para tiendas online' }).includes('amueblamiento-tiendas'));

console.log('\nciclo plan → aplica → revierte');
const p = await R.plan();
ok('plan: 1 cambia, 1 sin regla', p.cambian === 1 && p.sin_reglas === 1);
await R.aplica(p.cambios);
ok('aplica escribe sector y categorias', U[1].sector === 'mesas' && U[1].categorias === 'mesas\nsillas');
ok('la empresa sin regla no se toca', U[2].sector === 'maquinaria');
ok('auditoría guarda el antes', AUD.length === 1 && AUD[0].accion === 'empresa.reclasificada' && AUD[0].datos.antes.sector === 'materias-primas');
const n = await R.revierte();
ok('revierte desde auditoría', n === 1 && U[1].sector === 'materias-primas' && U[1].categorias === 'materias-primas');

console.log(`\n${total - fallos}/${total} comprobaciones correctas.`);
if (fallos) process.exit(1);
