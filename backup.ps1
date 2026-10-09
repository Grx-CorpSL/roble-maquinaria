# Copia de seguridad de la base de ROBLE, antes de migrar.
#
# Hace tres cosas y las tres importan:
#   1. Volcado completo en formato custom (permite restaurar tablas sueltas).
#   2. Copia en CSV de las tablas que la migracion lee, para comparar fila a fila.
#   3. COMPRUEBA la copia: la restaura en un esquema temporal y verifica que los
#      recuentos coinciden con el original. Una copia sin probar no es una copia.
#
# Solo lee de produccion. Lo unico que escribe es en el disco local y en un
# esquema temporal que se borra al terminar.
#
# Uso:
#   powershell -File "<ruta>\roble-ml\backup.ps1"
#   powershell -File "<ruta>\roble-ml\backup.ps1" -SinComprobar   (no recomendado)

param([switch]$SinComprobar)

# 'Continue' y no 'Stop': con Stop, cualquier linea que psql escriba en stderr
# mata el script antes de la limpieza y la cadena se queda en el disco. Los
# fallos se detectan por codigo de salida, que es lo fiable con ejecutables.
$ErrorActionPreference = 'Continue'
$raiz = $PSScriptRoot
$sello = Get-Date -Format 'yyyyMMdd-HHmm'
$destino = Join-Path $raiz "backups\$sello"

Write-Host ""
Write-Host "Copia de seguridad de ROBLE" -ForegroundColor Cyan
Write-Host "---------------------------"

# --- Herramientas -----------------------------------------------------------
$pgbin = "C:\Program Files\PostgreSQL\17\bin"
$pgdump    = Join-Path $pgbin "pg_dump.exe"
$pgrestore = Join-Path $pgbin "pg_restore.exe"
$psql      = Join-Path $pgbin "psql.exe"
foreach ($t in @($pgdump, $pgrestore, $psql)) {
  if (-not (Test-Path $t)) { Write-Host "No encuentro $t" -ForegroundColor Red; exit 1 }
}

