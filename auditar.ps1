# Auditoría de solo lectura de la base de ROBLE.
#
# Se puede lanzar desde cualquier carpeta: calcula sus rutas a partir de la
# ubicación del propio script, no del directorio actual.
#
# La cadena de conexión se pide por pantalla y vive solo en esta ventana:
# no se guarda en ningún archivo, no se escribe en el historial y no aparece
# en pantalla mientras se teclea.
#
# Uso:
#   powershell -File "<ruta>\roble-ml\auditar.ps1"
#   powershell -File "<ruta>\roble-ml\auditar.ps1" -Json

param([switch]$Json)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

Write-Host ""
Write-Host "Auditoria de ROBLE (solo lectura)" -ForegroundColor Cyan
Write-Host "---------------------------------"

# Dependencias: si faltan, se instalan en roble-ml, no globalmente.
if (-not (Test-Path (Join-Path $raiz "node_modules\@neondatabase"))) {
  Write-Host "Instalando dependencias..." -ForegroundColor Yellow
  Push-Location $raiz
  npm install --no-audit --no-fund --silent
  Pop-Location
}

# La cadena, por orden: variable de entorno, fichero conexion.local.txt, o
# preguntando. El fichero existe porque en algunas terminales de Windows no se
# puede pegar en un Read-Host -AsSecureString. Se borra al terminar.
$fichero = @("CONEXION.txt", "conexion.local.txt") |
  ForEach-Object { Join-Path $raiz $_ } |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $fichero) { $fichero = Join-Path $raiz "CONEXION.txt" }

if ($env:ROBLE_DATABASE_URL) {
  Write-Host "Usando la conexion de la variable de entorno." -ForegroundColor DarkGray
} elseif (Test-Path $fichero) {
  $linea = Get-Content $fichero | Where-Object { $_ -match '^\s*postgres(ql)?://' } | Select-Object -First 1
  if ($linea) {
    $env:ROBLE_DATABASE_URL = $linea.Trim()
    Write-Host "Cadena leida de $(Split-Path $fichero -Leaf)" -ForegroundColor DarkGray
  } else {
    Write-Host "$(Split-Path $fichero -Leaf) no tiene ninguna linea que empiece por postgres://" -ForegroundColor Red
    Write-Host "Pega la cadena dentro del fichero, en una sola linea, y guarda." -ForegroundColor Yellow
    exit 1
  }
} else {
  Write-Host ""
  Write-Host "Pega la cadena de conexion de SOLO LECTURA a Neon." -ForegroundColor Yellow
  Write-Host "No se vera al escribirla." -ForegroundColor DarkGray
  $segura = Read-Host "Cadena" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
  $env:ROBLE_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Borra el fichero y limpia la variable. Se llama en TODAS las salidas: si el
# script termina antes de tiempo, la cadena no puede quedarse en el disco.
function Limpia {
  $env:ROBLE_DATABASE_URL = $null
  if (Test-Path $fichero) {
    $n = Split-Path $fichero -Leaf
    Remove-Item $fichero -Force -ErrorAction SilentlyContinue
    Write-Host "$n borrado." -ForegroundColor DarkGray
  }
}

if (-not $env:ROBLE_DATABASE_URL) {
  Write-Host "No se ha indicado ninguna cadena. Cancelado." -ForegroundColor Red
  Limpia
  exit 1
}

# 1. Verificar la conexión antes de auditar.
Write-Host ""
Write-Host "1) Comprobando la conexion..." -ForegroundColor Cyan
# 2>&1 dentro de un bloque evita que PowerShell 5.1 convierta la salida de
# error de node en un NativeCommandError lleno de ruido.
& { node (Join-Path $raiz "api\_conexion.js") } 2>&1 | ForEach-Object { "$_" }
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "La conexion no sirve para auditar. No se ha consultado nada mas." -ForegroundColor Red
  Limpia
  exit 1
}

# 2. Auditoría. Solo SELECT.
Write-Host ""
Write-Host "2) Auditoria (solo lectura)..." -ForegroundColor Cyan
Write-Host ""

$salida = Join-Path $raiz "docs\auditoria-resultado.txt"
$opciones = if ($Json) { @("--json") } else { @() }
& { node (Join-Path $raiz "api\_auditoria.js") @opciones } 2>&1 |
  ForEach-Object { "$_" } | Tee-Object -FilePath $salida
$codigo = $LASTEXITCODE

Write-Host ""
if ($codigo -eq 0) {
  Write-Host "Informe guardado en:" -ForegroundColor Green
  Write-Host "  $salida"
  Write-Host ""
  Write-Host "No se ha modificado ningun dato: la auditoria solo lee." -ForegroundColor DarkGray
} else {
  Write-Host "La auditoria no ha podido completarse." -ForegroundColor Red
}

Limpia
exit $codigo
