/* Subir fotos desde el panel.
 *
 * Dos pasos, hechos a mano para no cargar una librería de 88 KB ni abrir la
 * CSP a una CDN:
 *   1. POST /api/subir  → el servidor comprueba el permiso y firma un token
 *      de un solo uso para esa ruta.
 *   2. PUT a blob.vercel-storage.com con ese token: el archivo va directo del
 *      navegador al almacén, sin pasar por la función ni por su límite de
 *      tamaño.
 *
 * Aquí no hay ninguna decisión de seguridad: las comprobaciones de tipo y
 * tamaño son para avisar antes de empezar; las de verdad las hace el servidor
 * al firmar y el almacén al recibir.
 *
 * Si el almacén no está conectado, /api/subir responde 503 y el botón no
 * aparece: el panel sigue aceptando direcciones https escritas a mano.
 */
window.Subir = (function () {
  const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
  const MAX = 8 * 1024 * 1024;
  const API = 'https://blob.vercel-storage.com';

  /* Nombre limpio: el servidor exige fotos/<empresa>/<nombre>.<ext> y rechaza
     cualquier otra cosa, así que se construye aquí uno que encaje. */
  function ruta(empresaId, archivo) {
    const ext = EXT[archivo.type] || 'jpg';
    const base = (archivo.name || 'foto')
      .replace(/\.[^.]*$/, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'foto';
    return `fotos/${empresaId}/${base}.${ext}`;
  }

  function revisa(archivo) {
    if (!TIPOS.includes(archivo.type)) return 'Solo se pueden subir imágenes JPG, PNG, WebP o AVIF.';
    if (archivo.size > MAX) return `«${archivo.name}» pesa más de 8 MB.`;
    return null;
  }

  async function pideToken(pathname) {
    const r = await fetch('/api/subir', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: { pathname, callbackUrl: '/api/subir', clientPayload: null, multipart: false },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No hemos podido subir la foto.');
    if (!d.clientToken) throw new Error('El servidor no ha dado permiso para subir.');
    return d.clientToken;
  }

  /* PUT con XMLHttpRequest, no fetch: es lo que da progreso de subida. */
  function envia(archivo, pathname, token, alProgresar) {
    return new Promise((cumple, falla) => {
      const x = new XMLHttpRequest();
      x.open('PUT', `${API}/${pathname}`, true);
      x.setRequestHeader('authorization', `Bearer ${token}`);
      x.setRequestHeader('x-content-type', archivo.type);
      x.setRequestHeader('x-vercel-blob-access', 'public');
      // Nada más: el sufijo aleatorio y los límites ya van dentro del token
      // que firmó el servidor. Una cabecera extra aquí la para el CORS del
      // almacén (comprobado en navegador: x-add-random-suffix lo bloquea).
      if (alProgresar && x.upload) {
        x.upload.onprogress = e => { if (e.lengthComputable) alProgresar(Math.round(e.loaded / e.total * 100)); };
      }
      x.onload = () => {
        let d = {};
        try { d = JSON.parse(x.responseText || '{}'); } catch { d = {}; }
        if (x.status >= 200 && x.status < 300 && d.url) cumple(d.url);
        else falla(new Error(d.error?.message || d.error || 'El almacén ha rechazado la foto.'));
      };
      x.onerror = () => falla(new Error('Se ha cortado la conexión al subir la foto.'));
      x.send(archivo);
    });
  }

  /* Sube un archivo y devuelve su dirección. */
  async function una(archivo, empresaId, alProgresar) {
    const mal = revisa(archivo);
    if (mal) throw new Error(mal);
    const pathname = ruta(empresaId, archivo);
    const token = await pideToken(pathname);
    return envia(archivo, pathname, token, alProgresar);
  }

  /* ¿Está el almacén conectado? Se pregunta una vez por carga de página: un
     cuerpo vacío no llega a firmar nada, solo distingue 503 de lo demás. */
  let activa = null;
  function disponible() {
    if (activa === null) {
      activa = fetch('/api/subir', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      }).then(r => r.status !== 503).catch(() => false);
    }
    return activa;
  }

  return { una, revisa, ruta, disponible, TIPOS, MAX };
})();