# --- Cadena de conexion -----------------------------------------------------
$fichero = @("CONEXION.txt", "conexion.local.txt") |
  ForEach-Object { Join-Path $raiz $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($env:ROBLE_DATABASE_URL) {
  Write-Host "Usando la conexion de la variable de entorno." -ForegroundColor DarkGray
} elseif ($fichero) {
  $linea = Get-Content $fichero | Where-Object { $_ -match '^\s*postgres(ql)?://' } | Select-Object -First 1
  if (-not $linea) {
    Write-Host "$(Split-Path $fichero -Leaf) no tiene ninguna linea que empiece por postgres://" -ForegroundColor Red
    exit 1
  }
  $env:ROBLE_DATABASE_URL = $linea.Trim()
  Write-Host "Cadena leida de $(Split-Path $fichero -Leaf)" -ForegroundColor DarkGray
} else {
  Write-Host "No hay cadena de conexion. Escribela en CONEXION.txt." -ForegroundColor Red
  exit 1
}

function Limpia {
  $env:ROBLE_DATABASE_URL = $null
  if ($fichero -and (Test-Path $fichero)) {
    $n = Split-Path $fichero -Leaf
    Remove-Item $fichero -Force -ErrorAction SilentlyContinue
    Write-Host "$n borrado." -ForegroundColor DarkGray
  }
}

# Todo lo que sigue va dentro de try/finally: salga como salga, Limpia corre.
try {

# pg_dump no entiende los parametros de Neon en la URL: se quitan. Si el que se
# quita era el primero, el siguiente '&' tiene que pasar a ser '?'.
$url = $env:ROBLE_DATABASE_URL -replace '[?&]channel_binding=[^&]*', ''
if ($url -notmatch '\?' -and $url -match '&') { $url = $url -replace '&', '?' }
if ($url -notmatch 'sslmode=') { $url += ($(if ($url -match '\?') { '&' } else { '?' }) + 'sslmode=require') }

# SIEMPRE por el endpoint directo, nunca por el pooler. El pooler de Neon es
# pgbouncer en modo transaccion: pg_dump y pg_restore fijan search_path='' en
# su sesion, y esa conexion vuelve al pool contaminada. La siguiente consulta
# que la herede (la nuestra, o la de la web en produccion) falla con
# 'relation "usuarios" does not exist'. Se vio al comprobar la restauracion.
$url = $url -replace '-pooler\.', '.'

New-Item -ItemType Directory -Force -Path $destino | Out-Null

# --- 1. Recuentos ANTES, para comparar despues ------------------------------
Write-Host ""
Write-Host "1) Contando filas en produccion..." -ForegroundColor Cyan
$TABLAS = @('usuarios','sesiones','productos','resenas','conversaciones','mensajes',
            'favoritos','facturas','solicitudes','publicaciones','recuperaciones',
            'stripe_webhook_events')
$consulta = ($TABLAS | ForEach-Object { "SELECT '$_' AS tabla, COUNT(*)::bigint AS filas FROM public.$_" }) -join ' UNION ALL '
$antes = & $psql $url -tA -F ',' -c "$consulta ORDER BY 1" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "No se ha podido consultar la base:" -ForegroundColor Red
  $antes | ForEach-Object { "  $_" }
  Limpia; exit 1
}
$antes | ForEach-Object { "   $_" }
$antes | Out-File (Join-Path $destino "recuentos-antes.csv") -Encoding utf8

# --- 2. Volcado completo ----------------------------------------------------
Write-Host ""
Write-Host "2) Volcado completo (formato custom)..." -ForegroundColor Cyan
$dump = Join-Path $destino "roble-$sello.dump"
& $pgdump $url --format=custom --no-owner --no-acl --file=$dump 2>&1 | ForEach-Object { "   $_" }
if (-not (Test-Path $dump)) { Write-Host "El volcado no se ha creado." -ForegroundColor Red; Limpia; exit 1 }
$mb = [math]::Round((Get-Item $dump).Length / 1MB, 2)
Write-Host "   $dump  ($mb MB)" -ForegroundColor Green

# --- 3. Copia en CSV, legible -----------------------------------------------
Write-Host ""
Write-Host "3) Copia en CSV de cada tabla..." -ForegroundColor Cyan
foreach ($t in $TABLAS) {
  $csv = Join-Path $destino "$t.csv"
  # psql responde "COPY n" con las filas de verdad. Contar lineas del CSV
  # engana: hay campos con saltos de linea (descripciones) y salen de mas.
  $salida = & $psql $url -tA -c "\copy $t TO '$csv' WITH CSV HEADER" 2>&1
  $n = ($salida | Where-Object { $_ -match '^COPY (\d+)' } | ForEach-Object { $Matches[1] } | Select-Object -First 1)
  if (Test-Path $csv) { Write-Host ("   {0,-16} {1} filas" -f $t, $(if ($n) { $n } else { '?' })) }
}

if ($SinComprobar) {
  Write-Host ""
  Write-Host "AVISO: copia SIN comprobar. Una copia sin probar no cuenta como copia." -ForegroundColor Yellow
  Limpia; exit 0
}

# --- 4. Comprobar la copia restaurandola ------------------------------------
# Se restaura en una base de datos TEMPORAL del mismo proyecto Neon y se
# comparan los recuentos. No sirve un esquema aparte: pg_dump escribe los
# nombres con esquema (public.usuarios), asi que caerian sobre las tablas
# reales. La base temporal se borra al terminar.
Write-Host ""
Write-Host "4) Comprobando la copia: restaurando en una base temporal..." -ForegroundColor Cyan
$dbTmp = "roble_prueba_restauracion"
# Cada -c va en su propia transaccion: CREATE DATABASE no admite ir dentro de una.
& $psql $url -q -c "DROP DATABASE IF EXISTS $dbTmp WITH (FORCE);" -c "CREATE DATABASE $dbTmp;" 2>&1 |
  ForEach-Object { "   $_" }
if ($LASTEXITCODE -ne 0) { Write-Host "   No se ha podido crear la base temporal." -ForegroundColor Red; exit 1 }

# La misma cadena, apuntando a la base temporal.
$urlTmp = $url -replace '/[^/?]+(\?[^/]*)?$', "/$dbTmp`$1"

& $pgrestore --dbname=$urlTmp --no-owner --no-acl --exit-on-error $dump 2>&1 |
  Select-Object -First 5 | ForEach-Object { "   $_" }
$restauroBien = ($LASTEXITCODE -eq 0)
if (-not $restauroBien) { Write-Host "   pg_restore ha devuelto error." -ForegroundColor Red }

$consulta2 = ($TABLAS | ForEach-Object { "SELECT '$_' AS tabla, COUNT(*)::bigint AS filas FROM public.$_" }) -join ' UNION ALL '
$despues = & $psql $urlTmp -tA -F ',' -c "$consulta2 ORDER BY 1" 2>&1

$ok = $restauroBien
if ($LASTEXITCODE -ne 0) {
  Write-Host "   No se ha podido leer la base restaurada:" -ForegroundColor Red
  $despues | ForEach-Object { "     $_" }
  $ok = $false
} else {
  Write-Host ""
  Write-Host "   tabla            produccion  copia" -ForegroundColor DarkGray
  $mapaAntes = @{}; $antes | ForEach-Object { $p = $_ -split ','; $mapaAntes[$p[0]] = $p[1] }
  foreach ($linea in $despues) {
    $p = $linea -split ','
    $a = $mapaAntes[$p[0]]; $d = $p[1]
    $igual = ($a -eq $d)
    if (-not $igual) { $ok = $false }
    $color = if ($igual) { 'Gray' } else { 'Red' }
    Write-Host ("   {0,-16} {1,10}  {2,5} {3}" -f $p[0], $a, $d, $(if ($igual) { '' } else { '<-- NO COINCIDE' })) -ForegroundColor $color
  }
}

# Se borra siempre. Si no se pudiera, se dice: una base temporal olvidada en
# Neon es una copia de los datos de clientes fuera de control.
$borrado = & $psql $url -q -c "DROP DATABASE IF EXISTS $dbTmp WITH (FORCE);" 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "   base temporal borrada." -ForegroundColor DarkGray
} else {
  Write-Host "   AVISO: no se ha podido borrar la base temporal $dbTmp. Borrala a mano en Neon." -ForegroundColor Yellow
  $borrado | ForEach-Object { "   $_" }
}

Write-Host ""
if ($ok) {
  Write-Host "COPIA VERIFICADA. Los recuentos coinciden." -ForegroundColor Green
  Write-Host "  $destino"
  Write-Host ""
  Write-Host "Para restaurar en caso de problema:" -ForegroundColor DarkGray
  Write-Host "  pg_restore --dbname=<cadena> --no-owner `"$dump`"" -ForegroundColor DarkGray
} else {
  Write-Host "LA COPIA NO CUADRA. No migres hasta resolverlo." -ForegroundColor Red
}

exit $(if ($ok) { 0 } else { 1 })

} finally {
  Limpia
}
