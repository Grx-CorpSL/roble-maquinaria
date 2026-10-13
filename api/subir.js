/* Subida de fotos al almacén de Vercel Blob, desde el panel.
 *
 *   POST /api/subir  (protocolo de @vercel/blob/client)
 *
 * El archivo va del navegador al almacén SIN pasar por esta función: aquí solo
 * se firma un permiso de un solo uso, después de comprobar en servidor que
 * quien sube tiene membresía con permiso en esa empresa. Así no aplica el
 * límite de tamaño del cuerpo de una función serverless.
 *
 * La ruta la propone el navegador, así que aquí se COMPRUEBA: tiene que ser
 * exactamente fotos/<empresa>/<nombre>.<ext>, con la empresa en la que el
 * usuario tiene permiso. Sin esa comprobación, cualquiera con sesión podría
 * escribir en la carpeta de otra empresa. `addRandomSuffix` evita pisadas.
 *
 * Hay dos formas de autenticarse contra el almacén, y se usa la que haya:
 *   - OIDC (lo que deja Vercel al conectar un store hoy): la función se
 *     identifica sola con VERCEL_OIDC_TOKEN + BLOB_STORE_ID, y el permiso se
 *     emite con issueSignedToken. No hay ningún secreto que guardar.
 *   - Token de lectura/escritura (BLOB_READ_WRITE_TOKEN), el modo de siempre.
 * Sin ninguna de las dos se responde 503 y se dice: el panel entonces sigue
 * pidiendo direcciones https, como hasta ahora.
 */

// handleUpload vive en la subruta /client aunque se ejecute en servidor: ahí
// es donde @vercel/blob 2.x lo exporta (el paquete raíz no lo tiene).
const { handleUpload, handleUploadPresigned } = require('@vercel/blob/client');
const { issueSignedToken } = require('@vercel/blob');
const { usuarioDeSesion, esAdmin } = require('./auth');
const { exige } = require('./_permisos');
const { registra, init } = require('./_esquema');
const { cuerpo } = require('./sesion');

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_BYTES = 8 * 1024 * 1024;   // 8 MB por foto
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

/* ponytail: límite en memoria por instancia, como los demás de esta API.
   Frena la subida masiva casual; un contador de verdad iría en base. */
const SUBIDAS = new Map();
const MAX_HORA = 60;
function demasiadas(clave) {
  const ahora = Date.now();
  const r = SUBIDAS.get(clave);
  if (!r || ahora - r.desde > 3600e3) { SUBIDAS.set(clave, { desde: ahora, n: 1 }); return false; }
  r.n++;
  return r.n > MAX_HORA;
}

/* Nombre de la variable: unas veces Vercel la crea en mayúsculas y otras en
   minúsculas, así que se aceptan las dos. */
const tokenBlob = () =>
  process.env.BLOB_READ_WRITE_TOKEN || process.env.blob_read_write_token || '';
// OIDC: la función se identifica sola, no hay secreto que guardar.
const hayOidc = () => !!(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);

/* LA comprobación: la ruta viene del navegador, así que se valida en vez de
   confiar en ella, y la empresa sale de la propia ruta, no de un campo aparte
   que podría no coincidir con la carpeta donde se acaba escribiendo.
   Devuelve el id de empresa o lanza. La usan los dos caminos. */
async function autoriza(usuario, pathname) {
  const m = /^fotos\/(\d+)\/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp|avif)$/.exec(String(pathname || ''));
  if (!m) throw new Error('Nombre de archivo no válido.');
  const empresaId = Number(m[1]);
  if (!esAdmin(usuario.email)) {
    const g = await exige(usuario, empresaId, 'productos.editar');
    if (!g.ok) throw new Error(g.error);
  }
  return empresaId;
}

function alTerminar(ip) {
  return async ({ blob, tokenPayload }) => {
    let d = {};
    try { d = JSON.parse(tokenPayload || '{}'); } catch { d = {}; }
    await init();
    await registra({
      user_id: d.user_id || null, empresa_id: d.empresa_id || null,
      accion: 'foto.subida', datos: { url: blob.url, tam: blob.size }, ip,
    });
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido.' }); return; }
  const token = tokenBlob();
  if (!token && !hayOidc()) {
    res.status(503).json({ error: 'La subida de fotos aún no está activa en esta web.' });
    return;
  }

  try {
    // Vercel entrega el cuerpo como objeto, string o Buffer; la librería espera
    // un objeto con `type`, así que se normaliza como en el resto de la API.
    const body = cuerpo(req);
    /* El aviso de «subida terminada» lo manda el almacén, no el navegador: llega
       sin cookie y lo autentica la firma x-vercel-signature, que comprueba la
       librería antes de llamar a alTerminar. Pedirle sesión lo rechazaba con 401
       y la subida nunca quedaba en auditoría. */
    const aviso = body.type === 'blob.upload-completed';
    const usuario = aviso ? null : await usuarioDeSesion(req);
    if (!aviso && !usuario) { res.status(401).json({ error: 'Tienes que haber iniciado sesión.' }); return; }
    if (!aviso && demasiadas(String(usuario.id))) {
      res.status(429).json({ error: 'Has subido muchas fotos seguidas. Inténtalo dentro de un rato.' });
      return;
    }

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    const comun = { request: req, body, onUploadCompleted: alTerminar(ip) };

    // Con OIDC el permiso se pide al almacén firmado por la identidad de la
    // función; el token de lectura/escritura solo se usa si no hay OIDC.
    const resultado = hayOidc()
      ? await handleUploadPresigned({
          ...comun,
          getSignedToken: async (pathname) => {
            const empresaId = await autoriza(usuario, pathname);
            const firmado = await issueSignedToken({
              pathname, operations: ['put'],
              allowedContentTypes: TIPOS, maximumSizeInBytes: MAX_BYTES,
            });
            return {
              token: firmado,
              urlOptions: {
                addRandomSuffix: true,
                callbackUrl: '/api/subir',
                tokenPayload: JSON.stringify({ empresa_id: empresaId, user_id: usuario.id }),
              },
            };
          },
        })
      : await handleUpload({
          ...comun,
          token,
          onBeforeGenerateToken: async (pathname) => {
            const empresaId = await autoriza(usuario, pathname);
            return {
              allowedContentTypes: TIPOS,
              maximumSizeInBytes: MAX_BYTES,
              addRandomSuffix: true,
              tokenPayload: JSON.stringify({ empresa_id: empresaId, user_id: usuario.id }),
            };
          },
        });

    res.status(200).json(resultado);
  } catch (err) {
    console.error(JSON.stringify({ evt: 'subir_error', msg: err.message }));
    // handleUpload lanza con el mensaje de onBeforeGenerateToken cuando se deniega.
    res.status(400).json({ error: err.message || 'No hemos podido subir la foto.' });
  }
};

module.exports.TIPOS = TIPOS;
module.exports.MAX_BYTES = MAX_BYTES;
module.exports.EXT = EXT;
