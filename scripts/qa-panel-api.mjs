/* Banco de pruebas de autorización y validación de /api/empresa y
 * /api/productos, con la base de datos y la sesión SIMULADAS: no toca Neon.
 *
 * Lo que comprueba es lo que decide la seguridad del panel: que sin sesión no
 * se puede nada, que un lector no edita, que quien no es miembro recibe el
 * mismo 404 que si la empresa no existiera, que un producto ajeno no se puede
 * tocar aunque se conozca su id, que el administrador sí puede, y que las
 * validaciones frenan antes de escribir.
 *
 * Uso:  node scripts/qa-panel-api.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
/* ── Base simulada ─────────────────────────────────────────────────────────
   Empresas 10 (Alfa) y 20 (Beta). Ana(1) propietaria de Alfa; Luis(2) lector
   de Alfa; Beto(3) propietario de Beta; Dani(4) sin empresa; Root(9) admin.
   Producto 100 es de Alfa, 200 es de Beta. */
const MEMBRESIAS = { '1|10': 'propietario', '2|10': 'lector', '3|20': 'propietario' };
const PRODUCTOS = { 100: { id: 100, user_id: 10 }, 200: { id: 200, user_id: 20 } };
const escrituras = [];
function sqlFalso(strings, ...values) {
  const t = strings.join('?').replace(/\s+/g, ' ');
  if (/FROM information_schema\.tables/.test(t)) return Promise.resolve(['empresas', 'membresias', 'invitaciones', 'verificaciones_email', 'emails_verificados', 'auditoria'].map(n => ({ table_name: n })));
  if (/FROM membresias m JOIN empresas e/.test(t)) {
    const rol = MEMBRESIAS[`${values[0]}|${values[1]}`];
    return Promise.resolve(rol ? [{ rol, estado: 'activa', estado_empresa: 'activa', nombre: 'X' }] : []);
  }
  if (/SELECT id, user_id FROM productos/.test(t)) return Promise.resolve(PRODUCTOS[values[0]] ? [PRODUCTOS[values[0]]] : []);
  if (/COUNT\(\*\)::int AS n FROM productos/.test(t)) return Promise.resolve([{ n: 3 }]);
  if (/^ ?SELECT id, empresa, descripcion/.test(t)) return Promise.resolve(values[0] === 10 ? [{ id: 10, empresa: 'Alfa', categorias: 'maquinaria' }] : []);
  if (/^ ?UPDATE usuarios SET/.test(t)) { escrituras.push('UPDATE usuarios ' + values.at(-1)); return Promise.resolve(values.at(-1) === 10 || values.at(-1) === 20 ? [{ id: values.at(-1) }] : []); }
  if (/^ ?UPDATE empresas SET nombre/.test(t)) { escrituras.push('UPDATE empresas'); return Promise.resolve([]); }
  if (/^ ?INSERT INTO productos/.test(t)) { escrituras.push('INSERT productos ' + values[0]); return Promise.resolve([{ id: 999 }]); }
  if (/^ ?UPDATE productos SET/.test(t)) { escrituras.push('UPDATE productos ' + values.at(-1)); return Promise.resolve([]); }
  if (/^ ?DELETE FROM productos/.test(t)) { escrituras.push('DELETE productos ' + values[0]); return Promise.resolve([]); }
  if (/INSERT INTO auditoria/.test(t)) return Promise.resolve([]);
  // moderación y visibilidad
  if (/^ ?UPDATE empresas SET estado/.test(t)) { const id = values.at(-1); if (id !== 10 && id !== 20) return Promise.resolve([]); escrituras.push('UPDATE empresas estado ' + id); return Promise.resolve([{ id }]); }
  if (/FROM usuarios u LEFT JOIN empresas em/.test(t)) return Promise.resolve([
    { id: 10, cuenta: 'a@x.es', estado_mod: 'activa', empresa: 'Alfa', categorias: 'maquinaria', plan: 'gratuito' },
    { id: 20, cuenta: 'b@x.es', estado_mod: 'pendiente', origen: 'alta', empresa: 'Beta', categorias: 'maquinaria', plan: 'gratuito' },
    { id: 30, cuenta: 'c@x.es', estado_mod: null, empresa: 'Gama', categorias: 'maquinaria', plan: 'gratuito' }]);
  if (/FROM productos p JOIN usuarios u/.test(t)) return Promise.resolve([{ id: 100, titulo: 'Sierra', sector: 'maquinaria', user_id: 10 }, { id: 200, titulo: 'Prensa', sector: 'maquinaria', user_id: 20 }]);
  // contactos
  if (/SELECT id, empresa, email, email_contacto FROM usuarios/.test(t)) return Promise.resolve(values[0] === 10 ? [{ id: 10, empresa: 'Alfa', email: 'x@directorio.roble.es', email_contacto: null }] : []);
  if (/^ ?INSERT INTO solicitudes/.test(t)) { escrituras.push('INSERT solicitudes ' + values.at(-1) + ' tel=' + values[2]); return Promise.resolve([]); }
  if (/FROM solicitudes WHERE destino_id/.test(t)) return Promise.resolve(values[0] === 10 ? [{ id: 500, nombre: 'Pepe', email: 'p@x.es', telefono: '612 34 56 78', mensaje: 'Sobre: Sierra\n\nHola', estado: 'nueva', creada: '2026-09-27', destino_id: 10 }] : []);
  if (/SELECT id, destino_id FROM solicitudes/.test(t)) return Promise.resolve({ 500: [{ id: 500, destino_id: 10 }], 600: [{ id: 600, destino_id: 20 }] }[values[0]] || []);
  if (/^ ?UPDATE solicitudes SET estado/.test(t)) { escrituras.push('UPDATE solicitudes ' + values.at(-1)); return Promise.resolve([]); }
  throw new Error('consulta no simulada: ' + t.slice(0, 80));
}
const esquema = require('../api/_esquema.js');
esquema.db = () => sqlFalso;
esquema.init = async () => {};
esquema.registra = async () => {};   // la auditoría real escribe en Neon; aquí no hay Neon
// _permisos y auth importaron db/init por destructuring: se recargan con el stub puesto.
for (const k of Object.keys(require.cache)) if (/[\\/]api[\\/](_permisos|auth|sesion|empresa|productos|datos|admin)\.js$/.test(k)) delete require.cache[k];
process.env.ROBLE_ADMIN_EMAILS = 'root@roble.es';
const auth = require('../api/auth.js');
const USUARIOS = { 1: { id: 1, email: 'ana@x.es' }, 2: { id: 2, email: 'luis@x.es' }, 3: { id: 3, email: 'beto@x.es' }, 4: { id: 4, email: 'dani@x.es' }, 9: { id: 9, email: 'root@roble.es' } };
auth.usuarioDeSesion = async req => USUARIOS[req.usuario] || null;
for (const k of Object.keys(require.cache)) if (/[\\/]api[\\/](empresa|productos|_contacto|contactos|_correo)\.js$/.test(k)) delete require.cache[k];
const empresa = require('../api/empresa.js');
const productos = require('../api/productos.js');
// El formulario público entra por POST en /api/contactos; el mismo handler sirve al panel.
const contacto = require('../api/contactos.js');
const contactos = require('../api/contactos.js');
function res() { const r = { code: 0, body: null, h: {} }; r.setHeader = (k, v) => { r.h[k] = v; }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; }
let nReq = 0; const req = (usuario, method, query = {}, body = {}) => ({ usuario, method, query, body, headers: { 'x-forwarded-for': '10.0.0.' + (nReq++ % 250) } });
function comprueba(t, ok) { total++; if (!ok) fallos++; console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${t}`); }
let fallos = 0, total = 0;
async function caso(t, handler, rq, esperado, escrituraEsperada) {
  total++; const antes = escrituras.length; const r = res(); await handler(rq, r);
  const escribio = escrituras.slice(antes);
  const ok = r.code === esperado && (escrituraEsperada === undefined || (escrituraEsperada ? escribio.length > 0 : escribio.length === 0));
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${t.padEnd(58)} -> ${r.code}${escribio.length ? '  escribió: ' + escribio.join('; ') : ''}${ok ? '' : '  (esperado ' + esperado + ')'}`);
}
const FICHA = { nombre: 'Alfa SL', desc: 'x', web: 'https://alfa.es', email: 'info@alfa.es', sectores: ['maquinaria'], servicios: 'a, b' };
const PROD = { titulo: 'Sierra', sector: 'maquinaria', sub: 's', desc: 'd', fotos: ['https://img.example/1.jpg'] };
console.log('\n/api/empresa');
await caso('sin sesión: 401 y no escribe', empresa, req(null, 'PATCH', { id: 10 }, FICHA), 401, false);
await caso('propietaria edita su empresa: 200 y escribe', empresa, req(1, 'PATCH', { id: 10 }, FICHA), 200, true);
await caso('lector NO edita: 403 y no escribe', empresa, req(2, 'PATCH', { id: 10 }, FICHA), 403, false);
await caso('lector sí lee (GET): 200', empresa, req(2, 'GET', { id: 10 }), 200, false);
await caso('no miembro: 404 (igual que inexistente), no escribe', empresa, req(3, 'PATCH', { id: 10 }, FICHA), 404, false);
await caso('empresa inexistente: 404', empresa, req(1, 'PATCH', { id: 999 }, FICHA), 404, false);
await caso('sin empresa (comprador): 404', empresa, req(4, 'PATCH', { id: 10 }, FICHA), 404, false);
await caso('admin edita cualquier empresa: 200', empresa, req(9, 'PATCH', { id: 20 }, FICHA), 200, true);
await caso('validación: sin nombre -> 400, no escribe', empresa, req(1, 'PATCH', { id: 10 }, { ...FICHA, nombre: '' }), 400, false);
await caso('validación: web sin http -> 400', empresa, req(1, 'PATCH', { id: 10 }, { ...FICHA, web: 'alfa.es' }), 400, false);
await caso('validación: sector inventado -> 400', empresa, req(1, 'PATCH', { id: 10 }, { ...FICHA, sectores: ['zzz'] }), 400, false);
await caso('método no permitido: 405', empresa, req(1, 'DELETE', { id: 10 }), 405, false);
console.log('\n/api/productos');
await caso('sin sesión: 401', productos, req(null, 'POST', {}, { empresa_id: 10, ...PROD }), 401, false);
await caso('propietaria crea en su empresa: 201', productos, req(1, 'POST', {}, { empresa_id: 10, ...PROD }), 201, true);
await caso('propietaria NO crea en empresa ajena (empresa_id manipulado): 404', productos, req(1, 'POST', {}, { empresa_id: 20, ...PROD }), 404, false);
await caso('lector NO crea: 403', productos, req(2, 'POST', {}, { empresa_id: 10, ...PROD }), 403, false);
await caso('propietaria edita su producto: 200', productos, req(1, 'PATCH', { id: 100 }, PROD), 200, true);
await caso('propietaria NO edita producto ajeno (id conocido): 404', productos, req(1, 'PATCH', { id: 200 }, PROD), 404, false);
await caso('producto inexistente: 404 (mismo mensaje)', productos, req(1, 'PATCH', { id: 555 }, PROD), 404, false);
await caso('lector NO borra: 403', productos, req(2, 'DELETE', { id: 100 }), 403, false);
await caso('propietaria borra el suyo: 200', productos, req(1, 'DELETE', { id: 100 }), 200, true);
await caso('propietaria NO borra el ajeno: 404', productos, req(1, 'DELETE', { id: 200 }), 404, false);
await caso('admin borra cualquiera: 200', productos, req(9, 'DELETE', { id: 200 }), 200, true);
await caso('validación: foto sin https -> 400', productos, req(1, 'POST', {}, { empresa_id: 10, ...PROD, fotos: ['http://x/1.jpg'] }), 400, false);
await caso('validación: sin título -> 400', productos, req(1, 'POST', {}, { empresa_id: 10, ...PROD, titulo: '' }), 400, false);
const MSG = { destino_id: 10, nombre: 'Pepe', email: 'p@x.es', mensaje: 'Hola, me interesa', producto: 'Sierra', telefono: '612 34 56 78' };

