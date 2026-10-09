/* Pone una variable en el proyecto Vercel roble-maquinaria leyendo su valor de
 * SECRETO.txt. Para secretos que no deben pasar por la terminal ni el chat.
 * El fichero se borra al terminar, salga como salga.
 *
 *   node scripts/variable-vercel.mjs RESEND_API_KEY
 */

import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROYECTO = 'roble-maquinaria';   // NUNCA maqdemad
const fichero = join(RAIZ, 'SECRETO.txt');

function main() {
  const nombre = process.argv[2];
  if (!nombre || !/^[A-Z][A-Z0-9_]*$/.test(nombre)) { console.log('Uso: node scripts/variable-vercel.mjs NOMBRE_VARIABLE'); return 1; }
  if (!existsSync(fichero)) { console.log('Falta SECRETO.txt con el valor en una línea.'); return 1; }
  const valor = readFileSync(fichero, 'utf8').split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('Pega ') && !l.startsWith('Este archivo'))[0];
  if (!valor) { console.log('SECRETO.txt no tiene ningún valor.'); return 1; }

  const enlace = JSON.parse(readFileSync(join(RAIZ, '.vercel', 'project.json'), 'utf8'));
  if (enlace.projectName !== PROYECTO) { console.log(`Carpeta enlazada a "${enlace.projectName}", no a ${PROYECTO}. No se toca.`); return 1; }

  const vercel = (args, input) => spawnSync('vercel', args, { cwd: RAIZ, shell: true, input, encoding: 'utf8' });
  vercel(['env', 'rm', nombre, 'production', '-y']);
  const r = vercel(['env', 'add', nombre, 'production'], valor);
  const limpia = s => (s || '').split('\n').filter(l => l.trim() && !l.includes(valor)).slice(-2).join('\n');
  if (r.status !== 0) { console.log('ERROR al poner la variable:\n' + limpia(r.stderr) + limpia(r.stdout)); return 1; }
  console.log(`${nombre} puesta en Vercel (${PROYECTO}, production). Hace falta redesplegar para que las funciones la lean.`);
  return 0;
}

let codigo = 1;
try { codigo = main(); }
finally { if (existsSync(fichero)) { unlinkSync(fichero); console.log('SECRETO.txt borrado.'); } }
process.exit(codigo);
