/* Comprueba la ruta que acepta /api/subir.
 *
 * Es la única barrera que impide que alguien con sesión escriba en la carpeta
 * de otra empresa, así que se prueba sola: la expresión del endpoint, con los
 * nombres que un navegador puede mandar.
 *
 *   node scripts/qa-subir.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La misma expresión que api/subir.js, leída del propio archivo para que el
// test falle si allí cambia sin actualizarse aquí.
const fuente = readFileSync(new URL('../api/subir.js', import.meta.url), 'utf8');
const m = /const m = (\/\^fotos.+?\/)\.exec/.exec(fuente);
assert.ok(m, 'no se encuentra la expresión de la ruta en api/subir.js');
const RE = eval(m[1]);

const empresaDe = p => { const r = RE.exec(p); return r ? Number(r[1]) : null; };

const validas = [
  ['fotos/36/maquina.jpg', 36],
  ['fotos/36/foto-1.jpeg', 36],
  ['fotos/1/a.png', 1],
  ['fotos/156/sierra_grande.webp', 156],
  ['fotos/40/x.avif', 40],
];
for (const [ruta, esperada] of validas) {
  assert.equal(empresaDe(ruta), esperada, `debería valer: ${ruta}`);
}

const invalidas = [
  'fotos/36/../40/robo.jpg',        // salirse de la carpeta
  'fotos/36/sub/carpeta.jpg',       // carpeta anidada
  '/fotos/36/foto.jpg',             // barra inicial
  'fotos//foto.jpg',                // sin empresa
  'fotos/abc/foto.jpg',             // empresa no numérica
  'fotos/36/foto.svg',              // SVG: puede llevar script
  'fotos/36/foto.html',
  'fotos/36/foto.jpg.html',
  'fotos/36/foto',                  // sin extensión
  'otra/36/foto.jpg',               // fuera de fotos/
  'fotos/36/' + 'a'.repeat(81) + '.jpg',  // nombre demasiado largo
  '',
];
for (const ruta of invalidas) {
  assert.equal(empresaDe(ruta), null, `NO debería valer: ${ruta}`);
}

// La empresa sale de la ruta, que es lo que luego se comprueba con exige():
// si no coincidieran, se autorizaría una carpeta y se escribiría en otra.
assert.equal(empresaDe('fotos/36/foto.jpg'), 36);
assert.notEqual(empresaDe('fotos/40/foto.jpg'), 36);

console.log(`OK — ${validas.length + invalidas.length} rutas comprobadas`);