console.log('\n/api/contacto (público)');
await caso('mensaje correcto: 201 y escribe en solicitudes', contacto, req(null, 'POST', {}, MSG), 201, true);
comprueba('el WhatsApp español sin prefijo se guarda como +34…', escrituras.at(-1).endsWith('tel=+34612345678'));
await caso('WhatsApp con prefijo (+351 912…): 201', contacto, req(null, 'POST', {}, { ...MSG, telefono: '+351 912 345 678' }), 201, true);
comprueba('con prefijo se respeta tal cual', escrituras.at(-1).endsWith('tel=+351912345678'));
await caso('sin WhatsApp: 400', contacto, req(null, 'POST', {}, { ...MSG, telefono: '' }), 400, false);
await caso('WhatsApp de 5 cifras: 400', contacto, req(null, 'POST', {}, { ...MSG, telefono: '12345' }), 400, false);
await caso('trampa _honey: 200 y NO escribe', contacto, req(null, 'POST', {}, { ...MSG, _honey: 'x' }), 200, false);
await caso('sin correo válido: 400', contacto, req(null, 'POST', {}, { ...MSG, email: 'no' }), 400, false);
await caso('sin mensaje: 400', contacto, req(null, 'POST', {}, { ...MSG, mensaje: '' }), 400, false);
await caso('empresa inexistente: 400', contacto, req(null, 'POST', {}, { ...MSG, destino_id: 999 }), 400, false);
await caso('GET sin sesión ya no es el formulario: 401', contacto, req(null, 'GET', {}, {}), 401, false);
for (let i = 0; i < 5; i++) await contacto({ ...req(null, 'POST', {}, MSG), headers: { 'x-forwarded-for': '9.9.9.9' } }, res());
await caso('sexto mensaje seguido desde la misma IP: 429', contacto, { ...req(null, 'POST', {}, MSG), headers: { 'x-forwarded-for': '9.9.9.9' } }, 429, false);
console.log('\n/api/contactos (panel)');
await caso('sin sesión: 401', contactos, req(null, 'GET', { empresa: 10 }), 401, false);
await caso('propietaria lista los suyos: 200', contactos, req(1, 'GET', { empresa: 10 }), 200, false);
{ const r = res(); await contactos(req(1, 'GET', { empresa: 10 }), r); comprueba('la lista trae el número listo para wa.me', r.body.contactos[0].whatsapp === '34612345678'); }
await caso('lector también lista (contactos.ver): 200', contactos, req(2, 'GET', { empresa: 10 }), 200, false);
await caso('no miembro: 404', contactos, req(3, 'GET', { empresa: 10 }), 404, false);
await caso('propietaria cambia estado: 200 y escribe', contactos, req(1, 'PATCH', { id: 500 }, { estado: 'cerrado' }), 200, true);
await caso('lector NO gestiona: 403', contactos, req(2, 'PATCH', { id: 500 }, { estado: 'cerrado' }), 403, false);
await caso('contacto de otra empresa (id conocido): 404', contactos, req(1, 'PATCH', { id: 600 }, { estado: 'cerrado' }), 404, false);
await caso('estado inventado: 400', contactos, req(1, 'PATCH', { id: 500 }, { estado: 'spam' }), 400, false);
await caso('admin gestiona cualquiera: 200', contactos, req(9, 'PATCH', { id: 600 }, { estado: 'en-curso' }), 200, true);
console.log('\n/api/admin (moderación)');
const admin = require('../api/admin.js');
await caso('sin sesión: 401', admin, req(null, 'PATCH', { empresa: 20 }, { estado: 'activa' }), 401, false);
await caso('propietaria (no admin): 404, no revela el endpoint', admin, req(1, 'PATCH', { empresa: 10 }, { estado: 'suspendida' }), 404, false);
await caso('admin aprueba una alta: 200 y escribe', admin, req(9, 'PATCH', { empresa: 20 }, { estado: 'activa' }), 200, true);
await caso('admin, estado inventado: 400', admin, req(9, 'PATCH', { empresa: 20 }, { estado: 'publicada' }), 400, false);
await caso('admin, empresa inexistente: 404', admin, req(9, 'PATCH', { empresa: 999 }, { estado: 'activa' }), 404, false);
await caso('admin, GET: 405', admin, req(9, 'GET', { empresa: 20 }), 405, false);

