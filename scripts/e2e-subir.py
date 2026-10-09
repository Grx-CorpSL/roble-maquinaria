"""Prueba el botón «Subir fotos» del panel en un navegador real, headless.

Es el único trozo del circuito de subida que no cubre ningún otro banco:
assets/subir.js hace el PUT al almacén a mano con XMLHttpRequest, y una
cabecera de más la para el CORS del almacén aunque el servidor esté bien
(pasó con x-add-random-suffix el 2026-10-02).

Recorrido: entrar → Mis anuncios → Nuevo anuncio → ¿aparece el botón? →
subir un jpg → ¿la dirección llega al textarea? → guardar → ¿la fila muestra
la foto del almacén? → borrar el anuncio. La foto queda en el almacén: se
imprime su dirección por si se quiere borrar.

Uso (necesita Playwright para Python con Chromium):
    ROBLE_E2E_EMAIL=... ROBLE_E2E_PASSWORD=... python scripts/e2e-subir.py
La cuenta tiene que ser propietaria de una empresa con permiso de editar
productos. Vale una pendiente de moderación: no sale en la web pública.
Opcional: ROBLE_E2E_URL para probar otra dirección (por defecto producción).
"""
import os, sys, time, json, tempfile
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get("ROBLE_E2E_URL", "https://roble-maquinaria.vercel.app").rstrip("/")
EMAIL = os.environ.get("ROBLE_E2E_EMAIL", "")
PW = os.environ.get("ROBLE_E2E_PASSWORD", "")
if not EMAIL or not PW:
    sys.exit("Faltan ROBLE_E2E_EMAIL y ROBLE_E2E_PASSWORD en el entorno.")
FOTO = os.path.join(RAIZ, "assets", "img", "fotos", "sm", "tupis.jpg")
TITULO = "PRUEBA E2E subida (borrar) " + str(int(time.time()))

errores_consola, fallos_red = [], []
resultado = {"ok": False}

def paso(n, txt):
    print(f"  [{n}] {txt}", flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: errores_consola.append(m.text) if m.type == "error" else None)
    page.on("requestfailed", lambda r: fallos_red.append(f"{r.method} {r.url} -> {r.failure}"))
    page.set_default_timeout(30000)

    try:
        page.goto(f"{BASE}/acceso.html")
        page.fill("#e-email", EMAIL)
        page.fill("#e-pass", PW)
        page.click("#f-entrar button[type=submit]")
        page.wait_for_url(lambda u: "acceso.html" not in u, timeout=20000)
        paso(1, f"sesión abierta, redirigido a {page.url.replace(BASE, '')}")

        page.goto(f"{BASE}/panel/anuncios.html")
        page.wait_for_selector("#btn-new")
        page.click("#btn-new")
        page.wait_for_selector("#f-fotos")
        paso(2, "formulario de anuncio abierto")

        # El botón se enseña solo si /api/subir no responde 503.
        caja = page.locator('.subir[data-subir="f-fotos"]')
        caja.wait_for(state="attached")
        page.wait_for_function(
            "() => { const c = document.querySelector('.subir[data-subir=\"f-fotos\"]'); return c && !c.hidden; }",
            timeout=15000)
        paso(3, "botón «Subir fotos» visible: el almacén está activo")

        caja.locator("input[type=file]").set_input_files(FOTO)
        page.wait_for_function(
            "() => (document.getElementById('f-fotos').value || '').includes('blob.vercel-storage.com')",
            timeout=45000)
        url = page.eval_on_selector("#f-fotos", "e => e.value.trim()")
        estado = caja.locator(".subir-estado").inner_text()
        paso(4, f"subida hecha → {url}")
        paso(4, f"estado en pantalla: «{estado}»")
        resultado["url"] = url

        page.fill("#f-titulo", TITULO)
        page.select_option("#f-cat", index=1)
        page.click("#dr-save")
        page.wait_for_selector(f"a[data-edit] >> text={TITULO}", timeout=20000)
        fila = page.locator("a[data-edit]", has_text=TITULO).first
        pid = fila.get_attribute("data-edit")
        src = page.locator(f".cell-main:has(a[data-edit='{pid}']) img").first.get_attribute("src")
        paso(5, f"anuncio publicado con id {pid}; miniatura en la fila: {src}")
        resultado["pid"] = pid
        resultado["miniatura_del_almacen"] = "blob.vercel-storage.com" in (src or "")

        r = page.evaluate(
            "id => fetch('/api/productos?id=' + id, {method:'DELETE', credentials:'same-origin'}).then(r => r.status)",
            pid)
        paso(6, f"anuncio borrado (DELETE → {r})")
        resultado["ok"] = r == 200 and resultado["miniatura_del_almacen"]

    except Exception as e:
        print("FALLO:", repr(e)[:400])
        captura = os.path.join(tempfile.gettempdir(), "roble-e2e-fallo.png")
        page.screenshot(path=captura)
        print("captura en", captura)
    finally:
        b.close()

# ERR_ABORTED en /api/auth o en el POST final es normal: lo corta la
# navegación o el cierre del navegador, no un fallo.
print()
print("errores de consola:", len(errores_consola))
for e in errores_consola[:8]: print("   -", e[:200])
print("peticiones fallidas:", len(fallos_red))
for f in fallos_red[:8]: print("   -", f[:200])
print()
print("RESULTADO:", json.dumps(resultado, ensure_ascii=False))
sys.exit(0 if resultado["ok"] else 1)