console.log('\n/api/datos.js (visibilidad)');
{ const { datos } = require('../api/datos.js');
  const pub = await datos(), todo = await datos({ todas: true }), mio = await datos({ propias: [20] });
  comprueba('público: solo activas (y antiguas sin fila en empresas)', pub.empresas.map(e => e.id).join() === '10,30');
  comprueba('público: los productos de una pendiente no salen', pub.productos.map(p => p.id).join() === '100');
  comprueba('público: nunca el correo de la cuenta', pub.empresas.every(e => !('cuenta' in e)));
  comprueba('admin: todas, con estado y correo de cuenta', todo.empresas.length === 3 && todo.empresas.find(e => e.id === 20).estado === 'pendiente' && todo.empresas[0].cuenta === 'a@x.es');
  comprueba('miembro: ve su empresa pendiente, sin correos de cuenta', mio.empresas.map(e => e.id).join() === '10,20,30' && mio.empresas.every(e => !('cuenta' in e))); }
{ const r = res(); await contactos(req(1, 'GET', { todas: 1 }), r); comprueba('contactos de todas las empresas: 404 si no eres admin', r.code === 404); }

console.log('\n/api/maquinaria.js (categorías)');
{ const { catDe } = require('../api/maquinaria.js'); const cats = require('../api/_maquinaria.json').categorias;
  const malas = cats.filter(c => catDe({ sub: c.nombre, titulo: 'x' }) !== c.id);
  comprueba(`las ${cats.length} categorías vuelven tal cual guardadas por nombre`, !malas.length);
  if (malas.length) console.log('   ', malas.map(c => c.id).join(', ')); }

console.log(`\n${total - fallos}/${total} comprobaciones correctas.`);
if (fallos) process.exit(1);
